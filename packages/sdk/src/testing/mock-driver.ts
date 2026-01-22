import { Effect, Stream, Layer, Ref, Chunk, Clock } from "effect"
import type { SandboxDriverService } from "../driver"
import { SandboxDriver } from "../driver"
import {
  SandboxNotFoundError,
  SandboxProviderError,
  type SandboxError,
  currentTimestamp,
  generateId,
} from "../errors"
import type {
  CreateOptions,
  SandboxInfo,
  SandboxStatus,
  RunCommand,
  RunResult,
  ProcessChunk,
  FsEntry,
  SnapshotInfo,
  RunCodeInput,
  RunCodeResult,
  VolumeInfo,
  StartProcessOptions,
  ProcessInfo,
} from "../types"

/**
 * In-memory sandbox state for mock driver.
 */
export interface MockSandboxState {
  id: string
  name?: string
  status: SandboxStatus
  createdAt: string
  workdir: string
  env: Record<string, string>
  files: Map<string, Uint8Array>
  processes: Map<string, ProcessInfo>
}

/**
 * Configuration for MockDriver behavior.
 */
export interface MockDriverConfig {
  /** Initial sandboxes to populate */
  initialSandboxes?: MockSandboxState[]
  /** Initial volumes to populate */
  initialVolumes?: VolumeInfo[]
  /** Simulated latency for operations (ms) */
  latencyMs?: number
  /** Make specific operations fail */
  failOperations?: {
    create?: boolean
    destroy?: boolean
    run?: boolean
    readFile?: boolean
    writeFile?: boolean
  }
  /** Custom error message for failed operations */
  errorMessage?: string
  /** Command execution handler for custom responses */
  commandHandler?: (sandboxId: string, cmd: RunCommand) => RunResult
}

/**
 * Create a mock sandbox driver for testing.
 *
 * The mock driver maintains in-memory state and can be configured
 * to simulate various behaviors including failures.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const driver = yield* SandboxDriver
 *   const info = yield* driver.create({ image: "node:20" })
 *   yield* driver.writeFile(info.id, "/test.txt", "hello")
 *   const content = yield* driver.readFile(info.id, "/test.txt", { encoding: "utf8" })
 *   expect(content).toBe("hello")
 * })
 *
 * Effect.runPromise(program.pipe(Effect.provide(MockDriverLive())))
 * ```
 */
