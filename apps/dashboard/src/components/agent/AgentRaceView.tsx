import { Component, For, Show, createSignal, createMemo, createEffect, onCleanup } from "solid-js"
import type { AgentEvent, Provider, RunStatus, EventType } from "@/types"
import type { ProviderRunState } from "@/hooks/useRun"

interface AgentRaceViewProps {
  providerRuns: Map<Provider, ProviderRunState>
  events: AgentEvent[]
  connected: boolean
  reconnecting: boolean
  runId?: string | null
}

interface AgentStats {
  provider: Provider
  status: RunStatus
  iteration: number
  maxIterations: number
  currentTask: string
  completedStories: number
  totalStories: number
  toolCalls: number
  thoughts: number
  errors: number
  startTime: number | null
  duration: number | null
  progress: number
}

const providerColors: Record<Provider, { bg: string; border: string; text: string; glow: string; gradient: string }> = {
  modal: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/50",
    text: "text-emerald-400",
    glow: "shadow-emerald-500/20",
    gradient: "from-emerald-500 to-emerald-600"
  },
  daytona: {
    bg: "bg-violet-500/10",
    border: "border-violet-500/50",
    text: "text-violet-400",
    glow: "shadow-violet-500/20",
    gradient: "from-violet-500 to-violet-600"
  },
  e2b: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/50",
    text: "text-amber-400",
    glow: "shadow-amber-500/20",
    gradient: "from-amber-500 to-amber-600"
  },
  blaxel: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/50",
    text: "text-rose-400",
    glow: "shadow-rose-500/20",
    gradient: "from-rose-500 to-rose-600"
  },
  cloudflare: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/50",
    text: "text-orange-400",
    glow: "shadow-orange-500/20",
    gradient: "from-orange-500 to-orange-600"
  },
  vercel: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/50",
    text: "text-cyan-400",
    glow: "shadow-cyan-500/20",
    gradient: "from-cyan-500 to-cyan-600"
  },
  docker: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/50",
    text: "text-blue-400",
    glow: "shadow-blue-500/20",
    gradient: "from-blue-500 to-blue-600"
  },
}

const providerLogos: Record<Provider, string> = {
  modal: "\u26A1",
  daytona: "\uD83C\uDF19",
  e2b: "\uD83D\uDD32",
  blaxel: "\u2728",
  cloudflare: "\u2601\uFE0F",
  vercel: "\u25B2",
  docker: "\uD83D\uDC33",
}

const providerNames: Record<Provider, string> = {
  modal: "Modal",
  daytona: "Daytona",
  e2b: "E2B",
  blaxel: "Blaxel",
  cloudflare: "Cloudflare",
  vercel: "Vercel",
  docker: "Docker",
}

