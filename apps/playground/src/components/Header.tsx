import { Show } from "solid-js"
import type { ContainerState } from "../types"

interface HeaderProps {
  focusedContainer: ContainerState | null
  onRun: () => void
  isRunning: boolean
}

export function Header(props: HeaderProps) {
  const hasContainer = () => props.focusedContainer !== null
  const containerReady = () => props.focusedContainer?.status === "ready"

  return (
    <header class="flex items-center justify-between h-14 px-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
      <div class="flex items-center gap-4">
        {/* Logo */}
        <div class="flex items-center gap-2.5">
          <div class="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-purple-600">
            <svg viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span class="font-semibold text-[15px] text-white tracking-tight">Sandbox</span>
        </div>

        {/* Breadcrumb Divider */}
        <svg class="w-4 h-4 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5l7 7-7 7" />
        </svg>

        {/* Container Info */}
        <Show
          when={hasContainer()}
          fallback={
            <span class="text-[13px] text-[var(--color-text-dim)]">No container selected</span>
          }
        >
          <div class="flex items-center gap-3">
            {/* Provider badge */}
            <div class="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
              <div
                class={`w-1.5 h-1.5 rounded-full ${
                  props.focusedContainer?.status === "ready"
                    ? "bg-[var(--color-success)] shadow-[var(--color-glow-success)]"
                    : props.focusedContainer?.status === "creating"
                      ? "bg-[var(--color-warning)] animate-pulse"
                      : "bg-[var(--color-text-dim)]"
                }`}
              />
              <span class="text-[12px] font-medium text-[var(--color-text)]">{props.focusedContainer?.provider}</span>
            </div>

            {/* Image */}
            <span class="text-[13px] text-[var(--color-text-muted)] font-mono">
              {props.focusedContainer?.image}
            </span>

            {/* ID */}
            <Show when={props.focusedContainer?.id}>
              <div class="flex items-center gap-1.5 text-[var(--color-text-dim)]">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span class="text-[12px] font-mono">{props.focusedContainer?.id?.slice(0, 8)}</span>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <div class="flex items-center gap-3">
        <button
          class="flex items-center gap-2 h-9 px-4 text-[13px] font-semibold bg-white text-black rounded-lg hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          onClick={props.onRun}
          disabled={!containerReady() || props.isRunning}
        >
          <Show
            when={!props.isRunning}
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
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </Show>
          {props.isRunning ? "Running" : "Run"}
        </button>
      </div>
    </header>
  )
}
