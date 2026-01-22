import { Component, createSignal, createEffect, Show } from "solid-js"
import type { RepoMetadata } from "../types"

interface RepoInputProps {
  onRepoValidated: (url: string, branch: string, metadata: RepoMetadata) => void
  disabled?: boolean
}

const GITHUB_URL_REGEX = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)\/?$/
const SHORTHAND_REGEX = /^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/

function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim()
  
  const fullMatch = trimmed.match(GITHUB_URL_REGEX)
  if (fullMatch) {
    return { owner: fullMatch[1], repo: fullMatch[2].replace(/\.git$/, "") }
  }
  
  const shortMatch = trimmed.match(SHORTHAND_REGEX)
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2].replace(/\.git$/, "") }
  }
  
  return null
}

async function fetchRepoMetadata(owner: string, repo: string): Promise<RepoMetadata> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Repository not found")
    }
    throw new Error(`GitHub API error: ${response.status}`)
  }
  const data = await response.json()
  return {
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    stars: data.stargazers_count,
    language: data.language,
    defaultBranch: data.default_branch,
  }
}

async function fetchBranches(owner: string, repo: string): Promise<string[]> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`)
  if (!response.ok) {
    return []
  }
  const data = await response.json()
  return data.map((b: { name: string }) => b.name)
}

export const RepoInput: Component<RepoInputProps> = (props) => {
  const [url, setUrl] = createSignal("")
  const [branch, setBranch] = createSignal("")
  const [branches, setBranches] = createSignal<string[]>([])
  const [error, setError] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [metadata, setMetadata] = createSignal<RepoMetadata | null>(null)
  const [parsed, setParsed] = createSignal<{ owner: string; repo: string } | null>(null)

  let debounceTimeout: ReturnType<typeof setTimeout> | null = null

  createEffect(() => {
    const value = url()
    setError(null)
    setMetadata(null)
    setBranches([])
    setBranch("")
    
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }
    
    if (!value.trim()) {
      setParsed(null)
      return
    }
    
    const result = parseGitHubUrl(value)
    setParsed(result)
    
    if (!result) {
      setError("Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo")
      return
    }
    
    debounceTimeout = setTimeout(async () => {
      setLoading(true)
      try {
        const [meta, branchList] = await Promise.all([
          fetchRepoMetadata(result.owner, result.repo),
          fetchBranches(result.owner, result.repo),
        ])
        setMetadata(meta)
        setBranches(branchList)
        setBranch(meta.defaultBranch)
        props.onRepoValidated(`https://github.com/${result.owner}/${result.repo}`, meta.defaultBranch, meta)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch repository")
        setMetadata(null)
      } finally {
        setLoading(false)
      }
    }, 500)
  })

  const handleBranchChange = (newBranch: string) => {
    setBranch(newBranch)
    const meta = metadata()
    const p = parsed()
    if (meta && p) {
      props.onRepoValidated(`https://github.com/${p.owner}/${p.repo}`, newBranch, meta)
    }
  }

  return (
    <div class="space-y-3">
      <div>
        <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
          GitHub Repository
        </label>
        <div class="relative">
          <input
            type="text"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
            placeholder="https://github.com/owner/repo or owner/repo"
            disabled={props.disabled}
            class="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder-[var(--color-text-dim)] text-sm focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
          />
          <Show when={loading()}>
            <div class="absolute right-3 top-1/2 -translate-y-1/2">
              <svg
                class="w-4 h-4 text-[var(--color-accent)] animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          </Show>
        </div>
        <Show when={error()}>
          <p class="mt-1.5 text-xs text-[var(--color-error)]">{error()}</p>
        </Show>
      </div>

      <Show when={branches().length > 0}>
        <div class="animate-fadeIn">
          <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
            Branch
          </label>
          <select
            value={branch()}
            onChange={(e) => handleBranchChange(e.currentTarget.value)}
            disabled={props.disabled}
            class="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm focus:border-[var(--color-accent)] transition-colors disabled:opacity-50 appearance-none cursor-pointer"
          >
            {branches().map((b) => (
              <option value={b}>{b}</option>
            ))}
          </select>
        </div>
      </Show>

      <Show when={metadata()}>
        <div class="card p-3 animate-slideUp">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center shrink-0">
              <svg
                class="w-5 h-5 text-[var(--color-text-muted)]"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-[var(--color-text)] text-sm truncate">
                {metadata()!.fullName}
              </h3>
              <Show when={metadata()!.description}>
                <p class="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                  {metadata()!.description}
                </p>
              </Show>
              <div class="flex items-center gap-3 mt-2">
                <Show when={metadata()!.language}>
                  <span class="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                    <span class="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
                    {metadata()!.language}
                  </span>
                </Show>
                <span class="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/>
                  </svg>
                  {metadata()!.stars.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