const statusEmoji: Record<RunStatus, string> = {
  idle: "\u23F8\uFE0F",
  cloning: "\uD83D\uDCE5",
  installing: "\uD83D\uDCE6",
  running: "\uD83C\uDFC3",
  paused: "\u23F8\uFE0F",
  completed: "\u2705",
  failed: "\u274C",
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

const RaceAgentCard: Component<{
  stats: AgentStats
  rank: number
  isLeader: boolean
  selected?: boolean
  onClick?: () => void
}> = (props) => {
  const colors = () => providerColors[props.stats.provider]
  const [pulseActive, setPulseActive] = createSignal(false)

  createEffect(() => {
    if (props.stats.status === "running") {
      const interval = setInterval(() => setPulseActive(p => !p), 1000)
      onCleanup(() => clearInterval(interval))
    }
  })

  const progressPercent = () => {
    if (props.stats.totalStories === 0) return props.stats.progress
    return Math.round((props.stats.completedStories / props.stats.totalStories) * 100)
  }

  return (
    <div
      class={`relative rounded-xl border-2 ${colors().border} ${colors().bg} p-4 transition-all duration-300 cursor-pointer ${
        props.isLeader && props.stats.status === "running" ? `shadow-lg ${colors().glow}` : ""
      } ${props.selected ? "ring-2 ring-white/50" : "hover:bg-white/5"} ${
        props.stats.status === "completed" ? "opacity-90" : ""
      } ${props.stats.status === "failed" ? "opacity-60" : ""}`}
      onClick={props.onClick}
    >
      {/* Rank Badge */}
      <div class={`absolute -top-3 -left-3 w-8 h-8 rounded-full bg-gradient-to-br ${colors().gradient} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
        {props.rank}
      </div>

      {/* Leader Crown */}
      <Show when={props.isLeader && props.stats.status === "running"}>
        <div class="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl animate-bounce">
          {"\uD83D\uDC51"}
        </div>
      </Show>

      {/* Header */}
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-2xl">{providerLogos[props.stats.provider]}</span>
          <div>
            <h3 class={`font-semibold ${colors().text}`}>{providerNames[props.stats.provider]}</h3>
            <p class="text-xs text-gray-500">Agent #{props.rank}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-lg">{statusEmoji[props.stats.status]}</span>
          <Show when={props.stats.status === "running" && pulseActive()}>
            <span class={`w-2 h-2 rounded-full bg-gradient-to-r ${colors().gradient} animate-ping`} />
          </Show>
        </div>
      </div>

      {/* Progress Bar */}
      <div class="mb-3">
        <div class="flex justify-between text-xs mb-1">
          <span class="text-gray-400">Progress</span>
          <span class={colors().text}>{progressPercent()}%</span>
        </div>
        <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            class={`h-full bg-gradient-to-r ${colors().gradient} transition-all duration-500 rounded-full`}
            style={{ width: `${progressPercent()}%` }}
          />
        </div>
      </div>

      {/* Iteration Counter */}
      <div class="flex items-center justify-between mb-3 p-2 bg-black/20 rounded-lg">
        <span class="text-xs text-gray-400">Iteration</span>
        <div class="flex items-center gap-1">
          <span class={`text-lg font-mono font-bold ${colors().text}`}>
            {props.stats.iteration}
          </span>
          <span class="text-xs text-gray-500">/ {props.stats.maxIterations}</span>
        </div>
      </div>

      {/* Current Task */}
      <div class="mb-3">
        <p class="text-xs text-gray-400 mb-1">Current Task</p>
        <p class="text-sm text-gray-300 truncate" title={props.stats.currentTask}>
          {props.stats.currentTask || "Initializing..."}
        </p>
      </div>

      {/* Stats Grid */}
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="p-2 bg-black/20 rounded">
          <p class={`text-lg font-mono font-bold ${colors().text}`}>{props.stats.completedStories}</p>
          <p class="text-[10px] text-gray-500">Stories</p>
        </div>
        <div class="p-2 bg-black/20 rounded">
          <p class={`text-lg font-mono font-bold ${colors().text}`}>{props.stats.toolCalls}</p>
          <p class="text-[10px] text-gray-500">Tools</p>
        </div>
        <div class="p-2 bg-black/20 rounded">
          <p class={`text-lg font-mono font-bold ${props.stats.errors > 0 ? "text-red-400" : colors().text}`}>
            {props.stats.errors}
          </p>
          <p class="text-[10px] text-gray-500">Errors</p>
        </div>
      </div>

      {/* Duration */}
      <Show when={props.stats.duration !== null}>
        <div class="mt-3 pt-3 border-t border-gray-700/50 flex justify-between items-center">
          <span class="text-xs text-gray-400">Duration</span>
          <span class={`text-sm font-mono ${colors().text}`}>
            {formatDuration(props.stats.duration!)}
          </span>
        </div>
      </Show>

      {/* Completed/Failed Overlay */}
      <Show when={props.stats.status === "completed"}>
        <div class="absolute inset-0 bg-emerald-500/5 rounded-xl flex items-center justify-center">
          <div class="text-center">
            <span class="text-4xl">{"\uD83C\uDFC6"}</span>
            <p class="text-emerald-400 font-semibold mt-1">Completed!</p>
          </div>
        </div>
      </Show>
      <Show when={props.stats.status === "failed"}>
        <div class="absolute inset-0 bg-red-500/5 rounded-xl flex items-center justify-center">
          <div class="text-center">
            <span class="text-4xl">{"\uD83D\uDCA5"}</span>
            <p class="text-red-400 font-semibold mt-1">Failed</p>
          </div>
        </div>
      </Show>
    </div>
  )
}

const LiveActivityFeed: Component<{ events: AgentEvent[]; limit?: number }> = (props) => {
  const recentEvents = createMemo(() => {
    return props.events
      .slice(-(props.limit || 10))
      .reverse()
  })

  const getEventColor = (event: AgentEvent) => {
    if (event.provider) {
      return providerColors[event.provider].text
    }
    return "text-gray-400"
  }

  const getEventIcon = (type: EventType) => {
    switch (type) {
      case "thought": return "\uD83D\uDCAD"
      case "tool_call": return "\u26A1"
      case "tool_result": return "\u2713"
      case "ralph_iteration": return "\uD83D\uDD04"
      case "ralph_complete": return "\uD83C\uDF89"
      case "opencode_ready": return "\uD83D\uDE80"
      case "error": return "\u274C"
      default: return "\u2192"
    }
  }

  const getEventSummary = (event: AgentEvent) => {
    const data = event.data
    switch (event.type) {
      case "thought":
        return typeof data === "string" ? data.slice(0, 50) : "Thinking..."
      case "tool_call":
        return `${(data as { name?: string })?.name || "tool"}()`
      case "ralph_iteration":
        return `Iteration ${(data as { iteration?: number })?.iteration || "?"}`
      case "ralph_complete":
        return "All tasks completed!"
      case "opencode_ready":
        return "OpenCode server ready"
      case "error":
        return typeof data === "string" ? data.slice(0, 40) : "Error occurred"
      default:
        return event.type
    }
  }

  return (
    <div class="h-full overflow-y-auto">
      <For each={recentEvents()}>
        {(event) => (
          <div class="flex items-start gap-2 px-3 py-2 hover:bg-white/5 border-b border-gray-800/50">
            <span class="text-sm">{getEventIcon(event.type)}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class={`text-xs font-medium ${getEventColor(event)}`}>
                  {event.provider ? providerNames[event.provider] : "System"}
                </span>
                <span class="text-[10px] text-gray-600">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p class="text-xs text-gray-400 truncate">{getEventSummary(event)}</p>
            </div>
          </div>
        )}
      </For>
      <Show when={recentEvents().length === 0}>
        <div class="flex items-center justify-center h-full text-gray-500 text-sm">
          Waiting for activity...
        </div>
      </Show>
    </div>
  )
}

export const AgentRaceView: Component<AgentRaceViewProps> = (props) => {
  const [elapsedTime, setElapsedTime] = createSignal(0)
  const [startTime] = createSignal(Date.now())
  const [selectedProvider, setSelectedProvider] = createSignal<Provider | null>(null)
  const [sidebarView, setSidebarView] = createSignal<"activity" | "sessions">("activity")

  createEffect(() => {
    const hasRunning = Array.from(props.providerRuns.values()).some(
      pr => ["cloning", "installing", "running"].includes(pr.status)
    )

    if (hasRunning) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime())
      }, 1000)
      onCleanup(() => clearInterval(interval))
    }
  })

  const agentStats = createMemo<AgentStats[]>(() => {
    const stats: AgentStats[] = []

    for (const [provider, run] of props.providerRuns) {
      const providerEvents = props.events.filter(e => e.provider === provider)

      let iteration = 0
      let maxIterations = 10
      let currentTask = ""
      let completedStories = 0
      let totalStories = 0

      for (const event of providerEvents) {
        if (event.type === "ralph_iteration") {
          const data = event.data as { iteration?: number; maxIterations?: number; message?: string }
          iteration = data.iteration || iteration
          maxIterations = data.maxIterations || maxIterations
          currentTask = data.message || currentTask
        }
        if (event.type === "ralph_complete") {
          const data = event.data as { summary?: string; iterations?: number }
          currentTask = data.summary || "All tasks completed"
          iteration = data.iterations || iteration
        }
        if (event.type === "status") {
          const data = event.data as { message?: string; completedStories?: number; totalStories?: number }
          if (data.message) currentTask = data.message
          if (data.completedStories !== undefined) completedStories = data.completedStories
          if (data.totalStories !== undefined) totalStories = data.totalStories
        }
      }

      const toolCalls = providerEvents.filter(e => e.type === "tool_call").length
      const thoughts = providerEvents.filter(e => e.type === "thought").length
      const errors = providerEvents.filter(e => e.type === "error").length

      const firstEvent = providerEvents[0]
      const lastEvent = providerEvents[providerEvents.length - 1]

      const startTimeMs = firstEvent?.timestamp || null
      const duration = run.status === "completed" || run.status === "failed"
        ? (lastEvent?.timestamp || Date.now()) - (startTimeMs || Date.now())
        : startTimeMs
          ? Date.now() - startTimeMs
          : null

      const progress = totalStories > 0
        ? Math.round((completedStories / totalStories) * 100)
        : Math.min(iteration * 10, 100)

      stats.push({
        provider,
        status: run.status,
        iteration,
        maxIterations,
        currentTask: currentTask || getStatusText(run.status),
        completedStories,
        totalStories,
        toolCalls,
        thoughts,
        errors,
        startTime: startTimeMs,
        duration,
        progress,
      })
    }

    return stats.sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return -1
      if (b.status === "completed" && a.status !== "completed") return 1
      return b.progress - a.progress || b.iteration - a.iteration
    })
  })

  const getStatusText = (status: RunStatus) => {
    switch (status) {
      case "cloning": return "Cloning repository..."
      case "installing": return "Installing dependencies..."
      case "running": return "Working on tasks..."
      case "completed": return "All tasks completed!"
      case "failed": return "Run failed"
      default: return "Initializing..."
    }
  }

  const leaderProvider = createMemo(() => {
    const running = agentStats().filter(s => s.status === "running")
    if (running.length === 0) return null
    return running[0].provider
  })

  const completedCount = createMemo(() =>
    agentStats().filter(s => s.status === "completed").length
  )

  const runningCount = createMemo(() =>
    agentStats().filter(s => ["cloning", "installing", "running"].includes(s.status)).length
  )

  return (
    <div class="flex flex-col h-full bg-gradient-to-b from-gray-950 to-gray-900">
      {/* Header */}
      <div class="px-6 py-4 border-b border-gray-800 bg-black/30">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
              {"\uD83C\uDFC1"} Agent Race
              <span class="text-sm font-normal text-gray-400">
                ({props.providerRuns.size} agents)
              </span>
            </h2>
            <div class="flex items-center gap-3 text-sm">
              <Show when={runningCount() > 0}>
                <span class="flex items-center gap-1.5 text-blue-400">
                  <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  {runningCount()} running
                </span>
              </Show>
              <Show when={completedCount() > 0}>
                <span class="text-emerald-400">
                  {"\u2713"} {completedCount()} completed
                </span>
              </Show>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <Show when={props.connected}>
              <span class="flex items-center gap-1.5 text-xs text-emerald-400">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </Show>
            <Show when={props.reconnecting}>
              <span class="flex items-center gap-1.5 text-xs text-yellow-400">
                <span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                Reconnecting...
              </span>
            </Show>
            <div class="text-sm font-mono text-gray-400">
              {"\u23F1\uFE0F"} {formatDuration(elapsedTime())}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div class="flex-1 flex overflow-hidden">
        {/* Agent Cards Grid */}
        <div class="flex-1 p-6 overflow-y-auto">
          <div class={`grid gap-4 ${
            agentStats().length <= 2 ? "grid-cols-2" :
            agentStats().length <= 4 ? "grid-cols-2 xl:grid-cols-4" :
            "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          }`}>
            <For each={agentStats()}>
              {(stats, index) => (
                <RaceAgentCard
                  stats={stats}
                  rank={index() + 1}
                  isLeader={stats.provider === leaderProvider()}
                  selected={selectedProvider() === stats.provider}
                  onClick={() => {
                    setSelectedProvider(stats.provider)
                    setSidebarView("activity")
                  }}
                />
              )}
            </For>
          </div>
        </div>

        {/* Sidebar - Activity Feed */}
        <div class="w-80 border-l border-gray-800 bg-black/20 flex flex-col">
          {/* Sidebar Tabs */}
          <div class="flex border-b border-gray-800">
            <button
              class={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                sidebarView() === "activity"
                  ? "text-white bg-white/5 border-b-2 border-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
              onClick={() => setSidebarView("activity")}
            >
              <span class="flex items-center justify-center gap-1.5">
                <span class="text-lg">{"\uD83D\uDCE1"}</span>
                Activity
              </span>
            </button>
            <button
              class={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                sidebarView() === "sessions"
                  ? "text-white bg-white/5 border-b-2 border-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
              onClick={() => setSidebarView("sessions")}
            >
              <span class="flex items-center justify-center gap-1.5">
                <span class="text-lg">{"\uD83E\uDDE0"}</span>
                Sessions
              </span>
            </button>
          </div>

          {/* Sidebar Content */}
          <Show when={sidebarView() === "activity"}>
            <LiveActivityFeed events={props.events} limit={20} />
          </Show>
          <Show when={sidebarView() === "sessions"}>
            <Show when={selectedProvider()}>
              <div class="flex-1 flex items-center justify-center text-gray-500 text-sm">
                <div class="text-center p-4">
                  <span class="text-3xl block mb-2">{"\uD83E\uDDE0"}</span>
                  <p>Sessions for {providerNames[selectedProvider()!]}</p>
                  <p class="text-xs mt-1 text-gray-600">OpenCode sessions view coming soon</p>
                </div>
              </div>
            </Show>
            <Show when={!selectedProvider()}>
              <div class="flex-1 flex items-center justify-center text-gray-500 text-sm">
                <div class="text-center p-4">
                  <span class="text-3xl block mb-2">{"\uD83D\uDC46"}</span>
                  <p>Select an agent to view sessions</p>
                </div>
              </div>
            </Show>
          </Show>
        </div>
      </div>

      {/* Footer Stats */}
      <div class="px-6 py-3 border-t border-gray-800 bg-black/30">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <div class="flex items-center gap-6">
            <span>Total Events: <span class="text-white font-mono">{props.events.length}</span></span>
            <span>Tool Calls: <span class="text-white font-mono">
              {props.events.filter(e => e.type === "tool_call").length}
            </span></span>
            <span>Errors: <span class={`font-mono ${
              props.events.filter(e => e.type === "error").length > 0 ? "text-red-400" : "text-white"
            }`}>
              {props.events.filter(e => e.type === "error").length}
            </span></span>
          </div>
          <div class="flex items-center gap-4">
            <For each={Object.entries(providerColors).slice(0, props.providerRuns.size)}>
              {([provider, colors]) => (
                <div class="flex items-center gap-1.5">
                  <span class={`w-2 h-2 rounded-full bg-gradient-to-r ${colors.gradient}`} />
                  <span class={colors.text}>{providerNames[provider as Provider]}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
