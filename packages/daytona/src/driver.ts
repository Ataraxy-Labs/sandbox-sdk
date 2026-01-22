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
  type ReadFileOptions,
  type ListOptions,
  type RmOptions,
  type SnapshotInfo,
  type RunCodeInput,
  type RunCodeResult,
  type SandboxError,
  type StartProcessOptions,
  type ProcessInfo,
  SandboxProviderError,
  currentTimestamp,
  generateId,
} from "@ataraxy-labs/sandbox-sdk"
import { DaytonaConfigTag } from "./config"
import { createClient, type DaytonaClient } from "./client"

interface DaytonaSandboxResponse {
  id: string
  name?: string
  state: "started" | "starting" | "stopped" | "stopping" | "archived" | "archiving" | "error" | "pending" | "unknown"
  createdAt?: string
  cpu?: number
  memory?: number
  disk?: number
  gpu?: number
  labels?: Record<string, string>
  env?: Record<string, string>
  errorReason?: string
}

interface ExecuteResponse {
  exitCode?: number
  result: string
}

interface FileInfo {
  name: string
  isDir: boolean
  size?: number
  modTime?: string
  mode?: string
}

const mapStatus = (state: DaytonaSandboxResponse["state"]): SandboxStatus => {
  switch (state) {
    case "started":
      return "ready"
    case "starting":
    case "pending":
      return "creating"
    case "stopped":
    case "stopping":
    case "archived":
    case "archiving":
      return "stopped"
    default:
      return "failed"
  }
}

const encodeCommand = (cmd: string, args?: ReadonlyArray<string>, env?: Record<string, string>): string => {
  const fullCmd = args?.length ? `${cmd} ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}` : cmd
  const b64Cmd = Buffer.from(fullCmd).toString("base64")

  const envParts = env
    ? Object.entries(env)
        .map(([k, v]) => `export ${k}=$(echo '${Buffer.from(v).toString("base64")}' | base64 -d)`)
        .join("; ")
    : ""

  return envParts
    ? `sh -c "${envParts}; echo '${b64Cmd}' | base64 -d | sh"`
    : `sh -c "echo '${b64Cmd}' | base64 -d | sh"`
}

const makeToolboxClient = (baseClient: DaytonaClient, sandboxId: string) => ({
  request: <T>(method: string, path: string, body?: unknown) =>
    baseClient.request<T>(method, `/toolbox/${sandboxId}/toolbox${path}`, body),
})

