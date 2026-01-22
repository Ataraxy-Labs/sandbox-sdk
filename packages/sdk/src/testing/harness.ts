import { Effect, Layer, Fiber, Duration, Exit, Scope } from "effect"
import type { SandboxDriverService } from "../driver"
import { SandboxDriver } from "../driver"
import type { SandboxError } from "../errors"
import type { SandboxInfo, RunResult } from "../types"
import { acquireSandbox, withManagedSandbox, withManagedSandboxTimeout } from "../scoped"

/**
 * Test harness configuration options.
 */
export interface TestHarnessConfig {
  /** Timeout for each test operation (default: 60 seconds) */
  operationTimeoutMs?: number
  /** Auto-cleanup sandboxes after test (default: true) */
  autoCleanup?: boolean
  /** Log operations for debugging (default: false) */
  verbose?: boolean
}

/**
 * Test harness for running sandbox integration tests.
 *
 * Provides lifecycle management, cleanup, and assertion helpers.
 *
 * @example
 * ```ts
 * const harness = TestHarness.create({ verbose: true })
 *
 * const test = harness.test(
 *   "should run commands",
 *   Effect.gen(function* () {
 *     const sandbox = yield* harness.createSandbox({ image: "alpine:3.21" })
 *     const result = yield* harness.run(sandbox.id, { cmd: "echo", args: ["hello"] })
 *     harness.assertExitCode(result, 0)
 *     harness.assertStdoutContains(result, "hello")
 *   })
 * )
 *
 * await Effect.runPromise(test.pipe(Effect.provide(DockerDriverLive)))
 * ```
 */
export class TestHarness {
  private createdSandboxes: string[] = []
  private createdVolumes: string[] = []

  constructor(private readonly config: TestHarnessConfig = {}) {}

  static create(config: TestHarnessConfig = {}) {
    return new TestHarness(config)
  }

  private logEffect(message: string) {
    if (!this.config.verbose) return Effect.void
    return Effect.logDebug(message).pipe(Effect.annotateLogs({ component: "TestHarness" }))
  }

  private get timeoutMs() {
    return this.config.operationTimeoutMs ?? 60_000
  }

  /**
   * Create a sandbox and track it for cleanup.
   */
  createSandbox(opts: Parameters<SandboxDriverService["create"]>[0]) {
    return Effect.gen(this, function* () {
      yield* this.logEffect(`Creating sandbox with image: ${opts.image}`)
      const driver = yield* SandboxDriver
      const info = yield* driver.create(opts).pipe(Effect.timeoutFail({
        duration: `${this.timeoutMs} millis`,
        onTimeout: () => new Error("Sandbox creation timed out"),
      }))
      this.createdSandboxes.push(info.id)
      yield* this.logEffect(`Created sandbox: ${info.id}`)
      return info
    })
  }

  /**
   * Run a command in a sandbox.
   */
  run(sandboxId: string, cmd: Parameters<SandboxDriverService["run"]>[1]) {
    return Effect.gen(this, function* () {
      yield* this.logEffect(`Running command in ${sandboxId}: ${cmd.cmd} ${(cmd.args ?? []).join(" ")}`)
      const driver = yield* SandboxDriver
      const result = yield* driver.run(sandboxId, cmd).pipe(Effect.timeoutFail({
        duration: `${this.timeoutMs} millis`,
        onTimeout: () => new Error("Command execution timed out"),
      }))
      yield* this.logEffect(`Command completed with exit code: ${result.exitCode}`)
      return result
    })
  }

  /**
   * Create a volume and track it for cleanup.
   */
  createVolume(name: string) {
    return Effect.gen(this, function* () {
      yield* this.logEffect(`Creating volume: ${name}`)
      const driver = yield* SandboxDriver
      if (!driver.volumeCreate) {
        return yield* Effect.fail(new Error("Volume operations not supported"))
      }
      const vol = yield* driver.volumeCreate(name)
      this.createdVolumes.push(name)
      yield* this.logEffect(`Created volume: ${name}`)
      return vol
    })
  }

