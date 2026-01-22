import { Effect, Layer } from "effect"
import {
  SandboxLifecycle,
  type SandboxLifecycleService,
  type SandboxInfo,
  type CreateOptions,
  currentTimestamp,
} from "@ataraxy-labs/sandbox-sdk"
import { DockerConfigTag } from "../config"
import { exec, mapError, DockerStateTag, type ContainerInfo } from "./shared"

export const DockerLifecycleLive = Layer.effect(
  SandboxLifecycle,
  Effect.gen(function* () {
    const config = yield* DockerConfigTag
    const state = yield* DockerStateTag

    const lifecycle: SandboxLifecycleService = {
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

              state.containerCache.set(containerId, {
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
            state.containerCache.delete(id)
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

      pause: undefined,
      resume: undefined,
    }

    return lifecycle
  }),
)
