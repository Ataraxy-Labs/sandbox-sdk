export type Provider = "modal" | "daytona" | "e2b" | "blaxel" | "cloudflare" | "vercel" | "docker"

export type RunStatus = "idle" | "cloning" | "installing" | "running" | "paused" | "completed" | "failed"

export type EventType = "status" | "clone_progress" | "install_progress" | "thought" | "tool_call" | "tool_result" | "output" | "error" | "complete" | "opencode_ready" | "ralph_iteration" | "ralph_complete"

export interface AgentEvent {
  id: string
  type: EventType
  timestamp: number
  data: unknown
  provider?: Provider
}

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  name: string
  result: unknown
  error?: string
}

export interface Run {
  id: string
  repoUrl: string
  branch: string
  task: string
  providers: Provider[]
  status: RunStatus
  events: AgentEvent[]
  startedAt: number
  completedAt?: number
}

export interface ProviderConfig {
  id: Provider
  name: string
  configured: boolean
}

export interface RepoMetadata {
  name: string
  fullName: string
  description: string | null
  stars: number
  language: string | null
  defaultBranch: string
}

export interface AgentConfig {
  maxIterations?: number
  doomLoopThreshold?: number
}
