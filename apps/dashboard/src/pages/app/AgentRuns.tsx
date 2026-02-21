import { createSignal, Show, createMemo, createEffect } from "solid-js"
import { RepoInput, TaskInput, ProviderSelector, TimelinePanel, TerminalPanel, FileExplorer, ComparisonView, AgentRaceView } from "@/components/agent"
import { useRun } from "@/hooks"
import type { Provider, RepoMetadata } from "@/types"

type ActiveTab = "timeline" | "terminal" | "files" | "comparison" | "race"

export default function AgentRuns() {
  const [repoUrl, setRepoUrl] = createSignal<string | null>(null)
  const [branch, setBranch] = createSignal<string | null>(null)
  const [repoMetadata, setRepoMetadata] = createSignal<RepoMetadata | null>(null)
  const [task, setTask] = createSignal<string>("")
  const [providers, setProviders] = createSignal<Provider[]>([])
  const [activeTab, setActiveTab] = createSignal<ActiveTab>("timeline")

  const run = useRun()

  const handleRepoValidated = (url: string, selectedBranch: string, metadata: RepoMetadata) => {
    setRepoUrl(url)
    setBranch(selectedBranch)
    setRepoMetadata(metadata)
  }

  const handleTaskChanged = (newTask: string) => {
    setTask(newTask)
  }

  const handleProvidersChanged = (newProviders: Provider[]) => {
    setProviders(newProviders)
  }

  const isReady = () => repoUrl() && task().trim().length > 0 && providers().length > 0
  const isRunning = () => ["cloning", "installing", "running"].includes(run.runState().status)

  const isMultiProvider = createMemo(() => providers().length > 1)

  createEffect(() => {
    if (run.runId()) {
      setActiveTab("timeline")
    }
  })

  const handleStartRun = async () => {
    const url = repoUrl()
    const selectedBranch = branch()
    const taskDesc = task()
    const selectedProviders = providers()

    if (!url || !taskDesc || selectedProviders.length === 0) return

    try {
      await run.startRun({
        repoUrl: url,
        branch: selectedBranch || "main",
        task: taskDesc,
        providers: selectedProviders,
      })
    } catch (error) {
      console.error("Failed to start run:", error)
    }
  }

  const handleStopRun = async () => {
    try {
      await run.stopRun()
    } catch (error) {
      console.error("Failed to stop run:", error)
    }
  }

  const statusText = () => {
    const state = run.runState()
    switch (state.status) {
      case "idle":
        return isReady()
          ? `Ready to run task on ${repoMetadata()?.fullName} using ${providers().length > 1 ? providers().length + " providers" : providers()[0]}`
          : providers().length === 0 && task().trim().length > 0 && repoUrl()
            ? "Select at least one provider to continue"
            : task().trim().length === 0 && repoUrl()
              ? "Enter a task description to continue"
              : "Enter a GitHub repository to get started"
      case "cloning":
        return "Cloning repository..."
      case "installing":
        return "Installing dependencies..."
      case "running":
        return "Agent is running..."
      case "completed":
        return "Run completed"
      case "failed":
        return state.error || "Run failed"
      default:
        return ""
    }
  }

  return (
    <div class="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div class="w-80 border-r border-[var(--color-border)] p-4 shrink-0 overflow-y-auto">
        <div class="space-y-6">
          <RepoInput onRepoValidated={handleRepoValidated} />
          <TaskInput onTaskChanged={handleTaskChanged} />
          <ProviderSelector onProvidersChanged={handleProvidersChanged} />

          <div class="pt-4 border-t border-[var(--color-border)]">
            <Show when={!isRunning()}>
              <button
                class="w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
                disabled={!isReady() || run.isStarting()}
                onClick={handleStartRun}
              >
                {run.isStarting() ? "Starting..." : "Start Run"}
              </button>
            </Show>
            <Show when={isRunning()}>
              <button
                class="w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors bg-red-500 text-white hover:bg-red-600"
                disabled={run.isStopping()}
                onClick={handleStopRun}
              >
                {run.isStopping() ? "Stopping..." : "Stop Run"}
              </button>
            </Show>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div class="flex-1 flex flex-col overflow-hidden">
        <Show when={run.runId()}>
          {/* Tab bar */}
          <div class="flex items-center gap-1 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <Show when={isMultiProvider()}>
              <button
                class={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeTab() === "race"
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]"
                }`}
                onClick={() => setActiveTab("race")}
              >
                <span class="flex items-center gap-1.5">
                  {"\uD83C\uDFC1"} Race
                </span>
              </button>
              <button
                class={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeTab() === "comparison"
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]"
                }`}
                onClick={() => setActiveTab("comparison")}
              >
                <span class="flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  Compare
                </span>
              </button>
            </Show>
            <button
              class={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab() === "timeline"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]"
              }`}
              onClick={() => setActiveTab("timeline")}
            >
              <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Timeline
              </span>
            </button>
            <button
              class={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab() === "terminal"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]"
              }`}
              onClick={() => setActiveTab("terminal")}
            >
              <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Terminal
              </span>
            </button>
            <button
              class={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab() === "files"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]"
              }`}
              onClick={() => setActiveTab("files")}
            >
              <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Files
              </span>
            </button>
          </div>

          {/* Tab content */}
          <div class="flex-1 relative overflow-hidden">
            <Show when={activeTab() === "race" && isMultiProvider()}>
              <div class="absolute inset-0">
                <AgentRaceView
                  providerRuns={run.runState().providerRuns}
                  events={run.getEvents()}
                  connected={run.isConnected()}
                  reconnecting={run.isReconnecting()}
                  runId={run.runId()}
                />
              </div>
            </Show>
            <Show when={activeTab() === "comparison" && isMultiProvider()}>
              <div class="absolute inset-0">
                <ComparisonView
                  providerRuns={run.runState().providerRuns}
                  events={run.getEvents()}
                  connected={run.isConnected()}
                  reconnecting={run.isReconnecting()}
                />
              </div>
            </Show>
            <Show when={activeTab() === "timeline"}>
              <div class="absolute inset-0">
                <TimelinePanel
                  events={run.getEvents()}
                  connected={run.isConnected()}
                  reconnecting={run.isReconnecting()}
                />
              </div>
            </Show>
            <Show when={activeTab() === "terminal"}>
              <div class="absolute inset-0">
                <TerminalPanel events={run.getEvents()} />
              </div>
            </Show>
            <Show when={activeTab() === "files"}>
              <div class="absolute inset-0">
                <FileExplorer
                  events={run.getEvents()}
                  runId={run.runId()}
                  provider={providers()[0]}
                />
              </div>
            </Show>
          </div>
        </Show>

        {/* Empty state when no run */}
        <Show when={!run.runId()}>
          <div class="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
            <div class="text-center">
              <h1 class="text-2xl font-semibold text-[var(--color-text)] mb-2">
                Agent Runner
              </h1>
              <p class="text-sm">{statusText()}</p>
            </div>
          </div>
        </Show>

        {/* Status bar */}
        <Show when={run.runId()}>
          <div class="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <div class="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <span>
                Status: <span class="font-medium text-[var(--color-text)]">{run.runState().status}</span>
              </span>
              <span>{statusText()}</span>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
