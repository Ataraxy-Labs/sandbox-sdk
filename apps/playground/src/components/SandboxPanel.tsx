import { Show } from "solid-js"
import type { ContainerState } from "../types"

interface SandboxPanelProps {
  container: ContainerState | null
}

export function SandboxPanel(props: SandboxPanelProps) {
  return (
    <div class="flex items-center justify-between h-8 px-4 border-t border-[var(--color-border)] bg-[var(--color-bg)] text-[11px]">
      <Show
        when={props.container}
        fallback={
          <div class="flex items-center gap-2 text-[var(--color-text-dim)]">
            <div class="w-1.5 h-1.5 rounded-full bg-[var(--color-text-dim)]" />
            <span>No container</span>
          </div>
        }
      >
        <div class="flex items-center gap-5">
          {/* Status */}
          <div class="flex items-center gap-2">
            <div
              class={`w-1.5 h-1.5 rounded-full ${
                props.container?.status === "ready"
                  ? "bg-[var(--color-success)] shadow-[var(--color-glow-success)]"
                  : props.container?.status === "creating"
                    ? "bg-[var(--color-warning)] animate-pulse"
                    : "bg-[var(--color-error)]"
              }`}
            />
            <span class="text-[var(--color-text-dim)]">Status</span>
            <span class={`font-medium ${
              props.container?.status === "ready" ? "text-[var(--color-success)]" :
              props.container?.status === "creating" ? "text-[var(--color-warning)]" :
              "text-[var(--color-error)]"
            }`}>{props.container?.status}</span>
          </div>

          <div class="w-px h-3 bg-[var(--color-border)]" />

          {/* Provider */}
          <div class="flex items-center gap-2 text-[var(--color-text-dim)]">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            <span>Provider</span>
            <span class="text-[var(--color-text)]">{props.container?.provider}</span>
          </div>

          <div class="w-px h-3 bg-[var(--color-border)]" />

          {/* Image */}
          <div class="flex items-center gap-2 text-[var(--color-text-dim)]">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span>Image</span>
            <span class="text-[var(--color-text)] font-mono">{props.container?.image}</span>
          </div>

          {/* ID */}
          <Show when={props.container?.id}>
            <div class="w-px h-3 bg-[var(--color-border)]" />
            <div class="flex items-center gap-2 text-[var(--color-text-dim)]">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              <span>ID</span>
              <span class="text-[var(--color-text)] font-mono">{props.container?.id?.slice(0, 16)}</span>
            </div>
          </Show>
        </div>
      </Show>

      <div class="flex items-center gap-1.5 text-[var(--color-text-dim)]">
        <span>Powered by</span>
        <a href="#" class="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors">GitArsenal SDK</a>
      </div>
    </div>
  )
}
