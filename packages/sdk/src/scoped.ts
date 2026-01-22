/**
 * Scoped sandbox resource management using Effect.acquireRelease.
 *
 * This module provides Effect-native resource management for sandboxes,
 * ensuring proper cleanup on success, failure, or cancellation.
 *
 * @example
 * ```ts
 * import { acquireSandbox, withManagedSandbox } from "@opencode-ai/sandbox-sdk"
 *
 * // Using scoped API with automatic cleanup
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const sandbox = yield* acquireSandbox({ image: "node:22" })
 *     const result = yield* run(sandbox.id, { cmd: "node", args: ["-v"] })
 *     return result
 *   })
 * )
 *
 * // Or using the convenience wrapper
 * const program = withManagedSandbox({ image: "node:22" }, (sandbox) =>
 *   run(sandbox.id, { cmd: "node", args: ["-v"] })
 * )
 * ```
 */

import { Effect, Scope, Duration } from "effect"
import { SandboxDriver } from "./driver"
import type { SandboxDriverService } from "./driver"
import type { CreateOptions, SandboxInfo, VolumeInfo } from "./types"
import type { SandboxError } from "./errors"
import { withOperationContext, sandboxErrorToLog, SandboxNotFoundError, SandboxTimeoutError } from "./errors"

/**
 * Acquire a sandbox as a scoped resource.
 *
 * The sandbox will be automatically destroyed when the scope closes,
 * regardless of success, failure, or cancellation.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const sandbox = yield* acquireSandbox({ image: "alpine:3.21" })
 *     // Use sandbox...
 *     // Automatically destroyed when scope closes
 *   })
 * )
 * ```
 */
export const acquireSandbox = (
  opts: CreateOptions,
): Effect.Effect<SandboxInfo, SandboxError, SandboxDriver | Scope.Scope> =>
  Effect.acquireRelease(
    withOperationContext(
      { capability: "lifecycle", operation: "create" },
      SandboxDriver.pipe(Effect.flatMap((d) => d.create(opts))),
    ),
    (info) =>
      withOperationContext(
        { provider: info.provider, capability: "lifecycle", operation: "destroy", sandboxId: info.id },
        SandboxDriver.pipe(Effect.flatMap((d) => d.destroy(info.id))),
      ).pipe(
        Effect.catchTag("SandboxNotFound", () => Effect.void),
        Effect.catchAll((err) =>
          Effect.logWarning("Failed to destroy sandbox during cleanup").pipe(
            Effect.annotateLogs({
              sandboxId: info.id,
              provider: info.provider,
              error: JSON.stringify(sandboxErrorToLog(err)),
            }),
            Effect.asVoid,
          ),
        ),
      ),
  )

/**
 * Run an effect with a managed sandbox that auto-cleans up.
 *
 * This is the recommended way to work with sandboxes in most cases.
 * The sandbox is created, passed to your function, and destroyed
 * when the function completes (success, failure, or cancellation).
 *
 * @example
 * ```ts
 * const result = await Effect.runPromise(
 *   withManagedSandbox({ image: "node:22" }, (sandbox) =>
 *     SandboxDriver.pipe(
 *       Effect.flatMap((d) => d.run(sandbox.id, { cmd: "echo", args: ["hello"] }))
 *     )
 *   ).pipe(Effect.provide(DockerDriverLive))
 * )
 * ```
 */
export const withManagedSandbox = <A, E, R>(
  opts: CreateOptions,
  use: (sandbox: SandboxInfo) => Effect.Effect<A, E, R>,
): Effect.Effect<A, SandboxError | E, SandboxDriver | Exclude<R, Scope.Scope>> =>
  Effect.scoped(acquireSandbox(opts).pipe(Effect.flatMap(use)))

/**
 * Run an effect with a managed sandbox and timeout.
 *
 * Applies a timeout to the entire operation (create + use + destroy).
 * On timeout, cleanup still runs and a SandboxTimeoutError is returned.
 *
 * @example
 * ```ts
 * const result = await Effect.runPromise(
 *   withManagedSandboxTimeout(
 *     { image: "node:22" },
 *     Duration.minutes(5),
 *     (sandbox) => longRunningOperation(sandbox)
 *   ).pipe(Effect.provide(DockerDriverLive))
 * )
 * ```
 */
