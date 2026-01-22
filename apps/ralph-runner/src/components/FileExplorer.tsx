import { Component, For, Show, createSignal, createMemo, createEffect, onMount, onCleanup } from "solid-js"
import * as monaco from "monaco-editor"
import type { AgentEvent, Provider, ToolCall, ToolResult } from "../types"

interface FileExplorerProps {
  events: AgentEvent[]
  runId: string | null
  provider?: Provider
  workDir?: string
}

interface FileNode {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileNode[]
  modified?: boolean
  created?: boolean
}

interface FileContent {
  path: string
  content: string
  language: string
  originalContent?: string
}

const getLanguageFromPath = (path: string): string => {
  const ext = path.split(".").pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    py: "python",
    rs: "rust",
    go: "go",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    graphql: "graphql",
    vue: "vue",
    svelte: "svelte",
  }
  return languageMap[ext || ""] || "plaintext"
}

const FileIcon: Component<{ type: "file" | "directory"; name: string; modified?: boolean }> = (props) => {
  const iconColor = () => {
    if (props.modified) return "text-yellow-400"
    if (props.type === "directory") return "text-blue-400"
    return "text-gray-400"
  }

  return (
    <span class={`shrink-0 ${iconColor()}`}>
      <Show when={props.type === "directory"} fallback={
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
        </svg>
      }>
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      </Show>
    </span>
  )
}

