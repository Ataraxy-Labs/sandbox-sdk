import { Component, For, Show, createEffect, createSignal } from "solid-js"
import type { AgentEvent, EventType } from "../types"

interface EventLogProps {
  events: AgentEvent[]
  connected: boolean
  reconnecting: boolean
}

const eventTypeConfig: Record<EventType, { color: string; icon: string; label: string }> = {
  status: { color: "text-blue-400", icon: "●", label: "Status" },
  clone_progress: { color: "text-cyan-400", icon: "↓", label: "Clone" },
  install_progress: { color: "text-purple-400", icon: "⬇", label: "Install" },
  thought: { color: "text-blue-400", icon: "💭", label: "Thought" },
  tool_call: { color: "text-green-400", icon: "⚡", label: "Tool" },
  tool_result: { color: "text-yellow-400", icon: "✓", label: "Result" },
  output: { color: "text-gray-400", icon: "→", label: "Output" },
  error: { color: "text-red-400", icon: "✗", label: "Error" },
  complete: { color: "text-emerald-400", icon: "✓", label: "Complete" },
  opencode_ready: { color: "text-emerald-400", icon: "🚀", label: "OpenCode Ready" },
  ralph_iteration: { color: "text-cyan-400", icon: "🔄", label: "Ralph Iteration" },
  ralph_complete: { color: "text-emerald-400", icon: "🎉", label: "Ralph Complete" },
}

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

const formatEventData = (data: unknown): string => {
  if (typeof data === "string") return data
  if (data === null || data === undefined) return ""
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

export const EventLog: Component<EventLogProps> = (props) => {
  let containerRef: HTMLDivElement | undefined
  const [autoScroll, setAutoScroll] = createSignal(true)

  createEffect(() => {
    if (props.events.length > 0 && autoScroll() && containerRef) {
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
      <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-[var(--color-text-muted)]">Events</span>
          <Show when={props.connected}>
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Connected" />
          </Show>
          <Show when={props.reconnecting}>
            <span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Reconnecting..." />
          </Show>
          <Show when={!props.connected && !props.reconnecting}>
            <span class="w-2 h-2 rounded-full bg-gray-500" title="Disconnected" />
          </Show>
        </div>
        <span class="text-xs text-[var(--color-text-muted)]">{props.events.length} events</span>
      </div>

      <div
        ref={containerRef}
        class="flex-1 overflow-y-auto font-mono text-xs"
        onScroll={handleScroll}
      >
        <Show when={props.events.length === 0}>
          <div class="flex items-center justify-center h-full text-[var(--color-text-muted)]">
            No events yet
          </div>
        </Show>
        <For each={props.events}>
          {(event) => {
            const config = eventTypeConfig[event.type] || eventTypeConfig.output
            return (
              <div class="px-3 py-1.5 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]">
                <div class="flex items-start gap-2">
                  <span class={`shrink-0 ${config.color}`}>{config.icon}</span>
                  <span class="shrink-0 text-[var(--color-text-muted)] w-16">
                    {formatTimestamp(event.timestamp)}
                  </span>
                  <Show when={event.provider}>
                    <span class="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
                      {event.provider}
                    </span>
                  </Show>
                  <span class={`shrink-0 ${config.color}`}>{config.label}</span>
                </div>
                <Show when={event.data}>
                  <pre class="mt-1 ml-6 text-[var(--color-text-muted)] whitespace-pre-wrap break-all">
                    {formatEventData(event.data)}
                  </pre>
                </Show>
              </div>
            )
          }}
        </For>
      </div>

      <Show when={!autoScroll() && props.events.length > 0}>
        <button
          class="absolute bottom-4 right-4 px-3 py-1.5 text-xs bg-[var(--color-accent)] text-white rounded-md shadow-lg hover:bg-[var(--color-accent-hover)] transition-colors"
          onClick={scrollToBottom}
        >
          ↓ Scroll to bottom
        </button>
      </Show>
    </div>
  )
}
