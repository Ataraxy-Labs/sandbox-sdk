import { Context, Effect, Layer, Scope, Stream } from "effect"
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
} from "./types"
import { SandboxDriver } from "./driver"

export interface SandboxHandle {
  readonly info: SandboxInfo
  readonly id: string
  status(): Effect.Effect<SandboxStatus, SandboxError>
  destroy(): Effect.Effect<void, SandboxError>

  readonly process: {
    run(cmd: RunCommand): Effect.Effect<RunResult, SandboxError>
    stream(cmd: RunCommand): Stream.Stream<ProcessChunk, SandboxError>
  }

  readonly fs: {
    readFile(path: string, opts?: ReadFileOptions): Effect.Effect<Uint8Array | string, SandboxError>
    writeFile(path: string, content: Uint8Array | string, opts?: WriteFileOptions): Effect.Effect<void, SandboxError>
    list(path: string, opts?: ListOptions): Effect.Effect<ReadonlyArray<FsEntry>, SandboxError>
    mkdir(path: string): Effect.Effect<void, SandboxError>
    rm(path: string, opts?: RmOptions): Effect.Effect<void, SandboxError>
  }
}

export interface SandboxService {
  create(opts: CreateOptions): Effect.Effect<SandboxHandle, SandboxError, Scope.Scope>
  list(): Effect.Effect<ReadonlyArray<SandboxInfo>, SandboxError>
  get(id: string): Effect.Effect<SandboxHandle, SandboxError>
}

export class Sandbox extends Context.Tag("Sandbox")<Sandbox, SandboxService>() {}

const createHandle = (driver: SandboxDriver["Type"], info: SandboxInfo): SandboxHandle => ({
  info,
  id: info.id,
  status: () => driver.status(info.id),
  destroy: () => driver.destroy(info.id),
  process: {
    run: (cmd) => driver.run(info.id, cmd),
    stream: (cmd) => driver.stream(info.id, cmd),
  },
  fs: {
    readFile: (path, opts) => driver.readFile(info.id, path, opts),
    writeFile: (path, content, opts) => driver.writeFile(info.id, path, content, opts),
    list: (path, opts) => driver.listDir(info.id, path, opts),
    mkdir: (path) => driver.mkdir(info.id, path),
    rm: (path, opts) => driver.rm(info.id, path, opts),
  },
})

export const SandboxLive = Layer.effect(
  Sandbox,
  Effect.gen(function* () {
    const driver = yield* SandboxDriver

    return {
      create: (opts) =>
        Effect.acquireRelease(driver.create(opts).pipe(Effect.map((info) => createHandle(driver, info))), (handle) =>
          handle.destroy().pipe(Effect.catchAll(() => Effect.void)),
        ),
      list: () => driver.list(),
      get: (id) => driver.get(id).pipe(Effect.map((info) => createHandle(driver, info))),
    }
  }),
)
