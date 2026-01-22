import { createSignal, Show, For } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Header } from "./components/Header"
import { CodeEditor } from "./components/CodeEditor"
import { Terminal } from "./components/Terminal"
import { SandboxPanel } from "./components/SandboxPanel"
import { FileExplorer } from "./components/FileExplorer"
import { OutputPanel } from "./components/OutputPanel"
import { Examples, DEFAULT_CODE } from "./components/Examples"
import { ContainerSidebar } from "./components/ContainerSidebar"
import { AIAssistant } from "./components/AIAssistant"
import type { AppState, ContainerState, Provider, Language } from "./types"
import { runtimeFromImage, languageFromRuntime } from "./types"

function generateClientId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const TABS = [
  { id: "output", label: "Output", icon: (
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5l7 7-7 7" />
    </svg>
  )},
  { id: "terminal", label: "Terminal", icon: (
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )},
  { id: "files", label: "Files", icon: (
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )},
  { id: "assistant", label: "AI", icon: (
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )},
] as const

export default function App() {
  const [state, setState] = createStore<AppState>({
    focusedId: null,
    containers: {},
    order: [],
    createDraft: { provider: "modal", image: "python:3.12-slim" },
    activeTab: "output",
  })

  const [code, setCode] = createSignal(DEFAULT_CODE.python)
  const [isCreating, setIsCreating] = createSignal(false)

  const focusedContainer = (): ContainerState | null => {
    if (!state.focusedId) return null
    return state.containers[state.focusedId] || null
  }

  const currentLanguage = (): Language => {
    const container = focusedContainer()
    if (!container) return "python"
    return languageFromRuntime(runtimeFromImage(container.image))
  }

  const currentImage = (): string => {
    const container = focusedContainer()
    return container?.image || state.createDraft.image
  }

  const appendTerminal = (clientId: string, line: string) => {
    setState(
      produce((s) => {
        if (s.containers[clientId]) {
          s.containers[clientId].terminal.push(line)
        }
      })
    )
  }

  const createContainer = async () => {
    const clientId = generateClientId()
    const { provider, image } = state.createDraft

    const newContainer: ContainerState = {
      id: "",
      clientId,
      status: "creating",
      provider,
      image,
      terminal: [`[system] Creating ${provider} sandbox with image: ${image}...`],
      output: null,
      isRunning: false,
      createdAt: Date.now(),
    }

    setState(
      produce((s) => {
        s.containers[clientId] = newContainer
        s.order.push(clientId)
        s.focusedId = clientId
      })
    )

    setIsCreating(true)

    try {
      const response = await fetch("/api/sandbox/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, provider }),
      })
      const data = await response.json()

      if (data.id) {
        setState(
          produce((s) => {
            if (s.containers[clientId]) {
              s.containers[clientId].id = data.id
              s.containers[clientId].status = "ready"
              s.containers[clientId].terminal.push(`[system] Sandbox created: ${data.id}`)
              s.containers[clientId].terminal.push(`[system] Status: ready`)
            }
          })
        )
      } else {
        throw new Error(data.error || "Failed to create sandbox")
      }
    } catch (err) {
      setState(
        produce((s) => {
          if (s.containers[clientId]) {
            s.containers[clientId].status = "failed"
            s.containers[clientId].terminal.push(`[error] ${err instanceof Error ? err.message : "Unknown error"}`)
          }
        })
      )
    } finally {
      setIsCreating(false)
    }
  }

  const destroyContainer = async (clientId: string) => {
    const container = state.containers[clientId]
    if (!container) return

    if (container.id && container.status === "ready") {
      appendTerminal(clientId, `[system] Destroying sandbox: ${container.id}...`)
      try {
        await fetch(`/api/sandbox/${container.id}/destroy?provider=${container.provider}`, { method: "POST" })
      } catch (err) {
        appendTerminal(clientId, `[error] ${err instanceof Error ? err.message : "Unknown error"}`)
      }
    }

    const orderIndex = state.order.indexOf(clientId)
    const nextId = state.order.length > 1 ? state.order[orderIndex === 0 ? 1 : orderIndex - 1] : null

    setState(
      produce((s) => {
        delete s.containers[clientId]
        s.order = s.order.filter((id) => id !== clientId)
        if (s.focusedId === clientId) {
          s.focusedId = nextId !== clientId ? nextId : null
        }
      })
    )
  }

  const focusContainer = (clientId: string) => {
    setState("focusedId", clientId)
  }

  const runCode = async () => {
    const container = focusedContainer()
    if (!container || container.status !== "ready" || !container.id) {
      return
    }

    const clientId = container.clientId
    const language = currentLanguage()

    setState(
      produce((s) => {
        if (s.containers[clientId]) {
          s.containers[clientId].isRunning = true
          s.containers[clientId].output = null
          s.containers[clientId].terminal.push(`[run] Executing ${language} code...`)
        }
      })
    )

    try {
      const response = await fetch(`/api/sandbox/${container.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code: code() }),
      })
      const result = await response.json()

      setState(
        produce((s) => {
          if (s.containers[clientId]) {
            s.containers[clientId].output = result
            s.containers[clientId].terminal.push(`[run] Exit code: ${result.exitCode}`)
            if (result.stdout) {
              result.stdout.split("\n").forEach((line: string) => {
                s.containers[clientId].terminal.push(`[stdout] ${line}`)
              })
            }
            if (result.stderr) {
              result.stderr.split("\n").forEach((line: string) => {
                s.containers[clientId].terminal.push(`[stderr] ${line}`)
              })
            }
          }
        })
      )
    } catch (err) {
      appendTerminal(clientId, `[error] ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setState(
        produce((s) => {
          if (s.containers[clientId]) {
            s.containers[clientId].isRunning = false
          }
        })
      )
    }
  }

  const runCommand = async (cmd: string) => {
    const container = focusedContainer()
    if (!container || container.status !== "ready" || !container.id) {
      return
    }

    const clientId = container.clientId
    appendTerminal(clientId, `$ ${cmd}`)

    try {
      const response = await fetch(`/api/sandbox/${container.id}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: "sh", args: ["-c", cmd] }),
      })
      const result = await response.json()

      if (result.stdout) {
        result.stdout.split("\n").forEach((line: string) => {
          if (line) appendTerminal(clientId, line)
        })
      }
      if (result.stderr) {
        result.stderr.split("\n").forEach((line: string) => {
          if (line) appendTerminal(clientId, `[stderr] ${line}`)
        })
      }
    } catch (err) {
      appendTerminal(clientId, `[error] ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  return (
    <div class="h-full flex flex-col bg-[var(--color-bg)]">
      <Header focusedContainer={focusedContainer()} onRun={runCode} isRunning={focusedContainer()?.isRunning || false} />

      <div class="flex-1 flex overflow-hidden p-3 gap-3">
        {/* Left Sidebar - Card Style */}
        <div class="w-64 flex flex-col card-elevated overflow-hidden">
          <ContainerSidebar
            state={state}
            onFocus={focusContainer}
            onDestroy={destroyContainer}
            onCreate={createContainer}
            onDraftProviderChange={(p) => setState("createDraft", "provider", p)}
            onDraftImageChange={(img) => setState("createDraft", "image", img)}
            isCreating={isCreating()}
          />
        </div>

        {/* Center - Editor Panel */}
        <div class="flex-1 flex flex-col card-elevated overflow-hidden">
          <Examples image={currentImage()} onSelect={setCode} />
          <div class="flex-1 overflow-hidden">
            <CodeEditor code={code()} language={currentLanguage()} onChange={setCode} />
          </div>
        </div>

        {/* Right Panel - Card Style */}
        <div class="w-[460px] flex flex-col card-elevated overflow-hidden">
          {/* Tabs */}
          <div class="flex items-center h-11 px-2 border-b border-[var(--color-border)]">
            <For each={TABS}>
              {(tab) => (
                <button
                  class={`flex items-center gap-2 h-full px-3 text-[13px] font-medium transition-all relative ${
                    state.activeTab === tab.id
                      ? "text-white"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }`}
                  onClick={() => setState("activeTab", tab.id)}
                >
                  <span class={state.activeTab === tab.id ? "text-[var(--color-accent)]" : ""}>{tab.icon}</span>
                  {tab.label}
                  <Show when={state.activeTab === tab.id}>
                    <div class="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--color-accent)] rounded-full" />
                  </Show>
                </button>
              )}
            </For>
          </div>

          {/* Tab Content */}
          <div class="flex-1 overflow-hidden">
            <Show when={state.activeTab === "output"}>
              <OutputPanel result={focusedContainer()?.output || null} isRunning={focusedContainer()?.isRunning || false} />
            </Show>
            <Show when={state.activeTab === "terminal"}>
              <Terminal
                lines={focusedContainer()?.terminal || []}
                onCommand={runCommand}
                disabled={focusedContainer()?.status !== "ready"}
              />
            </Show>
            <Show when={state.activeTab === "files"}>
              <FileExplorer sandboxId={focusedContainer()?.id || null} disabled={focusedContainer()?.status !== "ready"} />
            </Show>
            <Show when={state.activeTab === "assistant"}>
              <AIAssistant code={code()} language={currentLanguage()} />
            </Show>
          </div>
        </div>
      </div>

      <SandboxPanel container={focusedContainer()} />
    </div>
  )
}
