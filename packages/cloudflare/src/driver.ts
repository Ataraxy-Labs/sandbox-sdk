import { Effect, Stream, Layer } from "effect"
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
  type RunCodeInput,
  type RunCodeResult,
  type SandboxError,
  mapErrorFromMessage,
  ErrorPatterns,
  SandboxProviderError,
} from "@ataraxy-labs/sandbox-sdk"
import { CloudflareConfigTag } from "./config"
import { createClient } from "./client"

const cloudflareErrorPatterns = {
  ...ErrorPatterns,
  auth: [...ErrorPatterns.auth, "api token"],
  network: [...ErrorPatterns.network, "fetch"],
}

const mapError = (err: unknown, id?: string): SandboxError =>
  mapErrorFromMessage(err, id, cloudflareErrorPatterns)

interface CFSandbox {
  id: string
  name?: string
  status: "running" | "stopped" | "creating"
  created_at: string
  runtime: "python" | "nodejs"
}

const mapStatus = (status: CFSandbox["status"]): SandboxStatus => {
  switch (status) {
    case "running":
      return "ready"
    case "creating":
      return "creating"
    case "stopped":
      return "stopped"
    default:
      return "failed"
  }
}

export const CloudflareDriverLive = Layer.effect(
  SandboxDriver,
  Effect.gen(function* () {
    const config = yield* CloudflareConfigTag
    const client = createClient(
      config.baseUrl ?? "https://api.cloudflare.com/client/v4",
      config.apiToken,
      config.accountId,
    )

    const driver: SandboxDriverService = {
      create: (options: CreateOptions) =>
        Effect.gen(function* () {
          const runtime = options.image?.includes("python") ? "python" : "nodejs"
          const sbx = yield* client.request<CFSandbox>("POST", "/sandbox/sandboxes", {
            name: options.name,
            runtime,
            timeout_ms: options.timeoutMs ?? config.timeoutMs,
          })
          return {
            id: sbx.id,
            name: sbx.name,
            provider: "cloudflare",
            status: mapStatus(sbx.status),
            createdAt: sbx.created_at,
          } satisfies SandboxInfo
        }),

      destroy: (id: string) => client.request<void>("DELETE", `/sandbox/sandboxes/${id}`),

      status: (id: string) =>
        Effect.gen(function* () {
          const sbx = yield* client.request<CFSandbox>("GET", `/sandbox/sandboxes/${id}`)
          return mapStatus(sbx.status)
        }),

      list: () =>
        Effect.gen(function* () {
          const sandboxes = yield* client.request<CFSandbox[]>("GET", "/sandbox/sandboxes")
          return sandboxes.map((s) => ({
            id: s.id,
            name: s.name,
            provider: "cloudflare",
            status: mapStatus(s.status),
            createdAt: s.created_at,
          }))
        }),

      get: (id: string) =>
        Effect.gen(function* () {
          const sbx = yield* client.request<CFSandbox>("GET", `/sandbox/sandboxes/${id}`)
          return {
            id: sbx.id,
            name: sbx.name,
            provider: "cloudflare",
            status: mapStatus(sbx.status),
            createdAt: sbx.created_at,
          } satisfies SandboxInfo
        }),

      run: (id: string, cmd: RunCommand) =>
        Effect.gen(function* () {
          const result = yield* client.request<{ exit_code: number; stdout: string; stderr: string }>(
            "POST",
            `/sandbox/sandboxes/${id}/execute`,
            {
              command: cmd.cmd,
              args: cmd.args,
              cwd: cmd.cwd,
              env: cmd.env,
              timeout_ms: cmd.timeoutMs,
            },
          )
          return { exitCode: result.exit_code, stdout: result.stdout, stderr: result.stderr } satisfies RunResult
        }),

      stream: (id: string, cmd: RunCommand) =>
        Stream.async<ProcessChunk, SandboxError>((emit) => {
          const url = `wss://sandbox.cloudflare.com/v1/sandboxes/${id}/execute/stream?token=${encodeURIComponent(config.apiToken)}`
          const ws = new WebSocket(url)
          ws.onopen = () => ws.send(JSON.stringify({ command: cmd.cmd, args: cmd.args }))
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            emit.single({
              channel: data.stream === "stderr" ? "stderr" : "stdout",
              data: new TextEncoder().encode(data.data),
            })
          }
          ws.onclose = () => emit.end()
          ws.onerror = (err) => emit.fail(mapError(err, id))
        }),

      readFile: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const result = yield* client.request<{ content: string }>(
            "GET",
            `/sandbox/sandboxes/${id}/files?path=${encodeURIComponent(path)}`,
          )
          return opts?.encoding === "utf8" ? result.content : new TextEncoder().encode(result.content)
        }),

      writeFile: (id: string, path: string, content, _opts) =>
        client.request<void>("PUT", `/sandbox/sandboxes/${id}/files`, {
          path,
          content: typeof content === "string" ? content : new TextDecoder().decode(content),
        }),

      listDir: (id: string, path: string, _opts) =>
        Effect.gen(function* () {
          const files = yield* client.request<Array<{ path: string; is_directory: boolean; size?: number }>>(
            "GET",
            `/sandbox/sandboxes/${id}/files/list?path=${encodeURIComponent(path)}`,
          )
          return files.map((f) => ({
            path: f.path,
            type: f.is_directory ? "dir" : "file",
            size: f.size,
          })) satisfies FsEntry[]
        }),

      mkdir: (id: string, path: string) =>
        client.request<void>("POST", `/sandbox/sandboxes/${id}/files/mkdir`, { path }),

      rm: (id: string, path: string, opts) =>
        client.request<void>(
          "DELETE",
          `/sandbox/sandboxes/${id}/files?path=${encodeURIComponent(path)}&recursive=${opts?.recursive ?? false}`,
        ),

      pause: undefined,
      resume: undefined,
      snapshotCreate: undefined,
      snapshotRestore: undefined,
      snapshotList: undefined,

      runCode: (id: string, input: RunCodeInput) =>
        Effect.gen(function* () {
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

          const result = yield* client.request<{ exit_code: number; stdout: string; stderr: string }>(
            "POST",
            `/sandbox/sandboxes/${id}/execute`,
            {
              command,
              timeout_ms: input.timeoutMs,
            },
          )
          return { exitCode: result.exit_code, stdout: result.stdout, stderr: result.stderr } satisfies RunCodeResult
        }),
    }

    return driver
  }),
)
