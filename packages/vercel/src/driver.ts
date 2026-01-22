import { Effect, Stream, Layer } from "effect"
import { Sandbox } from "@vercel/sandbox"
import {
  SandboxDriver,
  type SandboxDriverService,
  type CreateOptions,
  type SandboxInfo,
  type RunCommand,
  type RunResult,
  type ProcessChunk,
  type FsEntry,
  type SandboxError,
  mapErrorFromMessage,
  ErrorPatterns,
} from "@ataraxy-labs/sandbox-sdk"
import { VercelConfigTag } from "./config"

const vercelErrorPatterns = {
  ...ErrorPatterns,
  auth: [...ErrorPatterns.auth, "oidc", "authentication", "invalid token"],
  notFound: [...ErrorPatterns.notFound, "sandbox not found"],
  network: [...ErrorPatterns.network, "fetch"],
}

const mapError = (err: unknown, id?: string): SandboxError =>
  mapErrorFromMessage(err, id, vercelErrorPatterns)

const cache = new Map<string, Sandbox>()

const getSandbox = (id: string, config: { oidcToken?: string; accessToken?: string; teamId?: string }) =>
  Effect.tryPromise({
    try: async () => {
      if (cache.has(id)) return cache.get(id)!
      const sbx = await Sandbox.get({ sandboxId: id })
      cache.set(id, sbx)
      return sbx
    },
    catch: (err) => mapError(err, id),
  })