export const withManagedSandboxTimeout = <A, E, R>(
  opts: CreateOptions,
  timeout: Duration.DurationInput,
  use: (sandbox: SandboxInfo) => Effect.Effect<A, E, R>,
): Effect.Effect<A, SandboxError | E, SandboxDriver | Exclude<R, Scope.Scope>> =>
  withManagedSandbox(opts, use).pipe(
    Effect.timeoutFail({
      duration: timeout,
      onTimeout: () =>
        new SandboxTimeoutError({
          timeoutMs: Duration.toMillis(timeout),
          message: `Sandbox operation timed out after ${Duration.toMillis(timeout)}ms`,
        }),
    }),
  )

/**
 * Acquire a volume as a scoped resource.
 *
 * The volume will be automatically deleted when the scope closes.
 * Note: Only works with drivers that support volumes.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const volume = yield* acquireVolume("test-vol")
 *     const sandbox = yield* acquireSandbox({
 *       image: "alpine",
 *       volumes: { "/data": volume.name }
 *     })
 *     // Use sandbox with volume...
 *   })
 * )
 * ```
 */
export const acquireVolume = (
  name: string,
): Effect.Effect<VolumeInfo, SandboxError, SandboxDriver | Scope.Scope> =>
  Effect.acquireRelease(
    SandboxDriver.pipe(
      Effect.flatMap((d) => {
        if (!d.volumeCreate) {
          return Effect.die(new Error("Volume operations not supported by this driver"))
        }
        return d.volumeCreate(name)
      }),
    ),
    (vol) =>
      SandboxDriver.pipe(
        Effect.flatMap((d) => {
          if (!d.volumeDelete) {
            return Effect.void
          }
          return d.volumeDelete(vol.name).pipe(
            Effect.catchAll((err) =>
              Effect.logWarning("Failed to delete volume during cleanup").pipe(
                Effect.annotateLogs({
                  volumeName: vol.name,
                  error: JSON.stringify(sandboxErrorToLog(err)),
                }),
                Effect.asVoid,
              ),
            ),
          )
        }),
      ),
  )

/**
 * Run an effect with a managed volume that auto-cleans up.
 *
 * @example
 * ```ts
 * const result = await Effect.runPromise(
 *   withManagedVolume("my-vol", (volume) =>
 *     withManagedSandbox(
 *       { image: "alpine", volumes: { "/data": volume.name } },
 *       (sandbox) => doWork(sandbox)
 *     )
 *   ).pipe(Effect.provide(DockerDriverLive))
 * )
 * ```
 */
export const withManagedVolume = <A, E, R>(
  name: string,
  use: (volume: VolumeInfo) => Effect.Effect<A, E, R>,
): Effect.Effect<A, SandboxError | E, SandboxDriver | Exclude<R, Scope.Scope>> =>
  Effect.scoped(acquireVolume(name).pipe(Effect.flatMap(use)))

/**
 * Acquire multiple sandboxes as scoped resources.
 *
 * All sandboxes are cleaned up when the scope closes.
 * Useful for testing multi-sandbox scenarios.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const sandboxes = yield* acquireSandboxes([
 *       { image: "node:22" },
 *       { image: "python:3.12" },
 *     ])
 *     // Use sandboxes[0], sandboxes[1]...
 *   })
 * )
 * ```
 */
export const acquireSandboxes = (
  optsList: CreateOptions[],
): Effect.Effect<SandboxInfo[], SandboxError, SandboxDriver | Scope.Scope> =>
  Effect.forEach(optsList, acquireSandbox, { concurrency: "unbounded" })

/**
 * Acquire a sandbox and volume together as scoped resources.
 *
 * The sandbox is mounted with the volume at the specified path.
 * Both are cleaned up when the scope closes (sandbox first, then volume).
 *
 * @example
 * ```ts
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const { sandbox, volume } = yield* acquireSandboxWithVolume(
 *       { image: "alpine" },
 *       "test-data",
 *       "/data"
 *     )
 *     // Write to /data, it persists in the volume
 *   })
 * )
 * ```
 */
export const acquireSandboxWithVolume = (
  sandboxOpts: Omit<CreateOptions, "volumes">,
  volumeName: string,
  mountPath: string,
): Effect.Effect<
  { sandbox: SandboxInfo; volume: VolumeInfo },
  SandboxError,
  SandboxDriver | Scope.Scope
> =>
  Effect.gen(function* () {
    const volume = yield* acquireVolume(volumeName)
    const sandbox = yield* acquireSandbox({
      ...sandboxOpts,
      volumes: { [mountPath]: volume.name },
    })
    return { sandbox, volume }
  })
