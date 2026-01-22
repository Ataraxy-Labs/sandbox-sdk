import type { RunCommand, RunResult, ProcessChunk } from "../types"
import type { SandboxDriverService } from "../driver"

export interface CommandData {
  id: string
  sandboxId: string
  cmd: string
  args: string[]
  cwd?: string
  startedAt: number
  exitCode: number | null
}

/**
 * A command executed in a Sandbox.
 *
 * For detached commands, you can {@link wait} to get a {@link CommandResult} instance
 * with the populated exit code. For non-detached commands, {@link Sandbox.runCommand}
 * automatically waits and returns a {@link CommandResult} instance.
 *
 * You can iterate over command output with {@link logs}.
 *
 * @see {@link Sandbox.runCommand} to start a command.
 */
export class Command {
  protected readonly driver: SandboxDriverService
  protected readonly sandboxId: string
  protected readonly spec: RunCommand
  private _exitCode: number | null = null
  private outputCache: Promise<{ stdout: string; stderr: string; both: string }> | null = null
  private _result: RunResult | null = null

  /**
   * The exit code of the command. Null if command hasn't finished.
   */
  get exitCode(): number | null {
    return this._exitCode
  }

  constructor(opts: { driver: SandboxDriverService; sandboxId: string; spec: RunCommand }) {
    this.driver = opts.driver
    this.sandboxId = opts.sandboxId
    this.spec = opts.spec
  }

  /**
   * Execute the command and wait for it to complete.
   * @returns A promise resolving to the command result.
   */
  async run(): Promise<CommandResult> {
    if (this._result) {
      return new CommandResult({
        driver: this.driver,
        sandboxId: this.sandboxId,
        spec: this.spec,
        result: this._result,
      })
    }

    const { Effect } = await import("effect")
    const result = await Effect.runPromise(this.driver.run(this.sandboxId, this.spec))
    this._exitCode = result.exitCode
    this._result = result

    return new CommandResult({
      driver: this.driver,
      sandboxId: this.sandboxId,
      spec: this.spec,
      result,
    })
  }

  /**
   * Stream the command output as an async iterable.
   * @returns An async iterable of process chunks.
   */
  async *stream(): AsyncIterable<ProcessChunk> {
    const { Effect, Stream } = await import("effect")

    const chunks: ProcessChunk[] = []
    let resolve: (() => void) | null = null
    let reject: ((err: Error) => void) | null = null
    let done = false

    const streamEffect = Stream.runForEach(this.driver.stream(this.sandboxId, this.spec), (chunk) =>
      Effect.sync(() => {
        chunks.push(chunk)
        resolve?.()
      }),
    )

    Effect.runPromise(streamEffect)
      .then(() => {
        done = true
        resolve?.()
      })
      .catch((err) => {
        done = true
        reject?.(err instanceof Error ? err : new Error(String(err)))
      })

    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!
      } else if (!done) {
        await new Promise<void>((res, rej) => {
          resolve = res
          reject = rej
        })
      }
    }
  }

  /**
   * Get cached output, fetching logs only once and reusing for concurrent calls.
   */
  private async getCachedOutput(): Promise<{ stdout: string; stderr: string; both: string }> {
    if (!this.outputCache) {
      this.outputCache = (async () => {
        const decoder = new TextDecoder()
        let stdout = ""
        let stderr = ""
        let both = ""

        for await (const chunk of this.stream()) {
          const text = decoder.decode(chunk.data)
          both += text
          if (chunk.channel === "stdout") {
            stdout += text
          } else {
            stderr += text
          }
        }

        return { stdout, stderr, both }
      })()
    }

    return this.outputCache
  }

  /**
   * Get the stdout output as a string.
   */
  async getStdout(): Promise<string> {
    const cached = await this.getCachedOutput()
    return cached.stdout
  }

  /**
   * Get the stderr output as a string.
   */
  async getStderr(): Promise<string> {
    const cached = await this.getCachedOutput()
    return cached.stderr
  }

  /**
   * Get both stdout and stderr combined as a string.
   */
  async getOutput(): Promise<string> {
    const cached = await this.getCachedOutput()
    return cached.both
  }
}

/**
 * A command that has finished executing.
 * The exit code is immediately available and populated upon creation.
 */
export class CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly durationMs?: number

  private readonly driver: SandboxDriverService
  private readonly sandboxId: string
  private readonly spec: RunCommand

  constructor(opts: {
    driver: SandboxDriverService
    sandboxId: string
    spec: RunCommand
    result: RunResult
  }) {
    this.driver = opts.driver
    this.sandboxId = opts.sandboxId
    this.spec = opts.spec
    this.exitCode = opts.result.exitCode
    this.stdout = opts.result.stdout
    this.stderr = opts.result.stderr
    this.durationMs = opts.result.durationMs
  }

  /**
   * Parse stdout as JSON.
   * @returns The parsed JSON value.
   */
  json<T = unknown>(): T {
    return JSON.parse(this.stdout) as T
  }

  /**
   * Get stdout trimmed.
   */
  text(): string {
    return this.stdout.trim()
  }

  /**
   * Create a new Command to re-run this command.
   */
  toCommand(): Command {
    return new Command({
      driver: this.driver,
      sandboxId: this.sandboxId,
      spec: this.spec,
    })
  }
}
