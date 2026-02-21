import { createSignal, Show, For, createEffect } from "solid-js"
import type { FileEntry } from "@/types"

interface FileExplorerProps {
  sandboxId: string | null
  disabled: boolean
}

export function FileExplorer(props: FileExplorerProps) {
  const [currentPath, setCurrentPath] = createSignal("/")
  const [entries, setEntries] = createSignal<FileEntry[]>([])
  const [loading, setLoading] = createSignal(false)
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null)
  const [fileContent, setFileContent] = createSignal<string | null>(null)

  const loadDirectory = async (path: string) => {
    if (!props.sandboxId || props.disabled) return

    setLoading(true)
    try {
      const response = await fetch(`/api/sandbox/${props.sandboxId}/ls?path=${encodeURIComponent(path)}`)
      const data = await response.json()
      setEntries(data.entries || [])
      setCurrentPath(path)
      setSelectedFile(null)
      setFileContent(null)
    } catch (err) {
      console.error("Failed to load directory:", err)
    } finally {
      setLoading(false)
    }
  }

  const loadFile = async (path: string) => {
    if (!props.sandboxId) return

    try {
      const response = await fetch(`/api/sandbox/${props.sandboxId}/read?path=${encodeURIComponent(path)}`)
      const data = await response.json()
      setSelectedFile(path)
      setFileContent(data.content)
    } catch (err) {
      console.error("Failed to read file:", err)
    }
  }

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.type === "dir") {
      loadDirectory(entry.path)
    } else {
      loadFile(entry.path)
    }
  }

  const goUp = () => {
    const path = currentPath()
    if (path === "/") return
    const parts = path.split("/").filter(Boolean)
    parts.pop()
    loadDirectory("/" + parts.join("/") || "/")
  }

  createEffect(() => {
    if (props.sandboxId && !props.disabled) {
      loadDirectory("/")
    }
  })

  const formatSize = (size?: number) => {
    if (!size) return ""
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div class="h-full flex flex-col bg-[var(--color-bg)]">
      <Show
        when={!props.disabled}
        fallback={
          <div class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <div class="w-12 h-12 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center mx-auto mb-4">
                <svg class="w-5 h-5 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              </div>
              <p class="text-sm text-[var(--color-text-muted)]">Select a container</p>
              <p class="text-xs text-[var(--color-text-dim)] mt-1">to browse files</p>
            </div>
          </div>
        }
      >
        {/* Path Bar */}
        <div class="flex items-center gap-2 h-10 px-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <button
            onClick={goUp}
            disabled={currentPath() === "/"}
            class="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-md disabled:opacity-30 transition-colors"
          >
            <svg class="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={() => loadDirectory(currentPath())} class="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-md transition-colors">
            <svg class="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <div class="w-px h-4 bg-[var(--color-border)]" />
          <span class="text-xs font-mono text-[var(--color-text-muted)] truncate">{currentPath()}</span>
        </div>

        <div class="flex-1 flex overflow-hidden">
          {/* File List */}
          <div class="w-1/2 border-r border-[var(--color-border)] overflow-y-auto">
            <Show
              when={!loading()}
              fallback={
                <div class="flex items-center justify-center h-20">
                  <div class="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
                </div>
              }
            >
              <For
                each={entries()}
                fallback={
                  <div class="flex items-center justify-center h-20 text-[var(--color-text-dim)] text-xs">
                    Empty directory
                  </div>
                }
              >
                {(entry) => (
                  <button
                    class={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--color-bg-secondary)] transition-colors ${
                      selectedFile() === entry.path ? "bg-[var(--color-bg-tertiary)]" : ""
                    }`}
                    onClick={() => handleEntryClick(entry)}
                  >
                    <Show
                      when={entry.type === "dir"}
                      fallback={
                        <svg class="w-4 h-4 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      }
                    >
                      <svg class="w-4 h-4 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </Show>
                    <span class="flex-1 text-xs text-[var(--color-text)] truncate">{entry.path.split("/").pop()}</span>
                    <Show when={entry.size}>
                      <span class="text-[10px] text-[var(--color-text-dim)] tabular-nums">{formatSize(entry.size)}</span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </div>

          {/* File Preview */}
          <div class="w-1/2 overflow-hidden flex flex-col">
            <Show
              when={selectedFile()}
              fallback={
                <div class="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs">
                  Select a file to preview
                </div>
              }
            >
              <div class="h-10 flex items-center px-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                <span class="text-[11px] font-mono text-[var(--color-text-muted)] truncate">{selectedFile()}</span>
              </div>
              <pre class="flex-1 p-3 text-xs font-mono text-[var(--color-text)] overflow-auto whitespace-pre-wrap leading-relaxed">
                {fileContent()}
              </pre>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
