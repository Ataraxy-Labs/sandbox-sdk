import { createSignal, onCleanup, onMount, createEffect, Accessor } from "solid-js"
import type { AgentEvent, EventType } from "@/types"

export interface EventStreamState {
  connected: boolean
  reconnecting: boolean
  error: string | null
  events: AgentEvent[]
}

export interface UseEventStreamOptions {
  runId: string | null | Accessor<string | null>
  onEvent?: (event: AgentEvent) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: string) => void
  maxReconnectAttempts?: number
  reconnectDelay?: number
}

export function useEventStream(options: UseEventStreamOptions) {
  const {
    onEvent,
    onConnect,
    onDisconnect,
    onError,
    maxReconnectAttempts = 5,
    reconnectDelay = 1000,
  } = options

  // Handle both getter objects and direct accessor functions
  const getRunId = (): string | null => {
    const runIdOption = options.runId
    if (typeof runIdOption === "function") {
      return runIdOption()
    }
    return runIdOption
  }

  const [state, setState] = createSignal<EventStreamState>({
    connected: false,
    reconnecting: false,
    error: null,
    events: [],
  })

  let eventSource: EventSource | null = null
  let reconnectAttempts = 0
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    const currentRunId = getRunId()
    console.log("[useEventStream] connect() called, runId:", currentRunId)
    if (!currentRunId) {
      console.log("[useEventStream] No runId, skipping connection")
      return
    }

    // Close existing connection
    if (eventSource) {
      console.log("[useEventStream] Closing existing EventSource")
      eventSource.close()
      eventSource = null
    }

    const url = `/api/run/${currentRunId}/stream`
    console.log("[useEventStream] Creating EventSource for URL:", url)
    eventSource = new EventSource(url)

    eventSource.onopen = () => {
      console.log("[useEventStream] EventSource OPEN")
      reconnectAttempts = 0
      setState((prev) => ({
        ...prev,
        connected: true,
        reconnecting: false,
        error: null,
      }))
      onConnect?.()
    }

    eventSource.onerror = (e) => {
      console.error("[useEventStream] EventSource ERROR:", e)
      setState((prev) => ({
        ...prev,
        connected: false,
      }))
      onDisconnect?.()

      // Attempt reconnection
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++
        setState((prev) => ({
          ...prev,
          reconnecting: true,
        }))
        reconnectTimeout = setTimeout(() => {
          connect()
        }, reconnectDelay * reconnectAttempts)
      } else {
        const errorMsg = "Failed to connect after multiple attempts"
        setState((prev) => ({
          ...prev,
          reconnecting: false,
          error: errorMsg,
        }))
        onError?.(errorMsg)
      }
    }

    // Event types from the server
    const eventTypes: EventType[] = [
      "status",
      "clone_progress",
      "install_progress",
      "thought",
      "tool_call",
      "tool_result",
      "output",
      "error",
      "complete",
      "opencode_ready",
      "ralph_iteration",
      "ralph_complete",
    ]

    eventTypes.forEach((eventType) => {
      eventSource!.addEventListener(eventType, (e: MessageEvent) => {
        console.log(`[useEventStream] Received event type="${eventType}":`, e.data.substring(0, 200))
        try {
          const event = JSON.parse(e.data) as AgentEvent
          setState((prev) => ({
            ...prev,
            events: [...prev.events, event],
          }))
          onEvent?.(event)
        } catch (err) {
          console.error("[useEventStream] Failed to parse event:", err)
        }
      })
    })

    // Keep-alive ping
    eventSource.addEventListener("ping", () => {
      console.log("[useEventStream] Received ping")
    })
  }

  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    setState((prev) => ({
      ...prev,
      connected: false,
      reconnecting: false,
    }))
    onDisconnect?.()
  }

  const clearEvents = () => {
    setState((prev) => ({
      ...prev,
      events: [],
    }))
  }

  onMount(() => {
    const currentRunId = getRunId()
    console.log("[useEventStream] onMount, runId:", currentRunId)
    if (currentRunId) {
      connect()
    }
  })

  onCleanup(() => {
    disconnect()
  })

  return {
    state,
    connect,
    disconnect,
    clearEvents,
  }
}
