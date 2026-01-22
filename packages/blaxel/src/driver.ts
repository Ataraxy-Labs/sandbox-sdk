import { Effect, Stream, Layer, Clock } from "effect"
import {
  SandboxDriver,
  type SandboxDriverService,
  type CreateOptions,
  type SandboxInfo,
  type SandboxStatus,
  type RunCommand,
  type RunResult,
  type ProcessChunk,
  type FsEntry,
  type SnapshotInfo,
  type RunCodeInput,
  type RunCodeResult,
  type SandboxError,
  SandboxProviderError,
  currentTimestamp,
  generateId,
} from "@ataraxy-labs/sandbox-sdk"
import { BlaxelConfigTag } from "./config"
import { createClient } from "./client"

interface BlaxelSandboxResponse {
  metadata: {
    name: string
    workspace?: string
    createdAt?: string
    labels?: Record<string, string>
    url?: string
  }
  spec: {
    runtime?: {
      image?: string
      memory?: number
      cpu?: number
      envs?: Array<{ name: string; value: string }>
    }
  }
  status?:
    | "DELETING"
    | "TERMINATED"
    | "FAILED"
    | "DEACTIVATED"
    | "DEACTIVATING"
    | "UPLOADING"
    | "BUILDING"
    | "DEPLOYING"
    | "DEPLOYED"
}

interface BlaxelProcessResponse {
  pid: string
  name: string
  command: string
  status: string
  exitCode: number
  stdout: string
  stderr: string
  logs: string
  workingDir: string
  startedAt: string
  completedAt: string
}

interface BlaxelFileInfo {
  name: string
  path: string
  isDir?: boolean
  size?: number
  modifiedAt?: string
}

interface BlaxelDirResponse {
  files: BlaxelFileInfo[]
  subdirectories: BlaxelFileInfo[]
}

const mapStatus = (status?: BlaxelSandboxResponse["status"]): SandboxStatus => {
  switch (status) {
    case "DEPLOYED":
      return "ready"
    case "DEPLOYING":
    case "BUILDING":
    case "UPLOADING":
      return "creating"
    case "DEACTIVATED":
    case "DEACTIVATING":
    case "TERMINATED":
    case "DELETING":
      return "stopped"
    case "FAILED":
      return "failed"
    default:
      return "creating"
  }
}

const mapImageToBlaxel = (image?: string): string => {
  if (!image) return "blaxel/py-app:latest"
  if (image.startsWith("blaxel/")) return image
  const normalized = image.toLowerCase()
  if (normalized.includes("python")) return "blaxel/py-app:latest"
  if (normalized.includes("node") || normalized.includes("javascript") || normalized.includes("typescript"))
    return "blaxel/node:latest"
  return "blaxel/py-app:latest"
}

