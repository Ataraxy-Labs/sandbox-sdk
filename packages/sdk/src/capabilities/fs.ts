import { Context, Effect, Stream } from "effect"
import type { SandboxError } from "../errors"
import type { FsEntry, ReadFileOptions, WriteFileOptions, ListOptions, RmOptions, FileWatchEvent } from "../types"

/**
 * Filesystem operations for sandboxes.
 * All providers must implement core FS operations.
 */
export interface SandboxFsService {
  /**
   * Read a file from the sandbox.
   */
  readonly readFile: (
    id: string,
    path: string,
    opts?: ReadFileOptions,
  ) => Effect.Effect<Uint8Array | string, SandboxError>

  /**
   * Write content to a file in the sandbox.
   */
  readonly writeFile: (
    id: string,
    path: string,
    content: Uint8Array | string,
    opts?: WriteFileOptions,
  ) => Effect.Effect<void, SandboxError>

  /**
   * List directory contents.
   */
  readonly listDir: (
    id: string,
    path: string,
    opts?: ListOptions,
  ) => Effect.Effect<ReadonlyArray<FsEntry>, SandboxError>

  /**
   * Create a directory.
   */
  readonly mkdir: (id: string, path: string) => Effect.Effect<void, SandboxError>

  /**
   * Remove a file or directory.
   */
  readonly rm: (id: string, path: string, opts?: RmOptions) => Effect.Effect<void, SandboxError>

  /**
   * Watch for file changes (optional capability).
   */
  readonly watch?: (id: string, path: string) => Stream.Stream<FileWatchEvent, SandboxError>
}

export class SandboxFs extends Context.Tag("SandboxFs")<SandboxFs, SandboxFsService>() {}

/**
 * Standalone effect functions for filesystem operations.
 */
export const readFile = (
  id: string,
  path: string,
  opts?: ReadFileOptions,
): Effect.Effect<Uint8Array | string, SandboxError, SandboxFs> =>
  Effect.flatMap(SandboxFs, (svc) => svc.readFile(id, path, opts))

export const writeFile = (
  id: string,
  path: string,
  content: Uint8Array | string,
  opts?: WriteFileOptions,
): Effect.Effect<void, SandboxError, SandboxFs> =>
  Effect.flatMap(SandboxFs, (svc) => svc.writeFile(id, path, content, opts))

export const listDir = (
  id: string,
  path: string,
  opts?: ListOptions,
): Effect.Effect<ReadonlyArray<FsEntry>, SandboxError, SandboxFs> =>
  Effect.flatMap(SandboxFs, (svc) => svc.listDir(id, path, opts))

export const mkdir = (
  id: string,
  path: string,
): Effect.Effect<void, SandboxError, SandboxFs> =>
  Effect.flatMap(SandboxFs, (svc) => svc.mkdir(id, path))

export const rm = (
  id: string,
  path: string,
  opts?: RmOptions,
): Effect.Effect<void, SandboxError, SandboxFs> =>
  Effect.flatMap(SandboxFs, (svc) => svc.rm(id, path, opts))