  /**
   * Clean up all tracked sandboxes and volumes.
   */
  cleanup() {
    return Effect.gen(this, function* () {
      const driver = yield* SandboxDriver

      for (const id of this.createdSandboxes) {
        yield* this.logEffect(`Destroying sandbox: ${id}`)
        yield* driver.destroy(id).pipe(Effect.catchAll(() => Effect.void))
      }
      this.createdSandboxes = []

      if (driver.volumeDelete) {
        for (const name of this.createdVolumes) {
          yield* this.logEffect(`Deleting volume: ${name}`)
          yield* driver.volumeDelete(name).pipe(Effect.catchAll(() => Effect.void))
        }
      }
      this.createdVolumes = []

      yield* this.logEffect("Cleanup complete")
    })
  }

  /**
   * Wrap a test effect with automatic cleanup.
   */
  test<A>(name: string, testEffect: Effect.Effect<A, SandboxError, SandboxDriver>) {
    return Effect.gen(this, function* () {
      yield* this.logEffect(`Starting test: ${name}`)
      try {
        return yield* testEffect
      } finally {
        if (this.config.autoCleanup !== false) {
          yield* this.cleanup()
        }
      }
    })
  }

  /**
   * Assert that a command exited with the expected code.
   */
  assertExitCode(result: RunResult, expected: number): void {
    if (result.exitCode !== expected) {
      throw new Error(
        `Expected exit code ${expected}, got ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      )
    }
  }

  /**
   * Assert that stdout contains the expected string.
   */
  assertStdoutContains(result: RunResult, expected: string): void {
    if (!result.stdout.includes(expected)) {
      throw new Error(`Expected stdout to contain "${expected}", got: ${result.stdout}`)
    }
  }

  /**
   * Assert that stderr contains the expected string.
   */
  assertStderrContains(result: RunResult, expected: string): void {
    if (!result.stderr.includes(expected)) {
      throw new Error(`Expected stderr to contain "${expected}", got: ${result.stderr}`)
    }
  }

  /**
   * Assert that stdout matches the expected pattern.
   */
  assertStdoutMatches(result: RunResult, pattern: RegExp): void {
    if (!pattern.test(result.stdout)) {
      throw new Error(`Expected stdout to match ${pattern}, got: ${result.stdout}`)
    }
  }
}

/**
 * Run an integration test with the given driver layer.
 *
 * @example
 * ```ts
 * await runIntegrationTest(
 *   DockerDriverLive,
 *   Effect.gen(function* () {
 *     const driver = yield* SandboxDriver
 *     const info = yield* driver.create({ image: "alpine:3.21" })
 *     expect(info.status).toBe("ready")
 *     yield* driver.destroy(info.id)
 *   })
 * )
 * ```
 */
export const runIntegrationTest = <A, E, R>(
  driverLayer: Layer.Layer<SandboxDriver, E, R>,
  test: Effect.Effect<A, SandboxError, SandboxDriver>,
): Promise<A> =>
  Effect.runPromise(
    test.pipe(Effect.provide(driverLayer as Layer.Layer<SandboxDriver, never, never>)),
  )

/**
 * Create a test suite runner for a specific driver.
 *
 * @example
 * ```ts
 * const suite = createDriverTestSuite(DockerDriverLive, "Docker")
 *
 * describe("Docker Driver", () => {
 *   suite.testLive("should create sandbox", (driver) =>
 *     Effect.gen(function* () {
 *       const info = yield* driver.create({ image: "alpine" })
 *       yield* driver.destroy(info.id)
 *     })
 *   )
 * })
 * ```
 */
export const createDriverTestSuite = <E, R>(
  driverLayer: Layer.Layer<SandboxDriver, E, R>,
  driverName: string,
  options: { skip?: boolean; timeout?: number } = {},
) => {
  const checkAvailability = async (): Promise<boolean> => {
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          yield* driver.list()
          return true
        }).pipe(
          Effect.provide(driverLayer as Layer.Layer<SandboxDriver, never, never>),
          Effect.timeout("10 seconds"),
          Effect.catchAll(() => Effect.succeed(false)),
        ),
      )
      return result === true
    } catch {
      return false
    }
  }

  return {
    name: driverName,

    /**
     * Run a test that requires the driver to be available.
     */
    testLive: (
      name: string,
      testFn: (driver: SandboxDriverService) => Effect.Effect<void, SandboxError, SandboxDriver>,
      timeout = options.timeout ?? 60000,
    ) => ({
      name,
      run: async () => {
        if (options.skip) {
          console.log(`⏭️  Skipping: ${name} (suite disabled)`)
          return
        }

        const available = await checkAvailability()
        if (!available) {
          console.log(`⏭️  Skipping: ${name} (${driverName} not available)`)
          return
        }

        await Effect.runPromise(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            yield* testFn(driver)
          }).pipe(
            Effect.provide(driverLayer as Layer.Layer<SandboxDriver, never, never>),
            Effect.timeout(`${timeout} millis`),
          ),
        )
      },
      timeout,
    }),

    /**
     * Run a test that doesn't require the actual driver.
     */
    testUnit: (
      name: string,
      testFn: () => Effect.Effect<void, SandboxError, SandboxDriver>,
    ) => ({
      name,
      run: async () => {
        await Effect.runPromise(
          testFn().pipe(Effect.provide(driverLayer as Layer.Layer<SandboxDriver, never, never>)),
        )
      },
    }),
  }
}

/**
 * Helper to wait for a sandbox to be ready with polling.
 */
export const waitForSandboxReady = (
  sandboxId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
) =>
  Effect.gen(function* () {
    const driver = yield* SandboxDriver
    const timeoutMs = options.timeoutMs ?? 60_000
    const pollIntervalMs = options.pollIntervalMs ?? 1000
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const status = yield* driver.status(sandboxId)
      if (status === "ready") {
        return true
      }
      if (status === "failed" || status === "stopped") {
        return yield* Effect.fail(new Error(`Sandbox ${sandboxId} entered ${status} state`))
      }
      yield* Effect.sleep(`${pollIntervalMs} millis`)
    }

    return yield* Effect.fail(new Error(`Timeout waiting for sandbox ${sandboxId} to be ready`))
  })

/**
 * Helper to run a command and assert it succeeds.
 */
export const runAndExpectSuccess = (
  sandboxId: string,
  cmd: Parameters<SandboxDriverService["run"]>[1],
) =>
  Effect.gen(function* () {
    const driver = yield* SandboxDriver
    const result = yield* driver.run(sandboxId, cmd)
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr}`),
      )
    }
    return result
  })

