import { Component, For, Show, createEffect, createSignal, createMemo } from "solid-js"
import type { AgentEvent, EventType, ToolCall, ToolResult } from "../types"

interface TimelinePanelProps {
  events: AgentEvent[]
  connected: boolean
  reconnecting: boolean
}

interface TimelineStep {
  id: string
  type: EventType
  timestamp: number
  summary: string
  details?: unknown
  provider?: string
}

const eventTypeConfig: Record<EventType, { color: string; bgColor: string; icon: string; label: string; borderClass: string }> = {
  status: { 
    color: "text-gray-400", 
    bgColor: "bg-gray-500/10", 
    icon: "○", 
    label: "Status",
    borderClass: "border-l-gray-500"
  },
  clone_progress: { 
    color: "text-cyan-400", 
    bgColor: "bg-cyan-500/10", 
    icon: "↓", 
    label: "Clone",
    borderClass: "border-l-cyan-500"
  },
  install_progress: { 
    color: "text-purple-400", 
    bgColor: "bg-purple-500/10", 
    icon: "⬇", 
    label: "Install",
    borderClass: "border-l-purple-500"
  },
  thought: { 
    color: "text-blue-400", 
    bgColor: "bg-blue-500/10", 
    icon: "💭", 
    label: "Thought",
    borderClass: "border-l-[var(--color-thought)]"
  },
  tool_call: { 
    color: "text-green-400", 
    bgColor: "bg-green-500/10", 
    icon: "⚡", 
    label: "Tool Call",
    borderClass: "border-l-[var(--color-tool-call)]"
  },
  tool_result: { 
    color: "text-yellow-400", 
    bgColor: "bg-yellow-500/10", 
    icon: "✓", 
    label: "Result",
    borderClass: "border-l-[var(--color-tool-result)]"
  },
  output: { 
    color: "text-gray-400", 
    bgColor: "bg-gray-500/10", 
    icon: "→", 
    label: "Output",
    borderClass: "border-l-gray-500"
  },
  error: { 
    color: "text-red-400", 
    bgColor: "bg-red-500/10", 
    icon: "✗", 
    label: "Error",
    borderClass: "border-l-[var(--color-error)]"
  },
  complete: { 
    color: "text-emerald-400", 
    bgColor: "bg-emerald-500/10", 
    icon: "✓", 
    label: "Complete",
    borderClass: "border-l-emerald-500"
  },
  opencode_ready: { 
    color: "text-emerald-400", 
    bgColor: "bg-emerald-500/10", 
    icon: "🚀", 
    label: "OpenCode Ready",
    borderClass: "border-l-emerald-500"
  },
  ralph_iteration: { 
    color: "text-cyan-400", 
    bgColor: "bg-cyan-500/10", 
    icon: "🔄", 
    label: "Ralph Iteration",
    borderClass: "border-l-cyan-500"
  },
  ralph_complete: { 
    color: "text-emerald-400", 
    bgColor: "bg-emerald-500/10", 
    icon: "🎉", 
    label: "Ralph Complete",
    borderClass: "border-l-emerald-500"
  },
}

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

const formatRelativeTime = (timestamp: number) => {
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 1000) return "just now"
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return formatTimestamp(timestamp)
}

const getSummary = (event: AgentEvent): string => {
  const data = event.data
  
  switch (event.type) {
    case "status": {
      if (typeof data === "string") return data
      const statusData = data as { message?: string }
      return statusData?.message || "Status update"
    }
    case "clone_progress":
    case "install_progress": {
      if (typeof data === "string") return data
      const progressData = data as { message?: string; progress?: number }
      if (progressData?.message) {
        return progressData.progress !== undefined 
          ? `${progressData.message} (${progressData.progress}%)`
          : progressData.message
      }
      return "Processing..."
    }
    case "thought":
      if (typeof data === "string") {
        return data.length > 100 ? data.slice(0, 100) + "..." : data
      }
      return "Thinking..."
    case "tool_call": {
      const toolCall = data as ToolCall
      if (toolCall?.name) {
        const args = toolCall.arguments || {}
        const argsSummary = Object.entries(args)
          .slice(0, 2)
          .map(([k, v]) => {
            const val = typeof v === "string" 
              ? (v.length > 30 ? v.slice(0, 30) + "..." : v)
              : JSON.stringify(v).slice(0, 30)
            return `${k}=${val}`
          })
          .join(", ")
        return `${toolCall.name}(${argsSummary})`
      }
      return "Tool call"
    }
    case "tool_result": {
      const result = data as ToolResult
      if (result?.error) return `Error: ${result.error}`
      if (result?.name) return `${result.name} completed`
      return "Result received"
    }
    case "error":
      return typeof data === "string" ? data : "An error occurred"
    case "complete":
      return "Agent completed task"
    case "output":
      return typeof data === "string" 
        ? (data.length > 80 ? data.slice(0, 80) + "..." : data)
        : "Output"
    default:
      return typeof data === "string" ? data : "Event"
  }
}

