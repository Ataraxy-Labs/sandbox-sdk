import { Context, Effect } from "effect"
import type { SandboxError } from "../errors"
import type { SnapshotInfo } from "../types"

/**
 * Snapshot operations for sandboxes (optional capability).
 * Allows saving and restoring sandbox state.
 */
export interface SandboxSnapshotsService {
  /**
   * Create a snapshot of the current sandbox state.
   */
  readonly create: (
    id: string,
    metadata?: Record<string, unknown>,
  ) => Effect.Effect<SnapshotInfo, SandboxError>

  /**
   * Restore a sandbox from a snapshot.
   */
  readonly restore: (id: string, snapshotId: string) => Effect.Effect<void, SandboxError>

  /**
   * List available snapshots for a sandbox.
   */
  readonly list: (id: string) => Effect.Effect<ReadonlyArray<SnapshotInfo>, SandboxError>
}

export class SandboxSnapshots extends Context.Tag("SandboxSnapshots")<
  SandboxSnapshots,
  SandboxSnapshotsService
>() {}

/**
 * Standalone effect functions for snapshot operations.
 */
export const createSnapshot = (
  id: string,
  metadata?: Record<string, unknown>,
): Effect.Effect<SnapshotInfo, SandboxError, SandboxSnapshots> =>
  Effect.flatMap(SandboxSnapshots, (svc) => svc.create(id, metadata))

export const restoreSnapshot = (
  id: string,
  snapshotId: string,
): Effect.Effect<void, SandboxError, SandboxSnapshots> =>
  Effect.flatMap(SandboxSnapshots, (svc) => svc.restore(id, snapshotId))

export const listSnapshots = (
  id: string,
): Effect.Effect<ReadonlyArray<SnapshotInfo>, SandboxError, SandboxSnapshots> =>
  Effect.flatMap(SandboxSnapshots, (svc) => svc.list(id))
