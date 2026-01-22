import { Context, Effect } from "effect"
import type { SandboxError } from "../errors"
import type { VolumeInfo } from "../types"

/**
 * Volume management operations (optional capability).
 * Allows creating and managing persistent volumes.
 */
export interface SandboxVolumesService {
  /**
   * Create a new volume.
   */
  readonly create: (name: string) => Effect.Effect<VolumeInfo, SandboxError>

  /**
   * Delete a volume.
   */
  readonly delete: (name: string) => Effect.Effect<void, SandboxError>

  /**
   * List all volumes.
   */
  readonly list: () => Effect.Effect<ReadonlyArray<VolumeInfo>, SandboxError>

  /**
   * Get volume info by name.
   */
  readonly get: (name: string) => Effect.Effect<VolumeInfo, SandboxError>
}

export class SandboxVolumes extends Context.Tag("SandboxVolumes")<
  SandboxVolumes,
  SandboxVolumesService
>() {}

/**
 * Standalone effect functions for volume operations.
 */
export const createVolume = (
  name: string,
): Effect.Effect<VolumeInfo, SandboxError, SandboxVolumes> =>
  Effect.flatMap(SandboxVolumes, (svc) => svc.create(name))

export const deleteVolume = (
  name: string,
): Effect.Effect<void, SandboxError, SandboxVolumes> =>
  Effect.flatMap(SandboxVolumes, (svc) => svc.delete(name))

export const listVolumes = (): Effect.Effect<
  ReadonlyArray<VolumeInfo>,
  SandboxError,
  SandboxVolumes
> => Effect.flatMap(SandboxVolumes, (svc) => svc.list())

export const getVolume = (
  name: string,
): Effect.Effect<VolumeInfo, SandboxError, SandboxVolumes> =>
  Effect.flatMap(SandboxVolumes, (svc) => svc.get(name))
