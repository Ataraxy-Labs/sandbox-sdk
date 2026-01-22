import { Component } from "solid-js"

export const Header: Component = () => {
  return (
    <header class="h-14 border-b border-[var(--color-border)] flex items-center px-4 shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
          <svg
            class="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <span class="font-semibold text-[var(--color-text)]">Ralph Runner</span>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <div class="text-xs text-[var(--color-text-muted)]">
          Provider Status
        </div>
      </div>
    </header>
  )
}
