import { Component, createSignal, createEffect, Show, For, onMount } from "solid-js"

interface TaskInputProps {
  onTaskChanged: (task: string) => void
  disabled?: boolean
}

const TASK_TEMPLATES = [
  { id: "tests", label: "Add tests", description: "Write unit tests for the codebase" },
  { id: "typescript", label: "Fix TypeScript errors", description: "Fix all TypeScript compilation errors" },
  { id: "docs", label: "Add documentation", description: "Add JSDoc comments and README documentation" },
  { id: "lint", label: "Fix linting issues", description: "Fix all ESLint/Prettier warnings and errors" },
  { id: "refactor", label: "Refactor code", description: "Refactor for better readability and maintainability" },
  { id: "security", label: "Security audit", description: "Review code for security vulnerabilities" },
] as const

const MAX_CHARS = 2000
const HISTORY_KEY = "ralph-runner-task-history"
const MAX_HISTORY_ITEMS = 10

interface TaskHistoryItem {
  task: string
  timestamp: number
}

function loadTaskHistory(): TaskHistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

function saveTaskHistory(history: TaskHistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)))
  } catch {
    // Ignore storage errors
  }
}

export const TaskInput: Component<TaskInputProps> = (props) => {
  const [task, setTask] = createSignal("")
  const [showTemplates, setShowTemplates] = createSignal(false)
  const [showHistory, setShowHistory] = createSignal(false)
  const [history, setHistory] = createSignal<TaskHistoryItem[]>([])

  onMount(() => {
    setHistory(loadTaskHistory())
  })

  createEffect(() => {
    const currentTask = task()
    props.onTaskChanged(currentTask)
  })

  const charCount = () => task().length
  const isOverLimit = () => charCount() > MAX_CHARS
  const charCountClass = () => {
    if (isOverLimit()) return "text-[var(--color-error)]"
    if (charCount() > MAX_CHARS * 0.9) return "text-[var(--color-warning)]"
    return "text-[var(--color-text-muted)]"
  }

  const applyTemplate = (template: (typeof TASK_TEMPLATES)[number]) => {
    setTask(template.description)
    setShowTemplates(false)
  }

  const applyHistoryItem = (item: TaskHistoryItem) => {
    setTask(item.task)
    setShowHistory(false)
  }

  const addToHistory = () => {
    const currentTask = task().trim()
    if (!currentTask) return

    const existingHistory = history()
    const filtered = existingHistory.filter((h) => h.task !== currentTask)
    const newHistory: TaskHistoryItem[] = [
      { task: currentTask, timestamp: Date.now() },
      ...filtered,
    ].slice(0, MAX_HISTORY_ITEMS)

    setHistory(newHistory)
    saveTaskHistory(newHistory)
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
    setShowHistory(false)
  }

  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div class="space-y-3">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="block text-sm font-medium text-[var(--color-text-secondary)]">
            Task Description
          </label>
          <div class="flex items-center gap-2">
            {/* Templates dropdown */}
            <div class="relative">
              <button
                type="button"
                onClick={() => {
                  setShowTemplates(!showTemplates())
                  setShowHistory(false)
                }}
                disabled={props.disabled}
                class="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Templates
              </button>
              <Show when={showTemplates()}>
                <div class="absolute right-0 top-full mt-1 w-64 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg z-10 animate-fadeIn">
                  <div class="p-1">
                    <For each={TASK_TEMPLATES}>
                      {(template) => (
                        <button
                          type="button"
                          onClick={() => applyTemplate(template)}
                          class="w-full text-left px-3 py-2 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                        >
                          <div class="text-sm text-[var(--color-text)]">{template.label}</div>
                          <div class="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                            {template.description}
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>

            {/* History dropdown */}
            <Show when={history().length > 0}>
              <div class="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowHistory(!showHistory())
                    setShowTemplates(false)
                  }}
                  disabled={props.disabled}
                  class="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  History
                </button>
                <Show when={showHistory()}>
                  <div class="absolute right-0 top-full mt-1 w-72 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg z-10 animate-fadeIn">
                    <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
                      <span class="text-xs font-medium text-[var(--color-text-secondary)]">Recent Tasks</span>
                      <button
                        type="button"
                        onClick={clearHistory}
                        class="text-xs text-[var(--color-error)] hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                    <div class="p-1 max-h-60 overflow-y-auto">
                      <For each={history()}>
                        {(item) => (
                          <button
                            type="button"
                            onClick={() => applyHistoryItem(item)}
                            class="w-full text-left px-3 py-2 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                          >
                            <div class="text-sm text-[var(--color-text)] line-clamp-2">
                              {item.task}
                            </div>
                            <div class="text-xs text-[var(--color-text-dim)] mt-1">
                              {formatTimestamp(item.timestamp)}
                            </div>
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>

        <div class="relative">
          <textarea
            value={task()}
            onInput={(e) => setTask(e.currentTarget.value)}
            onBlur={addToHistory}
            placeholder={"Describe the task you want the agent to perform...\n\nExamples:\n\u2022 Add unit tests for the authentication module\n\u2022 Fix all TypeScript errors and warnings\n\u2022 Refactor the API routes for better error handling\n\u2022 Add JSDoc documentation to exported functions"}
            disabled={props.disabled}
            rows={6}
            class="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder-[var(--color-text-dim)] text-sm focus:border-[var(--color-accent)] transition-colors disabled:opacity-50 resize-none"
          />
        </div>

        <div class="flex items-center justify-between mt-1.5">
          <Show when={isOverLimit()}>
            <p class="text-xs text-[var(--color-error)]">
              Task description is too long
            </p>
          </Show>
          <Show when={!isOverLimit()}>
            <span />
          </Show>
          <span class={`text-xs ${charCountClass()}`}>
            {charCount().toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Close dropdowns when clicking outside */}
      <Show when={showTemplates() || showHistory()}>
        <div
          class="fixed inset-0 z-0"
          onClick={() => {
            setShowTemplates(false)
            setShowHistory(false)
          }}
        />
      </Show>
    </div>
  )
}
