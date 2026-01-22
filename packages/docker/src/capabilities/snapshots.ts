import { Effect, Layer } from "effect"
import {
  SandboxSnapshots,
  type SandboxSnapshotsService,
  type SnapshotInfo,
  generateId,
  currentTimestamp,
} from "@ataraxy-labs/sandbox-sdk"
import { exec, mapError } from "./shared"

export const DockerSnapshotsLive = Layer.effect(
  SandboxSnapshots,
  Effect.gen(function* () {
    const snapshots: SandboxSnapshotsService = {
      create: (id: string, metadata?: Record<string, unknown>) =>
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

      restore: (_id: string, _snapshotId: string) =>
        Effect.fail(
          mapError(new Error("Docker snapshot restore not implemented - create new container from snapshot image")),
        ),

      list: (_id: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", [
              "images",
              "--format",
              "{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}",
              "sandbox-snapshot",
            ])
            if (result.exitCode !== 0) {
              return []
            }

            const lines = result.stdout.trim().split("\n").filter(Boolean)
            return lines.map((line): SnapshotInfo => {
              const [fullTag, createdAt] = line.split("\t")
              const id = fullTag?.split(":")[1] ?? fullTag ?? ""
              return {
                id,
                createdAt: createdAt ?? new Date().toISOString(),
              }
            })
          },
          catch: mapError,
        }),
    }

    return snapshots
  }),
)
