import { Effect, Layer } from "effect"
import {
  SandboxDriverFromCapabilities,
  SandboxLifecycle,
  SandboxProcess,
  SandboxFs,
  SandboxSnapshots,
  SandboxVolumes,
  SandboxCode,
} from "@ataraxy-labs/sandbox-sdk"
import { DockerConfigTag, type DockerConfig } from "../config"
import { DockerStateTag, type DockerState } from "./shared"
import { DockerLifecycleLive } from "./lifecycle"
import { DockerProcessLive } from "./process"
import { DockerFsLive } from "./fs"
import { DockerSnapshotsLive } from "./snapshots"
import { DockerVolumesLive } from "./volumes"
import { DockerCodeLive } from "./code"

const DockerStateLive = (config: DockerConfig) =>
  Layer.effect(
    DockerStateTag,
    Effect.sync(() => ({
      containerCache: new Map(),
      advertiseHost: config.advertiseHost ?? "127.0.0.1",
    })),
  )

const DockerConfigFromConfig = (config: DockerConfig) =>
  Layer.succeed(DockerConfigTag, {
    advertiseHost: config.advertiseHost ?? "127.0.0.1",
    timeoutMs: config.timeoutMs ?? 300000,
    defaultPorts: config.defaultPorts ?? [],
    network: config.network,
  })

/**
 * Layer that provides all Docker capability services.
 *
 * This layer provides:
 * - SandboxLifecycle
 * - SandboxProcess
 * - SandboxFs
 * - SandboxSnapshots
 * - SandboxVolumes
 * - SandboxCode
 *
 * IMPORTANT: All capabilities share a single DockerState instance to ensure
 * the containerCache is consistent across lifecycle/process/fs operations.
 *
 * Usage:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const lifecycle = yield* SandboxLifecycle
 *   const sandbox = yield* lifecycle.create({ image: "node:20" })
 *   // ...
 * })
 *
 * Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(DockerCapabilitiesLive({ advertiseHost: "localhost" }))
 *   )
 * )
 * ```
 */
export const DockerCapabilitiesLive = (config: DockerConfig = {}) => {
  const baseLayer = Layer.mergeAll(
    DockerConfigFromConfig(config),
    DockerStateLive(config),
  )

  const allCapabilities = Layer.mergeAll(
    DockerLifecycleLive,
    DockerProcessLive,
    DockerFsLive,
    DockerSnapshotsLive,
    DockerVolumesLive,
    DockerCodeLive,
  )

  return allCapabilities.pipe(Layer.provide(baseLayer))
}

/**
 * Layer that provides SandboxDriver from Docker capabilities.
 *
 * This combines the capability services using the adapter to produce
 * a legacy-compatible SandboxDriver. Useful for gradual migration.
 *
 * Usage:
 * ```ts
 * const program = Effect.gen(function* () {
 *   const driver = yield* SandboxDriver
 *   const sandbox = yield* driver.create({ image: "node:20" })
 *   // ...
 * })
 *
 * Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(DockerDriverFromCapabilitiesLive({ advertiseHost: "localhost" }))
 *   )
 * )
 * ```
 */
export const DockerDriverFromCapabilitiesLive = (config: DockerConfig = {}) =>
  SandboxDriverFromCapabilities.pipe(Layer.provide(DockerCapabilitiesLive(config)))
