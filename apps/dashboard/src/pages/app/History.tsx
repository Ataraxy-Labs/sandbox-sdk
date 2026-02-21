import { createSignal, Show, For } from "solid-js"
import { Badge } from "@/components/ui"

type Tab = "sandboxes" | "runs"

interface SandboxEntry {
  _id: string
  sandboxId: string
  provider: string
  repoUrl: string
  status: string
  createdAt: number
}

interface RunEntry {
  _id: string
  task: string
  status: string
  iterationCount: number
  createdAt: number
  completedAt?: number
}

export default function History() {
  const [tab, setTab] = createSignal<Tab>("runs")
  const [sandboxes, setSandboxes] = createSignal<SandboxEntry[]>([])
  const [runs, setRuns] = createSignal<RunEntry[]>([])
  const [loading, setLoading] = createSignal(true)

  // Fetch history from Convex via API
  const fetchHistory = async () => {
    setLoading(true)
    try {
      const [sbRes, runRes] = await Promise.all([
        fetch("/api/user/sandboxes").then((r) => r.ok ? r.json() : { sandboxes: [] }),
        fetch("/api/user/runs").then((r) => r.ok ? r.json() : { runs: [] }),
      ])
      setSandboxes(sbRes.sandboxes || [])
      setRuns(runRes.runs || [])
    } catch {
      // silently fail, show empty state
    } finally {
      setLoading(false)
    }
  }

  fetchHistory()

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  const statusVariant = (status: string) => {
    if (status === "completed" || status === "ready") return "success" as const
    if (status === "running" || status === "creating") return "warning" as const
    if (status === "failed") return "destructive" as const
    return "secondary" as const
  }

  return (
    <div class="h-full flex flex-col">
      {/* Tab bar */}
      <div class="flex items-center gap-1 px-4 pt-4">
        <button
          class={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab() === "runs"
              ? "bg-[var(--color-bg-elevated)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
          onClick={() => setTab("runs")}
        >
          Agent Runs
        </button>
        <button
          class={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab() === "sandboxes"
              ? "bg-[var(--color-bg-elevated)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
          onClick={() => setTab("sandboxes")}
        >
          Sandboxes
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto p-4">
        <Show when={loading()}>
          <div class="flex items-center justify-center h-40 text-sm text-[var(--color-text-muted)]">
            Loading...
          </div>
        </Show>

        <Show when={!loading()}>
          {/* Runs tab */}
          <Show when={tab() === "runs"}>
            <Show
              when={runs().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center h-40 text-sm text-[var(--color-text-muted)]">
                  <p>No agent runs yet.</p>
                  <p class="text-xs mt-1">Start one from the Agent page.</p>
                </div>
              }
            >
              <div class="space-y-2">
                <For each={runs()}>
                  {(run) => (
                    <div class="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center gap-4">
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate">{run.task}</div>
                        <div class="text-xs text-[var(--color-text-muted)] mt-1">
                          {formatTime(run.createdAt)} · {run.iterationCount} iterations
                        </div>
                      </div>
                      <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          {/* Sandboxes tab */}
          <Show when={tab() === "sandboxes"}>
            <Show
              when={sandboxes().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center h-40 text-sm text-[var(--color-text-muted)]">
                  <p>No sandboxes yet.</p>
                  <p class="text-xs mt-1">Create one from the Playground.</p>
                </div>
              }
            >
              <div class="space-y-2">
                <For each={sandboxes()}>
                  {(sb) => (
                    <div class="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center gap-4">
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate">{sb.repoUrl || sb.sandboxId}</div>
                        <div class="text-xs text-[var(--color-text-muted)] mt-1">
                          {sb.provider} · {formatTime(sb.createdAt)}
                        </div>
                      </div>
                      <Badge variant={statusVariant(sb.status)}>{sb.status}</Badge>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  )
}
