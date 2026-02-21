import { Component, For, Show, createSignal, createMemo, createEffect } from "solid-js"
import type { AgentEvent, Provider, RunStatus, EventType, ToolCall, ToolResult } from "@/types"
import type { ProviderRunState } from "@/hooks/useRun"

interface ComparisonViewProps {
  providerRuns: Map<Provider, ProviderRunState>
  events: AgentEvent[]
  connected: boolean
  reconnecting: boolean
}

interface ProviderSummary {
  provider: Provider
  status: RunStatus
  stepCount: number
  toolCallCount: number
  errorCount: number
  startTime: number | null
  endTime: number | null
  duration: number | null
  currentIteration: number
  maxIterations: number
  currentTask: string | null
  opencodeUrl: string | null
}

type TabType = "timeline" | "terminal"

const providerDisplayNames: Record<Provider, string> = {
  modal: "Modal",
  daytona: "Daytona",
  e2b: "E2B",
  blaxel: "Blaxel",
  cloudflare: "Cloudflare",
  vercel: "Vercel",
  docker: "Docker",
}

// Distinct colors for each provider - vibrant and easily distinguishable
const providerColors: Record<Provider, { primary: string; bg: string; border: string; glow: string; gradient: string }> = {
  modal: {
    primary: "#10b981",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/50",
    glow: "shadow-emerald-500/20",
    gradient: "from-emerald-500/20 to-emerald-500/5"
  },
  daytona: {
    primary: "#8b5cf6",
    bg: "bg-violet-500/10",
    border: "border-violet-500/50",
    glow: "shadow-violet-500/20",
    gradient: "from-violet-500/20 to-violet-500/5"
  },
  e2b: {
    primary: "#f59e0b",
    bg: "bg-amber-500/10",
    border: "border-amber-500/50",
    glow: "shadow-amber-500/20",
    gradient: "from-amber-500/20 to-amber-500/5"
  },
  blaxel: {
    primary: "#ec4899",
    bg: "bg-pink-500/10",
    border: "border-pink-500/50",
    glow: "shadow-pink-500/20",
    gradient: "from-pink-500/20 to-pink-500/5"
  },
  cloudflare: {
    primary: "#f97316",
    bg: "bg-orange-500/10",
    border: "border-orange-500/50",
    glow: "shadow-orange-500/20",
    gradient: "from-orange-500/20 to-orange-500/5"
  },
  vercel: {
    primary: "#06b6d4",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/50",
    glow: "shadow-cyan-500/20",
    gradient: "from-cyan-500/20 to-cyan-500/5"
  },
  docker: {
    primary: "#3b82f6",
    bg: "bg-blue-500/10",
    border: "border-blue-500/50",
    glow: "shadow-blue-500/20",
    gradient: "from-blue-500/20 to-blue-500/5"
  },
}

