import { Effect, Layer } from "effect"
import {
  SandboxVolumes,
  type SandboxVolumesService,
  type VolumeInfo,
  currentTimestamp,
} from "@ataraxy-labs/sandbox-sdk"
import { exec, mapError } from "./shared"

export const DockerVolumesLive = Layer.effect(
  SandboxVolumes,
  Effect.gen(function* () {
    const volumes: SandboxVolumesService = {
      create: (name: string) =>
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

      delete: (name: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["volume", "rm", name])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to delete volume: ${result.stderr}`)
            }
          },
          catch: mapError,
        }),

      list: () =>
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

      get: (name: string) =>
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
    }

    return volumes
  }),
)