const streamToBuffer = async (stream: NodeJS.ReadableStream | null): Promise<Buffer> => {
  if (!stream) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export const VercelDriverLive = Layer.effect(
  SandboxDriver,
  Effect.gen(function* () {
    const config = yield* VercelConfigTag

    const driver: SandboxDriverService = {
      create: (options: CreateOptions) =>
        Effect.tryPromise({
          try: async () => {
            const createOpts: Parameters<typeof Sandbox.create>[0] = {
              timeout: options.timeoutMs ?? config.timeoutMs ?? 600000,
              runtime: options.runtime ?? "node22",
              resources: options.resources?.vcpus ? { vcpus: options.resources.vcpus } : undefined,
              ports: options.encryptedPorts ?? [],
            }

            if (options.source) {
              if (options.source.type === "git") {
                createOpts.source = {
                  type: "git",
                  url: options.source.url,
                  depth: options.source.depth,
                  revision: options.source.revision,
                  ...(options.source.username && options.source.password
                    ? { username: options.source.username, password: options.source.password }
                    : {}),
                }
              } else if (options.source.type === "tarball") {
                createOpts.source = {
                  type: "tarball",
                  url: options.source.url,
                }
              } else if (options.source.type === "snapshot") {
                // Vercel SDK handles snapshots differently
                ;(createOpts as { source?: { type: "snapshot"; snapshotId: string } }).source = {
                  type: "snapshot",
                  snapshotId: options.source.snapshotId,
                }
              }
            }

            const sbx = await Sandbox.create(createOpts)
            cache.set(sbx.sandboxId, sbx)
            return {
              id: sbx.sandboxId,
              name: options.name,
              provider: "vercel",
              status: "ready",
              createdAt: new Date().toISOString(),
            } satisfies SandboxInfo
          },
          catch: mapError,
        }),

      destroy: (id: string) =>
        Effect.tryPromise({
          try: async () => {
            const sbx = cache.get(id) ?? (await Sandbox.get({ sandboxId: id }))
            await sbx.stop()
            cache.delete(id)
          },
          catch: (err) => mapError(err, id),
        }),

      status: (id: string) =>
        Effect.tryPromise({
          try: async () => {
            const sbx = cache.get(id) ?? (await Sandbox.get({ sandboxId: id }))
            return sbx ? "ready" : "stopped"
          },
          catch: (err) => mapError(err, id),
        }),

      list: () =>
        Effect.tryPromise({
          try: async () => {
            const items: SandboxInfo[] = []
            for (const [id] of cache) {
              items.push({
                id,
                provider: "vercel",
                status: "ready",
                createdAt: new Date().toISOString(),
              })
            }
            return items
          },
          catch: mapError,
        }),

      get: (id: string) =>
        Effect.tryPromise({
          try: async () => {
            const sbx = cache.get(id) ?? (await Sandbox.get({ sandboxId: id }))
            cache.set(id, sbx)
            return {
              id: sbx.sandboxId,
              provider: "vercel",
              status: "ready",
              createdAt: new Date().toISOString(),
            } satisfies SandboxInfo
          },
          catch: (err) => mapError(err, id),
        }),

      run: (id: string, cmd: RunCommand) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, config)
          const result = yield* Effect.tryPromise({
            try: async () => {
              const fullCmd = cmd.cwd
                ? `cd ${cmd.cwd} && ${cmd.cmd} ${(cmd.args ?? []).join(" ")}`.trim()
                : `${cmd.cmd} ${(cmd.args ?? []).join(" ")}`.trim()

              const execution = await sbx.runCommand("bash", ["-c", fullCmd])
              const stdout = await execution.stdout()
              const stderr = await execution.stderr()

              return {
                exitCode: execution.exitCode,
                stdout,
                stderr,
              } satisfies RunResult
            },
            catch: (err) => mapError(err, id),
          })
          return result
        }),

      stream: (id: string, cmd: RunCommand) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const sbx = yield* getSandbox(id, config)
            return Stream.async<ProcessChunk, SandboxError>((emit) => {
              const encoder = new TextEncoder()
              const fullCmd = cmd.cwd
                ? `cd ${cmd.cwd} && ${cmd.cmd} ${(cmd.args ?? []).join(" ")}`.trim()
                : `${cmd.cmd} ${(cmd.args ?? []).join(" ")}`.trim()

              sbx
                .runCommand("bash", ["-c", fullCmd])
                .then(async (execution) => {
                  const stdout = await execution.stdout()
                  const stderr = await execution.stderr()
                  if (stdout) emit.single({ channel: "stdout", data: encoder.encode(stdout) })
                  if (stderr) emit.single({ channel: "stderr", data: encoder.encode(stderr) })
                  emit.end()
                })
                .catch((err: unknown) => emit.fail(mapError(err, id)))
            })
          }),
        ),

      readFile: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, config)
          return yield* Effect.tryPromise({
            try: async () => {
              const stream = await sbx.readFile({ path })
              const buffer = await streamToBuffer(stream)
              return opts?.encoding === "utf8" ? buffer.toString("utf8") : new Uint8Array(buffer)
            },
            catch: (err) => mapError(err, id),
          })
        }),

      writeFile: (id: string, path: string, content, _opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, config)
          yield* Effect.tryPromise({
            try: async () => {
              const buffer =
                typeof content === "string" ? Buffer.from(content) : Buffer.from(content)
              await sbx.writeFiles([{ path, content: buffer }])
            },
            catch: (err) => mapError(err, id),
          })
        }),

      listDir: (id: string, path: string, _opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, config)
          return yield* Effect.tryPromise({
            try: async () => {
              const result = await sbx.runCommand("bash", ["-c", `ls -la ${path}`])
              const stdout = await result.stdout()
              const lines = stdout.split("\n").filter((l) => l.trim() && !l.startsWith("total"))
              return lines.map((line): FsEntry => {
                const parts = line.split(/\s+/)
                const isDir = line.startsWith("d")
                const name = parts[parts.length - 1]
                return {
                  path: `${path}/${name}`.replace(/\/+/g, "/"),
                  type: isDir ? "dir" : "file",
                }
              })
            },
            catch: (err) => mapError(err, id),
          })
        }),

      mkdir: (id: string, path: string) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, config)
          yield* Effect.tryPromise({
            try: async () => {
              await sbx.runCommand("bash", ["-c", `mkdir -p ${path}`])
            },
            catch: (err) => mapError(err, id),
          })
        }),

      rm: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, config)
          yield* Effect.tryPromise({
            try: async () => {
              const flags = opts?.recursive ? "-rf" : "-f"
              await sbx.runCommand("bash", ["-c", `rm ${flags} ${path}`])
            },
            catch: (err) => mapError(err, id),
          })
        }),

      pause: undefined,
      resume: undefined,

      getProcessUrls: (id: string, ports: number[]) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, config)
          return yield* Effect.tryPromise({
            try: async () => {
              const urls: Record<number, string> = {}
              for (const port of ports) {
                try {
                  urls[port] = sbx.domain(port)
                } catch {
                  // Port not exposed, skip
                }
              }
              return urls
            },
            catch: (err) => mapError(err, id),
          })
        }),

      runCode: (id: string, input) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, config)
          return yield* Effect.tryPromise({
            try: async () => {
              let cmd: string
              const lang = input.language.toLowerCase()

              if (lang === "python" || lang === "python3") {
                cmd = `python3 -c ${JSON.stringify(input.code)}`
              } else if (lang === "javascript" || lang === "js" || lang === "node") {
                cmd = `node -e ${JSON.stringify(input.code)}`
              } else if (lang === "typescript" || lang === "ts") {
                cmd = `npx ts-node -e ${JSON.stringify(input.code)}`
              } else if (lang === "bash" || lang === "sh") {
                cmd = input.code
              } else {
                cmd = `${lang} -c ${JSON.stringify(input.code)}`
              }

              const result = await sbx.runCommand("bash", ["-c", cmd])
              const stdout = await result.stdout()
              const stderr = await result.stderr()

              return {
                stdout,
                stderr,
                exitCode: result.exitCode,
              }
            },
            catch: (err) => mapError(err, id),
          })
        }),
    }

    return driver
  }),
)
