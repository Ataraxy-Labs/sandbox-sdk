import { createSignal, createEffect } from "solid-js"
import type { AgentEvent, Provider, RunStatus, RalphAgentConfig } from "@/types"
import { useEventStream } from "./useEventStream"

export interface ProviderRunState {
  provider: Provider
  sandboxId: string | null
  status: RunStatus
  events: AgentEvent[]
  opencodeUrl?: string
  sessionId?: string
}

export interface RunState {
  id: string | null
  status: RunStatus
  providerRuns: Map<Provider, ProviderRunState>
  startedAt: number | null
  completedAt: number | null
  error: string | null
}

export interface StartRunParams {
  repoUrl: string
  branch: string
  task: string
  providers: Provider[]
  config?: RalphAgentConfig
}

export function useRun() {
  const [runId, setRunId] = createSignal<string | null>(null)
  const [runState, setRunState] = createSignal<RunState>({
    id: null,
    status: "idle",
    providerRuns: new Map(),
    startedAt: null,
    completedAt: null,
    error: null,
  })
  const [isStarting, setIsStarting] = createSignal(false)
  const [isStopping, setIsStopping] = createSignal(false)

  const handleEvent = (event: AgentEvent) => {
    console.log("[useRun] handleEvent:", event.type, event.provider, event.id)
    setRunState((prev) => {
      const newProviderRuns = new Map(prev.providerRuns)
      const provider = event.provider

      if (provider) {
        const existingRun = newProviderRuns.get(provider)

        // Determine new status based on event type
        let newProviderStatus: RunStatus = existingRun?.status || "cloning"
        if (event.type === "complete" || event.type === "ralph_complete") {
          newProviderStatus = "completed"
        } else if (event.type === "error") {
          newProviderStatus = "failed"
        } else if (event.type === "clone_progress") {
          newProviderStatus = "cloning"
        } else if (event.type === "install_progress") {
          newProviderStatus = "installing"
        } else if (event.type === "thought" || event.type === "tool_call" || event.type === "ralph_iteration" || event.type === "opencode_ready") {
          newProviderStatus = "running"
        }

        // Extract opencode URL from opencode_ready event
        let opencodeUrl = existingRun?.opencodeUrl
        if (event.type === "opencode_ready" && event.data && typeof event.data === "object") {
          const data = event.data as { url?: string }
          if (data.url) {
            opencodeUrl = data.url
          }
        }

        if (existingRun) {
          newProviderRuns.set(provider, {
            ...existingRun,
            events: [...existingRun.events, event],
            status: newProviderStatus,
            opencodeUrl: opencodeUrl || existingRun.opencodeUrl,
          })
        } else {
          // Create provider run if it doesn't exist (can happen with event replay)
          newProviderRuns.set(provider, {
            provider,
            sandboxId: null,
            events: [event],
            status: newProviderStatus,
            opencodeUrl,
          })
        }
      }

      // Check if all providers are done
      const allDone = newProviderRuns.size > 0 && Array.from(newProviderRuns.values()).every(
        (pr) => pr.status === "completed" || pr.status === "failed"
      )

      const anyFailed = Array.from(newProviderRuns.values()).some(
        (pr) => pr.status === "failed"
      )

      // Determine overall status from provider statuses
      let newStatus = prev.status
      if (allDone) {
        newStatus = anyFailed ? "failed" : "completed"
      } else {
        // Use the most "advanced" status from any provider
        const statuses = Array.from(newProviderRuns.values()).map(pr => pr.status)
        if (statuses.includes("running")) {
          newStatus = "running"
        } else if (statuses.includes("installing")) {
          newStatus = "installing"
        } else if (statuses.includes("cloning")) {
          newStatus = "cloning"
        }
      }

      return {
        ...prev,
        providerRuns: newProviderRuns,
        status: newStatus,
        completedAt: allDone ? Date.now() : prev.completedAt,
      }
    })
  }

  const eventStream = useEventStream({
    runId: runId,  // Pass the accessor directly
    onEvent: handleEvent,
    onError: (error) => {
      setRunState((prev) => ({
        ...prev,
        error,
      }))
    },
  })

  // Reconnect when runId changes
  createEffect(() => {
    const id = runId()
    console.log("[useRun] createEffect triggered, runId:", id)
    if (id) {
      console.log("[useRun] Calling eventStream.connect()")
      eventStream.connect()
    } else {
      console.log("[useRun] No runId, calling eventStream.disconnect()")
      eventStream.disconnect()
    }
  })

  const startRun = async (params: StartRunParams) => {
    setIsStarting(true)
    setRunState({
      id: null,
      status: "idle",
      providerRuns: new Map(),
      startedAt: null,
      completedAt: null,
      error: null,
    })

    try {
      const response = await fetch("/api/run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to start run")
      }

      const data = await response.json()
      console.log("[useRun] startRun response:", data)

      // Initialize provider runs
      const providerRuns = new Map<Provider, ProviderRunState>()
      for (const providerResult of data.providers) {
        providerRuns.set(providerResult.provider, {
          provider: providerResult.provider,
          sandboxId: providerResult.sandboxId,
          status: providerResult.success ? "cloning" : "failed",
          events: [],
        })
      }

      console.log("[useRun] Setting runId to:", data.runId)
      setRunState({
        id: data.runId,
        status: "cloning",
        providerRuns,
        startedAt: Date.now(),
        completedAt: null,
        error: null,
      })
      setRunId(data.runId)

      return data
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      setRunState((prev) => ({
        ...prev,
        status: "failed",
        error: errorMsg,
      }))
      throw error
    } finally {
      setIsStarting(false)
    }
  }

  const stopRun = async () => {
    const id = runId()
    if (!id) return

    setIsStopping(true)

    try {
      const response = await fetch(`/api/run/${id}/stop`, {
        method: "POST",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to stop run")
      }

      setRunState((prev) => ({
        ...prev,
        status: "completed",
        completedAt: Date.now(),
      }))

      eventStream.disconnect()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      setRunState((prev) => ({
        ...prev,
        error: errorMsg,
      }))
      throw error
    } finally {
      setIsStopping(false)
    }
  }

  const getEvents = () => eventStream.state().events

  const getEventsByProvider = (provider: Provider) => {
    return eventStream.state().events.filter((e) => e.provider === provider)
  }

  const isConnected = () => eventStream.state().connected

  const isReconnecting = () => eventStream.state().reconnecting

  return {
    runId,
    runState,
    isStarting,
    isStopping,
    startRun,
    stopRun,
    getEvents,
    getEventsByProvider,
    isConnected,
    isReconnecting,
  }
}
