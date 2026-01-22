import { Effect, Layer, Stream } from "effect"
import {
  SandboxProcess,
  type SandboxProcessService,
  type RunCommand,
  type RunResult,
  type ProcessChunk,
  type StartProcessOptions,
  type ProcessInfo,
  type SandboxError,
  generateId,
} from "@ataraxy-labs/sandbox-sdk"
import { exec, mapError, DockerStateTag } from "./shared"

export const DockerProcessLive = Layer.effect(
  SandboxProcess,
  Effect.gen(function* () {
    const state = yield* DockerStateTag

    const process: SandboxProcessService = {
      run: (id: string, cmd: RunCommand) =>
        Effect.tryPromise({
          try: async () => {
            const args = ["exec"]
            if (cmd.cwd) args.push("-w", cmd.cwd)
            if (cmd.env) {
              for (const [k, v] of Object.entries(cmd.env)) {
                args.push("-e", `${k}=${v}`)
              }
            }
            args.push(id, cmd.cmd, ...(cmd.args ?? []))

            const result = await exec("docker", args)
            return {
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            } satisfies RunResult
          },
          catch: (err) => mapError(err, id),
        }),

      stream: (id: string, cmd: RunCommand) =>
        Stream.async<ProcessChunk, SandboxError>((emit) => {
          const args = ["exec"]
          if (cmd.cwd) args.push("-w", cmd.cwd)
          if (cmd.env) {
            for (const [k, v] of Object.entries(cmd.env)) {
              args.push("-e", `${k}=${v}`)
            }
          }
          args.push(id, cmd.cmd, ...(cmd.args ?? []))

          const proc = Bun.spawn(["docker", ...args], {
            stdout: "pipe",
            stderr: "pipe",
          })

          const readStream = async (
            stream: ReadableStream<Uint8Array>,
            channel: "stdout" | "stderr",
          ) => {
            const reader = stream.getReader()
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                emit.single({ channel, data: value })
              }
            } finally {
              reader.releaseLock()
            }
          }

          Promise.all([
            readStream(proc.stdout, "stdout"),
            readStream(proc.stderr, "stderr"),
          ])
            .then(() => emit.end())
            .catch((err: unknown) => emit.fail(mapError(err, id)))
        }),

      startProcess: (id: string, opts: StartProcessOptions) =>
        Effect.gen(function* () {
          const processId = yield* generateId("proc")
          return yield* Effect.tryPromise({
            try: async () => {
              const args = ["exec", "-d"]

              if (opts.cwd) {
                args.push("-w", opts.cwd)
              }

              if (opts.env) {
                for (const [key, value] of Object.entries(opts.env)) {
                  args.push("-e", `${key}=${value}`)
                }
              }

              args.push(id, opts.cmd, ...(opts.args ?? []))

              const result = await exec("docker", args)
              if (result.exitCode !== 0 && !opts.background) {
                throw new Error(`Failed to start process: ${result.stderr}`)
              }

              return {
                id: processId,
                status: "running",
              } satisfies ProcessInfo
            },
            catch: (err) => mapError(err, id),
          })
        }),

      stopProcess: undefined,

      getProcessUrls: (id: string, ports: number[]) =>
        Effect.tryPromise({
          try: async () => {
            const cached = state.containerCache.get(id)
            if (cached) {
              const urls: Record<number, string> = {}
              for (const port of ports) {
                const hostPort = cached.ports[port]
                if (hostPort) {
                  urls[port] = `http://${state.advertiseHost}:${hostPort}`
                }
              }
              return urls
            }

            const result = await exec("docker", [
              "inspect",
              "--format",
              '{{json .NetworkSettings.Ports}}',
              id,
            ])

            if (result.exitCode !== 0) {
              return {}
            }

            const urls: Record<number, string> = {}
            try {
              const portsJson = JSON.parse(result.stdout.trim())
              for (const port of ports) {
                const bindings = portsJson[`${port}/tcp`]
                if (bindings && Array.isArray(bindings) && bindings.length > 0) {
                  const hostPort = (bindings[0] as { HostPort: string }).HostPort
                  urls[port] = `http://${state.advertiseHost}:${hostPort}`
                }
              }
            } catch {
            }

            return urls
          },
          catch: (err) => mapError(err, id),
        }),
    }

    return process
  }),
)