const statusConfig: Record<RunStatus, { color: string; bgColor: string; label: string; pulse: boolean }> = {
  idle: { color: "text-gray-400", bgColor: "bg-gray-500", label: "Idle", pulse: false },
  cloning: { color: "text-cyan-400", bgColor: "bg-cyan-500", label: "Cloning", pulse: true },
  installing: { color: "text-purple-400", bgColor: "bg-purple-500", label: "Installing", pulse: true },
  running: { color: "text-blue-400", bgColor: "bg-blue-500", label: "Running", pulse: true },
  paused: { color: "text-yellow-400", bgColor: "bg-yellow-500", label: "Paused", pulse: false },
  completed: { color: "text-green-400", bgColor: "bg-green-500", label: "Completed", pulse: false },
  failed: { color: "text-red-400", bgColor: "bg-red-500", label: "Failed", pulse: false },
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

const eventTypeConfig: Record<EventType, { color: string; icon: string }> = {
  status: { color: "text-gray-400", icon: "\u25CB" },
  clone_progress: { color: "text-cyan-400", icon: "\u2193" },
  install_progress: { color: "text-purple-400", icon: "\u2B07" },
  thought: { color: "text-blue-400", icon: "\uD83D\uDCAD" },
  tool_call: { color: "text-green-400", icon: "\u26A1" },
  tool_result: { color: "text-yellow-400", icon: "\u2713" },
  output: { color: "text-gray-400", icon: "\u2192" },
  error: { color: "text-red-400", icon: "\u2717" },
  complete: { color: "text-emerald-400", icon: "\u2713" },
  opencode_ready: { color: "text-emerald-400", icon: "\uD83D\uDE80" },
  ralph_iteration: { color: "text-cyan-400", icon: "\uD83D\uDD04" },
  ralph_complete: { color: "text-emerald-400", icon: "\uD83C\uDF89" },
}

const getSummaryText = (event: AgentEvent): string => {
  const data = event.data

  switch (event.type) {
    case "status":
      return typeof data === "string" ? data : String(data)
    case "clone_progress":
    case "install_progress":
      return typeof data === "string" ? data : "Processing..."
    case "thought":
      if (typeof data === "string") {
        return data.length > 60 ? data.slice(0, 60) + "..." : data
      }
      return "Thinking..."
    case "tool_call": {
      const toolCall = data as ToolCall
      return toolCall?.name ? `${toolCall.name}()` : "Tool call"
    }
    case "tool_result": {
      const result = data as ToolResult
      if (result?.error) return `Error: ${result.error.slice(0, 40)}...`
      return result?.name ? `${result.name} done` : "Result"
    }
    case "ralph_iteration": {
      const iterData = data as { iteration?: number; maxIterations?: number; message?: string }
      return iterData?.message || `Iteration ${iterData?.iteration || "?"}/${iterData?.maxIterations || "?"}`
    }
    case "ralph_complete": {
      const completeData = data as { summary?: string; iterations?: number }
      return completeData?.summary || `Completed in ${completeData?.iterations || "?"} iterations`
    }
    case "opencode_ready": {
      const readyData = data as { url?: string }
      return readyData?.url ? `OpenCode ready` : "OpenCode starting..."
    }
    case "error":
      return typeof data === "string" ? data.slice(0, 60) : "Error"
    case "complete":
      return "Complete"
    case "output":
      return typeof data === "string" ? data.slice(0, 60) : "Output"
    default:
      return "Event"
  }
}

// Progress ring component for iteration display
const ProgressRing: Component<{ progress: number; size: number; strokeWidth: number; color: string }> = (props) => {
  const radius = () => (props.size - props.strokeWidth) / 2
  const circumference = () => radius() * 2 * Math.PI
  const offset = () => circumference() - (props.progress / 100) * circumference()

  return (
    <svg width={props.size} height={props.size} class="transform -rotate-90">
      <circle
        cx={props.size / 2}
        cy={props.size / 2}
        r={radius()}
        fill="none"
        stroke="currentColor"
        stroke-width={props.strokeWidth}
        class="text-gray-700"
      />
      <circle
        cx={props.size / 2}
        cy={props.size / 2}
        r={radius()}
        fill="none"
        stroke={props.color}
        stroke-width={props.strokeWidth}
        stroke-linecap="round"
        stroke-dasharray={`${circumference()}`}
        stroke-dashoffset={`${offset()}`}
        class="transition-all duration-500"
      />
    </svg>
  )
}

const MiniTimeline: Component<{
  events: AgentEvent[]
  syncScroll: boolean
  scrollTop: number
  onScroll: (scrollTop: number) => void
  providerColor: string
}> = (props) => {
  let containerRef: HTMLDivElement | undefined

  createEffect(() => {
    if (props.syncScroll && containerRef) {
      containerRef.scrollTop = props.scrollTop
    }
  })

  const handleScroll = () => {
    if (containerRef && !props.syncScroll) {
      props.onScroll(containerRef.scrollTop)
    }
  }

  return (
    <div
      ref={containerRef}
      class="flex-1 overflow-y-auto py-1"
      onScroll={handleScroll}
    >
      <Show when={props.events.length === 0}>
        <div class="flex items-center justify-center h-20 text-[var(--color-text-muted)] text-xs">
          <div class="flex flex-col items-center gap-2">
            <div class="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ "border-color": props.providerColor, "border-top-color": "transparent" }} />
            <span>Waiting for events...</span>
          </div>
        </div>
      </Show>
      <For each={props.events}>
        {(event) => {
          const config = eventTypeConfig[event.type] || eventTypeConfig.output
          return (
            <div
              class="flex items-start gap-2 px-2 py-1.5 hover:bg-[var(--color-bg-secondary)] border-l-2 transition-colors"
              style={{ "border-left-color": event.type === "ralph_iteration" || event.type === "ralph_complete" ? props.providerColor : "transparent" }}
            >
              <span class={`shrink-0 ${config.color} text-xs`}>{config.icon}</span>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] text-[var(--color-text-secondary)] truncate">
                  {getSummaryText(event)}
                </p>
              </div>
              <span class="text-[9px] text-[var(--color-text-dim)] shrink-0">
                {formatTimestamp(event.timestamp)}
              </span>
            </div>
          )
        }}
      </For>
    </div>
  )
}

