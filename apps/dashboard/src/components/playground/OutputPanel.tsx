import { Show } from "solid-js"
import type { ExecutionResult } from "@/types"

interface OutputPanelProps {
  result: ExecutionResult | null
  isRunning: boolean
}

export function OutputPanel(props: OutputPanelProps) {
  return (
    <div class="h-full flex flex-col overflow-hidden">
      <Show
        when={props.result || props.isRunning}
        fallback={
          <div class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <div class="w-14 h-14 rounded-2xl bg-[var(--color-bg-tertiary)] flex items-center justify-center mx-auto mb-4">
                <svg class="w-6 h-6 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <p class="text-[14px] font-medium text-[var(--color-text-secondary)]">Run code to see output</p>
              <p class="text-[12px] text-[var(--color-text-dim)] mt-1">Press Run or Cmd+Enter</p>
            </div>
          </div>
        }
      >
        <Show
          when={!props.isRunning}
          fallback={
            <div class="flex-1 flex items-center justify-center">
              <div class="text-center">
                <div class="relative w-12 h-12 mx-auto mb-4">
                  <div class="absolute inset-0 border-2 border-[var(--color-border)] rounded-full" />
                  <div class="absolute inset-0 border-2 border-transparent border-t-[var(--color-accent)] rounded-full animate-spin" />
                </div>
                <p class="text-[14px] font-medium text-[var(--color-text-secondary)]">Executing...</p>
              </div>
            </div>
          }
        >
          <div class="flex-1 overflow-auto animate-fadeIn">
            {/* Exit Code Banner */}
            <div
              class={`flex items-center justify-between px-4 py-3 text-[13px] font-medium ${
                props.result?.exitCode === 0
                  ? "bg-[var(--color-success-subtle)] text-[var(--color-success)]"
                  : "bg-[var(--color-error-subtle)] text-[var(--color-error)]"
              }`}
            >
              <div class="flex items-center gap-2">
                <Show
                  when={props.result?.exitCode === 0}
                  fallback={
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  }
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </Show>
                <span>Exit code: {props.result?.exitCode}</span>
              </div>
              <Show when={props.result?.durationMs}>
                <span class="text-[var(--color-text-dim)] tabular-nums text-[12px]">{props.result?.durationMs}ms</span>
              </Show>
            </div>

            {/* stdout */}
            <Show when={props.result?.stdout}>
              <div class="border-b border-[var(--color-border)]">
                <div class="flex items-center gap-2 px-4 py-2 text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider bg-[var(--color-bg-secondary)]">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  stdout
                </div>
                <pre class="px-4 py-4 text-[13px] font-mono text-[var(--color-text)] whitespace-pre-wrap overflow-x-auto leading-relaxed">
                  {props.result?.stdout}
                </pre>
              </div>
            </Show>

            {/* stderr */}
            <Show when={props.result?.stderr}>
              <div>
                <div class="flex items-center gap-2 px-4 py-2 text-[10px] font-semibold text-[var(--color-error)] uppercase tracking-wider bg-[var(--color-error-subtle)]">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  stderr
                </div>
                <pre class="px-4 py-4 text-[13px] font-mono text-[var(--color-error)] whitespace-pre-wrap overflow-x-auto leading-relaxed">
                  {props.result?.stderr}
                </pre>
              </div>
            </Show>

            {/* No output */}
            <Show when={!props.result?.stdout && !props.result?.stderr}>
              <div class="flex items-center gap-2 px-4 py-4 text-[var(--color-text-dim)] text-[13px]">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 12H4" />
                </svg>
                No output
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  )
}