export const DaytonaDriverLive = Layer.effect(
  SandboxDriver,
  Effect.gen(function* () {
    const config = yield* DaytonaConfigTag
    const client = createClient(config.baseUrl ?? "https://app.daytona.io/api", config.apiKey)

    const driver: SandboxDriverService = {
      create: (opts: CreateOptions) =>
        Effect.gen(function* () {
          const body: Record<string, unknown> = {
            language: opts.image || "python",
          }
          if (opts.name) body.name = opts.name
          if (opts.env) body.envVars = opts.env
          if (opts.cpu || opts.memoryMiB) {
            body.resources = {
              cpu: opts.cpu,
              memory: opts.memoryMiB ? Math.ceil(opts.memoryMiB / 1024) : undefined,
            }
          }

          const sbx = yield* client.request<DaytonaSandboxResponse>("POST", "/sandbox", body)
          const createdAt = sbx.createdAt ?? (yield* currentTimestamp)
          return {
            id: sbx.id,
            name: sbx.name,
            provider: "daytona",
            status: mapStatus(sbx.state),
            createdAt,
            metadata: { labels: sbx.labels },
          } satisfies SandboxInfo
        }),

      destroy: (id: string) => client.request<void>("DELETE", `/sandbox/${id}`),

      status: (id: string) =>
        Effect.gen(function* () {
          const sbx = yield* client.request<DaytonaSandboxResponse>("GET", `/sandbox/${id}`)
          return mapStatus(sbx.state)
        }),

      list: () =>
        Effect.gen(function* () {
          const sandboxes = yield* client.request<DaytonaSandboxResponse[]>("GET", "/sandbox")
          const now = yield* currentTimestamp
          return sandboxes.map((sbx) => ({
            id: sbx.id,
            name: sbx.name,
            provider: "daytona",
            status: mapStatus(sbx.state),
            createdAt: sbx.createdAt ?? now,
          }))
        }),

      get: (id: string) =>
        Effect.gen(function* () {
          const sbx = yield* client.request<DaytonaSandboxResponse>("GET", `/sandbox/${id}`)
          const createdAt = sbx.createdAt ?? (yield* currentTimestamp)
          return {
            id: sbx.id,
            name: sbx.name,
            provider: "daytona",
            status: mapStatus(sbx.state),
            createdAt,
          } satisfies SandboxInfo
        }),

      run: (id: string, cmd: RunCommand) =>
        Effect.gen(function* () {
          const toolbox = makeToolboxClient(client, id)
          const command = encodeCommand(cmd.cmd, cmd.args, cmd.env)

          const result = yield* toolbox.request<ExecuteResponse>("POST", "/process/execute", {
            command,
            cwd: cmd.cwd,
            timeout: cmd.timeoutMs ? Math.ceil(cmd.timeoutMs / 1000) : undefined,
          })

          return {
            exitCode: result.exitCode ?? 0,
            stdout: result.result ?? "",
            stderr: "",
          } satisfies RunResult
        }),

      stream: (id: string, cmd: RunCommand) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const sessionId = yield* generateId("stream")
            const baseUrl = (config.baseUrl ?? "https://app.daytona.io/api")
              .replace("https://", "wss://")
              .replace("http://", "ws://")
            const command = encodeCommand(cmd.cmd, cmd.args, cmd.env)
            const url = `${baseUrl}/toolbox/${id}/process/session/${sessionId}/command/stream`

            return Stream.asyncEffect<ProcessChunk, SandboxError>((emit) => {
              const wsUrl = `${url}?token=${encodeURIComponent(config.apiKey)}`
              const ws = new WebSocket(wsUrl)

              ws.onopen = () => {
                ws.send(JSON.stringify({ command, cwd: cmd.cwd }))
              }

              ws.onmessage = (event) => {
                const data =
                  typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer)
                emit.single({ channel: "stdout", data: new TextEncoder().encode(data) })
              }

              ws.onclose = () => emit.end()
              ws.onerror = (err) => emit.fail(new SandboxProviderError({ message: String(err) }))

              return Effect.sync(() => {
                try {
                  ws.close()
                } catch {}
              })
            })
          }),
        ),

      readFile: (id: string, path: string, opts?: ReadFileOptions) =>
        Effect.gen(function* () {
          const toolbox = makeToolboxClient(client, id)
          const result = yield* toolbox.request<ArrayBuffer>("GET", `/files/download?path=${encodeURIComponent(path)}`)
          const data = new Uint8Array(result)
          return opts?.encoding === "utf8" ? new TextDecoder().decode(data) : data
        }),

      writeFile: (id: string, path: string, content) =>
        Effect.gen(function* () {
          const toolbox = makeToolboxClient(client, id)
          const data = typeof content === "string" ? content : new TextDecoder().decode(content)
          yield* toolbox.request<void>("POST", `/files/upload?path=${encodeURIComponent(path)}`, data)
        }),

      listDir: (id: string, path: string, opts?: ListOptions) =>
        Effect.gen(function* () {
          const toolbox = makeToolboxClient(client, id)
          const files = yield* toolbox.request<FileInfo[]>("GET", `/files?path=${encodeURIComponent(path)}`)
          return files.map(
            (f): FsEntry => ({
              path: `${path}/${f.name}`.replace("//", "/"),
              type: f.isDir ? "dir" : "file",
              size: f.size,
              modifiedAt: f.modTime,
            }),
          )
        }),

      mkdir: (id: string, path: string) =>
        Effect.gen(function* () {
          const toolbox = makeToolboxClient(client, id)
          yield* toolbox.request<void>("POST", `/files/folder?path=${encodeURIComponent(path)}&mode=755`)
        }),

      rm: (id: string, path: string, opts?: RmOptions) =>
        Effect.gen(function* () {
          const toolbox = makeToolboxClient(client, id)
          yield* toolbox.request<void>(
            "DELETE",
            `/files?path=${encodeURIComponent(path)}&recursive=${opts?.recursive ?? false}`,
          )
        }),

      pause: (id: string) => client.request<void>("POST", `/sandbox/${id}/stop`),

      resume: (id: string) => client.request<void>("POST", `/sandbox/${id}/start`),

      snapshotCreate: undefined,
      snapshotRestore: undefined,
      snapshotList: undefined,

      runCode: (id: string, input: RunCodeInput) =>
        Effect.gen(function* () {
          const toolbox = makeToolboxClient(client, id)

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

          const result = yield* toolbox.request<ExecuteResponse>("POST", "/process/execute", {
            command,
            timeout: input.timeoutMs ? Math.ceil(input.timeoutMs / 1000) : undefined,
          })

          return {
            exitCode: result.exitCode ?? 0,
            stdout: result.result ?? "",
            stderr: "",
          } satisfies RunCodeResult
        }),

      startProcess: (id: string, opts: StartProcessOptions) =>
        Effect.gen(function* () {
          const toolbox = makeToolboxClient(client, id)
          const command = encodeCommand(opts.cmd, opts.args, opts.env)
          const processId = yield* generateId("proc")
          const timestamp = yield* Clock.currentTimeMillis

          yield* toolbox.request<ExecuteResponse>("POST", "/process/execute", {
            command: `nohup ${command} > /tmp/process-${timestamp}.log 2>&1 &`,
            cwd: opts.cwd,
            timeout: 30,
          })

          return {
            id: processId,
            status: "running",
          } satisfies ProcessInfo
        }),

      getProcessUrls: (id: string, ports: number[]) =>
        Effect.gen(function* () {
          const urls: Record<number, string> = {}

          for (const port of ports) {
            interface PreviewLink {
              url: string
              token?: string
            }
            const result = yield* client
              .request<PreviewLink>("GET", `/sandbox/${id}/preview/${port}`)
              .pipe(
                Effect.map((preview) => preview.url),
                Effect.catchAll(() =>
                  Effect.succeed(`https://${port}-${id}.preview.daytona.app`),
                ),
              )
            urls[port] = result
          }

          return urls
        }),

      stopProcess: undefined,
    }

    return driver
  }),
)
