import { Component, For, Show, createSignal, createMemo, createEffect, onCleanup, Switch, Match } from "solid-js"
import type { AgentEvent, Provider, RunStatus, EventType } from "../types"
import type { ProviderRunState } from "../hooks/useRun"
import { 
  useOpenCodeSessions, 
  type OpenCodeSession, 
  type OpenCodeMessageWithParts,
  type OpenCodePart,
  type OpenCodeTextPart,
  type OpenCodeToolPart,
  type OpenCodeReasoningPart
} from "../hooks/useOpenCodeSessions"

interface RalphDashboardProps {
  providerRuns: Map<Provider, ProviderRunState>
  events: AgentEvent[]
  connected: boolean
  reconnecting: boolean
  runId?: string | null
}

// View hierarchy: Sandbox → Ralph Loop → Iterations → Messages
type ViewLevel = "sandboxes" | "ralph-loops" | "iterations" | "messages"

interface RalphIteration {
  iteration: number
  sessionId: string
  startTime: number
  endTime?: number
  status: "running" | "completed" | "error"
  toolCalls: number
  thoughts: number
}

interface RalphLoop {
  id: string
  task: string
  startTime: number
  endTime?: number
  status: RunStatus
  iterations: RalphIteration[]
  currentIteration: number
  maxIterations: number
}

interface SandboxInfo {
  provider: Provider
  sandboxId: string | null
  status: RunStatus
  ralphLoops: RalphLoop[]
  opencodeUrl?: string
}

const providerColors: Record<Provider, { bg: string; border: string; text: string; gradient: string }> = {
  modal: { bg: "bg-emerald-500/10", border: "border-emerald-500/50", text: "text-emerald-400", gradient: "from-emerald-500 to-emerald-600" },
  daytona: { bg: "bg-violet-500/10", border: "border-violet-500/50", text: "text-violet-400", gradient: "from-violet-500 to-violet-600" },
  e2b: { bg: "bg-amber-500/10", border: "border-amber-500/50", text: "text-amber-400", gradient: "from-amber-500 to-amber-600" },
  blaxel: { bg: "bg-rose-500/10", border: "border-rose-500/50", text: "text-rose-400", gradient: "from-rose-500 to-rose-600" },
  cloudflare: { bg: "bg-orange-500/10", border: "border-orange-500/50", text: "text-orange-400", gradient: "from-orange-500 to-orange-600" },
  vercel: { bg: "bg-cyan-500/10", border: "border-cyan-500/50", text: "text-cyan-400", gradient: "from-cyan-500 to-cyan-600" },
  docker: { bg: "bg-blue-500/10", border: "border-blue-500/50", text: "text-blue-400", gradient: "from-blue-500 to-blue-600" },
}

const providerIcons: Record<Provider, string> = {
  modal: "⚡", daytona: "🌙", e2b: "🔲", blaxel: "✨", cloudflare: "☁️", vercel: "▲", docker: "🐳"
}

