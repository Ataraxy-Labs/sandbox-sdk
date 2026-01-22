import { Component, For, Show, createMemo, createEffect, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { 
  useOpenCodeSessions, 
  type OpenCodeSession, 
  type OpenCodeMessageWithParts,
  type OpenCodeEvent,
  type OpenCodePart
} from "../hooks/useOpenCodeSessions"
import type { Provider } from "../types"
import { SessionChatView } from "./SessionChatView"

interface OpenCodeSessionsViewProps {
  runId: string | null
  provider: Provider
}

const agentTypeColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  architect: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/50",
    text: "text-purple-400",
    icon: "🏛️",
  },
  frontend: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/50",
    text: "text-blue-400",
    icon: "🎨",
  },
  backend: {
    bg: "bg-green-500/10",
    border: "border-green-500/50",
    text: "text-green-400",
    icon: "⚙️",
  },
  database: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/50",
    text: "text-amber-400",
    icon: "🗄️",
  },
  orchestrator: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/50",
    text: "text-rose-400",
    icon: "🎭",
  },
  default: {
    bg: "bg-gray-500/10",
    border: "border-gray-500/50",
    text: "text-gray-400",
    icon: "🤖",
  },
}

const detectAgentType = (title: string | undefined): string => {
  if (!title) return "default"
  const lower = title.toLowerCase()
  if (lower.includes("architect")) return "architect"
  if (lower.includes("frontend") || lower.includes("ui") || lower.includes("react")) return "frontend"
  if (lower.includes("backend") || lower.includes("api") || lower.includes("server")) return "backend"
  if (lower.includes("database") || lower.includes("db") || lower.includes("sql")) return "database"
  if (lower.includes("orchestrat") || lower.includes("ralph") || lower.includes("main")) return "orchestrator"
  return "default"
}

interface SessionTreeNode {
  session: OpenCodeSession
  children: SessionTreeNode[]
  level: number
  agentType: string
}

const buildSessionTree = (sessions: OpenCodeSession[]): SessionTreeNode[] => {
  const sessionMap = new Map<string, SessionTreeNode>()
  
  sessions.forEach(session => {
    sessionMap.set(session.id, {
      session,
      children: [],
      level: 0,
      agentType: detectAgentType(session.title),
    })
  })
  
  const rootNodes: SessionTreeNode[] = []
  
  sessions.forEach(session => {
    const node = sessionMap.get(session.id)!
    if (session.parentID && sessionMap.has(session.parentID)) {
      const parent = sessionMap.get(session.parentID)!
      node.level = parent.level + 1
      parent.children.push(node)
    } else {
      rootNodes.push(node)
    }
  })
  
  return rootNodes
}