const FileTreeItem: Component<{ 
  node: FileNode
  depth: number
  selectedPath: string | null
  expandedPaths: Set<string>
  onSelect: (node: FileNode) => void
  onToggle: (path: string) => void
}> = (props) => {
  const isExpanded = () => props.expandedPaths.has(props.node.path)
  const isSelected = () => props.selectedPath === props.node.path

  const handleClick = () => {
    if (props.node.type === "directory") {
      props.onToggle(props.node.path)
    } else {
      props.onSelect(props.node)
    }
  }

  return (
    <div>
      <div
        class={`flex items-center gap-2 py-1 px-2 cursor-pointer rounded text-sm transition-colors ${
          isSelected() 
            ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]" 
            : "hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
        }`}
        style={{ "padding-left": `${props.depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        <Show when={props.node.type === "directory"}>
          <span class={`shrink-0 text-xs text-[var(--color-text-dim)] transition-transform ${isExpanded() ? "rotate-90" : ""}`}>
            ▶
          </span>
        </Show>
        <Show when={props.node.type === "file"}>
          <span class="w-3" />
        </Show>
        <FileIcon type={props.node.type} name={props.node.name} modified={props.node.modified} />
        <span class="truncate flex-1">{props.node.name}</span>
        <Show when={props.node.modified}>
          <span class="shrink-0 w-2 h-2 rounded-full bg-yellow-400" title="Modified by agent" />
        </Show>
        <Show when={props.node.created}>
          <span class="shrink-0 w-2 h-2 rounded-full bg-green-400" title="Created by agent" />
        </Show>
      </div>
      <Show when={props.node.type === "directory" && isExpanded() && props.node.children}>
        <For each={props.node.children}>
          {(child) => (
            <FileTreeItem
              node={child}
              depth={props.depth + 1}
              selectedPath={props.selectedPath}
              expandedPaths={props.expandedPaths}
              onSelect={props.onSelect}
              onToggle={props.onToggle}
            />
          )}
        </For>
      </Show>
    </div>
  )
}

export const FileExplorer: Component<FileExplorerProps> = (props) => {
  let editorContainerRef: HTMLDivElement | undefined
  let diffEditorContainerRef: HTMLDivElement | undefined
  let editor: monaco.editor.IStandaloneCodeEditor | undefined
  let diffEditor: monaco.editor.IStandaloneDiffEditor | undefined

  const [fileTree, setFileTree] = createSignal<FileNode[]>([])
  const [selectedFile, setSelectedFile] = createSignal<FileContent | null>(null)
  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set())
  const [loading, setLoading] = createSignal(false)
  const [treeLoading, setTreeLoading] = createSignal(false)
  const [viewMode, setViewMode] = createSignal<"view" | "diff">("view")
  const [error, setError] = createSignal<string | null>(null)

  const modifiedFiles = createMemo(() => {
    const modified = new Map<string, { before: string | null; after: string }>()
    
    for (const event of props.events) {
      if (event.type === "tool_call") {
        const toolCall = event.data as ToolCall
        if (toolCall?.name === "write_file" && toolCall.arguments?.path) {
          const path = toolCall.arguments.path as string
          const content = toolCall.arguments.content as string
          if (!modified.has(path)) {
            modified.set(path, { before: null, after: content })
          } else {
            modified.get(path)!.after = content
          }
        }
      }
      
      if (event.type === "tool_result") {
        const result = event.data as ToolResult
        if (result?.name === "read_file") {
          const resultData = result.result as { content?: string }
          if (resultData?.content !== undefined) {
            for (const [, value] of modified) {
              if (value.before === null) {
                value.before = resultData.content
                break
              }
            }
          }
        }
      }
    }
    
    return modified
  })

  const modifiedPaths = createMemo(() => new Set(modifiedFiles().keys()))

  const loadFileTree = async () => {
    if (!props.runId) return

    setTreeLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/run/${props.runId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          provider: props.provider,
          path: props.workDir || "/workspace"
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to load file tree")
      }

      const data = await response.json()
      setFileTree(markModifiedFiles(data.tree, modifiedPaths()))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files")
    } finally {
      setTreeLoading(false)
    }
  }

  const markModifiedFiles = (nodes: FileNode[], modifiedSet: Set<string>): FileNode[] => {
    return nodes.map(node => {
      const normalizedPath = node.path.replace(/^\/workspace\/[^/]+\//, "")
      const isModified = modifiedSet.has(node.path) || 
                         modifiedSet.has(normalizedPath) ||
                         Array.from(modifiedSet).some(p => p.endsWith(node.path) || node.path.endsWith(p))
      
      if (node.type === "directory" && node.children) {
        return {
          ...node,
          children: markModifiedFiles(node.children, modifiedSet)
        }
      }
      
      return { ...node, modified: isModified }
    })
  }

  const loadFileContent = async (node: FileNode) => {
    if (!props.runId || node.type === "directory") return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/run/${props.runId}/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          provider: props.provider,
          path: node.path
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to load file")
      }

      const data = await response.json()
      
      const modifiedData = modifiedFiles().get(node.path) || 
                          Array.from(modifiedFiles().entries()).find(([p]) => 
                            p.endsWith(node.name) || node.path.endsWith(p)
                          )?.[1]

      setSelectedFile({
        path: node.path,
        content: data.content,
        language: getLanguageFromPath(node.path),
        originalContent: modifiedData?.before || undefined
      })

      if (node.modified && modifiedData?.before) {
        setViewMode("diff")
      } else {
        setViewMode("view")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load file")
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (node: FileNode) => {
    loadFileContent(node)
  }

  const handleToggle = (path: string) => {
    setExpandedPaths(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }

  const refreshTree = () => {
    loadFileTree()
  }

  onMount(() => {
    monaco.editor.defineTheme("ralph-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0d0d0d",
        "editor.foreground": "#e4e4e7",
        "editorLineNumber.foreground": "#52525b",
        "editorLineNumber.activeForeground": "#a1a1aa",
        "editor.lineHighlightBackground": "#18181b",
        "editor.selectionBackground": "#3b82f633",
        "editorCursor.foreground": "#3b82f6",
      },
    })
  })

  createEffect(() => {
    const file = selectedFile()
    const mode = viewMode()

    if (mode === "view" && file && editorContainerRef) {
      if (diffEditor) {
        diffEditor.dispose()
        diffEditor = undefined
      }

      if (!editor) {
        editor = monaco.editor.create(editorContainerRef, {
          value: file.content,
          language: file.language,
          theme: "ralph-dark",
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
        })
      } else {
        const model = monaco.editor.createModel(file.content, file.language)
        editor.setModel(model)
      }
    } else if (mode === "diff" && file && file.originalContent !== undefined && diffEditorContainerRef) {
      if (editor) {
        editor.dispose()
        editor = undefined
      }

      if (!diffEditor) {
        diffEditor = monaco.editor.createDiffEditor(diffEditorContainerRef, {
          theme: "ralph-dark",
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          renderSideBySide: true,
        })
      }

      const originalModel = monaco.editor.createModel(file.originalContent || "", file.language)
      const modifiedModel = monaco.editor.createModel(file.content, file.language)
      diffEditor.setModel({ original: originalModel, modified: modifiedModel })
    }
  })

  createEffect(() => {
    if (props.runId) {
      loadFileTree()
    }
  })

  onCleanup(() => {
    editor?.dispose()
    diffEditor?.dispose()
  })

  const modifiedCount = createMemo(() => modifiedPaths().size)

  return (
    <div class="flex h-full">
      <div class="w-64 shrink-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium text-[var(--color-text)]">Files</h3>
            <Show when={modifiedCount() > 0}>
              <span class="px-1.5 py-0.5 text-[10px] rounded bg-yellow-500/20 text-yellow-400">
                {modifiedCount()} modified
              </span>
            </Show>
          </div>
          <button
            class="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            onClick={refreshTree}
            title="Refresh"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto py-2">
          <Show when={treeLoading()}>
            <div class="flex items-center justify-center py-8">
              <span class="text-xs text-[var(--color-text-muted)]">Loading files...</span>
            </div>
          </Show>
          <Show when={!treeLoading() && fileTree().length === 0}>
            <div class="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
              <span class="text-2xl mb-2">📁</span>
              <p class="text-xs">No files loaded</p>
              <Show when={props.runId}>
                <button
                  class="mt-2 text-xs text-[var(--color-accent)] hover:underline"
                  onClick={refreshTree}
                >
                  Load files
                </button>
              </Show>
            </div>
          </Show>
          <Show when={!treeLoading() && fileTree().length > 0}>
            <For each={fileTree()}>
              {(node) => (
                <FileTreeItem
                  node={node}
                  depth={0}
                  selectedPath={selectedFile()?.path || null}
                  expandedPaths={expandedPaths()}
                  onSelect={handleFileSelect}
                  onToggle={handleToggle}
                />
              )}
            </For>
          </Show>
        </div>
      </div>

      <div class="flex-1 flex flex-col overflow-hidden">
        <Show when={selectedFile()}>
          <div class="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-sm text-[var(--color-text)] truncate">{selectedFile()?.path}</span>
              <Show when={modifiedPaths().has(selectedFile()?.path || "")}>
                <span class="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-yellow-500/20 text-yellow-400">
                  Modified
                </span>
              </Show>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <Show when={selectedFile()?.originalContent !== undefined}>
                <button
                  class={`px-2 py-1 text-xs rounded transition-colors ${
                    viewMode() === "view"
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                  }`}
                  onClick={() => setViewMode("view")}
                >
                  View
                </button>
                <button
                  class={`px-2 py-1 text-xs rounded transition-colors ${
                    viewMode() === "diff"
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                  }`}
                  onClick={() => setViewMode("diff")}
                >
                  Diff
                </button>
              </Show>
            </div>
          </div>
        </Show>

        <div class="flex-1 relative">
          <Show when={loading()}>
            <div class="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)] z-10">
              <span class="text-sm text-[var(--color-text-muted)]">Loading file...</span>
            </div>
          </Show>
          
          <Show when={error()}>
            <div class="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)] z-10">
              <div class="text-center">
                <span class="text-2xl mb-2 block">⚠️</span>
                <p class="text-sm text-red-400">{error()}</p>
              </div>
            </div>
          </Show>

          <Show when={!selectedFile() && !loading()}>
            <div class="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
              <span class="text-3xl mb-2">📄</span>
              <p class="text-sm">Select a file to view its contents</p>
              <Show when={modifiedCount() > 0}>
                <p class="text-xs mt-1 text-yellow-400">
                  {modifiedCount()} file{modifiedCount() === 1 ? "" : "s"} modified by agent
                </p>
              </Show>
            </div>
          </Show>

          <Show when={viewMode() === "view" && selectedFile()}>
            <div ref={editorContainerRef} class="absolute inset-0" />
          </Show>
          
          <Show when={viewMode() === "diff" && selectedFile()?.originalContent !== undefined}>
            <div ref={diffEditorContainerRef} class="absolute inset-0" />
          </Show>
        </div>
      </div>
    </div>
  )
}