const statusIcons: Record<RunStatus, string> = {
  idle: "⏸️", cloning: "📥", installing: "📦", running: "🏃", paused: "⏸️", completed: "✅", failed: "❌"
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

// Breadcrumb navigation component
const Breadcrumb: Component<{
  items: Array<{ label: string; onClick?: () => void }>
}> = (props) => (
  <div class="flex items-center gap-2 text-sm">
    <For each={props.items}>
      {(item, index) => (
        <>
          <Show when={index() > 0}>
            <span class="text-gray-600">/</span>
          </Show>
          <Show when={item.onClick} fallback={<span class="text-gray-400">{item.label}</span>}>
            <button 
              class="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              onClick={item.onClick}
            >
              {item.label}
            </button>
          </Show>
        </>
      )}
    </For>
  </div>
)

// Get tool icon based on tool name
const getToolIcon = (tool: string) => {
  const name = tool.toLowerCase()
  if (name.includes("bash") || name.includes("shell")) return { icon: "$", bg: "bg-amber-500/10", text: "text-amber-400" }
  if (name.includes("read")) return { icon: "→", bg: "bg-blue-500/10", text: "text-blue-400" }
  if (name.includes("write")) return { icon: "←", bg: "bg-green-500/10", text: "text-green-400" }
  if (name.includes("edit")) return { icon: "✎", bg: "bg-green-500/10", text: "text-green-400" }
  if (name.includes("grep") || name.includes("search")) return { icon: "🔍", bg: "bg-purple-500/10", text: "text-purple-400" }
  if (name.includes("glob") || name.includes("list")) return { icon: "📁", bg: "bg-cyan-500/10", text: "text-cyan-400" }
  if (name.includes("web") || name.includes("fetch")) return { icon: "🌐", bg: "bg-indigo-500/10", text: "text-indigo-400" }
  if (name.includes("task")) return { icon: "🤖", bg: "bg-rose-500/10", text: "text-rose-400" }
  if (name.includes("todo")) return { icon: "✓", bg: "bg-emerald-500/10", text: "text-emerald-400" }
  return { icon: "⚙️", bg: "bg-gray-500/10", text: "text-gray-400" }
}

// Get subtitle for tool based on input
const getToolSubtitle = (tool: string, input: Record<string, unknown>): string => {
  if (tool === "read" && input.filePath) return String(input.filePath).split("/").pop() || ""
  if (tool === "bash" && input.description) return String(input.description)
  if (tool === "bash" && input.command) return String(input.command).slice(0, 50)
  if (tool === "edit" && input.filePath) return String(input.filePath).split("/").pop() || ""
  if (tool === "write" && input.filePath) return String(input.filePath).split("/").pop() || ""
  if (tool === "grep" && input.pattern) return String(input.pattern)
  if (tool === "glob" && input.pattern) return String(input.pattern)
  if (tool === "task" && input.description) return String(input.description)
  if (tool === "webfetch" && input.url) return String(input.url).slice(0, 40)
  return ""
}

// Tool rendering component (inspired by opencode's desktop app)
const ToolPartView: Component<{ part: OpenCodeToolPart; expanded?: boolean }> = (props) => {
  const [isExpanded, setExpanded] = createSignal(props.expanded ?? false)
  
  const toolStyle = () => getToolIcon(props.part.tool)
  const subtitle = () => props.part.state.title || getToolSubtitle(props.part.tool, props.part.state.input || {})

  const statusStyles: Record<string, string> = {
    pending: "text-yellow-400 bg-yellow-500/10",
    running: "text-blue-400 bg-blue-500/10",
    completed: "text-emerald-400 bg-emerald-500/10",
    error: "text-red-400 bg-red-500/10",
  }

  const statusIcons: Record<string, string> = {
    pending: "⏳",
    running: "⚙️",
    completed: "✓",
    error: "✗",
  }

  return (
    <div class={`rounded-lg overflow-hidden border border-gray-700/50 ${toolStyle().bg}`}>
      <button
        class="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
        onClick={() => setExpanded(!isExpanded())}
      >
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class={`w-8 h-8 rounded-lg flex items-center justify-center ${toolStyle().bg} border border-gray-700/50`}>
            <span class={`text-sm ${toolStyle().text}`}>{toolStyle().icon}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-200 capitalize">{props.part.tool}</span>
              <span class={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${statusStyles[props.part.state.status] || statusStyles.pending}`}>
                <span>{statusIcons[props.part.state.status] || "?"}</span>
                <span>{props.part.state.status}</span>
              </span>
            </div>
            <Show when={subtitle()}>
              <p class="text-xs text-gray-400 truncate mt-0.5">{subtitle()}</p>
            </Show>
          </div>
        </div>
        <svg 
          class={`w-5 h-5 text-gray-500 transition-transform shrink-0 ml-2 ${isExpanded() ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      <Show when={isExpanded()}>
        <div class="border-t border-gray-700/50 p-4 space-y-4 bg-black/20">
          <Show when={props.part.state.input && Object.keys(props.part.state.input).length > 0}>
            <div>
              <p class="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Input</p>
              <pre class="bg-gray-900/80 p-3 rounded-lg text-xs overflow-x-auto text-gray-300 font-mono border border-gray-800">
                {JSON.stringify(props.part.state.input, null, 2)}
              </pre>
            </div>
          </Show>
          <Show when={props.part.state.status === "completed" && props.part.state.output}>
            <div>
              <p class="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Output</p>
              <pre class="bg-gray-900/80 p-3 rounded-lg text-xs overflow-x-auto text-gray-300 font-mono max-h-72 overflow-y-auto border border-gray-800">
                {props.part.state.output}
              </pre>
            </div>
          </Show>
          <Show when={props.part.state.error}>
            <div>
              <p class="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Error</p>
              <pre class="bg-red-950/50 p-3 rounded-lg text-xs text-red-300 font-mono border border-red-900/50">
                {props.part.state.error}
              </pre>
            </div>
          </Show>
          <Show when={props.part.state.time}>
            <div class="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-800">
              <span>Duration: {props.part.state.time?.end && props.part.state.time?.start 
                ? formatDuration(props.part.state.time.end - props.part.state.time.start)
                : "Running..."}</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

// Text part rendering (with markdown-like styling)
const TextPartView: Component<{ part: OpenCodeTextPart }> = (props) => {
  const processText = () => {
    let text = props.part.text.trim()
    // Simple markdown processing for display
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    text = text.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-800 rounded text-sm font-mono">$1</code>')
    return text
  }

  return (
    <div 
      class="text-gray-200 leading-relaxed whitespace-pre-wrap"
      innerHTML={processText()}
    />
  )
}

// Reasoning/thinking part
const ReasoningPartView: Component<{ part: OpenCodeReasoningPart }> = (props) => {
  const [expanded, setExpanded] = createSignal(false)

  return (
    <div class="border border-purple-700/30 rounded-lg bg-purple-900/10 overflow-hidden">
      <button
        class="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex items-center gap-2">
          <span class="text-purple-400">💭</span>
          <span class="text-sm text-purple-300 italic">Thinking...</span>
        </div>
        <svg 
          class={`w-4 h-4 text-purple-500 transition-transform ${expanded() ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <Show when={expanded()}>
        <div class="border-t border-purple-700/30 p-3">
          <p class="text-sm text-purple-200/80 whitespace-pre-wrap italic">{props.part.text}</p>
        </div>
      </Show>
    </div>
  )
}

// Part renderer dispatcher
const PartView: Component<{ part: OpenCodePart }> = (props) => (
  <Switch fallback={null}>
    <Match when={props.part.type === "text"}>
      <TextPartView part={props.part as OpenCodeTextPart} />
    </Match>
    <Match when={props.part.type === "tool"}>
      <ToolPartView part={props.part as OpenCodeToolPart} />
    </Match>
    <Match when={props.part.type === "reasoning"}>
      <ReasoningPartView part={props.part as OpenCodeReasoningPart} />
    </Match>
  </Switch>
)

// Message bubble component (opencode style)
const MessageView: Component<{ message: OpenCodeMessageWithParts }> = (props) => {
  const isUser = () => props.message?.info?.role === "user"
  
  const agentName = () => {
    if (isUser()) return "User"
    return props.message?.info?.agent || "Assistant"
  }

  const timestamp = () => {
    const created = props.message.info?.time?.created
    return created ? formatTime(created) : ""
  }

  const visibleParts = () => {
    const all = props.message.parts || []
    const visible = all.filter(p => {
      if (!p || !p.type) return false
      // Filter to text, tool, reasoning parts
      if (!["text", "tool", "reasoning"].includes(p.type)) return false
      // For text parts, filter out synthetic and ignored
      if (p.type === "text") {
        const textPart = p as OpenCodeTextPart
        if (textPart.synthetic || textPart.ignored) return false
        if (!textPart.text?.trim()) return false
      }
      return true
    })
    // Debug: log parts data
    if (all.length > 0 && visible.length === 0) {
      console.log("[MessageView] All parts filtered out:", all.map(p => ({ type: p?.type, synthetic: (p as any)?.synthetic })))
    }
    return visible
  }

  const tokens = () => {
    if (isUser()) return null
    const info = props.message.info as any
    return info.tokens
  }

  const cost = () => {
    if (isUser()) return null
    return (props.message.info as any).cost
  }

  // Group consecutive tool parts together for better display
  const groupedParts = () => {
    const parts = visibleParts()
    const groups: Array<{ type: "text" | "tools" | "reasoning"; parts: OpenCodePart[] }> = []
    let currentTools: OpenCodePart[] = []

    for (const part of parts) {
      if (part.type === "tool") {
        currentTools.push(part)
      } else {
        if (currentTools.length > 0) {
          groups.push({ type: "tools", parts: currentTools })
          currentTools = []
        }
        groups.push({ type: part.type as "text" | "reasoning", parts: [part] })
      }
    }
    if (currentTools.length > 0) {
      groups.push({ type: "tools", parts: currentTools })
    }
    return groups
  }

  return (
    <div class={`flex gap-3 ${isUser() ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div class={`w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0 ${
        isUser() 
          ? "bg-gradient-to-br from-blue-500 to-blue-600" 
          : "bg-gradient-to-br from-emerald-500 to-teal-600"
      }`}>
        {isUser() ? "👤" : "🤖"}
      </div>

      <div class={`flex-1 min-w-0 ${isUser() ? "flex flex-col items-end" : ""}`}>
        {/* Header */}
        <div class={`flex items-center gap-2 mb-2 ${isUser() ? "flex-row-reverse" : ""}`}>
          <span class="text-sm font-semibold text-gray-200">{agentName()}</span>
          <span class="text-xs text-gray-500">{timestamp()}</span>
          <Show when={tokens()}>
            <span class="text-xs text-gray-600 flex items-center gap-1">
              <span class="opacity-60">·</span>
              {tokens()?.input || 0} in / {tokens()?.output || 0} out
            </span>
          </Show>
        </div>

        {/* Content */}
        <div class={`space-y-3 ${isUser() ? "max-w-[85%]" : "max-w-full"}`}>
          <Show when={visibleParts().length === 0}>
            <p class="text-gray-400 italic text-sm">Processing...</p>
          </Show>
          <For each={groupedParts()}>
            {(group) => (
              <Switch>
                <Match when={group.type === "tools"}>
                  <div class="space-y-2">
                    <For each={group.parts}>
                      {(part) => <ToolPartView part={part as OpenCodeToolPart} />}
                    </For>
                  </div>
                </Match>
                <Match when={group.type === "text"}>
                  <div class={`rounded-xl p-4 ${
                    isUser() 
                      ? "bg-blue-600 text-white" 
                      : "bg-gray-800/80 border border-gray-700/50"
                  }`}>
                    <TextPartView part={group.parts[0] as OpenCodeTextPart} />
                  </div>
                </Match>
                <Match when={group.type === "reasoning"}>
                  <ReasoningPartView part={group.parts[0] as OpenCodeReasoningPart} />
                </Match>
              </Switch>
            )}
          </For>
        </div>

        {/* Cost info */}
        <Show when={cost()}>
          <div class="text-xs text-gray-500 mt-2 flex items-center gap-1">
            💰 ${cost()?.toFixed(4)}
          </div>
        </Show>
      </div>
    </div>
  )
}

// Messages view for an iteration
const IterationMessagesView: Component<{
  runId: string
  provider: Provider
  sessionId: string
  iterationNumber: number
  onBack: () => void
}> = (props) => {
  const [messages, setMessages] = createSignal<OpenCodeMessageWithParts[]>([])
  const [loading, setLoading] = createSignal(true)
  let scrollRef: HTMLDivElement | undefined

  const { fetchSessionMessages, healthy, subscribeToEvents } = useOpenCodeSessions({
    runId: props.runId,
    provider: props.provider,
    pollInterval: 3000,
  })

  const colors = () => providerColors[props.provider]

  // Load messages on mount and when sessionId changes
  createEffect(() => {
    const sessionId = props.sessionId
    console.log("[IterationMessagesView] Loading messages for session:", sessionId, "runId:", props.runId, "provider:", props.provider)
    
    setLoading(true)
    fetchSessionMessages(sessionId, 100).then((msgs) => {
      console.log("[IterationMessagesView] Got messages:", msgs?.length)
      if (msgs && msgs.length > 0) {
        console.log("[IterationMessagesView] First message:", JSON.stringify(msgs[0], null, 2))
        console.log("[IterationMessagesView] Message infos:", msgs.map(m => ({ role: m.info?.role, partsCount: m.parts?.length })))
      }
      setMessages(msgs)
      setLoading(false)
      // Scroll to bottom
      setTimeout(() => {
        if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight
      }, 100)
    }).catch((err) => {
      console.error("[IterationMessagesView] Error fetching messages:", err)
      setLoading(false)
    })
  })

  // Poll for messages updates (SSE may not always work through the proxy)
  createEffect(() => {
    const sessionId = props.sessionId
    
    const refreshMessages = () => {
      fetchSessionMessages(sessionId, 100).then((msgs) => {
        const currentLen = messages().length
        if (msgs.length !== currentLen) {
          console.log("[IterationMessagesView] Messages updated:", currentLen, "->", msgs.length)
          setMessages(msgs)
          setTimeout(() => {
            if (scrollRef) scrollRef.scrollTo({ top: scrollRef.scrollHeight, behavior: "smooth" })
          }, 100)
        }
      })
    }
    
    // Poll every 3 seconds for updates
    const interval = setInterval(refreshMessages, 3000)
    onCleanup(() => clearInterval(interval))
  })

  const totalTokens = () => {
    let input = 0
    let output = 0
    for (const msg of messages()) {
      const info = msg.info as any
      if (info.tokens) {
        input += info.tokens.input || 0
        output += info.tokens.output || 0
      }
    }
    return { input, output }
  }

  return (
    <div class="flex flex-col h-full bg-gradient-to-b from-gray-950 to-gray-900">
      {/* Header */}
      <div class={`px-6 py-4 border-b border-gray-800 bg-black/30`}>
        <div class="flex items-center gap-4">
          <button
            class="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            onClick={props.onBack}
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="flex-1">
            <div class="flex items-center gap-3">
              <span class={`text-2xl`}>{providerIcons[props.provider]}</span>
              <div>
                <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                  Iteration #{props.iterationNumber}
                  <span class={`text-sm font-normal ${colors().text}`}>
                    {props.provider}
                  </span>
                </h3>
                <p class="text-xs text-gray-500">
                  Session: {props.sessionId.slice(0, 16)}...
                </p>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <Show when={healthy()}>
              <span class="flex items-center gap-1.5 text-xs text-emerald-400">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </Show>
            <Show when={!healthy()}>
              <span class="flex items-center gap-1.5 text-xs text-gray-500">
                <span class="w-2 h-2 rounded-full bg-gray-600" />
                Disconnected
              </span>
            </Show>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} class="flex-1 overflow-y-auto">
        <div class="max-w-4xl mx-auto py-6 px-6 space-y-6">
          <Show when={loading()}>
            <div class="flex items-center justify-center py-20">
              <div class="text-center">
                <div class="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin mx-auto mb-3" />
                <p class="text-sm text-gray-500">Loading messages...</p>
              </div>
            </div>
          </Show>
          <Show when={!loading() && messages().length === 0}>
            <div class="flex flex-col items-center justify-center py-20 text-gray-500">
              <span class="text-4xl mb-3">💬</span>
              <p class="text-lg">No messages yet</p>
              <p class="text-sm text-gray-600 mt-1">Messages will appear here as the agent works</p>
              <p class="text-xs text-gray-700 mt-3">Session: {props.sessionId}</p>
            </div>
          </Show>
          <For each={messages().filter(m => m && m.info)}>
            {(msg) => <MessageView message={msg} />}
          </For>
        </div>
      </div>

      {/* Footer with stats */}
      <div class="px-6 py-3 border-t border-gray-800 bg-black/30">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <div class="flex items-center gap-4">
            <span>Messages: <span class="text-white font-mono">{messages().length}</span></span>
            <span>Tokens: <span class="text-white font-mono">
              {totalTokens().input.toLocaleString()} in / {totalTokens().output.toLocaleString()} out
            </span></span>
          </div>
          <div class="flex items-center gap-2">
            <span class={`w-2 h-2 rounded-full bg-gradient-to-r ${colors().gradient}`} />
            <span class={colors().text}>{props.provider}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Iterations list view
const IterationsView: Component<{
  iterations: RalphIteration[]
  provider: Provider
  onSelectIteration: (iteration: RalphIteration) => void
  onBack: () => void
}> = (props) => {
  const colors = () => providerColors[props.provider]

  return (
    <div class="flex flex-col h-full">
      <div class="px-4 py-3 border-b border-gray-800 bg-black/30 flex items-center gap-3">
        <button
          class="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
          onClick={props.onBack}
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 class="text-sm font-medium text-white flex items-center gap-2">
          <span class={colors().text}>🔄</span>
          Ralph Iterations ({props.iterations.length})
        </h3>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <Show when={props.iterations.length === 0}>
          <div class="flex flex-col items-center justify-center py-12 text-gray-500">
            <span class="text-3xl mb-2">⏳</span>
            <p>No iterations yet</p>
          </div>
        </Show>
        <For each={props.iterations}>
          {(iter) => (
            <button
              class={`w-full p-4 rounded-lg border ${colors().border} ${colors().bg} hover:bg-white/10 transition-all text-left`}
              onClick={() => props.onSelectIteration(iter)}
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class={`text-2xl font-bold ${colors().text}`}>#{iter.iteration}</span>
                  <span class={`px-2 py-0.5 rounded-full text-xs ${
                    iter.status === "running" ? "bg-blue-500/20 text-blue-400" :
                    iter.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {iter.status}
                  </span>
                </div>
                <svg class="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div class="text-xs text-gray-500 mb-2 truncate">
                Session: {iter.sessionId.slice(0, 16)}...
              </div>
              <div class="flex items-center gap-4 text-sm text-gray-400">
                <span class="text-xs">{formatTime(iter.startTime)}</span>
                <span class="text-xs text-gray-600">Click to view messages</span>
              </div>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

// Sandbox card component
const SandboxCard: Component<{
  sandbox: SandboxInfo
  onClick: () => void
}> = (props) => {
  const colors = () => providerColors[props.sandbox.provider]
  const totalIterations = () => props.sandbox.ralphLoops.reduce((sum, l) => sum + l.iterations.length, 0)
  const currentIter = () => props.sandbox.ralphLoops.find(l => l.status === "running")?.currentIteration || 0

  return (
    <button
      class={`w-full p-5 rounded-xl border-2 ${colors().border} ${colors().bg} hover:bg-white/10 transition-all text-left`}
      onClick={props.onClick}
    >
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <span class="text-3xl">{providerIcons[props.sandbox.provider]}</span>
          <div>
            <h3 class={`text-lg font-semibold ${colors().text}`}>
              {props.sandbox.provider.charAt(0).toUpperCase() + props.sandbox.provider.slice(1)}
            </h3>
            <p class="text-xs text-gray-500">
              {props.sandbox.sandboxId?.slice(0, 12) || "Initializing..."}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xl">{statusIcons[props.sandbox.status]}</span>
          <Show when={props.sandbox.status === "running"}>
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </Show>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 text-center">
        <div class="p-2 bg-black/20 rounded-lg">
          <p class={`text-xl font-bold ${colors().text}`}>{props.sandbox.ralphLoops.length}</p>
          <p class="text-xs text-gray-500">Loops</p>
        </div>
        <div class="p-2 bg-black/20 rounded-lg">
          <p class={`text-xl font-bold ${colors().text}`}>{totalIterations()}</p>
          <p class="text-xs text-gray-500">Iterations</p>
        </div>
        <div class="p-2 bg-black/20 rounded-lg">
          <p class={`text-xl font-bold ${colors().text}`}>{currentIter()}</p>
          <p class="text-xs text-gray-500">Current</p>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between text-sm text-gray-400">
        <span>Click to view iterations →</span>
        <Show when={props.sandbox.opencodeUrl}>
          <span class="text-xs text-emerald-400">🔗 Connected</span>
        </Show>
      </div>
    </button>
  )
}

export const RalphDashboard: Component<RalphDashboardProps> = (props) => {
  const [viewLevel, setViewLevel] = createSignal<ViewLevel>("sandboxes")
  const [selectedProvider, setSelectedProvider] = createSignal<Provider | null>(null)
  const [selectedIteration, setSelectedIteration] = createSignal<RalphIteration | null>(null)
  const [elapsedTime, setElapsedTime] = createSignal(0)
  const [providerSessions, setProviderSessions] = createSignal<Map<Provider, OpenCodeSession[]>>(new Map())

  // Timer for elapsed time
  createEffect(() => {
    const interval = setInterval(() => setElapsedTime(e => e + 1000), 1000)
    onCleanup(() => clearInterval(interval))
  })

  // Fetch sessions from opencode for each provider
  const fetchProviderSessions = async (provider: Provider) => {
    if (!props.runId) return
    try {
      const url = `/api/run/${props.runId}/${provider}/opencode/session`
      console.log(`[RalphDashboard] Fetching sessions for ${provider}:`, url)
      const response = await fetch(url)
      if (response.ok) {
        const sessions = await response.json()
        console.log(`[RalphDashboard] Got ${sessions?.length || 0} sessions for ${provider}:`, sessions?.map((s: any) => s.id))
        setProviderSessions(prev => {
          const newMap = new Map(prev)
          newMap.set(provider, Array.isArray(sessions) ? sessions : [])
          return newMap
        })
      } else {
        console.error(`[RalphDashboard] Failed to fetch sessions for ${provider}: ${response.status}`)
      }
    } catch (e) {
      console.error(`[RalphDashboard] Error fetching sessions for ${provider}:`, e)
    }
  }

  // Poll for sessions when we have providers
  createEffect(() => {
    if (!props.runId) return
    
    // Initial fetch
    for (const provider of props.providerRuns.keys()) {
      fetchProviderSessions(provider)
    }
    
    // Poll every 5 seconds
    const interval = setInterval(() => {
      for (const provider of props.providerRuns.keys()) {
        fetchProviderSessions(provider)
      }
    }, 5000)
    
    onCleanup(() => clearInterval(interval))
  })

  // Parse events and sessions into structured data
  const sandboxes = createMemo<SandboxInfo[]>(() => {
    const result: SandboxInfo[] = []
    const sessionsMap = providerSessions()

    for (const [provider, run] of props.providerRuns.entries()) {
      const providerEvents = props.events.filter(e => e.provider === provider)
      const sessions = sessionsMap.get(provider) || []
      
      // Build iterations from sessions (each Ralph iteration = 1 session)
      const iterations: RalphIteration[] = sessions.map((session, index) => {
        // Extract iteration number from session title if available
        const titleMatch = session.title?.match(/iteration\s*(\d+)/i)
        const iterNum = titleMatch ? parseInt(titleMatch[1]) : index + 1
        
        // Get timestamp - try time.created first, then createdAt string, then fallback
        const timestamp = session.time?.created 
          || (session.createdAt ? new Date(session.createdAt).getTime() : Date.now())
        
        const status: "running" | "completed" | "error" = 
          run.status === "completed" ? "completed" : run.status === "failed" ? "error" : "running"
        
        return {
          iteration: iterNum,
          sessionId: session.id,
          startTime: timestamp,
          status,
          toolCalls: 0, // Will be populated when viewing
          thoughts: 0,
        }
      }).sort((a, b) => a.startTime - b.startTime)
      
      // Also try to get iteration count from events if no sessions yet
      let maxIterations = 10
      for (const event of providerEvents) {
        if (event.type === "ralph_iteration") {
          const data = event.data as { maxIterations?: number }
          maxIterations = data.maxIterations || maxIterations
        }
      }

      // Create ralph loop
      const loops: RalphLoop[] = [{
        id: `loop_${provider}`,
        task: "Task from PRD",
        startTime: providerEvents[0]?.timestamp || Date.now(),
        status: run.status,
        iterations,
        currentIteration: iterations.length,
        maxIterations,
      }]

      result.push({
        provider,
        sandboxId: run.sandboxId,
        status: run.status,
        ralphLoops: loops,
        opencodeUrl: run.opencodeUrl,
      })
    }

    return result
  })

  const selectedSandbox = createMemo(() => 
    sandboxes().find(s => s.provider === selectedProvider())
  )

  const allIterations = createMemo(() => 
    selectedSandbox()?.ralphLoops.flatMap(l => l.iterations) || []
  )

  // Breadcrumb items
  const breadcrumbItems = createMemo(() => {
    const items: Array<{ label: string; onClick?: () => void }> = []
    
    items.push({
      label: "🏠 Sandboxes",
      onClick: viewLevel() !== "sandboxes" ? () => {
        setViewLevel("sandboxes")
        setSelectedProvider(null)
        setSelectedIteration(null)
      } : undefined
    })

    if (selectedProvider() && viewLevel() !== "sandboxes") {
      items.push({
        label: `${providerIcons[selectedProvider()!]} ${selectedProvider()}`,
        onClick: viewLevel() === "messages" ? () => {
          setViewLevel("iterations")
          setSelectedIteration(null)
        } : undefined
      })
    }

    if (selectedIteration() && viewLevel() === "messages") {
      items.push({
        label: `Iteration #${selectedIteration()!.iteration}`
      })
    }

    return items
  })

  const handleSelectSandbox = (sandbox: SandboxInfo) => {
    setSelectedProvider(sandbox.provider)
    setViewLevel("iterations")
  }

  const handleSelectIteration = (iter: RalphIteration) => {
    console.log("[RalphDashboard] Selected iteration:", iter.iteration, "sessionId:", iter.sessionId)
    setSelectedIteration(iter)
    setViewLevel("messages")
  }

  return (
    <div class="flex flex-col h-full bg-gradient-to-b from-gray-950 to-gray-900">
      {/* Header */}
      <div class="px-6 py-4 border-b border-gray-800 bg-black/30">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-xl font-bold text-white flex items-center gap-3">
            <span class="text-2xl">🤖</span>
            Ralph Dashboard
            <span class="text-sm font-normal text-gray-400">
              ({sandboxes().length} sandboxes)
            </span>
          </h2>
          <div class="flex items-center gap-4">
            <Show when={props.connected}>
              <span class="flex items-center gap-1.5 text-xs text-emerald-400">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </Show>
            <span class="text-sm font-mono text-gray-400">⏱️ {formatDuration(elapsedTime())}</span>
          </div>
        </div>
        <Breadcrumb items={breadcrumbItems()} />
      </div>

      {/* Main Content */}
      <div class="flex-1 overflow-hidden">
        <Switch>
          {/* Sandboxes View */}
          <Match when={viewLevel() === "sandboxes"}>
            <div class="h-full overflow-y-auto p-6">
              <div class={`grid gap-4 ${
                sandboxes().length <= 2 ? "grid-cols-1 md:grid-cols-2" :
                "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              }`}>
                <For each={sandboxes()}>
                  {(sandbox) => (
                    <SandboxCard 
                      sandbox={sandbox}
                      onClick={() => handleSelectSandbox(sandbox)}
                    />
                  )}
                </For>
              </div>
              <Show when={sandboxes().length === 0}>
                <div class="flex flex-col items-center justify-center py-20 text-gray-500">
                  <span class="text-5xl mb-4">📦</span>
                  <p class="text-lg">No sandboxes yet</p>
                  <p class="text-sm">Start a run to create sandboxes</p>
                </div>
              </Show>
            </div>
          </Match>

          {/* Iterations View */}
          <Match when={viewLevel() === "iterations" && selectedProvider()}>
            <IterationsView
              iterations={allIterations()}
              provider={selectedProvider()!}
              onSelectIteration={handleSelectIteration}
              onBack={() => {
                setViewLevel("sandboxes")
                setSelectedProvider(null)
              }}
            />
          </Match>

          {/* Messages View */}
          <Match when={viewLevel() === "messages" && selectedIteration() && props.runId}>
            <IterationMessagesView
              runId={props.runId!}
              provider={selectedProvider()!}
              sessionId={selectedIteration()!.sessionId}
              iterationNumber={selectedIteration()!.iteration}
              onBack={() => {
                setViewLevel("iterations")
                setSelectedIteration(null)
              }}
            />
          </Match>
        </Switch>
      </div>

      {/* Footer */}
      <div class="px-6 py-3 border-t border-gray-800 bg-black/30">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <div class="flex items-center gap-4">
            <span>Events: <span class="text-white font-mono">{props.events.length}</span></span>
            <span>Tools: <span class="text-white font-mono">
              {props.events.filter(e => e.type === "tool_call").length}
            </span></span>
          </div>
          <div class="flex items-center gap-3">
            <For each={sandboxes()}>
              {(s) => (
                <div class="flex items-center gap-1.5">
                  <span class={`w-2 h-2 rounded-full bg-gradient-to-r ${providerColors[s.provider].gradient}`} />
                  <span class={providerColors[s.provider].text}>{s.provider}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
