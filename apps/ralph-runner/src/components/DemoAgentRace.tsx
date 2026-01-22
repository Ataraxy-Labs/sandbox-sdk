import { Component, createSignal, createEffect, onCleanup, For } from "solid-js"
import type { AgentEvent, Provider, RunStatus } from "../types"
import type { ProviderRunState } from "../hooks/useRun"
import { AgentRaceView } from "./AgentRaceView"

interface DemoAgentRaceProps {
  autoStart?: boolean
}

const DEMO_PROVIDERS: Provider[] = ["modal", "daytona", "e2b", "blaxel", "cloudflare", "docker"]

const DEMO_TASKS = [
  "Implementing user authentication",
  "Adding API rate limiting",
  "Creating dashboard UI",
  "Setting up database migrations",
  "Writing unit tests",
  "Configuring CI/CD pipeline",
  "Optimizing query performance",
  "Adding error handling",
  "Implementing caching layer",
  "Creating API documentation",
]

const DEMO_TOOL_CALLS = [
  "read_file",
  "write_file",
  "run_command",
  "search_code",
  "list_directory",
  "create_file",
  "edit_file",
  "run_tests",
  "git_commit",
  "install_dependency",
]

const generateDemoEvent = (
  provider: Provider,
  eventIndex: number,
  iteration: number,
  maxIterations: number,
): AgentEvent => {
  const types: AgentEvent["type"][] = ["thought", "tool_call", "tool_result", "output"]
  const type = types[Math.floor(Math.random() * types.length)]
  const timestamp = Date.now()
  const id = `demo_${provider}_${timestamp}_${eventIndex}`

  switch (type) {
    case "thought":
      return {
        id,
        type: "thought",
        timestamp,
        provider,
        data: `Analyzing ${DEMO_TASKS[Math.floor(Math.random() * DEMO_TASKS.length)]}...`,
      }
    case "tool_call":
      return {
        id,
        type: "tool_call",
        timestamp,
        provider,
        data: {
          name: DEMO_TOOL_CALLS[Math.floor(Math.random() * DEMO_TOOL_CALLS.length)],
          arguments: { path: `/src/components/${Math.random().toString(36).slice(2, 8)}.ts` },
        },
      }
    case "tool_result":
      return {
        id,
        type: "tool_result",
        timestamp,
        provider,
        data: {
          name: DEMO_TOOL_CALLS[Math.floor(Math.random() * DEMO_TOOL_CALLS.length)],
          result: "Success",
        },
      }
    default:
      return {
        id,
        type: "output",
        timestamp,
        provider,
        data: `Processing iteration ${iteration}/${maxIterations}`,
      }
  }
}

const generateIterationEvent = (
  provider: Provider,
  iteration: number,
  maxIterations: number,
): AgentEvent => {
  return {
    id: `demo_${provider}_iteration_${iteration}`,
    type: "ralph_iteration",
    timestamp: Date.now(),
    provider,
    data: {
      iteration,
      maxIterations,
      message: DEMO_TASKS[iteration % DEMO_TASKS.length],
    },
  }
}

const generateCompleteEvent = (provider: Provider, iterations: number): AgentEvent => {
  return {
    id: `demo_${provider}_complete`,
    type: "ralph_complete",
    timestamp: Date.now(),
    provider,
    data: {
      success: true,
      summary: "All user stories completed successfully!",
      iterations,
    },
  }
}

