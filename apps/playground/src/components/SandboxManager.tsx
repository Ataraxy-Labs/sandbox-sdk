import { createSignal, createResource, For, Show, onMount } from "solid-js"
import type { SandboxState, Provider } from "../types"
import { PROVIDER_OPTIONS } from "../types"

interface SandboxInfo {
  id: string
  status: string
  image?: string
  name?: string
}

interface SandboxManagerProps {
  onSelectSandbox: (sandbox: { id: string; provider: Provider; image: string }) => void
  currentSandboxId: string | null
}

async function fetchSandboxes(provider: Provider): Promise<SandboxInfo[]> {
  try {
    const response = await fetch(`/api/sandboxes?provider=${provider}`)
    const data = await response.json()
    return data.sandboxes || []
  } catch {
    return []
  }
}

export function SandboxManager(props: SandboxManagerProps) {
  const [isOpen, setIsOpen] = createSignal(false)
  const [modalSandboxes, { refetch: refetchModal }] = createResource(() => fetchSandboxes("modal"))
  const [daytonaSandboxes, { refetch: refetchDaytona }] = createResource(() => fetchSandboxes("daytona"))
  const [destroying, setDestroying] = createSignal<string | null>(null)

  const refetchAll = () => {
    refetchModal()
    refetchDaytona()
  }

  const destroySandbox = async (id: string, provider: Provider) => {
    setDestroying(id)
    try {
      await fetch(`/api/sandbox/${id}/destroy?provider=${provider}`, { method: "POST" })
      refetchAll()
    } catch (err) {
      console.error("Failed to destroy sandbox:", err)
    } finally {
      setDestroying(null)
    }
  }

  const handleSelectSandbox = (sandbox: SandboxInfo, provider: Provider) => {
    props.onSelectSandbox({
      id: sandbox.id,
      provider,
      image: sandbox.image || "unknown",
    })
    setIsOpen(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
      case "ready":
        return "bg-[var(--color-success)]"
      case "creating":
      case "starting":
        return "bg-[var(--color-warning)]"
      default:
        return "bg-[var(--color-error)]"
    }
  }

  return (
    <>
      <button
        class="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
        onClick={() => {
          setIsOpen(true)
          refetchAll()
        }}
        title="Manage Sandboxes"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Sandboxes
      </button>

      <Show when={isOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-black/60" onClick={() => setIsOpen(false)} />
          <div class="relative bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl w-[600px] max-h-[80vh] overflow-hidden shadow-2xl">
            <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h2 class="text-lg font-semibold text-white">Sandbox Manager</h2>
              <div class="flex items-center gap-2">
                <button
                  class="p-2 text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
                  onClick={refetchAll}
                  title="Refresh"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
                <button
                  class="p-2 text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="overflow-y-auto max-h-[60vh]">
              <For each={PROVIDER_OPTIONS}>
                {(providerOption) => {
                  const sandboxes = () => (providerOption.value === "modal" ? modalSandboxes() : daytonaSandboxes())
                  const loading = () =>
                    providerOption.value === "modal" ? modalSandboxes.loading : daytonaSandboxes.loading

                  return (
                    <div class="border-b border-[var(--color-border)] last:border-b-0">
                      <div class="px-6 py-3 bg-[var(--color-bg-tertiary)]">
                        <div class="flex items-center gap-2">
                          <span class="font-medium text-white">{providerOption.label}</span>
                          <span class="text-xs text-[var(--color-text-dim)]">{providerOption.description}</span>
                        </div>
                      </div>

                      <div class="px-6 py-3">
                        <Show
                          when={!loading()}
                          fallback={
                            <div class="flex items-center justify-center py-4">
                              <div class="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                            </div>
                          }
                        >
                          <Show
                            when={sandboxes() && sandboxes()!.length > 0}
                            fallback={<p class="text-sm text-[var(--color-text-dim)] py-2">No sandboxes found</p>}
                          >
                            <div class="space-y-2">
                              <For each={sandboxes()}>
                                {(sandbox) => (
                                  <div
                                    class={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                                      props.currentSandboxId === sandbox.id
                                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                                        : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-tertiary)]"
                                    }`}
                                    onClick={() => handleSelectSandbox(sandbox, providerOption.value)}
                                  >
                                    <div class="flex items-center gap-3">
                                      <div class={`w-2 h-2 rounded-full ${getStatusColor(sandbox.status)}`} />
                                      <div>
                                        <div class="flex items-center gap-2">
                                          <span class="text-sm font-mono text-white">{sandbox.id.slice(0, 12)}...</span>
                                          <Show when={props.currentSandboxId === sandbox.id}>
                                            <span class="text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent)] text-white">
                                              active
                                            </span>
                                          </Show>
                                        </div>
                                        <div class="flex items-center gap-2 mt-1">
                                          <span class="text-xs text-[var(--color-text-dim)]">{sandbox.status}</span>
                                          <Show when={sandbox.image}>
                                            <span class="text-xs text-[var(--color-text-dim)]">• {sandbox.image}</span>
                                          </Show>
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      class="p-2 text-[var(--color-error)] hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        destroySandbox(sandbox.id, providerOption.value)
                                      }}
                                      disabled={destroying() === sandbox.id}
                                      title="Destroy sandbox"
                                    >
                                      <Show
                                        when={destroying() !== sandbox.id}
                                        fallback={
                                          <div class="w-4 h-4 border-2 border-[var(--color-error)] border-t-transparent rounded-full animate-spin" />
                                        }
                                      >
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                          />
                                        </svg>
                                      </Show>
                                    </button>
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                        </Show>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
