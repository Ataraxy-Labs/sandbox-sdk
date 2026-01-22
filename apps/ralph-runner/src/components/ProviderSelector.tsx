import { Component, createSignal, createEffect, onMount, For, Show } from "solid-js"
import type { Provider, ProviderConfig } from "../types"

interface ProviderSelectorProps {
  onProvidersChanged: (providers: Provider[]) => void
  disabled?: boolean
}

interface ProviderMeta {
  id: Provider
  name: string
  description: string
  icon: string
}

const PROVIDER_META: ProviderMeta[] = [
  {
    id: "modal",
    name: "Modal",
    description: "GPU-accelerated containers",
    icon: "M",
  },
  {
    id: "daytona",
    name: "Daytona",
    description: "Development environments",
    icon: "D",
  },
  {
    id: "e2b",
    name: "E2B",
    description: "Code interpreter sandbox",
    icon: "E",
  },
  {
    id: "blaxel",
    name: "Blaxel",
    description: "AI workload platform",
    icon: "B",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Edge computing containers",
    icon: "C",
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Serverless functions",
    icon: "V",
  },
  {
    id: "docker",
    name: "Docker",
    description: "Local containers (fast)",
    icon: "🐳",
  },
]

export const ProviderSelector: Component<ProviderSelectorProps> = (props) => {
  const [providers, setProviders] = createSignal<ProviderConfig[]>([])
  const [selected, setSelected] = createSignal<Provider[]>([])
  const [mode, setMode] = createSignal<"single" | "multi">("single")
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  onMount(async () => {
    try {
      const response = await fetch("/api/providers")
      if (!response.ok) {
        throw new Error("Failed to fetch providers")
      }
      const data = await response.json()
      setProviders(data.providers)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load providers")
    } finally {
      setLoading(false)
    }
  })

  createEffect(() => {
    props.onProvidersChanged(selected())
  })

  const getProviderMeta = (id: Provider): ProviderMeta => {
    return PROVIDER_META.find((p) => p.id === id) || { id, name: id, description: "", icon: id[0].toUpperCase() }
  }

  const isSelected = (id: Provider): boolean => {
    return selected().includes(id)
  }

  const toggleProvider = (id: Provider) => {
    if (props.disabled) return

    const provider = providers().find((p) => p.id === id)
    if (!provider?.configured) return

    if (mode() === "single") {
      setSelected(isSelected(id) ? [] : [id])
    } else {
      if (isSelected(id)) {
        setSelected(selected().filter((p) => p !== id))
      } else {
        setSelected([...selected(), id])
      }
    }
  }

  const handleModeChange = (newMode: "single" | "multi") => {
    setMode(newMode)
    if (newMode === "single" && selected().length > 1) {
      setSelected([selected()[0]])
    }
  }

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="block text-sm font-medium text-[var(--color-text-secondary)]">
          Sandbox Providers
        </label>
        <div class="flex items-center gap-1 p-0.5 bg-[var(--color-bg-tertiary)] rounded-md">
          <button
            type="button"
            onClick={() => handleModeChange("single")}
            disabled={props.disabled}
            class={`px-2 py-0.5 text-xs rounded transition-colors ${
              mode() === "single"
                ? "bg-[var(--color-bg-secondary)] text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            } disabled:opacity-50`}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("multi")}
            disabled={props.disabled}
            class={`px-2 py-0.5 text-xs rounded transition-colors ${
              mode() === "multi"
                ? "bg-[var(--color-bg-secondary)] text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            } disabled:opacity-50`}
          >
            Multi
          </button>
        </div>
      </div>

      <Show when={loading()}>
        <div class="grid grid-cols-2 gap-2">
          <For each={[1, 2, 3, 4, 5, 6]}>
            {() => (
              <div class="h-20 bg-[var(--color-bg-tertiary)] rounded-lg animate-pulse" />
            )}
          </For>
        </div>
      </Show>

      <Show when={error()}>
        <div class="p-3 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 rounded-lg">
          <p class="text-xs text-[var(--color-error)]">{error()}</p>
        </div>
      </Show>

      <Show when={!loading() && !error()}>
        <div class="grid grid-cols-2 gap-2">
          <For each={providers()}>
            {(provider) => {
              const meta = getProviderMeta(provider.id)
              const isActive = () => isSelected(provider.id)
              const isConfigured = provider.configured

              return (
                <button
                  type="button"
                  onClick={() => toggleProvider(provider.id)}
                  disabled={props.disabled || !isConfigured}
                  class={`relative p-3 rounded-lg border text-left transition-all ${
                    isActive()
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : isConfigured
                        ? "border-[var(--color-border)] bg-[var(--color-bg-tertiary)] hover:border-[var(--color-border-hover)]"
                        : "border-[var(--color-border)] bg-[var(--color-bg-tertiary)] opacity-50 cursor-not-allowed"
                  } disabled:opacity-50`}
                >
                  <Show when={isActive()}>
                    <div class="absolute top-1.5 right-1.5">
                      <svg
                        class="w-4 h-4 text-[var(--color-accent)]"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  </Show>

                  <div class="flex items-start gap-2">
                    <div
                      class={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold shrink-0 ${
                        isActive()
                          ? "bg-[var(--color-accent)] text-white"
                          : isConfigured
                            ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]"
                            : "bg-[var(--color-bg-secondary)] text-[var(--color-text-dim)]"
                      }`}
                    >
                      {meta.icon}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span
                          class={`text-sm font-medium truncate ${
                            isActive()
                              ? "text-[var(--color-text)]"
                              : isConfigured
                                ? "text-[var(--color-text)]"
                                : "text-[var(--color-text-muted)]"
                          }`}
                        >
                          {meta.name}
                        </span>
                        <span
                          class={`shrink-0 w-1.5 h-1.5 rounded-full ${
                            isConfigured ? "bg-[var(--color-success)]" : "bg-[var(--color-text-dim)]"
                          }`}
                          title={isConfigured ? "Configured" : "Not configured"}
                        />
                      </div>
                      <p class="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                </button>
              )
            }}
          </For>
        </div>
      </Show>

      <Show when={selected().length > 0}>
        <div class="text-xs text-[var(--color-text-secondary)] animate-fadeIn">
          {mode() === "single" ? (
            <span>Selected: {getProviderMeta(selected()[0]).name}</span>
          ) : (
            <span>
              Selected ({selected().length}): {selected().map((p) => getProviderMeta(p).name).join(", ")}
            </span>
          )}
        </div>
      </Show>

      <Show when={mode() === "multi" && selected().length > 1}>
        <p class="text-xs text-[var(--color-text-muted)]">
          The task will run in parallel across {selected().length} providers for comparison.
        </p>
      </Show>
    </div>
  )
}
