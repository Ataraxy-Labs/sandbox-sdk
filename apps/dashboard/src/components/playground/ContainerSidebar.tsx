import { Show, For, createSignal } from "solid-js"
import type { AppState, Provider } from "@/types"
import { PROVIDER_OPTIONS, IMAGE_OPTIONS } from "@/types"

interface ContainerSidebarProps {
  state: AppState
  onFocus: (clientId: string) => void
  onDestroy: (clientId: string) => void
  onCreate: () => void
  onDraftProviderChange: (provider: Provider) => void
  onDraftImageChange: (image: string) => void
  isCreating: boolean
}

export function ContainerSidebar(props: ContainerSidebarProps) {
  const containers = () => props.state.order.map((id) => props.state.containers[id]).filter(Boolean)
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const getStatusDot = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-[var(--color-success)] shadow-[var(--color-glow-success)]"
      case "creating":
        return "bg-[var(--color-warning)]"
      case "failed":
        return "bg-[var(--color-error)]"
      default:
        return "bg-[var(--color-text-dim)]"
    }
  }

  return (
    <div class="h-full flex flex-col">
      {/* Header */}
      <div class="flex items-center justify-between h-11 px-4 border-b border-[var(--color-border)]">
        <span class="text-[13px] font-semibold text-[var(--color-text)]">Containers</span>
        <span class="text-[11px] text-[var(--color-text-dim)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 rounded-full tabular-nums">
          {containers().length}
        </span>
      </div>

      {/* Container List */}
      <div class="flex-1 overflow-y-auto py-2">
        <Show
          when={containers().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-32 text-center px-4">
              <div class="w-10 h-10 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center mb-3">
                <svg class="w-5 h-5 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p class="text-xs text-[var(--color-text-dim)]">No containers yet</p>
            </div>
          }
        >
          <For each={containers()}>
            {(container) => (
              <div class="px-2">
                <div
                  class={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    props.state.focusedId === container.clientId
                      ? "bg-[var(--color-bg-elevated)] ring-1 ring-[var(--color-border-hover)]"
                      : "hover:bg-[var(--color-bg-tertiary)]"
                  }`}
                  onClick={() => props.onFocus(container.clientId)}
                >
                  <div class="flex items-center gap-3">
                    {/* Expand chevron */}
                    <button
                      class="w-4 h-4 flex items-center justify-center text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] transition-transform"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpand(container.clientId)
                      }}
                      style={{ transform: expanded()[container.clientId] ? "rotate(90deg)" : "rotate(0deg)" }}
                    >
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {/* Status dot */}
                    <div class={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDot(container.status)} ${container.status === "creating" ? "animate-pulse" : ""}`} />

                    {/* Container name */}
                    <span class="flex-1 text-[13px] font-medium text-[var(--color-text)] truncate font-mono">
                      {container.id ? container.id.slice(0, 12) : "Initializing..."}
                    </span>

                    {/* Delete button */}
                    <button
                      class="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-dim)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-subtle)] rounded-md transition-all"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onDestroy(container.clientId)
                      }}
                      title="Remove"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded details */}
                  <Show when={expanded()[container.clientId]}>
                    <div class="mt-2 ml-7 pl-3 border-l border-[var(--color-border)] space-y-1 animate-fadeIn">
                      <div class="flex items-center gap-2">
                        <span class="text-[10px] text-[var(--color-text-dim)]">Provider</span>
                        <span class="text-[10px] text-[var(--color-text-muted)] font-medium">{container.provider}</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-[10px] text-[var(--color-text-dim)]">Image</span>
                        <span class="text-[10px] text-[var(--color-text-muted)] font-mono">{container.image}</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-[10px] text-[var(--color-text-dim)]">Status</span>
                        <span class={`text-[10px] font-medium ${
                          container.status === "ready" ? "text-[var(--color-success)]" :
                          container.status === "creating" ? "text-[var(--color-warning)]" :
                          container.status === "failed" ? "text-[var(--color-error)]" : "text-[var(--color-text-dim)]"
                        }`}>{container.status}</span>
                      </div>
                    </div>
                  </Show>

                  <Show when={container.isRunning}>
                    <div class="absolute top-2 right-2">
                      <div class="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />
                    </div>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* New Container Section */}
      <div class="border-t border-[var(--color-border)] p-4 space-y-4">
        <div class="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">New Container</div>

        {/* Provider Selection */}
        <div class="grid grid-cols-3 gap-1.5">
          <For each={PROVIDER_OPTIONS}>
            {(option) => (
              <button
                class={`px-2 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                  props.state.createDraft.provider === option.value
                    ? "bg-white text-black shadow-sm"
                    : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-white"
                }`}
                onClick={() => props.onDraftProviderChange(option.value)}
                title={option.description}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>

        {/* Image Selection */}
        <select
          class="w-full bg-[var(--color-bg-tertiary)] text-[12px] px-3 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-subtle)] transition-all cursor-pointer"
          value={props.state.createDraft.image}
          onChange={(e) => props.onDraftImageChange(e.currentTarget.value)}
        >
          <For each={IMAGE_OPTIONS}>{(option) => <option value={option.value}>{option.label}</option>}</For>
        </select>

        {/* Create Button */}
        <button
          class="w-full flex items-center justify-center gap-2 h-10 text-[13px] font-medium bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[var(--color-accent-subtle)]"
          onClick={props.onCreate}
          disabled={props.isCreating}
        >
          <Show
            when={!props.isCreating}
            fallback={
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            }
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </Show>
          {props.isCreating ? "Creating..." : "Create Container"}
        </button>
      </div>
    </div>
  )
}