const SessionCard: Component<{
  node: SessionTreeNode
  expanded: boolean
  onToggle: () => void
  onSelect: () => void
  selected: boolean
  messageCount: number
}> = (props) => {
  const colors = () => agentTypeColors[props.node.agentType] || agentTypeColors.default

  return (
    <div 
      class={`rounded-lg border ${colors().border} ${colors().bg} transition-all duration-200 ${
        props.selected ? "ring-2 ring-white/30" : ""
      }`}
      style={{ "margin-left": `${props.node.level * 24}px` }}
    >
      <div 
        class="p-3 cursor-pointer hover:bg-white/5"
        onClick={props.onSelect}
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xl">{colors().icon}</span>
            <div>
              <h4 class={`font-medium ${colors().text}`}>
                {props.node.session.title || `Session ${props.node.session.id.slice(0, 8)}`}
              </h4>
              <p class="text-xs text-gray-500">
                {new Date(props.node.session.time?.created || props.node.session.createdAt || Date.now()).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Show when={props.node.children.length > 0}>
              <button
                class="p-1 hover:bg-white/10 rounded"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onToggle()
                }}
              >
                <svg 
                  class={`w-4 h-4 text-gray-400 transition-transform ${props.expanded ? "rotate-90" : ""}`}
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </Show>
            <span class="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              {props.messageCount} msgs
            </span>
            <svg class="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

const SessionTree: Component<{
  nodes: SessionTreeNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  expandedIds: Set<string>
  onToggle: (id: string) => void
  messageCountMap: Map<string, number>
}> = (props) => {
  return (
    <div class="space-y-2">
      <For each={props.nodes}>
        {(node) => (
          <>
            <SessionCard
              node={node}
              selected={props.selectedId === node.session.id}
              expanded={props.expandedIds.has(node.session.id)}
              onSelect={() => props.onSelect(node.session.id)}
              onToggle={() => props.onToggle(node.session.id)}
              messageCount={props.messageCountMap.get(node.session.id) || 0}
            />
            <Show when={props.expandedIds.has(node.session.id) && node.children.length > 0}>
              <SessionTree
                nodes={node.children}
                selectedId={props.selectedId}
                onSelect={props.onSelect}
                expandedIds={props.expandedIds}
                onToggle={props.onToggle}
                messageCountMap={props.messageCountMap}
              />
            </Show>
          </>
        )}
      </For>
    </div>
  )
}

export const OpenCodeSessionsView: Component<OpenCodeSessionsViewProps> = (props) => {
  const { sessions, loading, healthy, opencodeUrl, fetchSessionMessages, checkHealth, fetchSessions, subscribeToEvents } = useOpenCodeSessions({
    runId: props.runId,
    provider: props.provider,
    pollInterval: 3000,
  })
  
  // Use store for better performance with complex state
  const [store, setStore] = createStore({
    selectedId: null as string | null,
    viewingChat: false,
    expandedIds: new Set<string>(),
    messagesMap: {} as Record<string, OpenCodeMessageWithParts[]>,
    messageCountMap: {} as Record<string, number>,
    loadingMessages: false,
    liveUpdates: [] as Array<{ type: string; timestamp: string }>,
  })
  
  const sessionTree = createMemo(() => buildSessionTree(sessions()))
  
  const selectedSession = createMemo(() => 
    sessions().find(s => s.id === store.selectedId)
  )
  
  const selectedMessages = createMemo(() => 
    store.messagesMap[store.selectedId || ""] || []
  )
  
  const handleSelect = async (id: string) => {
    setStore("selectedId", id)
    setStore("viewingChat", true)
    
    if (!store.messagesMap[id]) {
      setStore("loadingMessages", true)
      const messages = await fetchSessionMessages(id, 100)
      setStore("messagesMap", id, messages)
      setStore("messageCountMap", id, messages.length)
      setStore("loadingMessages", false)
    }
  }
  
  const handleToggle = (id: string) => {
    const newSet = new Set(store.expandedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setStore("expandedIds", newSet)
  }
  
  const handleBack = () => {
    setStore("viewingChat", false)
  }
  
  // Handle live SSE events from opencode
  const handleLiveEvent = (event: OpenCodeEvent) => {
    const data = event.data as any
    
    // Track live updates for debugging
    setStore(produce((s) => {
      s.liveUpdates.push({ type: event.type, timestamp: event.timestamp })
      if (s.liveUpdates.length > 50) s.liveUpdates.shift()
    }))
    
    // Handle different event types
    if (event.type === "session.created" || event.type === "session.updated") {
      // Refresh sessions list
      fetchSessions()
    }
    
    if (event.type === "message.updated" && data.properties?.info) {
      const msg = data.properties.info
      const sessionId = msg.sessionID
      
      if (store.messagesMap[sessionId]) {
        setStore(produce((s) => {
          const messages = s.messagesMap[sessionId]
          const existingIdx = messages.findIndex((m) => m.info.id === msg.id)
          if (existingIdx >= 0) {
            messages[existingIdx].info = msg
          } else {
            messages.push({ info: msg, parts: [] })
          }
          s.messageCountMap[sessionId] = messages.length
        }))
      }
    }
    
    if (event.type === "message.part.updated" && data.properties?.part) {
      const part = data.properties.part as OpenCodePart
      const sessionId = (part as any).sessionID as string
      const messageId = (part as any).messageID as string
      
      if (sessionId && store.messagesMap[sessionId]) {
        setStore(produce((s) => {
          const messages = s.messagesMap[sessionId]
          const msgIdx = messages.findIndex((m: OpenCodeMessageWithParts) => m.info.id === messageId)
          if (msgIdx >= 0) {
            const parts = messages[msgIdx].parts
            const partIdx = parts.findIndex((p: OpenCodePart) => p.id === part.id)
            if (partIdx >= 0) {
              parts[partIdx] = part
            } else {
              parts.push(part)
            }
          }
        }))
      }
    }
  }
  
  // Subscribe to live events
  createEffect(() => {
    if (healthy() && props.runId) {
      const unsubscribe = subscribeToEvents(handleLiveEvent)
      onCleanup(unsubscribe)
    }
  })
  
  // Auto-expand root nodes
  createEffect(() => {
    if (sessions().length > 0 && store.expandedIds.size === 0) {
      const rootIds = sessionTree().map(n => n.session.id)
      setStore("expandedIds", new Set(rootIds))
    }
  })
  
  // Fetch message counts for each session (only once)
  createEffect(() => {
    const sessionIds = sessions().map(s => s.id)
    sessionIds.forEach(async (id) => {
      if (store.messageCountMap[id] === undefined) {
        const messages = await fetchSessionMessages(id, 1)
        setStore("messageCountMap", id, messages.length)
      }
    })
  })

  return (
    <Show 
      when={store.viewingChat && store.selectedId}
      fallback={
        <div class="flex flex-col h-full bg-gray-900">
          <div class="px-4 py-3 border-b border-gray-800 bg-black/30">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-white flex items-center gap-2">
                <span class="text-lg">🧠</span>
                OpenCode Sessions
              </h3>
              <div class="flex items-center gap-2">
                <Show when={healthy()}>
                  <span class="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                </Show>
                <Show when={!healthy()}>
                  <span class="flex items-center gap-1.5 text-xs text-gray-500">
                    <span class="w-2 h-2 rounded-full bg-gray-600" />
                    Not Connected
                  </span>
                </Show>
                <button
                  class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                  onClick={() => {
                    checkHealth()
                    fetchSessions()
                  }}
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
            <Show when={opencodeUrl()}>
              <p class="text-xs text-gray-500 mt-1 truncate" title={opencodeUrl() || ""}>
                {opencodeUrl()}
              </p>
            </Show>
          </div>
          
          <div class="flex-1 overflow-y-auto p-4">
            <Show when={loading() && sessions().length === 0}>
              <div class="flex items-center justify-center h-full">
                <div class="text-center">
                  <div class="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mx-auto mb-2" />
                  <p class="text-sm text-gray-500">Loading sessions...</p>
                </div>
              </div>
            </Show>
            
            <Show when={!loading() && sessions().length === 0 && healthy()}>
              <div class="flex items-center justify-center h-full text-gray-500 text-sm">
                <div class="text-center">
                  <span class="text-3xl block mb-2">📭</span>
                  <p>No sessions yet</p>
                  <p class="text-xs mt-1">Waiting for agent activity...</p>
                </div>
              </div>
            </Show>
            
            <Show when={!loading() && !healthy()}>
              <div class="flex items-center justify-center h-full text-gray-500 text-sm">
                <div class="text-center">
                  <span class="text-3xl block mb-2">🔌</span>
                  <p>OpenCode server not connected</p>
                  <p class="text-xs mt-1">Waiting for server to start...</p>
                </div>
              </div>
            </Show>
            
            <Show when={sessions().length > 0}>
              <SessionTree
                nodes={sessionTree()}
                selectedId={store.selectedId}
                onSelect={handleSelect}
                expandedIds={store.expandedIds}
                onToggle={handleToggle}
                messageCountMap={new Map(Object.entries(store.messageCountMap))}
              />
            </Show>
          </div>
          
          <div class="px-4 py-2 border-t border-gray-800 bg-black/30">
            <div class="flex items-center justify-between text-xs text-gray-500">
              <span>{sessions().length} sessions</span>
              <span>{props.provider}</span>
            </div>
          </div>
        </div>
      }
    >
      <SessionChatView
        messages={selectedMessages()}
        loading={store.loadingMessages}
        sessionTitle={selectedSession()?.title || `Session ${store.selectedId?.slice(0, 8)}`}
        onBack={handleBack}
      />
    </Show>
  )
}