export const MockDriverLive = (config: MockDriverConfig = {}) =>
  Layer.effect(
    SandboxDriver,
    Effect.gen(function* () {
      const sandboxes = yield* Ref.make(new Map<string, MockSandboxState>(config.initialSandboxes?.map((s) => [s.id, s])))
      const volumes = yield* Ref.make(new Map<string, VolumeInfo>(config.initialVolumes?.map((v) => [v.name, v])))
      const snapshots = yield* Ref.make(new Map<string, SnapshotInfo>())

      const latency = config.latencyMs ?? 0
      const addLatency = latency > 0 ? Effect.sleep(`${latency} millis`) : Effect.void

      const checkFail = (op: keyof NonNullable<typeof config.failOperations>) =>
        config.failOperations?.[op]
          ? Effect.fail(new SandboxProviderError({ message: config.errorMessage ?? `Mock ${op} failed` }))
          : Effect.void

      const getSandbox = (id: string) =>
        Effect.flatMap(Ref.get(sandboxes), (map) => {
          const sandbox = map.get(id)
          return sandbox ? Effect.succeed(sandbox) : Effect.fail(new SandboxNotFoundError({ id }))
        })

      const driver: SandboxDriverService = {
        create: (opts: CreateOptions) =>
          Effect.gen(function* () {
            yield* checkFail("create")
            yield* addLatency
            const id = yield* generateId("mock-sbx")
            const createdAt = yield* currentTimestamp

            const state: MockSandboxState = {
              id,
              name: opts.name,
              status: "ready",
              createdAt,
              workdir: opts.workdir ?? "/workspace",
              env: opts.env ?? {},
              files: new Map(),
              processes: new Map(),
            }

            yield* Ref.update(sandboxes, (map) => new Map(map).set(id, state))

            return {
              id,
              name: opts.name,
              provider: "mock",
              status: "ready",
              createdAt,
            } satisfies SandboxInfo
          }),

        destroy: (id: string) =>
          Effect.gen(function* () {
            yield* checkFail("destroy")
            yield* addLatency
            yield* getSandbox(id)
            yield* Ref.update(sandboxes, (map) => {
              const newMap = new Map(map)
              newMap.delete(id)
              return newMap
            })
          }),

        status: (id: string) =>
          Effect.gen(function* () {
            yield* addLatency
            const sandbox = yield* getSandbox(id)
            return sandbox.status
          }),

        list: () =>
          Effect.gen(function* () {
            yield* addLatency
            const map = yield* Ref.get(sandboxes)
            return [...map.values()].map(
              (s): SandboxInfo => ({
                id: s.id,
                name: s.name,
                provider: "mock",
                status: s.status,
                createdAt: s.createdAt,
              }),
            )
          }),

        get: (id: string) =>
          Effect.gen(function* () {
            yield* addLatency
            const sandbox = yield* getSandbox(id)
            return {
              id: sandbox.id,
              name: sandbox.name,
              provider: "mock",
              status: sandbox.status,
              createdAt: sandbox.createdAt,
            } satisfies SandboxInfo
          }),

        run: (id: string, cmd: RunCommand) =>
          Effect.gen(function* () {
            yield* checkFail("run")
            yield* addLatency
            yield* getSandbox(id)

            if (config.commandHandler) {
              return config.commandHandler(id, cmd)
            }

            return {
              exitCode: 0,
              stdout: `mock output for: ${cmd.cmd} ${(cmd.args ?? []).join(" ")}`,
              stderr: "",
              durationMs: latency,
            } satisfies RunResult
          }),

        stream: (id: string, cmd: RunCommand) =>
          Stream.unwrap(
            Effect.gen(function* () {
              yield* getSandbox(id)
              const output = `mock stream output for: ${cmd.cmd} ${(cmd.args ?? []).join(" ")}`
              const chunk: ProcessChunk = {
                channel: "stdout",
                data: new TextEncoder().encode(output),
              }
              return Stream.fromIterable([chunk])
            }),
          ),

        readFile: (id: string, path: string, opts) =>
          Effect.gen(function* () {
            yield* checkFail("readFile")
            yield* addLatency
            const sandbox = yield* getSandbox(id)
            const content = sandbox.files.get(path)
            if (!content) {
              return yield* Effect.fail(
                new SandboxProviderError({ message: `File not found: ${path}` }),
              )
            }
            if (opts?.encoding === "utf8") {
              return new TextDecoder().decode(content)
            }
            return content
          }),

        writeFile: (id: string, path: string, content: Uint8Array | string) =>
          Effect.gen(function* () {
            yield* checkFail("writeFile")
            yield* addLatency
            const sandbox = yield* getSandbox(id)
            const data = typeof content === "string" ? new TextEncoder().encode(content) : content
            sandbox.files.set(path, data)
          }),

        listDir: (id: string, dirPath: string) =>
          Effect.gen(function* () {
            yield* addLatency
            const sandbox = yield* getSandbox(id)
            const entries: FsEntry[] = []
            const normalizedDir = dirPath.endsWith("/") ? dirPath : `${dirPath}/`

            for (const filePath of sandbox.files.keys()) {
              if (filePath.startsWith(normalizedDir)) {
                const relativePath = filePath.slice(normalizedDir.length)
                const parts = relativePath.split("/")
                if (parts.length === 1) {
                  entries.push({ path: filePath, type: "file" })
                } else {
                  const dirEntry = `${normalizedDir}${parts[0]}`
                  if (!entries.some((e) => e.path === dirEntry)) {
                    entries.push({ path: dirEntry, type: "dir" })
                  }
                }
              }
            }

            return entries
          }),

        mkdir: (id: string, _path: string) =>
          Effect.gen(function* () {
            yield* addLatency
            yield* getSandbox(id)
          }),

        rm: (id: string, path: string, opts) =>
          Effect.gen(function* () {
            yield* addLatency
            const sandbox = yield* getSandbox(id)
            if (opts?.recursive) {
              const prefix = path.endsWith("/") ? path : `${path}/`
              for (const filePath of sandbox.files.keys()) {
                if (filePath === path || filePath.startsWith(prefix)) {
                  sandbox.files.delete(filePath)
                }
              }
            } else {
              sandbox.files.delete(path)
            }
          }),

        snapshotCreate: (id: string, metadata) =>
          Effect.gen(function* () {
            yield* addLatency
            yield* getSandbox(id)
            const snapshotId = yield* generateId("snap")
            const createdAt = yield* currentTimestamp
            const info: SnapshotInfo = { id: snapshotId, createdAt, metadata }
            yield* Ref.update(snapshots, (map) => new Map(map).set(snapshotId, info))
            return info
          }),

        snapshotRestore: (id: string, snapshotId: string) =>
          Effect.gen(function* () {
            yield* addLatency
            yield* getSandbox(id)
            const snapshotMap = yield* Ref.get(snapshots)
            if (!snapshotMap.has(snapshotId)) {
              return yield* Effect.fail(new SandboxNotFoundError({ id: snapshotId }))
            }
          }),

        snapshotList: (id: string) =>
          Effect.gen(function* () {
            yield* addLatency
            yield* getSandbox(id)
            const map = yield* Ref.get(snapshots)
            return [...map.values()]
          }),

        runCode: (id: string, input: RunCodeInput) =>
          Effect.gen(function* () {
            yield* addLatency
            yield* getSandbox(id)
            return {
              exitCode: 0,
              stdout: `mock ${input.language} output`,
              stderr: "",
            } satisfies RunCodeResult
          }),

        volumeCreate: (name: string) =>
          Effect.gen(function* () {
            yield* addLatency
            const createdAt = yield* currentTimestamp
            const info: VolumeInfo = { id: name, name, createdAt }
            yield* Ref.update(volumes, (map) => new Map(map).set(name, info))
            return info
          }),

        volumeDelete: (name: string) =>
          Effect.gen(function* () {
            yield* addLatency
            yield* Ref.update(volumes, (map) => {
              const newMap = new Map(map)
              newMap.delete(name)
              return newMap
            })
          }),

        volumeList: () =>
          Effect.gen(function* () {
            yield* addLatency
            const map = yield* Ref.get(volumes)
            return [...map.values()]
          }),

        volumeGet: (name: string) =>
          Effect.gen(function* () {
            yield* addLatency
            const map = yield* Ref.get(volumes)
            const vol = map.get(name)
            if (!vol) {
              return yield* Effect.fail(new SandboxNotFoundError({ id: name }))
            }
            return vol
          }),

        startProcess: (id: string, opts: StartProcessOptions) =>
          Effect.gen(function* () {
            yield* addLatency
            const sandbox = yield* getSandbox(id)
            const processId = yield* generateId("proc")
            const info: ProcessInfo = { id: processId, status: "running" }
            sandbox.processes.set(processId, info)
            return info
          }),

        stopProcess: (id: string, processId: string) =>
          Effect.gen(function* () {
            yield* addLatency
            const sandbox = yield* getSandbox(id)
            const proc = sandbox.processes.get(processId)
            if (proc) {
              proc.status = "stopped"
            }
          }),

        getProcessUrls: (id: string, ports: number[]) =>
          Effect.gen(function* () {
            yield* addLatency
            yield* getSandbox(id)
            const urls: Record<number, string> = {}
            for (const port of ports) {
              urls[port] = `http://mock-sandbox:${port}`
            }
            return urls
          }),

        pause: undefined,
        resume: undefined,
        watch: undefined,
      }

      return driver
    }),
  )

/**
 * Get a reference to the internal sandbox state for test assertions.
 * Use with MockDriverLive to inspect sandbox files and state.
 */
export const MockDriverWithState = (config: MockDriverConfig = {}) =>
  Effect.gen(function* () {
    const sandboxes = yield* Ref.make(new Map<string, MockSandboxState>(config.initialSandboxes?.map((s) => [s.id, s])))
    const volumes = yield* Ref.make(new Map<string, VolumeInfo>(config.initialVolumes?.map((v) => [v.name, v])))

    const layer = MockDriverLive(config)

    return {
      layer,
      getSandboxes: () => Ref.get(sandboxes),
      getVolumes: () => Ref.get(volumes),
    }
  })

/**
 * Create a failing mock driver that errors on all operations.
 * Useful for testing error handling.
 */
export const FailingMockDriverLive = (errorMessage = "Mock failure") =>
  MockDriverLive({
    failOperations: {
      create: true,
      destroy: true,
      run: true,
      readFile: true,
      writeFile: true,
    },
    errorMessage,
  })

/**
 * Create a slow mock driver with configurable latency.
 * Useful for testing timeout and cancellation behavior.
 */
export const SlowMockDriverLive = (latencyMs: number) => MockDriverLive({ latencyMs })
