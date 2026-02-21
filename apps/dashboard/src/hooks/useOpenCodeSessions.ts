import { createSignal, createEffect, onCleanup, Accessor } from "solid-js"
import type { Provider } from "@/types"

export interface OpenCodeSession {
  id: string
  parentID?: string
  title?: string
  directory?: string
  time?: {
    created: number
    updated: number
    archived?: number
  }
  // Legacy fields for backwards compatibility
  createdAt?: string
  updatedAt?: string
}

// Message types matching the opencode SDK
export interface OpenCodeUserMessage {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  summary?: { title?: string; body?: string }
  agent: string
  model?: { providerID: string; modelID: string }
}

export interface OpenCodeAssistantMessage {
  id: string
  sessionID: string
  role: "assistant"
  time: { created: number; completed?: number }
  parentID: string
  modelID: string
  providerID: string
  agent: string
  cost?: number
  tokens?: { input: number; output: number }
  error?: { name: string; data: { message: string } }
}

export type OpenCodeMessage = OpenCodeUserMessage | OpenCodeAssistantMessage

// Part types
export interface OpenCodeTextPart {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
}

export interface OpenCodeToolPart {
  id: string
  sessionID: string
  messageID: string
  type: "tool"
  callID: string
  tool: string
  state: {
    status: "pending" | "running" | "completed" | "error"
    input?: Record<string, unknown>
    output?: string
    error?: string
    title?: string
    time?: { start: number; end?: number }
  }
}

export interface OpenCodeReasoningPart {
  id: string
  sessionID: string
  messageID: string
  type: "reasoning"
  text: string
}

export type OpenCodePart = OpenCodeTextPart | OpenCodeToolPart | OpenCodeReasoningPart | { type: string; [key: string]: unknown }

// Message with parts from API response
export interface OpenCodeMessageWithParts {
  info: OpenCodeMessage
  parts: OpenCodePart[]
}

export interface UseOpenCodeSessionsOptions {
  runId: string | null | Accessor<string | null>
  provider: Provider | Accessor<Provider>
  pollInterval?: number
}

export function useOpenCodeSessions(options: UseOpenCodeSessionsOptions) {
  const { pollInterval = 5000 } = options

  // Handle both accessors and direct values
  const getRunId = (): string | null => {
    const runIdOption = options.runId
    if (typeof runIdOption === "function") {
      return runIdOption()
    }
    return runIdOption
  }

  const getProvider = (): Provider => {
    const providerOption = options.provider
    if (typeof providerOption === "function") {
      return providerOption()
    }
    return providerOption
  }

  const [sessions, setSessions] = createSignal<OpenCodeSession[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [healthy, setHealthy] = createSignal(false)
  const [opencodeUrl, setOpencodeUrl] = createSignal<string | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | null = null

  const checkHealth = async () => {
    const runId = getRunId()
    const provider = getProvider()
    if (!runId) return false

    try {
      const response = await fetch(`/api/run/${runId}/${provider}/opencode/health`)
      const data = await response.json()
      setHealthy(data.healthy ?? false)
      setOpencodeUrl(data.url ?? null)
      return data.healthy ?? false
    } catch {
      setHealthy(false)
      return false
    }
  }

  const fetchSessions = async () => {
    const runId = getRunId()
    const provider = getProvider()
    if (!runId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/run/${runId}/${provider}/opencode/session`)
      if (!response.ok) {
        throw new Error("Failed to fetch sessions")
      }
      const data = await response.json()
      setSessions(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  const fetchSessionMessages = async (sessionId: string, limit = 50): Promise<OpenCodeMessageWithParts[]> => {
    const runId = getRunId()
    const provider = getProvider()
    if (!runId) {
      console.log("[fetchSessionMessages] No runId")
      return []
    }

    try {
      const url = `/api/run/${runId}/${provider}/opencode/session/${sessionId}/message?limit=${limit}`
      console.log("[fetchSessionMessages] Fetching:", url)
      const response = await fetch(url)
      if (!response.ok) {
        console.error("[fetchSessionMessages] Failed:", response.status, response.statusText)
        throw new Error(`Failed to fetch messages: ${response.status}`)
      }
      const data = await response.json()
      console.log("[fetchSessionMessages] Got data:", data?.length || 0, "messages", data)
      return Array.isArray(data) ? data : []
    } catch (e) {
      console.error("[fetchSessionMessages] Error:", e)
      return []
    }
  }

  const fetchSessionChildren = async (sessionId: string): Promise<OpenCodeSession[]> => {
    const runId = getRunId()
    const provider = getProvider()
    if (!runId) return []

    try {
      const response = await fetch(`/api/run/${runId}/${provider}/opencode/session/${sessionId}/children`)
      if (!response.ok) {
        throw new Error("Failed to fetch children")
      }
      const data = await response.json()
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  const startPolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(async () => {
      const isHealthy = await checkHealth()
      if (isHealthy) {
        await fetchSessions()
      }
    }, pollInterval)
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  createEffect(() => {
    const runId = getRunId()
    if (runId) {
      checkHealth().then((isHealthy) => {
        if (isHealthy) {
          fetchSessions()
        }
      })
      startPolling()
    } else {
      stopPolling()
      setSessions([])
    }
  })

  onCleanup(() => {
    stopPolling()
  })

  // Subscribe to live SSE events from opencode
  const subscribeToEvents = (onEvent: (event: OpenCodeEvent) => void): (() => void) => {
    const runId = getRunId()
    const provider = getProvider()
    if (!runId) return () => {}

    const controller = new AbortController()

    const connect = async () => {
      try {
        const response = await fetch(`/api/run/${runId}/${provider}/opencode/event`, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        })

        if (!response.ok || !response.body) return

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6))
                onEvent({
                  type: data.type || "message",
                  data,
                  timestamp: new Date().toISOString(),
                })
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("SSE connection error:", err)
        }
      }
    }

    connect()
    return () => controller.abort()
  }

  return {
    sessions,
    loading,
    error,
    healthy,
    opencodeUrl,
    fetchSessions,
    fetchSessionMessages,
    fetchSessionChildren,
    checkHealth,
    subscribeToEvents,
  }
}

// Live event from opencode SSE
export interface OpenCodeEvent {
  type: string
  data: unknown
  timestamp: string
}
