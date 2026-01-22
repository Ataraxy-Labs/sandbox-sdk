import { Effect, Stream, Layer, Clock } from "effect"
import { ModalClient, type Sandbox as ModalSandbox, type ContainerProcess } from "modal"
import {
  SandboxDriver,
  type SandboxDriverService,
  type CreateOptions,
  type SandboxInfo,
  type RunCommand,
  type RunResult,
  type ProcessChunk,
  type FsEntry,
  type SnapshotInfo,
  type RunCodeInput,
  type RunCodeResult,
  type VolumeInfo,
  type SandboxError,
  type StartProcessOptions,
  type ProcessInfo,
  mapErrorFromMessage,
  ErrorPatterns,
  currentTimestamp,
  generateId,
} from "@ataraxy-labs/sandbox-sdk"
import { ModalConfigTag } from "./config"

const modalErrorPatterns = {
  ...ErrorPatterns,
  auth: [...ErrorPatterns.auth, "unauthenticated", "permission_denied"],
  timeout: [...ErrorPatterns.timeout, "deadline_exceeded"],
}

const mapError = (err: unknown, id?: string): SandboxError =>
  mapErrorFromMessage(err, id, modalErrorPatterns)

export const ModalDriverLive = Layer.effect(
  SandboxDriver,
  Effect.gen(function* () {
    const config = yield* ModalConfigTag
    const appName = config.appName ?? "opencode-sandbox"

    const cache = new Map<string, ModalSandbox>()
    const volumeCache = new Map<string, Awaited<ReturnType<ModalClient["volumes"]["fromName"]>>>()
    const client = new ModalClient()

    const getApp = async () => {
      return await client.apps.fromName(appName, { createIfMissing: true })
    }

    const getSandbox = (id: string) =>
      Effect.tryPromise({
        try: async () => {
          if (cache.has(id)) return cache.get(id)!
          const sbx = await client.sandboxes.fromId(id)
          cache.set(id, sbx)
          return sbx
        },
        catch: (err) => mapError(err, id),
      })

    const driver: SandboxDriverService = {
      create: (options: CreateOptions) =>
        Effect.gen(function* () {
          const createdAt = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const app = await getApp()
              const image = client.images.fromRegistry(options.image ?? "alpine:3.21")

              const volumes: Record<string, Awaited<ReturnType<typeof client.volumes.fromName>>> = {}
              if (options.volumes) {
                for (const [mountPath, volumeName] of Object.entries(options.volumes)) {
                  const vol =
                    volumeCache.get(volumeName) ?? (await client.volumes.fromName(volumeName, { createIfMissing: true }))
                  volumeCache.set(volumeName, vol)
                  volumes[mountPath] = vol
                }
              }

              const encryptedPorts = options.encryptedPorts ?? config.defaultEncryptedPorts
              const unencryptedPorts = options.unencryptedPorts ?? config.defaultUnencryptedPorts

              const sandbox = await client.sandboxes.create(app, image, {
                name: options.name,
                timeoutMs: options.timeoutMs ?? config.timeoutMs,
                idleTimeoutMs: options.idleTimeoutMs ?? config.idleTimeoutMs,
                gpu: options.gpu,
                cpu: options.cpu,
                memoryMiB: options.memoryMiB,
                env: options.env,
                workdir: options.workdir,
                volumes: Object.keys(volumes).length > 0 ? volumes : undefined,
                command: options.command,
                encryptedPorts,
                unencryptedPorts,
              })

              cache.set(sandbox.sandboxId, sandbox)
              return {
                id: sandbox.sandboxId,
                name: options.name,
                provider: "modal",
                status: "ready",
                createdAt,
              } satisfies SandboxInfo
            },
            catch: mapError,
          })
        }),

      destroy: (id: string) =>
        Effect.tryPromise({
          try: async () => {
            const sbx = cache.get(id) ?? (await client.sandboxes.fromId(id))
            await sbx.terminate()
            cache.delete(id)
          },
          catch: (err) => mapError(err, id),
        }),

      status: (id: string) =>
        Effect.tryPromise({
          try: async () => {
            const sbx = await client.sandboxes.fromId(id)
            const exitCode = await sbx.poll()
            return exitCode === null ? "ready" : "stopped"
          },
          catch: (err) => mapError(err, id),
        }),

      list: () =>
        Effect.gen(function* () {
          const now = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const items: SandboxInfo[] = []
              for await (const sb of client.sandboxes.list()) {
                const exitCode = await sb.poll()
                items.push({
                  id: sb.sandboxId,
                  provider: "modal",
                  status: exitCode === null ? "ready" : "stopped",
                  createdAt: now,
                })
              }
              return items
            },
            catch: mapError,
          })
        }),

      get: (id: string) =>
        Effect.gen(function* () {
          const createdAt = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const sbx = await client.sandboxes.fromId(id)
              const exitCode = await sbx.poll()
              return {
                id: sbx.sandboxId,
                provider: "modal",
                status: exitCode === null ? "ready" : "stopped",
                createdAt,
              } satisfies SandboxInfo
            },
            catch: (err) => mapError(err, id),
          })
        }),

      run: (id: string, cmd: RunCommand) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          return yield* Effect.tryPromise({
            try: async () => {
              const command = [cmd.cmd, ...(cmd.args ?? [])]
              const proc = await sbx.exec(command, {
                workdir: cmd.cwd,
                env: cmd.env,
                timeoutMs: cmd.timeoutMs,
              })
              const [stdout, stderr, exitCode] = await Promise.all([
                proc.stdout.readText(),
                proc.stderr.readText(),
                proc.wait(),
              ])
              return { exitCode, stdout, stderr } satisfies RunResult
            },
            catch: (err) => mapError(err, id),
          })
        }),

      stream: (id: string, cmd: RunCommand) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const sbx = yield* getSandbox(id)
            return Stream.async<ProcessChunk, SandboxError>((emit) => {
              const command = [cmd.cmd, ...(cmd.args ?? [])]

              sbx
                .exec(command, { workdir: cmd.cwd, env: cmd.env, timeoutMs: cmd.timeoutMs })
                .then(async (proc) => {
                  const stdoutReader = (async () => {
                    const reader = proc.stdout.getReader()
                    while (true) {
                      const { done, value } = await reader.read()
                      if (done) break
                      if (value) {
                        const data = typeof value === "string" ? new TextEncoder().encode(value) : value
                        emit.single({ channel: "stdout", data })
                      }
                    }
                    reader.releaseLock()
                  })()

                  const stderrReader = (async () => {
                    const reader = proc.stderr.getReader()
                    while (true) {
                      const { done, value } = await reader.read()
                      if (done) break
                      if (value) {
                        const data = typeof value === "string" ? new TextEncoder().encode(value) : value
                        emit.single({ channel: "stderr", data })
                      }
                    }
                    reader.releaseLock()
                  })()

                  await Promise.all([stdoutReader, stderrReader, proc.wait()])
                  emit.end()
                })
                .catch((err: unknown) => emit.fail(mapError(err, id)))
            })
          }),
        ),

      readFile: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          return yield* Effect.tryPromise({
            try: async () => {
              const file = await sbx.open(path, "r")
              const data = await file.read()
              await file.close()
              return opts?.encoding === "utf8" ? new TextDecoder().decode(data) : data
            },
            catch: (err) => mapError(err, id),
          })
        }),

      writeFile: (id: string, path: string, content, _opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          yield* Effect.tryPromise({
            try: async () => {
              const data = typeof content === "string" ? new TextEncoder().encode(content) : content
              const file = await sbx.open(path, "w")
              await file.write(data)
              await file.flush()
              await file.close()
            },
            catch: (err) => mapError(err, id),
          })
        }),

      listDir: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          return yield* Effect.tryPromise({
            try: async () => {
              const proc = await sbx.exec(["ls", "-la", ...(opts?.recursive ? ["-R"] : []), path])
              const [stdout] = await Promise.all([proc.stdout.readText(), proc.wait()])
              const lines = stdout.split("\n").filter((l: string) => l.trim())
              return lines.slice(1).map((line: string): FsEntry => {
                const parts = line.split(/\s+/)
                const name = parts[parts.length - 1] ?? ""
                const isDir = line.startsWith("d")
                const sizeStr = parts[4]
                return {
                  path: `${path}/${name}`.replace("//", "/"),
                  type: isDir ? "dir" : "file",
                  size: sizeStr ? parseInt(sizeStr) || undefined : undefined,
                }
              })
            },
            catch: (err) => mapError(err, id),
          })
        }),

      mkdir: (id: string, path: string) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          yield* Effect.tryPromise({
            try: async () => {
              const proc = await sbx.exec(["mkdir", "-p", path])
              await proc.wait()
            },
            catch: (err) => mapError(err, id),
          })
        }),

      rm: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          const flags: string[] = []
          if (opts?.recursive) flags.push("-r")
          if (opts?.force) flags.push("-f")
          yield* Effect.tryPromise({
            try: async () => {
              const proc = await sbx.exec(["rm", ...flags, path])
              await proc.wait()
            },
            catch: (err) => mapError(err, id),
          })
        }),

      snapshotCreate: (id: string, metadata) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          const snapshotIdFallback = yield* generateId("snapshot")
          const createdAt = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const image = await sbx.snapshotFilesystem()
              return {
                id: (image as { imageId?: string }).imageId ?? snapshotIdFallback,
                createdAt,
                metadata,
              } satisfies SnapshotInfo
            },
            catch: (err) => mapError(err, id),
          })
        }),

      runCode: (id: string, input: RunCodeInput) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          return yield* Effect.tryPromise({
            try: async () => {
              const lang = input.language.toLowerCase()
              let command: string[]
              const b64 = Buffer.from(input.code).toString("base64")

              switch (lang) {
                case "python":
                case "py":
                  command = ["python3", "-u", "-c", `exec(__import__('base64').b64decode('${b64}').decode())`]
                  break
                case "javascript":
                case "js":
                  command = ["node", "-e", `eval(Buffer.from('${b64}','base64').toString())`]
                  break
                case "typescript":
                case "ts":
                  command = ["sh", "-c", `echo '${b64}' | base64 -d > /tmp/code.ts && npx tsx /tmp/code.ts`]
                  break
                case "bash":
                case "sh":
                  command = ["sh", "-c", `echo '${b64}' | base64 -d | sh`]
                  break
                default:
                  throw new Error(`Unsupported language: ${input.language}`)
              }

              const proc = await sbx.exec(command, { timeoutMs: input.timeoutMs })
              const [stdout, stderr, exitCode] = await Promise.all([
                proc.stdout.readText(),
                proc.stderr.readText(),
                proc.wait(),
              ])

              return { exitCode, stdout, stderr } satisfies RunCodeResult
            },
            catch: (err) => mapError(err, id),
          })
        }),

      pause: undefined,
      resume: undefined,
      snapshotRestore: undefined,
      snapshotList: undefined,

      volumeCreate: (name: string) =>
        Effect.gen(function* () {
          const createdAt = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const vol = await client.volumes.fromName(name, { createIfMissing: true })
              volumeCache.set(name, vol)
              return {
                id: name,
                name,
                createdAt,
              } satisfies VolumeInfo
            },
            catch: mapError,
          })
        }),

      volumeDelete: (name: string) =>
        Effect.tryPromise({
          try: async () => {
            await client.volumes.delete(name)
            volumeCache.delete(name)
          },
          catch: mapError,
        }),

      volumeList: () =>
        Effect.tryPromise({
          try: async () => {
            const items: VolumeInfo[] = []
            for (const [name] of volumeCache) {
              items.push({ id: name, name })
            }
            return items
          },
          catch: mapError,
        }),

      volumeGet: (name: string) =>
        Effect.tryPromise({
          try: async () => {
            const vol = volumeCache.get(name) ?? (await client.volumes.fromName(name))
            volumeCache.set(name, vol)
            return { id: name, name } satisfies VolumeInfo
          },
          catch: mapError,
        }),

      watch: undefined,

      startProcess: (id: string, opts: StartProcessOptions) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          const processId = yield* generateId("proc")
          return yield* Effect.tryPromise({
            try: async () => {
              const command = [opts.cmd, ...(opts.args ?? [])]
              const proc = await sbx.exec(command, {
                workdir: opts.cwd,
                env: opts.env,
              })

              if (opts.background) {
                return {
                  id: processId,
                  status: "running",
                } satisfies ProcessInfo
              }

              await proc.wait()
              return {
                id: processId,
                status: "stopped",
              } satisfies ProcessInfo
            },
            catch: (err) => mapError(err, id),
          })
        }),

      getProcessUrls: (id: string, ports: number[]) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          return yield* Effect.tryPromise({
            try: async () => {
              const tunnels = await sbx.tunnels()
              const urls: Record<number, string> = {}
              for (const port of ports) {
                const tunnel = tunnels[port]
                if (tunnel?.url) {
                  urls[port] = tunnel.url
                }
              }
              return urls
            },
            catch: (err) => mapError(err, id),
          })
        }),

      stopProcess: undefined,
    }

    return driver
  }),
)
