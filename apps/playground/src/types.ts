export type SandboxStatus = "creating" | "ready" | "stopped" | "failed"
export type Provider = "modal" | "daytona" | "e2b" | "blaxel" | "cloudflare" | "vercel"
export type RuntimeKind = "python" | "node" | "bash" | "generic"

export interface SandboxState {
  id: string | null
  status: SandboxStatus
  provider: Provider
  image: string
}

export interface ContainerState {
  id: string
  clientId: string
  status: SandboxStatus
  provider: Provider
  image: string
  terminal: string[]
  output: ExecutionResult | null
  isRunning: boolean
  createdAt: number
}

export interface AppState {
  focusedId: string | null
  containers: Record<string, ContainerState>
  order: string[]
  createDraft: { provider: Provider; image: string }
  activeTab: "output" | "terminal" | "files" | "assistant"
}

export const PROVIDER_OPTIONS: Array<{ value: Provider; label: string; description: string }> = [
  { value: "modal", label: "Modal", description: "Fast GPU-ready containers" },
  { value: "daytona", label: "Daytona", description: "Full dev environments" },
  { value: "e2b", label: "E2B", description: "Code interpreter sandboxes" },
  { value: "blaxel", label: "Blaxel", description: "Fast standby/resume" },
  { value: "cloudflare", label: "Cloudflare", description: "Edge sandbox runtime" },
  { value: "vercel", label: "Vercel", description: "Serverless code execution" },
]

export interface ExecutionResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs?: number
}

export interface FileEntry {
  path: string
  type: "file" | "dir"
  size?: number
}

export type Language = "python" | "javascript" | "bash"

export const LANGUAGE_CONFIG: Record<Language, { label: string; image: string; extension: string }> = {
  python: { label: "Python", image: "python:3.12-slim", extension: ".py" },
  javascript: { label: "JavaScript", image: "node:22-alpine", extension: ".js" },
  bash: { label: "Bash", image: "alpine:3.21", extension: ".sh" },
}

export const IMAGE_OPTIONS = [
  { value: "python:3.12-slim", label: "Python 3.12" },
  { value: "node:22-alpine", label: "Node.js 22" },
  { value: "alpine:3.21", label: "Alpine Linux" },
  { value: "ubuntu:24.04", label: "Ubuntu 24.04" },
  { value: "golang:1.22-alpine", label: "Go 1.22" },
  { value: "rust:1.75-slim", label: "Rust 1.75" },
]

export function runtimeFromImage(image: string): RuntimeKind {
  const img = image.toLowerCase()
  if (img.startsWith("python:") || img.includes("python")) return "python"
  if (img.startsWith("node:") || img.includes("node")) return "node"
  if (img.startsWith("alpine:")) return "bash"
  return "generic"
}

export function languageFromRuntime(runtime: RuntimeKind): Language {
  switch (runtime) {
    case "python":
      return "python"
    case "node":
      return "javascript"
    case "bash":
    case "generic":
      return "bash"
  }
}
