import { Effect, Stream, Layer, Clock } from "effect"
import { Sandbox } from "@e2b/code-interpreter"
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
  currentTimestamp,
} from "@ataraxy-labs/sandbox-sdk"
import { E2BConfigTag } from "./config"

const mapImageToTemplate = (image?: string): string => {
  if (!image) return "code-interpreter-v1"
  const normalized = image.toLowerCase()
  if (normalized.includes("python")) return "code-interpreter-v1"
  if (normalized.includes("node") || normalized.includes("javascript") || normalized.includes("typescript"))
    return "code-interpreter-v1"
  if (normalized.includes("go") || normalized.includes("golang")) return "code-interpreter-v1"
  if (normalized.includes("rust")) return "code-interpreter-v1"
  if (normalized.includes("java")) return "code-interpreter-v1"
  if (normalized.includes("ubuntu") || normalized.includes("debian") || normalized.includes("alpine"))
    return "code-interpreter-v1"
  return image
}

const e2bErrorPatterns = {
  ...ErrorPatterns,
  notFound: [...ErrorPatterns.notFound, "sandbox not found"],
  network: [...ErrorPatterns.network, "fetch"],
}

const mapError = (err: unknown, id?: string): SandboxError =>
  mapErrorFromMessage(err, id, e2bErrorPatterns)

export const E2BDriverLive = Layer.effect(
  SandboxDriver,
  Effect.gen(function* () {
    const config = yield* E2BConfigTag
    const cache = new Map<string, Sandbox>()

    const getSandbox = (id: string, forCodeExecution = false) =>
      Effect.tryPromise({
        try: async () => {
          if (cache.has(id)) return cache.get(id)!
          if (forCodeExecution) {
            throw new Error(`Sandbox ${id} not found in cache. Code execution requires the original sandbox instance.`)
          }
          const sbx = await Sandbox.connect(id, { apiKey: config.apiKey })
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
              const template = mapImageToTemplate(options.image) ?? config.template ?? "code-interpreter-v1"
              const sbx = await Sandbox.create(template, {
                apiKey: config.apiKey,
                timeoutMs: options.timeoutMs ?? config.timeoutMs,
              })
              cache.set(sbx.sandboxId, sbx)
              return {
                id: sbx.sandboxId,
                name: options.name,
                provider: "e2b",
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
            const sbx = cache.get(id) ?? (await Sandbox.connect(id, { apiKey: config.apiKey }))
            await sbx.kill()
            cache.delete(id)
          },
          catch: (err) => mapError(err, id),
        }),

      status: (id: string) =>
        Effect.tryPromise({
          try: async () => {
            const sbx = await Sandbox.connect(id, { apiKey: config.apiKey })
            const running = await sbx.isRunning()
            return running ? "ready" : "stopped"
          },
          catch: (err) => mapError(err, id),
        }),

      list: () =>
        Effect.tryPromise({
          try: async () => {
            const paginator = Sandbox.list({ apiKey: config.apiKey })
            const items: SandboxInfo[] = []
            while (paginator.hasNext) {
              const sandboxes = await paginator.nextItems()
              for (const sbx of sandboxes) {
                items.push({
                  id: sbx.sandboxId,
                  provider: "e2b",
                  status: sbx.state === "running" ? "ready" : "stopped",
                  createdAt: sbx.startedAt.toISOString(),
                })
              }
            }
            return items
          },
          catch: mapError,
        }),

      get: (id: string) =>
        Effect.gen(function* () {
          const createdAt = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const sbx = await Sandbox.connect(id, { apiKey: config.apiKey })
              const running = await sbx.isRunning()
              return {
                id: sbx.sandboxId,
                provider: "e2b",
                status: running ? "ready" : "stopped",
                createdAt,
              } satisfies SandboxInfo
            },
            catch: (err) => mapError(err, id),
          })
        }),

      run: (id: string, cmd: RunCommand) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          const result = yield* Effect.tryPromise({
            try: async () => {
              const execution = await sbx.commands.run(`${cmd.cmd} ${(cmd.args ?? []).join(" ")}`.trim(), {
                cwd: cmd.cwd,
                envs: cmd.env,
                timeoutMs: cmd.timeoutMs,
              })
              return {
                exitCode: execution.exitCode ?? 0,
                stdout: execution.stdout,
                stderr: execution.stderr,
              } satisfies RunResult
            },
            catch: (err) => mapError(err, id),
          })
          return result
        }),

      stream: (id: string, cmd: RunCommand) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const sbx = yield* getSandbox(id)
            return Stream.async<ProcessChunk, SandboxError>((emit) => {
              const encoder = new TextEncoder()
              sbx.commands
                .run(`${cmd.cmd} ${(cmd.args ?? []).join(" ")}`.trim(), {
                  cwd: cmd.cwd,
                  envs: cmd.env,
                  timeoutMs: cmd.timeoutMs,
                  onStdout: (data: string) => emit.single({ channel: "stdout", data: encoder.encode(data) }),
                  onStderr: (data: string) => emit.single({ channel: "stderr", data: encoder.encode(data) }),
                })
                .then(() => emit.end())
                .catch((err: unknown) => emit.fail(mapError(err, id)))
            })
          }),
        ),

      readFile: (id: string, path: string, opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          return yield* Effect.tryPromise({
            try: async () => {
              const content = await sbx.files.read(path)
              return opts?.encoding === "utf8" ? content : new TextEncoder().encode(content)
            },
            catch: (err) => mapError(err, id),
          })
        }),

      writeFile: (id: string, path: string, content, _opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          yield* Effect.tryPromise({
            try: async () => {
              const text = typeof content === "string" ? content : new TextDecoder().decode(content)
              await sbx.files.write(path, text)
            },
            catch: (err) => mapError(err, id),
          })
        }),

      listDir: (id: string, path: string, _opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          return yield* Effect.tryPromise({
            try: async () => {
              const entries = await sbx.files.list(path)
              return entries.map(
                (e): FsEntry => ({
                  path: e.path,
                  type: e.type === "dir" ? "dir" : "file",
                  size: e.size,
                }),
              )
            },
            catch: (err) => mapError(err, id),
          })
        }),

      mkdir: (id: string, path: string) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          yield* Effect.tryPromise({
            try: () => sbx.files.makeDir(path),
            catch: (err) => mapError(err, id),
          })
        }),

      rm: (id: string, path: string, _opts) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id)
          yield* Effect.tryPromise({
            try: () => sbx.files.remove(path),
            catch: (err) => mapError(err, id),
          })
        }),

      pause: undefined,
      resume: undefined,

      runCode: (id: string, input) =>
        Effect.gen(function* () {
          const sbx = yield* getSandbox(id, true)
          return yield* Effect.tryPromise({
            try: async () => {
              const result = await sbx.runCode(input.code, { timeoutMs: input.timeoutMs ?? 60000 })
              return {
                stdout: result.logs.stdout.join("\n"),
                stderr: result.logs.stderr.join("\n"),
                exitCode: result.error ? 1 : 0,
                artifacts: result.results?.map((r) => ({
                  name: r.text ?? "output",
                  mime: "text/plain",
                  data: new TextEncoder().encode(JSON.stringify(r)),
                })),
              }
            },
            catch: (err) => mapError(err, id),
          })
        }),
    }

    return driver
  }),
)