export const BlaxelDriverLive = Layer.effect(
  SandboxDriver,
  Effect.gen(function* () {
    const config = yield* BlaxelConfigTag
    const client = createClient(config.baseUrl ?? "https://api.blaxel.ai/v0", config.apiKey, config.workspace)
    const sandboxUrls = new Map<string, string>()

    const getSandboxUrl = (id: string): Effect.Effect<string, SandboxError> =>
      Effect.gen(function* () {
        const cached = sandboxUrls.get(id)
        if (cached) return cached
        const sbx = yield* client.request<BlaxelSandboxResponse>("GET", `/sandboxes/${id}`)
        const url = sbx.metadata.url
        if (!url) return yield* Effect.fail(new SandboxProviderError({ message: `Sandbox ${id} has no URL` }))
        sandboxUrls.set(id, url)
        return url
      })

    const driver: SandboxDriverService = {
      create: (options: CreateOptions) =>
        Effect.gen(function* () {
          const sandboxNameId = yield* generateId("sandbox")
          const name = options.name || sandboxNameId
          const envs = options.env ? Object.entries(options.env).map(([k, v]) => ({ name: k, value: v })) : undefined

          const sbx = yield* client.request<BlaxelSandboxResponse>("POST", "/sandboxes", {
            metadata: { name },
            spec: {
              runtime: {
                image: mapImageToBlaxel(options.image),
                memory: options.memoryMiB || 4096,
                envs,
                generation: "mk3",
              },
            },
          })
          if (sbx.metadata.url) {
            sandboxUrls.set(sbx.metadata.name, sbx.metadata.url)
          }
          const createdAt = sbx.metadata.createdAt ?? (yield* currentTimestamp)
          return {
            id: sbx.metadata.name,
            name: sbx.metadata.name,
            provider: "blaxel",
            status: mapStatus(sbx.status),
            createdAt,
          } satisfies SandboxInfo
        }),

      destroy: (name: string) =>
        Effect.gen(function* () {
          yield* client.request<void>("DELETE", `/sandboxes/${name}`)
          sandboxUrls.delete(name)
        }),

      status: (name: string) =>
        Effect.gen(function* () {
          const sbx = yield* client.request<BlaxelSandboxResponse>("GET", `/sandboxes/${name}`)
          return mapStatus(sbx.status)
        }),

      list: () =>
        Effect.gen(function* () {
          const sandboxes = yield* client.request<BlaxelSandboxResponse[]>("GET", "/sandboxes")
          const now = yield* currentTimestamp
          return sandboxes.map((s) => ({
            id: s.metadata.name,
            name: s.metadata.name,
            provider: "blaxel",
            status: mapStatus(s.status),
            createdAt: s.metadata.createdAt ?? now,
          }))
        }),

      get: (name: string) =>
        Effect.gen(function* () {
          const sbx = yield* client.request<BlaxelSandboxResponse>("GET", `/sandboxes/${name}`)
          if (sbx.metadata.url) {
            sandboxUrls.set(sbx.metadata.name, sbx.metadata.url)
          }
          const createdAt = sbx.metadata.createdAt ?? (yield* currentTimestamp)
          return {
            id: sbx.metadata.name,
            name: sbx.metadata.name,
            provider: "blaxel",
            status: mapStatus(sbx.status),
            createdAt,
          } satisfies SandboxInfo
        }),

      run: (id: string, cmd: RunCommand) =>
        Effect.gen(function* () {
          const url = yield* getSandboxUrl(id)
          const command = cmd.args?.length ? `${cmd.cmd} ${cmd.args.join(" ")}` : cmd.cmd
          const result = yield* client.sandboxRequest<BlaxelProcessResponse>(url, "POST", "/process", {
            command,
            workingDir: cmd.cwd,
            env: cmd.env,
            waitForCompletion: true,
            timeout: Math.floor((cmd.timeoutMs || 30000) / 1000),
          })
          return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } satisfies RunResult
        }),

      stream: (id: string, cmd: RunCommand) =>
        Stream.async<ProcessChunk, SandboxError>((emit) => {
          void (async () => {
            try {
              const url = sandboxUrls.get(id)
              if (!url) {
                emit.fail(new SandboxProviderError({ message: `Sandbox ${id} URL not found` }))
                return
              }
              const command = cmd.args?.length ? `${cmd.cmd} ${cmd.args.join(" ")}` : cmd.cmd
              const response = await fetch(`${url}/process`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${config.apiKey}`,
                  "Content-Type": "application/json",
                  Accept: "text/event-stream",
                  "x-blaxel-workspace": config.workspace,
                },
                body: JSON.stringify({ command, workingDir: cmd.cwd, env: cmd.env, waitForCompletion: true }),
              })
              if (!response.body) {
                emit.fail(new SandboxProviderError({ message: "No response body" }))
                return
              }
              const reader = response.body.getReader()
              const decoder = new TextDecoder()
              let buffer = ""
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""
                for (const line of lines) {
                  if (line.startsWith("stdout:")) {
                    emit.single({ channel: "stdout", data: new TextEncoder().encode(line.slice(7)) })
                  } else if (line.startsWith("stderr:")) {
                    emit.single({ channel: "stderr", data: new TextEncoder().encode(line.slice(7)) })
                  }
                }
              }
              emit.end()
            } catch (err) {
              emit.fail(new SandboxProviderError({ message: String(err) }))
            }
          })()
        }),

      readFile: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const url = yield* getSandboxUrl(id)
          const result = yield* client.sandboxRequest<{ content: string } | string>(
            url,
            "GET",
            `/filesystem/${encodeURIComponent(path.replace(/^\//, ""))}`,
          )
          const content = typeof result === "string" ? result : result.content
          return opts?.encoding === "utf8" ? content : new TextEncoder().encode(content)
        }),

      writeFile: (id: string, path: string, content, _opts) =>
        Effect.gen(function* () {
          const url = yield* getSandboxUrl(id)
          yield* client.sandboxRequest<void>(url, "PUT", `/filesystem/${encodeURIComponent(path.replace(/^\//, ""))}`, {
            content: typeof content === "string" ? content : new TextDecoder().decode(content),
          })
        }),

      listDir: (id: string, path: string, _opts) =>
        Effect.gen(function* () {
          const url = yield* getSandboxUrl(id)
          const result = yield* client.sandboxRequest<BlaxelDirResponse>(
            url,
            "GET",
            `/filesystem/${encodeURIComponent(path.replace(/^\//, "") || "/")}`,
          )
          const entries: FsEntry[] = []
          for (const f of result.files || []) {
            entries.push({ path: f.path, type: "file", size: f.size })
          }
          for (const d of result.subdirectories || []) {
            entries.push({ path: d.path, type: "dir" })
          }
          return entries
        }),

      mkdir: (id: string, path: string) =>
        Effect.gen(function* () {
          const url = yield* getSandboxUrl(id)
          yield* client.sandboxRequest<void>(url, "PUT", `/filesystem/${encodeURIComponent(path.replace(/^\//, ""))}`, {
            isDir: true,
          })
        }),

      rm: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const url = yield* getSandboxUrl(id)
          const recursive = opts?.recursive ? "?recursive=true" : ""
          yield* client.sandboxRequest<void>(
            url,
            "DELETE",
            `/filesystem/${encodeURIComponent(path.replace(/^\//, ""))}${recursive}`,
          )
        }),

      pause: undefined,
      resume: undefined,

      snapshotCreate: undefined,
      snapshotRestore: undefined,
      snapshotList: undefined,

      runCode: (id: string, input: RunCodeInput) =>
        Effect.gen(function* () {
          const url = yield* getSandboxUrl(id)
          let command: string
          const b64Code = Buffer.from(input.code).toString("base64")

          switch (input.language.toLowerCase()) {
            case "python":
            case "py":
              command = `python3 -u -c "exec(__import__('base64').b64decode('${b64Code}').decode())"`
              break
            case "typescript":
            case "ts":
            case "javascript":
            case "js":
              command = `node -e "eval(Buffer.from('${b64Code}','base64').toString())"`
              break
            case "bash":
            case "sh":
              command = `sh -c "echo '${b64Code}' | base64 -d | sh"`
              break
            default:
              return yield* Effect.fail(
                new SandboxProviderError({ message: `Unsupported language: ${input.language}` }),
              )
          }

          const result = yield* client.sandboxRequest<BlaxelProcessResponse>(url, "POST", "/process", {
            command,
            waitForCompletion: true,
            timeout: Math.floor((input.timeoutMs || 60000) / 1000),
          })
          return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } satisfies RunCodeResult
        }),
    }

    return driver
  }),
)