/**
 * Helper to create a sandbox and run cleanup on scope close.
 *
 * Uses Effect.acquireRelease for proper resource management.
 * The sandbox is automatically destroyed when the effect completes,
 * fails, or is cancelled.
 *
 * @example
 * ```ts
 * await Effect.runPromise(
 *   withSandbox({ image: "alpine:3.21" }, (sandbox) =>
 *     SandboxDriver.pipe(
 *       Effect.flatMap((d) => d.run(sandbox.id, { cmd: "echo", args: ["hello"] }))
 *     )
 *   ).pipe(Effect.provide(DockerDriverLive))
 * )
 * ```
 */
export const withSandbox = withManagedSandbox

/**
 * Acquire a sandbox as a scoped resource for manual scope management.
 *
 * Re-exported from scoped.ts for convenience in tests.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const sandbox = yield* scopedSandbox({ image: "alpine" })
 *     // sandbox auto-destroyed when scope closes
 *   })
 * )
 * ```
 */
export const scopedSandbox = acquireSandbox

/**
 * Run a test with a managed sandbox and timeout.
 *
 * @example
 * ```ts
 * await Effect.runPromise(
 *   withSandboxTimeout({ image: "node:22" }, "5 minutes", (sandbox) =>
 *     longRunningTest(sandbox)
 *   ).pipe(Effect.provide(DockerDriverLive))
 * )
 * ```
 */
export const withSandboxTimeout = withManagedSandboxTimeout