const MiniTerminal: Component<{ events: AgentEvent[]; providerColor: string }> = (props) => {
  const commandOutputs = createMemo(() => {
    const outputs: { command: string; output: string; exitCode?: number }[] = []
    const events = props.events

    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      if (event.type === "tool_call") {
        const toolCall = event.data as ToolCall
        if (toolCall?.name === "run_command") {
          const command = String(toolCall.arguments?.command || "")
          const resultEvent = events.slice(i + 1).find(
            (e) => e.type === "tool_result" && (e.data as ToolResult)?.name === "run_command"
          )

          let output = ""
          let exitCode: number | undefined

          if (resultEvent) {
            const result = resultEvent.data as ToolResult
            if (result?.error) {
              output = result.error
              exitCode = 1
            } else if (result?.result) {
              const res = result.result as { stdout?: string; stderr?: string; exitCode?: number }
              if (typeof res === "string") {
                output = res
              } else {
                if (res.stdout) output += res.stdout
                if (res.stderr) output += (output ? "\n" : "") + res.stderr
                exitCode = res.exitCode
              }
            }
          }

          outputs.push({ command, output, exitCode })
        }
      }
    }
    return outputs
  })

  return (
    <div class="flex-1 overflow-y-auto p-2 bg-[#0a0a0a] font-mono text-xs">
      <Show when={commandOutputs().length === 0}>
        <div class="flex items-center justify-center h-20 text-gray-500 text-xs">
          No commands yet...
        </div>
      </Show>
      <For each={commandOutputs()}>
        {(cmd) => (
          <div class="mb-2">
            <div style={{ color: props.providerColor }}>$ {cmd.command}</div>
            <Show when={cmd.output}>
              <div class="text-gray-300 whitespace-pre-wrap break-all text-[10px] max-h-24 overflow-hidden">
                {cmd.output.length > 200 ? cmd.output.slice(0, 200) + "..." : cmd.output}
              </div>
            </Show>
            <Show when={cmd.exitCode !== undefined && cmd.exitCode !== 0}>
              <div class="text-red-400 text-[10px]">[exit: {cmd.exitCode}]</div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

const AgentCard: Component<{
  provider: Provider
  run: ProviderRunState
  events: AgentEvent[]
  summary: ProviderSummary
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  syncScroll: boolean
  scrollTop: number
  onScroll: (scrollTop: number) => void
  isWinner: boolean
  rank: number | null
}> = (props) => {
  const statusCfg = () => statusConfig[props.run.status]
  const colors = () => providerColors[props.provider]
  const progress = () => props.summary.maxIterations > 0
    ? (props.summary.currentIteration / props.summary.maxIterations) * 100
    : 0

  return (
    <div
      class={`flex flex-col h-full rounded-xl overflow-hidden transition-all duration-300 ${
        props.isWinner ? "ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20" : ""
      }`}
      style={{
        "background": `linear-gradient(135deg, ${colors().gradient.replace("from-", "").replace(" to-", ", ").replace("/20", "33").replace("/5", "0d")})`,
        "border": `1px solid ${colors().primary}33`
      }}
    >
      {/* Header with provider name and status */}
      <div
        class="flex items-center justify-between px-3 py-2.5 border-b"
        style={{ "border-color": `${colors().primary}33` }}
      >
        <div class="flex items-center gap-2">
          {/* Provider icon/avatar */}
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: colors().primary }}
          >
            {providerDisplayNames[props.provider][0]}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-[var(--color-text)]">
                {providerDisplayNames[props.provider]}
              </span>
              <Show when={props.isWinner}>
                <span class="text-yellow-400 text-xs">{"\uD83C\uDFC6"}</span>
              </Show>
              <Show when={props.rank !== null && props.rank > 1}>
                <span class="text-[10px] text-[var(--color-text-muted)]">#{props.rank}</span>
              </Show>
            </div>
            <div class="flex items-center gap-1.5">
              <span
                class={`w-1.5 h-1.5 rounded-full ${statusCfg().bgColor} ${statusCfg().pulse ? "animate-pulse" : ""}`}
              />
              <span class={`text-[10px] ${statusCfg().color}`}>{statusCfg().label}</span>
            </div>
          </div>
        </div>

        {/* Progress ring */}
        <div class="relative">
          <ProgressRing
            progress={progress()}
            size={36}
            strokeWidth={3}
            color={colors().primary}
          />
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-[9px] font-mono text-[var(--color-text)]">
              {props.summary.currentIteration}/{props.summary.maxIterations || "?"}
            </span>
          </div>
        </div>
      </div>

      {/* Current task indicator */}
      <Show when={props.summary.currentTask}>
        <div
          class="px-3 py-1.5 text-[10px] border-b truncate"
          style={{
            "border-color": `${colors().primary}33`,
            background: `${colors().primary}11`
          }}
        >
          <span class="text-[var(--color-text-muted)]">Working on: </span>
          <span style={{ color: colors().primary }}>{props.summary.currentTask}</span>
        </div>
      </Show>

      {/* Stats row */}
      <div
        class="flex items-center justify-between px-3 py-1.5 text-[10px] border-b"
        style={{ "border-color": `${colors().primary}22` }}
      >
        <div class="flex items-center gap-3 text-[var(--color-text-muted)]">
          <span>Steps: <span class="text-[var(--color-text)] font-medium">{props.summary.stepCount}</span></span>
          <span>Tools: <span class="text-[var(--color-text)] font-medium">{props.summary.toolCallCount}</span></span>
          <Show when={props.summary.errorCount > 0}>
            <span class="text-red-400">{"\u26A0"} {props.summary.errorCount}</span>
          </Show>
        </div>
        <Show when={props.summary.duration !== null}>
          <span class="font-mono" style={{ color: colors().primary }}>
            {formatDuration(props.summary.duration!)}
          </span>
        </Show>
      </div>

      {/* Tab buttons */}
      <div class="flex gap-1 px-2 py-1.5 border-b" style={{ "border-color": `${colors().primary}22` }}>
        <button
          class={`px-2 py-1 text-[10px] rounded transition-all ${
            props.activeTab === "timeline"
              ? "text-white"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
          style={{
            background: props.activeTab === "timeline" ? colors().primary : "transparent"
          }}
          onClick={() => props.onTabChange("timeline")}
        >
          Timeline
        </button>
        <button
          class={`px-2 py-1 text-[10px] rounded transition-all ${
            props.activeTab === "terminal"
              ? "text-white"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
          style={{
            background: props.activeTab === "terminal" ? colors().primary : "transparent"
          }}
          onClick={() => props.onTabChange("terminal")}
        >
          Terminal
        </button>
        <Show when={props.summary.opencodeUrl}>
          <a
            href={props.summary.opencodeUrl!}
            target="_blank"
            rel="noopener noreferrer"
            class="px-2 py-1 text-[10px] rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] ml-auto flex items-center gap-1"
          >
            <span>{"\uD83D\uDD17"}</span>
            <span>OpenCode</span>
          </a>
        </Show>
      </div>

      {/* Content area */}
      <div class="flex-1 overflow-hidden">
        <Show when={props.activeTab === "timeline"}>
          <MiniTimeline
            events={props.events}
            syncScroll={props.syncScroll}
            scrollTop={props.scrollTop}
            onScroll={props.onScroll}
            providerColor={colors().primary}
          />
        </Show>
        <Show when={props.activeTab === "terminal"}>
          <MiniTerminal events={props.events} providerColor={colors().primary} />
        </Show>
      </div>
    </div>
  )
}

export const ComparisonView: Component<ComparisonViewProps> = (props) => {
  const [syncScroll, setSyncScroll] = createSignal(true)
  const [globalScrollTop, setGlobalScrollTop] = createSignal(0)
  const [activeTabs, setActiveTabs] = createSignal<Map<Provider, TabType>>(new Map())
  const [elapsedTime, setElapsedTime] = createSignal(0)

  // Update elapsed time every second
  createEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 1000)
    return () => clearInterval(interval)
  })

  const providers = createMemo(() => {
    return Array.from(props.providerRuns.keys())
  })

  const eventsByProvider = createMemo(() => {
    const map = new Map<Provider, AgentEvent[]>()
    for (const provider of providers()) {
      map.set(provider, props.events.filter(e => e.provider === provider))
    }
    return map
  })

  const summaries = createMemo<Map<Provider, ProviderSummary>>(() => {
    const map = new Map<Provider, ProviderSummary>()

    for (const [provider, run] of props.providerRuns) {
      const events = eventsByProvider().get(provider) || []
      const toolCalls = events.filter(e => e.type === "tool_call")
      const errors = events.filter(e => e.type === "error")

      const startTime = events.length > 0 ? events[0].timestamp : null
      const endEvent = events.find(e => e.type === "complete" || e.type === "ralph_complete" || e.type === "error")
      const endTime = endEvent?.timestamp || null

      // Extract iteration info from ralph_iteration events
      const iterEvents = events.filter(e => e.type === "ralph_iteration")
      const lastIterEvent = iterEvents[iterEvents.length - 1]
      const iterData = lastIterEvent?.data as { iteration?: number; maxIterations?: number } | undefined

      // Extract current task from the latest thought or tool_call
      const taskEvents = events.filter(e => e.type === "thought" || e.type === "tool_call")
      const lastTaskEvent = taskEvents[taskEvents.length - 1]
      let currentTask: string | null = null
      if (lastTaskEvent?.type === "thought" && typeof lastTaskEvent.data === "string") {
        currentTask = lastTaskEvent.data.slice(0, 50)
      } else if (lastTaskEvent?.type === "tool_call") {
        const tc = lastTaskEvent.data as ToolCall
        currentTask = tc?.name || null
      }

      map.set(provider, {
        provider,
        status: run.status,
        stepCount: events.length,
        toolCallCount: toolCalls.length,
        errorCount: errors.length,
        startTime,
        endTime,
        duration: startTime && endTime ? endTime - startTime : (startTime ? Date.now() - startTime : null),
        currentIteration: iterData?.iteration || 0,
        maxIterations: iterData?.maxIterations || 10,
        currentTask,
        opencodeUrl: run.opencodeUrl || null,
      })
    }

    return map
  })

  const getActiveTab = (provider: Provider): TabType => {
    return activeTabs().get(provider) || "timeline"
  }

  const setActiveTab = (provider: Provider, tab: TabType) => {
    setActiveTabs(prev => {
      const newMap = new Map(prev)
      newMap.set(provider, tab)
      return newMap
    })
  }

  const gridCols = createMemo(() => {
    const count = providers().length
    if (count === 1) return "grid-cols-1 max-w-2xl mx-auto"
    if (count === 2) return "grid-cols-2"
    if (count === 3) return "grid-cols-3"
    if (count === 4) return "grid-cols-2 lg:grid-cols-4"
    if (count === 5) return "grid-cols-2 lg:grid-cols-5"
    return "grid-cols-2 lg:grid-cols-3"
  })

  const completedCount = createMemo(() => {
    return Array.from(props.providerRuns.values()).filter(
      r => r.status === "completed"
    ).length
  })

  const failedCount = createMemo(() => {
    return Array.from(props.providerRuns.values()).filter(
      r => r.status === "failed"
    ).length
  })

  const runningCount = createMemo(() => {
    return Array.from(props.providerRuns.values()).filter(
      r => r.status === "running" || r.status === "cloning" || r.status === "installing"
    ).length
  })

  // Rank providers by completion time
  const rankings = createMemo(() => {
    const completed: { provider: Provider; duration: number }[] = []

    for (const [provider, summary] of summaries()) {
      if (summary.duration !== null && (summary.status === "completed")) {
        completed.push({ provider, duration: summary.duration })
      }
    }

    completed.sort((a, b) => a.duration - b.duration)

    const ranks = new Map<Provider, number>()
    completed.forEach((item, index) => {
      ranks.set(item.provider, index + 1)
    })

    return ranks
  })

  const fastestProvider = createMemo(() => {
    const ranks = rankings()
    for (const [provider, rank] of ranks) {
      if (rank === 1) return provider
    }
    return null
  })

  const totalProgress = createMemo(() => {
    let total = 0
    let count = 0
    for (const summary of summaries().values()) {
      if (summary.maxIterations > 0) {
        total += (summary.currentIteration / summary.maxIterations) * 100
        count++
      }
    }
    return count > 0 ? total / count : 0
  })

  return (
    <div class="flex flex-col h-full bg-gradient-to-br from-[var(--color-bg)] to-[var(--color-bg-secondary)]">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-sm">
        <div class="flex items-center gap-4">
          <h3 class="text-sm font-semibold text-[var(--color-text)]">
            {"\uD83C\uDFC1"} Agent Race
          </h3>
          <div class="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span class="px-2 py-0.5 rounded-full bg-[var(--color-bg-secondary)]">
              {providers().length} agents
            </span>
            <Show when={runningCount() > 0}>
              <span class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                {runningCount()} running
              </span>
            </Show>
            <Show when={completedCount() > 0}>
              <span class="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                {completedCount()} finished
              </span>
            </Show>
            <Show when={failedCount() > 0}>
              <span class="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                {failedCount()} failed
              </span>
            </Show>
          </div>
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
        </div>

        <div class="flex items-center gap-4">
          {/* Overall progress */}
          <div class="flex items-center gap-2">
            <div class="w-24 h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                style={{ width: `${totalProgress()}%` }}
              />
            </div>
            <span class="text-[10px] text-[var(--color-text-muted)]">
              {Math.round(totalProgress())}%
            </span>
          </div>

          {/* Elapsed time */}
          <span class="text-xs font-mono text-[var(--color-text-muted)]">
            {"\u23F1\uFE0F"} {formatDuration(elapsedTime())}
          </span>

          <Show when={fastestProvider()}>
            <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <span class="text-yellow-400">{"\uD83C\uDFC6"}</span>
              <span class="text-xs text-yellow-400 font-medium">
                {providerDisplayNames[fastestProvider()!]}
              </span>
            </div>
          </Show>

          <label class="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={syncScroll()}
              onChange={(e) => setSyncScroll(e.currentTarget.checked)}
              class="w-3.5 h-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] focus:ring-offset-0"
            />
            Sync
          </label>
        </div>
      </div>

      {/* Agent cards grid */}
      <div class="flex-1 p-4 overflow-hidden">
        <div class={`grid gap-3 h-full ${gridCols()}`}>
          <For each={providers()}>
            {(provider) => {
              const run = () => props.providerRuns.get(provider)!
              const events = () => eventsByProvider().get(provider) || []
              const summary = () => summaries().get(provider)!
              const rank = () => rankings().get(provider) || null

              return (
                <AgentCard
                  provider={provider}
                  run={run()}
                  events={events()}
                  summary={summary()}
                  activeTab={getActiveTab(provider)}
                  onTabChange={(tab) => setActiveTab(provider, tab)}
                  syncScroll={syncScroll()}
                  scrollTop={globalScrollTop()}
                  onScroll={setGlobalScrollTop}
                  isWinner={fastestProvider() === provider}
                  rank={rank()}
                />
              )
            }}
          </For>
        </div>
      </div>

      {/* Footer with provider status pills */}
      <div class="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-sm">
        <div class="flex items-center justify-center gap-4 flex-wrap">
          <For each={providers()}>
            {(provider) => {
              const summary = () => summaries().get(provider)
              const statusCfg = () => statusConfig[summary()?.status || "idle"]
              const colors = () => providerColors[provider]
              const isLeading = () => {
                const s = summary()
                if (!s) return false
                const allSummaries = Array.from(summaries().values())
                const maxIter = Math.max(...allSummaries.map(x => x.currentIteration))
                return s.currentIteration === maxIter && maxIter > 0
              }

              return (
                <div
                  class={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all ${
                    isLeading() ? "ring-1" : ""
                  }`}
                  style={{
                    background: `${colors().primary}15`,
                    "border-color": colors().primary,
                    "--tw-ring-color": isLeading() ? colors().primary : "transparent"
                  } as any}
                >
                  <span
                    class={`w-2 h-2 rounded-full ${statusCfg().pulse ? "animate-pulse" : ""}`}
                    style={{ background: colors().primary }}
                  />
                  <span style={{ color: colors().primary }} class="font-medium">
                    {providerDisplayNames[provider]}
                  </span>
                  <span class="text-[var(--color-text-muted)]">
                    {summary()?.currentIteration || 0}/{summary()?.maxIterations || "?"}
                  </span>
                  <Show when={summary()?.duration}>
                    <span class="text-[var(--color-text-dim)] font-mono text-[10px]">
                      {formatDuration(summary()!.duration!)}
                    </span>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}
