import { createSignal, Show, For } from "solid-js"
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui"

interface ProviderKeyConfig {
  provider: string
  label: string
  keys: Array<{ name: string; envVar: string; placeholder: string }>
}

const PROVIDER_KEY_CONFIGS: ProviderKeyConfig[] = [
  {
    provider: "modal",
    label: "Modal",
    keys: [
      { name: "MODAL_TOKEN_ID", envVar: "MODAL_TOKEN_ID", placeholder: "ak-..." },
      { name: "MODAL_TOKEN_SECRET", envVar: "MODAL_TOKEN_SECRET", placeholder: "as-..." },
    ],
  },
  {
    provider: "e2b",
    label: "E2B",
    keys: [{ name: "E2B_API_KEY", envVar: "E2B_API_KEY", placeholder: "e2b_..." }],
  },
  {
    provider: "daytona",
    label: "Daytona",
    keys: [{ name: "DAYTONA_API_KEY", envVar: "DAYTONA_API_KEY", placeholder: "dyt_..." }],
  },
  {
    provider: "blaxel",
    label: "Blaxel",
    keys: [{ name: "BLAXEL_API_KEY", envVar: "BLAXEL_API_KEY", placeholder: "blx_..." }],
  },
  {
    provider: "cloudflare",
    label: "Cloudflare",
    keys: [
      { name: "CLOUDFLARE_API_TOKEN", envVar: "CLOUDFLARE_API_TOKEN", placeholder: "..." },
      { name: "CLOUDFLARE_ACCOUNT_ID", envVar: "CLOUDFLARE_ACCOUNT_ID", placeholder: "..." },
    ],
  },
  {
    provider: "vercel",
    label: "Vercel",
    keys: [{ name: "VERCEL_ACCESS_TOKEN", envVar: "VERCEL_ACCESS_TOKEN", placeholder: "..." }],
  },
]

interface SavedKey {
  _id: string
  provider: string
  keyName: string
  hasValue: boolean
  updatedAt: number
}

export default function Settings() {
  const [savedKeys, setSavedKeys] = createSignal<SavedKey[]>([])
  const [saving, setSaving] = createSignal<string | null>(null)
  const [keyValues, setKeyValues] = createSignal<Record<string, string>>({})

  const fetchKeys = async () => {
    try {
      const res = await fetch("/api/user/keys")
      if (res.ok) {
        const data = await res.json()
        setSavedKeys(data.keys || [])
      }
    } catch {}
  }

  fetchKeys()

  const isKeySaved = (provider: string, keyName: string) => {
    return savedKeys().some((k) => k.provider === provider && k.keyName === keyName && k.hasValue)
  }

  const saveKey = async (provider: string, keyName: string) => {
    const value = keyValues()[`${provider}:${keyName}`]
    if (!value) return

    setSaving(`${provider}:${keyName}`)
    try {
      const res = await fetch("/api/user/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, keyName, value }),
      })
      if (res.ok) {
        // Clear the input and refresh
        setKeyValues((prev) => ({ ...prev, [`${provider}:${keyName}`]: "" }))
        await fetchKeys()
      }
    } catch {}
    setSaving(null)
  }

  const deleteKey = async (id: string) => {
    try {
      const res = await fetch(`/api/user/keys/${id}`, { method: "DELETE" })
      if (res.ok) {
        await fetchKeys()
      }
    } catch {}
  }

  return (
    <div class="h-full overflow-y-auto">
      <div class="max-w-2xl mx-auto p-6 space-y-6">
        {/* Profile */}
        <div>
          <h1 class="text-lg font-semibold mb-1">Settings</h1>
          <p class="text-xs text-[var(--color-text-muted)]">
            Manage your provider API keys. Keys are encrypted and stored securely.
          </p>
        </div>

        {/* Provider Keys */}
        <div class="space-y-4">
          <For each={PROVIDER_KEY_CONFIGS}>
            {(config) => (
              <Card>
                <CardHeader>
                  <div class="flex items-center gap-2">
                    <CardTitle>{config.label}</CardTitle>
                    <Show when={config.keys.every((k) => isKeySaved(config.provider, k.name))}>
                      <Badge variant="success">Configured</Badge>
                    </Show>
                  </div>
                </CardHeader>
                <CardContent>
                  <div class="space-y-3">
                    <For each={config.keys}>
                      {(key) => (
                        <div class="space-y-1.5">
                          <div class="flex items-center gap-2">
                            <Label>{key.name}</Label>
                            <Show when={isKeySaved(config.provider, key.name)}>
                              <span class="text-[10px] text-[var(--color-success)]">saved</span>
                            </Show>
                          </div>
                          <div class="flex gap-2">
                            <Input
                              type="password"
                              placeholder={isKeySaved(config.provider, key.name) ? "••••••••" : key.placeholder}
                              value={keyValues()[`${config.provider}:${key.name}`] || ""}
                              onInput={(e) =>
                                setKeyValues((prev) => ({
                                  ...prev,
                                  [`${config.provider}:${key.name}`]: e.currentTarget.value,
                                }))
                              }
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                !keyValues()[`${config.provider}:${key.name}`] ||
                                saving() === `${config.provider}:${key.name}`
                              }
                              onClick={() => saveKey(config.provider, key.name)}
                            >
                              {saving() === `${config.provider}:${key.name}` ? "..." : "Save"}
                            </Button>
                            <Show when={isKeySaved(config.provider, key.name)}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const saved = savedKeys().find(
                                    (k) => k.provider === config.provider && k.keyName === key.name
                                  )
                                  if (saved) deleteKey(saved._id)
                                }}
                              >
                                Remove
                              </Button>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </CardContent>
              </Card>
            )}
          </For>
        </div>

        {/* Info */}
        <div class="text-xs text-[var(--color-text-dim)] space-y-1">
          <p>Keys you add here will be used when creating sandboxes on each provider.</p>
          <p>If no key is set, the server's default environment variables are used.</p>
        </div>
      </div>
    </div>
  )
}
