import { Context, Effect } from "effect"
import type { SandboxError } from "../errors"
import type { CreateOptions, SandboxInfo, SandboxStatus } from "../types"

/**
 * Core lifecycle operations for sandboxes.
 * All providers must implement this service.
 */
export interface SandboxLifecycleService {
  /**
   * Create a new sandbox with the given options.
   */
  readonly create: (options: CreateOptions) => Effect.Effect<SandboxInfo, SandboxError>

  /**
   * Destroy a sandbox by ID.
   */
  readonly destroy: (id: string) => Effect.Effect<void, SandboxError>

  /**
   * Get the status of a sandbox.
   */
  readonly status: (id: string) => Effect.Effect<SandboxStatus, SandboxError>

  /**
   * List all sandboxes.
   */
  readonly list: () => Effect.Effect<ReadonlyArray<SandboxInfo>, SandboxError>

  /**
   * Get sandbox info by ID.
   */
  readonly get: (id: string) => Effect.Effect<SandboxInfo, SandboxError>

  /**
   * Pause a sandbox (optional capability).
   */
  readonly pause?: (id: string) => Effect.Effect<void, SandboxError>

  /**
   * Resume a paused sandbox (optional capability).
   */
  readonly resume?: (id: string) => Effect.Effect<void, SandboxError>
}

export class SandboxLifecycle extends Context.Tag("SandboxLifecycle")<
  SandboxLifecycle,
  SandboxLifecycleService
>() {}

/**
 * Standalone effect functions for lifecycle operations.
 * These automatically resolve the SandboxLifecycle service from context.
 */
export const create = (
  options: CreateOptions,
): Effect.Effect<SandboxInfo, SandboxError, SandboxLifecycle> =>
  Effect.flatMap(SandboxLifecycle, (svc) => svc.create(options))

export const destroy = (id: string): Effect.Effect<void, SandboxError, SandboxLifecycle> =>
  Effect.flatMap(SandboxLifecycle, (svc) => svc.destroy(id))

export const status = (
  id: string,
): Effect.Effect<SandboxStatus, SandboxError, SandboxLifecycle> =>
  Effect.flatMap(SandboxLifecycle, (svc) => svc.status(id))

export const list = (): Effect.Effect<ReadonlyArray<SandboxInfo>, SandboxError, SandboxLifecycle> =>
  Effect.flatMap(SandboxLifecycle, (svc) => svc.list())

export const get = (id: string): Effect.Effect<SandboxInfo, SandboxError, SandboxLifecycle> =>
  Effect.flatMap(SandboxLifecycle, (svc) => svc.get(id))
