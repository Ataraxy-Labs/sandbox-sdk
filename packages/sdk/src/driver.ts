import { Context, Effect, Stream } from "effect"
import type { SandboxError } from "./errors"
import type {
  CreateOptions,
  SandboxInfo,
  SandboxStatus,
  RunCommand,
  RunResult,
  ProcessChunk,
  FsEntry,
  ReadFileOptions,
  WriteFileOptions,
  ListOptions,
  RmOptions,
  SnapshotInfo,
  RunCodeInput,
  RunCodeResult,
  VolumeInfo,
  FileWatchEvent,
  StartProcessOptions,
  ProcessInfo,
} from "./types"

export interface SandboxDriverService {
  create(opts: CreateOptions): Effect.Effect<SandboxInfo, SandboxError>
  destroy(id: string): Effect.Effect<void, SandboxError>
  status(id: string): Effect.Effect<SandboxStatus, SandboxError>
  list(): Effect.Effect<ReadonlyArray<SandboxInfo>, SandboxError>
  get(id: string): Effect.Effect<SandboxInfo, SandboxError>

  run(id: string, cmd: RunCommand): Effect.Effect<RunResult, SandboxError>
  stream(id: string, cmd: RunCommand): Stream.Stream<ProcessChunk, SandboxError>

  readFile(id: string, path: string, opts?: ReadFileOptions): Effect.Effect<Uint8Array | string, SandboxError>
  writeFile(
    id: string,
    path: string,
    content: Uint8Array | string,
    opts?: WriteFileOptions,
  ): Effect.Effect<void, SandboxError>
  listDir(id: string, path: string, opts?: ListOptions): Effect.Effect<ReadonlyArray<FsEntry>, SandboxError>
  mkdir(id: string, path: string): Effect.Effect<void, SandboxError>
  rm(id: string, path: string, opts?: RmOptions): Effect.Effect<void, SandboxError>

  pause?(id: string): Effect.Effect<void, SandboxError>
  resume?(id: string): Effect.Effect<void, SandboxError>

  snapshotCreate?(id: string, metadata?: Record<string, unknown>): Effect.Effect<SnapshotInfo, SandboxError>
  snapshotRestore?(id: string, snapshotId: string): Effect.Effect<void, SandboxError>
  snapshotList?(id: string): Effect.Effect<ReadonlyArray<SnapshotInfo>, SandboxError>

  runCode?(id: string, input: RunCodeInput): Effect.Effect<RunCodeResult, SandboxError>

  volumeCreate?(name: string): Effect.Effect<VolumeInfo, SandboxError>
  volumeDelete?(name: string): Effect.Effect<void, SandboxError>
  volumeList?(): Effect.Effect<ReadonlyArray<VolumeInfo>, SandboxError>
  volumeGet?(name: string): Effect.Effect<VolumeInfo, SandboxError>

  watch?(id: string, path: string): Stream.Stream<FileWatchEvent, SandboxError>

  startProcess?(id: string, opts: StartProcessOptions): Effect.Effect<ProcessInfo, SandboxError>
  stopProcess?(id: string, processId: string): Effect.Effect<void, SandboxError>
  getProcessUrls?(id: string, ports: number[]): Effect.Effect<Record<number, string>, SandboxError>
}

export class SandboxDriver extends Context.Tag("SandboxDriver")<SandboxDriver, SandboxDriverService>() {}
