import { Effect, Stream, Layer, Clock } from "effect"
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
import { DockerConfigTag } from "./config"

const exec = async (cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

const dockerErrorPatterns = {
  ...ErrorPatterns,
  notFound: [...ErrorPatterns.notFound, "no such container"],
}

const mapError = (err: unknown, id?: string): SandboxError =>
  mapErrorFromMessage(err, id, dockerErrorPatterns)

interface ContainerInfo {
  id: string
  name?: string
  ports: Record<number, number>
}

export const DockerDriverLive = Layer.effect(
  SandboxDriver,
  Effect.gen(function* () {
    const config = yield* DockerConfigTag
    const advertiseHost = config.advertiseHost ?? "127.0.0.1"
    const containerCache = new Map<string, ContainerInfo>()

    const driver: SandboxDriverService = {
      create: (options: CreateOptions) =>
        Effect.gen(function* () {
          const createdAt = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const args: string[] = ["run", "-d", "--rm"]

              if (options.name) {
                args.push("--name", options.name)
              }

              if (options.workdir) {
                args.push("-w", options.workdir)
              }

              if (options.env) {
                for (const [key, value] of Object.entries(options.env)) {
                  args.push("-e", `${key}=${value}`)
                }
              }

              const portsToExpose = [
                ...(config.defaultPorts ?? []),
                ...(options.encryptedPorts ?? []),
                ...(options.unencryptedPorts ?? []),
              ]

              for (const port of portsToExpose) {
                args.push("-p", `0:${port}`)
              }

              if (options.volumes) {
                for (const [mountPath, volumeName] of Object.entries(options.volumes)) {
                  args.push("-v", `${volumeName}:${mountPath}`)
                }
              }

              if (config.network) {
                args.push("--network", config.network)
              }

              const image = options.image ?? "node:20"
              args.push(image)

              if (options.command && options.command.length > 0) {
                args.push(...options.command)
              } else {
                args.push("sleep", "infinity")
              }

              const result = await exec("docker", args)
              if (result.exitCode !== 0) {
                throw new Error(`Docker create failed: ${result.stderr}`)
              }

              const containerId = result.stdout.trim().substring(0, 12)

              const inspectResult = await exec("docker", [
                "inspect",
                "--format",
                '{{json .NetworkSettings.Ports}}',
                containerId,
              ])

              const portMappings: Record<number, number> = {}
              if (inspectResult.exitCode === 0) {
                try {
                  const portsJson = JSON.parse(inspectResult.stdout.trim())
                  for (const [containerPort, bindings] of Object.entries(portsJson)) {
                    if (bindings && Array.isArray(bindings) && bindings.length > 0) {
                      const port = parseInt(containerPort.split("/")[0]!)
                      const hostPort = parseInt((bindings[0] as { HostPort: string }).HostPort)
                      portMappings[port] = hostPort
                    }
                  }
                } catch {
                }
              }

              containerCache.set(containerId, {
                id: containerId,
                name: options.name,
                ports: portMappings,
              })

              return {
                id: containerId,
                name: options.name,
                provider: "docker",
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
            await exec("docker", ["rm", "-f", id])
            containerCache.delete(id)
          },
          catch: (err) => mapError(err, id),
        }),

      status: (id: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["inspect", "--format", "{{.State.Status}}", id])
            if (result.exitCode !== 0) {
              return "stopped"
            }
            const status = result.stdout.trim()
            return status === "running" ? "ready" : "stopped"
          },
          catch: (err) => mapError(err, id),
        }),

      list: () =>
        Effect.gen(function* () {
          const now = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const result = await exec("docker", [
                "ps",
                "--format",
                '{{.ID}}\t{{.Names}}\t{{.Status}}',
              ])
              if (result.exitCode !== 0) {
                return []
              }

              const lines = result.stdout.trim().split("\n").filter(Boolean)
              return lines.map((line): SandboxInfo => {
                const [id, name, status] = line.split("\t")
                return {
                  id: id!,
                  name: name || undefined,
                  provider: "docker",
                  status: status?.includes("Up") ? "ready" : "stopped",
                  createdAt: now,
                }
              })
            },
            catch: mapError,
          })
        }),

      get: (id: string) =>
        Effect.gen(function* () {
          const createdAt = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const result = await exec("docker", [
                "inspect",
                "--format",
                '{{.State.Status}}\t{{.Name}}',
                id,
              ])
              if (result.exitCode !== 0) {
                throw new Error(`Container not found: ${id}`)
              }
              const [status, name] = result.stdout.trim().split("\t")
              return {
                id,
                name: name?.replace(/^\//, ""),
                provider: "docker",
                status: status === "running" ? "ready" : "stopped",
                createdAt,
              } satisfies SandboxInfo
            },
            catch: (err) => mapError(err, id),
          })
        }),

      run: (id: string, cmd: RunCommand) =>
        Effect.tryPromise({
          try: async () => {
            const args = ["exec"]

            if (cmd.cwd) {
              args.push("-w", cmd.cwd)
            }

            if (cmd.env) {
              for (const [key, value] of Object.entries(cmd.env)) {
                args.push("-e", `${key}=${value}`)
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

          if (cmd.cwd) {
            args.push("-w", cmd.cwd)
          }

          if (cmd.env) {
            for (const [key, value] of Object.entries(cmd.env)) {
              args.push("-e", `${key}=${value}`)
            }
          }

          args.push(id, cmd.cmd, ...(cmd.args ?? []))

          const proc = Bun.spawn(["docker", ...args], {
            stdout: "pipe",
            stderr: "pipe",
          })

          const readStream = async (stream: ReadableStream<Uint8Array>, channel: "stdout" | "stderr") => {
            const reader = stream.getReader()
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value) {
                emit.single({ channel, data: value })
              }
            }
            reader.releaseLock()
          }

          Promise.all([
            readStream(proc.stdout, "stdout"),
            readStream(proc.stderr, "stderr"),
            proc.exited,
          ])
            .then(() => emit.end())
            .catch((err) => emit.fail(mapError(err, id)))
        }),

      readFile: (id: string, path: string, opts) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["exec", id, "cat", path])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to read file: ${result.stderr}`)
            }
            if (opts?.encoding === "utf8") {
              return result.stdout
            }
            return new TextEncoder().encode(result.stdout)
          },
          catch: (err) => mapError(err, id),
        }),

      writeFile: (id: string, path: string, content) =>
        Effect.tryPromise({
          try: async () => {
            const data = typeof content === "string" ? content : new TextDecoder().decode(content)
            const b64 = Buffer.from(data).toString("base64")
            const result = await exec("docker", [
              "exec",
              id,
              "sh",
              "-c",
              `echo '${b64}' | base64 -d > '${path}'`,
            ])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to write file: ${result.stderr}`)
            }
          },
          catch: (err) => mapError(err, id),
        }),

      listDir: (id: string, path: string, opts) =>
        Effect.tryPromise({
          try: async () => {
            const flags = opts?.recursive ? "-laR" : "-la"
            const result = await exec("docker", ["exec", id, "ls", flags, path])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to list directory: ${result.stderr}`)
            }

            const lines = result.stdout.split("\n").filter((l) => l.trim())
            return lines.slice(1).map((line): FsEntry => {
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
        }),

      mkdir: (id: string, path: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["exec", id, "mkdir", "-p", path])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to mkdir: ${result.stderr}`)
            }
          },
          catch: (err) => mapError(err, id),
        }),

      rm: (id: string, path: string, opts) =>
        Effect.tryPromise({
          try: async () => {
            const flags: string[] = []
            if (opts?.recursive) flags.push("-r")
            if (opts?.force) flags.push("-f")

            const result = await exec("docker", ["exec", id, "rm", ...flags, path])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to rm: ${result.stderr}`)
            }
          },
          catch: (err) => mapError(err, id),
        }),

      snapshotCreate: (id: string, metadata) =>
        Effect.gen(function* () {
          const snapshotId = yield* generateId("snapshot")
          const createdAt = yield* currentTimestamp
          return yield* Effect.tryPromise({
            try: async () => {
              const imageName = `sandbox-snapshot:${snapshotId}`
              const result = await exec("docker", ["commit", id, imageName])
              if (result.exitCode !== 0) {
                throw new Error(`Failed to create snapshot: ${result.stderr}`)
              }
              return {
                id: snapshotId,
                createdAt,
                metadata,
              } satisfies SnapshotInfo
            },
            catch: (err) => mapError(err, id),
          })
        }),

      runCode: (id: string, input: RunCodeInput) =>
        Effect.tryPromise({
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

            const result = await exec("docker", ["exec", id, ...command])
            return {
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            } satisfies RunCodeResult
          },
          catch: (err) => mapError(err, id),
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
              const result = await exec("docker", ["volume", "create", name])
              if (result.exitCode !== 0) {
                throw new Error(`Failed to create volume: ${result.stderr}`)
              }
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
            const result = await exec("docker", ["volume", "rm", name])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to delete volume: ${result.stderr}`)
            }
          },
          catch: mapError,
        }),

      volumeList: () =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["volume", "ls", "--format", "{{.Name}}"])
            if (result.exitCode !== 0) {
              return []
            }
            const names = result.stdout.trim().split("\n").filter(Boolean)
            return names.map((name): VolumeInfo => ({ id: name, name }))
          },
          catch: mapError,
        }),

      volumeGet: (name: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["volume", "inspect", name])
            if (result.exitCode !== 0) {
              throw new Error(`Volume not found: ${name}`)
            }
            return { id: name, name } satisfies VolumeInfo
          },
          catch: mapError,
        }),

      watch: undefined,

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

      getProcessUrls: (id: string, ports: number[]) =>
        Effect.tryPromise({
          try: async () => {
            const cached = containerCache.get(id)
            if (cached) {
              const urls: Record<number, string> = {}
              for (const port of ports) {
                const hostPort = cached.ports[port]
                if (hostPort) {
                  urls[port] = `http://${advertiseHost}:${hostPort}`
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
                  urls[port] = `http://${advertiseHost}:${hostPort}`
                }
              }
            } catch {
            }

            return urls
          },
          catch: (err) => mapError(err, id),
        }),

      stopProcess: undefined,
    }

    return driver
  }),
)