const formatDetails = (data: unknown): string => {
  if (typeof data === "string") return data
  if (data === null || data === undefined) return ""
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

const TimelineStep: Component<{ step: TimelineStep; isLatest: boolean }> = (props) => {
  const [expanded, setExpanded] = createSignal(false)
  const config = () => eventTypeConfig[props.step.type] || eventTypeConfig.output
  
  const hasDetails = () => {
    if (props.step.type === "thought") return true
    if (props.step.type === "tool_call" || props.step.type === "tool_result") return true
    if (props.step.type === "error") return true
    if (props.step.details && typeof props.step.details === "object") return true
    return false
  }

  return (
    <div 
      class={`group border-l-2 pl-4 py-2 transition-colors hover:bg-[var(--color-bg-secondary)] ${config().borderClass} ${props.isLatest ? "animate-slideUp" : ""}`}
    >
      <div 
        class={`flex items-start gap-3 ${hasDetails() ? "cursor-pointer" : ""}`}
        onClick={() => hasDetails() && setExpanded(!expanded())}
      >
        <div class={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${config().bgColor}`}>
          <span class={`text-xs ${config().color}`}>{config().icon}</span>
        </div>
        
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class={`text-xs font-medium ${config().color}`}>{config().label}</span>
            <Show when={props.step.provider}>
              <span class="px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
                {props.step.provider}
              </span>
            </Show>
            <span class="text-[10px] text-[var(--color-text-dim)] ml-auto">
              {formatTimestamp(props.step.timestamp)}
            </span>
          </div>
          
          <p class="mt-1 text-sm text-[var(--color-text-secondary)] break-words">
            {props.step.summary}
          </p>
          
          <Show when={hasDetails()}>
            <button 
              class="mt-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded())
              }}
            >
              <span class={`transition-transform ${expanded() ? "rotate-90" : ""}`}>▶</span>
              {expanded() ? "Hide details" : "Show details"}
            </button>
          </Show>
        </div>
      </div>
      
      <Show when={expanded() && props.step.details}>
        <div class="mt-2 ml-9 p-3 rounded-md bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] overflow-x-auto animate-fadeIn">
          <pre class="text-xs text-[var(--color-text-muted)] whitespace-pre-wrap break-all font-mono">
            {formatDetails(props.step.details)}
          </pre>
        </div>
      </Show>
    </div>
  )
}

export const TimelinePanel: Component<TimelinePanelProps> = (props) => {
  let containerRef: HTMLDivElement | undefined
  const [autoScroll, setAutoScroll] = createSignal(true)

  const steps = createMemo<TimelineStep[]>(() => {
    return props.events.map((event) => ({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      summary: getSummary(event),
      details: event.data,
      provider: event.provider,
    }))
  })

  createEffect(() => {
    const stepCount = steps().length
    if (stepCount > 0 && autoScroll() && containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight
    }
  })

  const handleScroll = () => {
    if (!containerRef) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }

  const scrollToBottom = () => {
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight
      setAutoScroll(true)
    }
  }

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div class="flex items-center gap-3">
          <h3 class="text-sm font-medium text-[var(--color-text)]">Agent Timeline</h3>
          <Show when={props.connected}>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span class="text-[10px] text-green-400">Live</span>
            </div>
          </Show>
          <Show when={props.reconnecting}>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <span class="text-[10px] text-yellow-400">Reconnecting...</span>
            </div>
          </Show>
          <Show when={!props.connected && !props.reconnecting}>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-gray-500" />
              <span class="text-[10px] text-gray-400">Disconnected</span>
            </div>
          </Show>
        </div>
        <span class="text-xs text-[var(--color-text-muted)]">{steps().length} steps</span>
      </div>

      <div
        ref={containerRef}
        class="flex-1 overflow-y-auto py-2"
        onScroll={handleScroll}
      >
        <Show when={steps().length === 0}>
          <div class="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
            <span class="text-2xl mb-2">⏳</span>
            <p class="text-sm">Waiting for agent activity...</p>
          </div>
        </Show>
        <For each={steps()}>
          {(step, index) => (
            <TimelineStep step={step} isLatest={index() === steps().length - 1} />
          )}
        </For>
      </div>

      <Show when={!autoScroll() && steps().length > 0}>
        <button
          class="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 text-xs bg-[var(--color-accent)] text-white rounded-full shadow-lg hover:bg-[var(--color-accent-hover)] transition-colors flex items-center gap-2"
          onClick={scrollToBottom}
        >
          <span>↓</span>
          <span>Scroll to latest</span>
          <span class="px-1.5 py-0.5 bg-white/20 rounded text-[10px]">
            {steps().length - Math.floor((containerRef?.scrollTop || 0) / 60)}
          </span>
        </button>
      </Show>
    </div>
  )
}
