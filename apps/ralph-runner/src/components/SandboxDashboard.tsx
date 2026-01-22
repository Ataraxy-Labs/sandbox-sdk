import { createEffect, For, Show, createSignal } from "solid-js"
import type { Id } from "@/hooks/useConvex"
import { useSandboxes, useRalphs, useAgentEvents } from "@/hooks/useConvex"

interface SandboxDashboardProps {
  userId: Id<"users">
}

/**
 * Dashboard showing sandboxes, sessions, and events
 */
export function SandboxDashboard(props: SandboxDashboardProps) {
  const [selectedSandboxId, setSelectedSandboxId] = createSignal<Id<"sandboxes">>()
  const [selectedRalphId, setSelectedRalphId] = createSignal<Id<"ralphs">>()

  const sandboxes = useSandboxes(() => props.userId)
  const ralphs = useRalphs(() => selectedSandboxId())
  const events = useAgentEvents(() => selectedRalphId())

  // Auto-select first sandbox
  createEffect(() => {
    const data = sandboxes.data
    if (data?.length && !selectedSandboxId()) {
      setSelectedSandboxId(data[0]._id)
    }
  })

  // Auto-select first ralph
  createEffect(() => {
    const data = ralphs.data
    if (data?.length && !selectedRalphId()) {
      setSelectedRalphId(data[0]._id)
    }
  })

  return (
    <div class="flex h-screen bg-[var(--color-bg)]">
      {/* Sandboxes */}
      <div class="w-64 border-r border-[var(--color-border)] overflow-y-auto">
        <div class="p-4 border-b border-[var(--color-border)]">
          <h2 class="font-semibold text-sm">Sandboxes</h2>
        </div>
        <Show when={!sandboxes.isPending} fallback={<div class="p-4 text-sm opacity-50">Loading...</div>}>
          <For each={sandboxes.data} fallback={<div class="p-4 text-sm opacity-50">No sandboxes</div>}>
            {(sandbox) => (
              <button
                onClick={() => { setSelectedSandboxId(sandbox._id); setSelectedRalphId(undefined) }}
                class={`w-full text-left px-4 py-3 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] ${selectedSandboxId() === sandbox._id ? "bg-[var(--color-accent)]/10" : ""}`}
              >
                <div class="text-sm font-medium">{sandbox.provider}</div>
                <div class="text-xs opacity-50 truncate">{sandbox.sandboxId}</div>
                <div class={`text-xs mt-1 ${sandbox.status === "ready" ? "text-green-500" : "text-yellow-500"}`}>
                  {sandbox.status}
                </div>
              </button>
            )}
          </For>
        </Show>
      </div>

      {/* Sessions */}
      <div class="w-64 border-r border-[var(--color-border)] overflow-y-auto">
        <div class="p-4 border-b border-[var(--color-border)]">
          <h2 class="font-semibold text-sm">Sessions</h2>
        </div>
        <Show when={selectedSandboxId()}>
          <Show when={!ralphs.isPending} fallback={<div class="p-4 text-sm opacity-50">Loading...</div>}>
            <For each={ralphs.data} fallback={<div class="p-4 text-sm opacity-50">No sessions</div>}>
              {(ralph) => (
                <button
                  onClick={() => setSelectedRalphId(ralph._id)}
                  class={`w-full text-left px-4 py-3 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] ${selectedRalphId() === ralph._id ? "bg-[var(--color-accent)]/10" : ""}`}
                >
                  <div class="text-sm font-medium truncate">{ralph.task}</div>
                  <div class="text-xs opacity-50 mt-1">
                    <span class={ralph.status === "completed" ? "text-green-500" : ralph.status === "failed" ? "text-red-500" : "text-yellow-500"}>
                      {ralph.status}
                    </span>
                    {" · "}{ralph.iterationCount} iterations
                  </div>
                </button>
              )}
            </For>
          </Show>
        </Show>
      </div>

      {/* Events */}
      <div class="flex-1 overflow-y-auto">
        <div class="p-4 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-bg)]">
          <h2 class="font-semibold text-sm">Events</h2>
        </div>
        <Show when={selectedRalphId()}>
          <Show when={!events.isPending} fallback={<div class="p-4 text-sm opacity-50">Loading...</div>}>
            <div class="space-y-2 p-4">
              <For each={events.data} fallback={<div class="text-sm opacity-50">No events</div>}>
                {(event) => (
                  <div class="bg-[var(--color-bg-secondary)] p-3 rounded border border-[var(--color-border)] text-xs">
                    <div class="font-medium">{event.type}</div>
                    <div class="opacity-50 mt-1 truncate font-mono">
                      {JSON.stringify(event.data).slice(0, 100)}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}

export default SandboxDashboard