export const DemoAgentRace: Component<DemoAgentRaceProps> = (props) => {
  const [events, setEvents] = createSignal<AgentEvent[]>([])
  const [providerRuns, setProviderRuns] = createSignal<Map<Provider, ProviderRunState>>(new Map())
  const [isRunning, setIsRunning] = createSignal(false)
  const [isPaused, setIsPaused] = createSignal(false)

  const providerState = new Map<Provider, { iteration: number; eventCount: number; maxIterations: number; status: RunStatus }>()

  const initializeProviders = () => {
    const runs = new Map<Provider, ProviderRunState>()
    for (const provider of DEMO_PROVIDERS) {
      const maxIterations = 5 + Math.floor(Math.random() * 6) // 5-10 iterations
      providerState.set(provider, { 
        iteration: 0, 
        eventCount: 0, 
        maxIterations,
        status: "cloning"
      })
      runs.set(provider, {
        provider,
        sandboxId: `demo-${provider}-${Date.now()}`,
        status: "cloning",
        events: [],
      })
    }
    setProviderRuns(runs)
  }

  const tick = () => {
    if (isPaused()) return

    const newEvents: AgentEvent[] = []
    const updatedRuns = new Map(providerRuns())

    for (const provider of DEMO_PROVIDERS) {
      const state = providerState.get(provider)!
      const run = updatedRuns.get(provider)!

      if (run.status === "completed" || run.status === "failed") continue

      // Simulate different speeds for different providers
      const speedFactors: Record<Provider, number> = {
        modal: 0.8,
        daytona: 0.6,
        e2b: 0.7,
        blaxel: 0.5,
        cloudflare: 0.75,
        vercel: 0.65,
        docker: 0.9,
      }
      const speedFactor = speedFactors[provider]

      if (Math.random() > speedFactor) continue

      // Progress through stages
      if (state.status === "cloning" && state.eventCount > 2) {
        state.status = "installing"
        run.status = "installing"
        newEvents.push({
          id: `demo_${provider}_installing`,
          type: "status",
          timestamp: Date.now(),
          provider,
          data: { message: "Installing dependencies..." },
        })
      } else if (state.status === "installing" && state.eventCount > 5) {
        state.status = "running"
        run.status = "running"
        newEvents.push({
          id: `demo_${provider}_running`,
          type: "opencode_ready",
          timestamp: Date.now(),
          provider,
          data: { url: `https://demo.${provider}.dev:4096` },
        })
        // Start first iteration
        state.iteration = 1
        newEvents.push(generateIterationEvent(provider, 1, state.maxIterations))
      } else if (state.status === "running") {
        // Generate some activity events
        if (Math.random() > 0.3) {
          newEvents.push(generateDemoEvent(provider, state.eventCount, state.iteration, state.maxIterations))
        }

        // Occasionally advance iteration
        if (state.eventCount > 0 && state.eventCount % 8 === 0 && state.iteration < state.maxIterations) {
          state.iteration++
          newEvents.push(generateIterationEvent(provider, state.iteration, state.maxIterations))
        }

        // Check for completion
        if (state.iteration >= state.maxIterations && state.eventCount > state.maxIterations * 6) {
          state.status = "completed"
          run.status = "completed"
          newEvents.push(generateCompleteEvent(provider, state.iteration))
        }

        // Small chance of failure for demo purposes (but make it rare)
        if (Math.random() < 0.002 && state.iteration > 2) {
          state.status = "failed"
          run.status = "failed"
          newEvents.push({
            id: `demo_${provider}_error`,
            type: "error",
            timestamp: Date.now(),
            provider,
            data: "Demo failure: Simulated error for demonstration",
          })
        }
      }

      state.eventCount++
      updatedRuns.set(provider, { ...run })
    }

    if (newEvents.length > 0) {
      setEvents(prev => [...prev, ...newEvents])
    }
    setProviderRuns(updatedRuns)

    // Check if all done
    const allDone = Array.from(providerState.values()).every(
      s => s.status === "completed" || s.status === "failed"
    )
    if (allDone) {
      setIsRunning(false)
    }
  }

  const startDemo = () => {
    setEvents([])
    initializeProviders()
    setIsRunning(true)
    setIsPaused(false)
  }

  const togglePause = () => {
    setIsPaused(p => !p)
  }

  const resetDemo = () => {
    setIsRunning(false)
    setIsPaused(false)
    setEvents([])
    setProviderRuns(new Map())
    providerState.clear()
  }

  createEffect(() => {
    if (isRunning() && !isPaused()) {
      const interval = setInterval(tick, 200)
      onCleanup(() => clearInterval(interval))
    }
  })

  createEffect(() => {
    if (props.autoStart && !isRunning() && events().length === 0) {
      startDemo()
    }
  })

  return (
    <div class="flex flex-col h-full">
      {/* Demo Controls */}
      <div class="px-4 py-3 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-b border-purple-500/20">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-lg">🎮</span>
            <span class="text-sm font-medium text-purple-300">Demo Mode</span>
            <span class="text-xs text-gray-400">
              Simulating 5 agents working on a PRD
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                isRunning()
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
              onClick={startDemo}
              disabled={isRunning()}
            >
              {events().length === 0 ? "▶ Start Demo" : "↻ Restart"}
            </button>
            <button
              class={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                !isRunning()
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : isPaused()
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
              onClick={togglePause}
              disabled={!isRunning()}
            >
              {isPaused() ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button
              class="px-3 py-1.5 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              onClick={resetDemo}
            >
              ✕ Reset
            </button>
          </div>
        </div>
      </div>

      {/* Agent Race View */}
      <div class="flex-1 overflow-hidden">
        {providerRuns().size > 0 ? (
          <AgentRaceView
            providerRuns={providerRuns()}
            events={events()}
            connected={isRunning()}
            reconnecting={false}
          />
        ) : (
          <div class="flex items-center justify-center h-full text-gray-400">
            <div class="text-center">
              <div class="text-6xl mb-4">🏁</div>
              <h3 class="text-xl font-medium text-white mb-2">Agent Race Demo</h3>
              <p class="text-sm text-gray-500 max-w-md">
                Click "Start Demo" to see 5 AI agents racing to complete 
                different parts of a PRD simultaneously.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
