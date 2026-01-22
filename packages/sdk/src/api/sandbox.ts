import type {
  CreateOptions,
  SandboxInfo,
  SandboxStatus,
  RunCommand,
  FsEntry,
  ReadFileOptions,
  WriteFileOptions,
  ListOptions,
  RmOptions,
  SnapshotInfo,
  RunCodeInput,
  RunCodeResult,
  StartProcessOptions,
  ProcessInfo,
} from "../types"
import type { SandboxDriverService } from "../driver"
import { SandboxValidationError, SandboxProviderError } from "../errors"
import { Command, CommandResult } from "./command"

/**
 * Configuration for creating a sandbox with a specific provider.
 */
export interface ProviderConfig {
  driver: SandboxDriverService
}

/**
 * Options for Sandbox.create() method.
 */
export interface SandboxCreateOptions extends CreateOptions {
  provider: ProviderConfig
}

/**
 * Options for Sandbox.get() method.
 */
export interface SandboxGetOptions {
  id: string
  provider: ProviderConfig
}

/**
 * Options for Sandbox.list() method.
 */
export interface SandboxListOptions {
  provider: ProviderConfig
}

/**
 * A Sandbox is an isolated Linux environment to run commands in.
 *
 * Use {@link Sandbox.create} or {@link Sandbox.get} to construct.
 *
 * @example
 * ```ts
 * // Create a sandbox with automatic cleanup
 * await using sandbox = await Sandbox.create({
 *   image: "alpine:3.21",
 *   provider: { driver: modalDriver },
 * });
 *
 * // Run a command
 * const result = await sandbox.runCommand("echo", ["Hello, World!"]);
 * console.log(result.stdout); // "Hello, World!\n"
 *
 * // Sandbox automatically stopped at the end of the block
 * ```
 */
export class Sandbox implements AsyncDisposable {
  private readonly driver: SandboxDriverService
  private _info: SandboxInfo
  private _stopped = false

  /**
   * Unique ID of this sandbox.
   */
  get id(): string {
    return this._info.id
  }

  /**
   * The sandbox metadata.
   */
  get info(): SandboxInfo {
    return this._info
  }

  /**
   * The provider name.
   */
  get provider(): string {
    return this._info.provider
  }

  /**
   * The public URL of this sandbox (if available).
   */
  get url(): string | undefined {
    return this._info.url
  }

  /**
   * The creation date of the sandbox.
   */
  get createdAt(): Date {
    return new Date(this._info.createdAt)
  }

  /**
   * File system operations for this sandbox.
   */
  readonly fs: SandboxFileSystem

  /**
   * Create a new Sandbox instance.
   * @internal Use {@link Sandbox.create} or {@link Sandbox.get} instead.
   */
  constructor(opts: { driver: SandboxDriverService; info: SandboxInfo }) {
    this.driver = opts.driver
    this._info = opts.info
    this.fs = new SandboxFileSystem(this.driver, this.id)
  }

  /**
   * Create a new sandbox.
   *
   * @param opts - Creation parameters including provider configuration.
   * @returns A promise resolving to the created {@link Sandbox}.
   *
   * @example
   * ```ts
   * // Create with automatic cleanup using await using
   * await using sandbox = await Sandbox.create({
   *   image: "node:22",
   *   provider: { driver: modalDriver },
   * });
   *
   * // Create without auto-cleanup
   * const sandbox = await Sandbox.create({
   *   image: "python:3.12",
   *   timeoutMs: 600000,
   *   provider: { driver: e2bDriver },
   * });
   * ```
   */
  static async create(opts: SandboxCreateOptions): Promise<Sandbox> {
    const { Effect } = await import("effect")
    const info = await Effect.runPromise(opts.provider.driver.create(opts))
    return new Sandbox({ driver: opts.provider.driver, info })
  }

  /**
   * Retrieve an existing sandbox by ID.
   *
   * @param opts - Get parameters including provider configuration.
   * @returns A promise resolving to the {@link Sandbox}.
   *
   * @example
   * ```ts
   * const sandbox = await Sandbox.get({
   *   id: "sbx-abc123",
   *   provider: { driver: modalDriver },
   * });
   * ```
   */
  static async get(opts: SandboxGetOptions): Promise<Sandbox> {
    const { Effect } = await import("effect")
    const info = await Effect.runPromise(opts.provider.driver.get(opts.id))
    return new Sandbox({ driver: opts.provider.driver, info })
  }

  /**
   * List all sandboxes.
   *
   * @param opts - List parameters including provider configuration.
   * @returns A promise resolving to an array of {@link SandboxInfo}.
   *
   * @example
   * ```ts
   * const sandboxes = await Sandbox.list({
   *   provider: { driver: modalDriver },
   * });
   * ```
   */
  static async list(opts: SandboxListOptions): Promise<readonly SandboxInfo[]> {
    const { Effect } = await import("effect")
    return Effect.runPromise(opts.provider.driver.list())
  }

  /**
   * Get the current status of the sandbox.
   */
  async status(): Promise<SandboxStatus> {
    const { Effect } = await import("effect")
    return Effect.runPromise(this.driver.status(this.id))
  }

  /**
   * Stop the sandbox.
   */
  async stop(): Promise<void> {
    if (this._stopped) return
    const { Effect } = await import("effect")
    await Effect.runPromise(this.driver.destroy(this.id))
    this._stopped = true
  }

  /**
   * Alias for stop().
   */
  async destroy(): Promise<void> {
    return this.stop()
  }

  /**
   * AsyncDisposable implementation for use with `await using`.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop().catch(() => {})
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Command Execution
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Execute a command in the sandbox.
   *
   * @param cmd - The command to execute.
   * @param args - Arguments to pass to the command.
   * @returns A promise resolving to the command result.
   *
   * @example
   * ```ts
   * const result = await sandbox.runCommand("npm", ["install"]);
   * if (result.exitCode !== 0) {
   *   console.error("Install failed:", result.stderr);
   * }
   * ```
   */
  async runCommand(cmd: string, args?: string[]): Promise<CommandResult>

  /**
   * Execute a command in the sandbox with full options.
   *
   * @param params - Command parameters.
   * @returns A promise resolving to the command result.
   *
   * @example
   * ```ts
   * const result = await sandbox.runCommand({
   *   cmd: "npm",
   *   args: ["run", "build"],
   *   cwd: "/app",
   *   env: { NODE_ENV: "production" },
   * });
   * ```
   */
  async runCommand(params: RunCommand): Promise<CommandResult>

  async runCommand(cmdOrParams: string | RunCommand, args?: string[]): Promise<CommandResult> {
    const spec: RunCommand =
      typeof cmdOrParams === "string" ? { cmd: cmdOrParams, args } : cmdOrParams

    const command = new Command({
      driver: this.driver,
      sandboxId: this.id,
      spec,
    })

    return command.run()
  }

  /**
   * Create a command without executing it.
   * Useful for streaming output or detached execution.
   *
   * @param cmd - The command to execute.
   * @param args - Arguments to pass to the command.
   * @param opts - Additional command options.
   * @returns A {@link Command} instance.
   *
   * @example
   * ```ts
   * const command = sandbox.command("npm", ["run", "dev"]);
   *
   * // Stream output
   * for await (const chunk of command.stream()) {
   *   process.stdout.write(chunk.data);
   * }
   * ```
   */
  command(cmd: string, args?: string[], opts?: Omit<RunCommand, "cmd" | "args">): Command {
    return new Command({
      driver: this.driver,
      sandboxId: this.id,
      spec: { cmd, args, ...opts },
    })
  }

  /**
   * Execute code in a specific language.
   *
   * @param input - Code execution parameters.
   * @returns A promise resolving to the code execution result.
   *
   * @example
   * ```ts
   * const result = await sandbox.runCode({
   *   language: "python",
   *   code: "print('Hello from Python!')",
   * });
   * console.log(result.stdout); // "Hello from Python!\n"
   * ```
   */
  async runCode(input: RunCodeInput): Promise<RunCodeResult> {
    const runCode = this.driver.runCode
    if (!runCode) {
      throw new SandboxValidationError({
        message: "runCode is not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(runCode(this.id, input))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // URL / Domain Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the public URL for a port exposed by this sandbox.
   *
   * @param port - Port number to get the URL for.
   * @returns A promise resolving to the full URL (e.g., `https://subdomain.example.run`).
   *
   * @example
   * ```ts
   * // Start a dev server
   * await sandbox.runCommand({ cmd: "npm", args: ["run", "dev"], detached: true });
   *
   * // Get the URL
   * const url = await sandbox.domain(3000);
   * console.log(`Open ${url} in your browser`);
   * ```
   */
  async domain(port: number): Promise<string> {
    const getProcessUrls = this.driver.getProcessUrls
    if (!getProcessUrls) {
      // Fall back to base URL if available
      if (this._info.url) {
        return `${this._info.url}:${port}`
      }
      throw new SandboxValidationError({
        message: "domain() is not supported by this provider and no base URL is available",
      })
    }

    const { Effect } = await import("effect")
    const urls = await Effect.runPromise(getProcessUrls(this.id, [port]))
    const url = urls[port]

    if (!url) {
      throw new SandboxProviderError({
        message: `No URL available for port ${port}. Make sure the port is exposed.`,
      })
    }

    return url
  }

  /**
   * Get URLs for multiple ports.
   *
   * @param ports - Array of port numbers.
   * @returns A promise resolving to a map of port to URL.
   */
  async getUrls(ports: number[]): Promise<Record<number, string>> {
    const getProcessUrls = this.driver.getProcessUrls
    if (!getProcessUrls) {
      throw new SandboxValidationError({
        message: "getUrls is not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(getProcessUrls(this.id, ports))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Process Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start a background process in the sandbox.
   *
   * @param opts - Process options.
   * @returns A promise resolving to process information.
   *
   * @example
   * ```ts
   * const proc = await sandbox.startProcess({
   *   cmd: "npm",
   *   args: ["run", "dev"],
   *   background: true,
   *   exposedPorts: [3000],
   * });
   * ```
   */
  async startProcess(opts: StartProcessOptions): Promise<ProcessInfo> {
    const startProcess = this.driver.startProcess
    if (!startProcess) {
      throw new SandboxValidationError({
        message: "startProcess is not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(startProcess(this.id, opts))
  }

  /**
   * Stop a background process.
   *
   * @param processId - The process ID to stop.
   */
  async stopProcess(processId: string): Promise<void> {
    const stopProcess = this.driver.stopProcess
    if (!stopProcess) {
      throw new SandboxValidationError({
        message: "stopProcess is not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(stopProcess(this.id, processId))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Snapshots
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a snapshot from this currently running sandbox.
   * New sandboxes can then be created from this snapshot.
   *
   * Note: Some providers may stop the sandbox as part of the snapshot creation process.
   *
   * @param metadata - Optional metadata to associate with the snapshot.
   * @returns A promise resolving to the snapshot information.
   *
   * @example
   * ```ts
   * // Set up the sandbox
   * await sandbox.runCommand("npm", ["install"]);
   *
   * // Create a snapshot
   * const snapshot = await sandbox.snapshot({ name: "dependencies-installed" });
   * console.log(`Snapshot ID: ${snapshot.id}`);
   * ```
   */
  async snapshot(metadata?: Record<string, unknown>): Promise<SnapshotInfo> {
    const snapshotCreate = this.driver.snapshotCreate
    if (!snapshotCreate) {
      throw new SandboxValidationError({
        message: "Snapshots are not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(snapshotCreate(this.id, metadata))
  }

  /**
   * Restore a snapshot to this sandbox.
   *
   * @param snapshotId - The snapshot ID to restore.
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshotRestore = this.driver.snapshotRestore
    if (!snapshotRestore) {
      throw new SandboxValidationError({
        message: "Snapshot restore is not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(snapshotRestore(this.id, snapshotId))
  }

  /**
   * List all snapshots for this sandbox.
   *
   * @returns A promise resolving to an array of snapshot information.
   */
  async listSnapshots(): Promise<readonly SnapshotInfo[]> {
    const snapshotList = this.driver.snapshotList
    if (!snapshotList) {
      throw new SandboxValidationError({
        message: "Snapshot listing is not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(snapshotList(this.id))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Pause the sandbox (if supported).
   */
  async pause(): Promise<void> {
    const pause = this.driver.pause
    if (!pause) {
      throw new SandboxValidationError({
        message: "pause is not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(pause(this.id))
  }

  /**
   * Resume a paused sandbox (if supported).
   */
  async resume(): Promise<void> {
    const resume = this.driver.resume
    if (!resume) {
      throw new SandboxValidationError({
        message: "resume is not supported by this provider",
      })
    }

    const { Effect } = await import("effect")
    return Effect.runPromise(resume(this.id))
  }
}

/**
 * File system operations for a sandbox.
 */
class SandboxFileSystem {
  constructor(
    private readonly driver: SandboxDriverService,
    private readonly sandboxId: string,
  ) {}

  /**
   * Read a file from the sandbox.
   *
   * @param path - Path to the file.
   * @param opts - Read options.
   * @returns A promise resolving to the file contents.
   *
   * @example
   * ```ts
   * const content = await sandbox.fs.readFile("/app/package.json", { encoding: "utf8" });
   * const pkg = JSON.parse(content as string);
   * ```
   */
  async readFile(path: string, opts?: ReadFileOptions): Promise<Uint8Array | string> {
    const { Effect } = await import("effect")
    return Effect.runPromise(this.driver.readFile(this.sandboxId, path, opts))
  }

  /**
   * Read a file as text.
   *
   * @param path - Path to the file.
   * @returns A promise resolving to the file contents as a string.
   */
  async readText(path: string): Promise<string> {
    const result = await this.readFile(path, { encoding: "utf8" })
    return typeof result === "string" ? result : new TextDecoder().decode(result)
  }

  /**
   * Read a file as JSON.
   *
   * @param path - Path to the file.
   * @returns A promise resolving to the parsed JSON.
   */
  async readJson<T = unknown>(path: string): Promise<T> {
    const text = await this.readText(path)
    return JSON.parse(text) as T
  }

  /**
   * Write content to a file in the sandbox.
   *
   * @param path - Path to the file.
   * @param content - Content to write.
   * @param opts - Write options.
   *
   * @example
   * ```ts
   * await sandbox.fs.writeFile("/app/config.json", JSON.stringify({ debug: true }));
   * ```
   */
  async writeFile(
    path: string,
    content: Uint8Array | string,
    opts?: WriteFileOptions,
  ): Promise<void> {
    const { Effect } = await import("effect")
    return Effect.runPromise(this.driver.writeFile(this.sandboxId, path, content, opts))
  }

  /**
   * Write text to a file.
   *
   * @param path - Path to the file.
   * @param text - Text content to write.
   */
  async writeText(path: string, text: string): Promise<void> {
    return this.writeFile(path, text, { create: true, truncate: true })
  }

  /**
   * Write JSON to a file.
   *
   * @param path - Path to the file.
   * @param data - Data to serialize as JSON.
   */
  async writeJson(path: string, data: unknown): Promise<void> {
    return this.writeText(path, JSON.stringify(data, null, 2))
  }

  /**
   * List files and directories.
   *
   * @param path - Path to list.
   * @param opts - List options.
   * @returns A promise resolving to an array of file system entries.
   *
   * @example
   * ```ts
   * const entries = await sandbox.fs.list("/app");
   * for (const entry of entries) {
   *   console.log(`${entry.type}: ${entry.path}`);
   * }
   * ```
   */
  async list(path: string, opts?: ListOptions): Promise<readonly FsEntry[]> {
    const { Effect } = await import("effect")
    return Effect.runPromise(this.driver.listDir(this.sandboxId, path, opts))
  }

  /**
   * Create a directory.
   *
   * @param path - Path to create.
   *
   * @example
   * ```ts
   * await sandbox.fs.mkdir("/app/dist");
   * ```
   */
  async mkdir(path: string): Promise<void> {
    const { Effect } = await import("effect")
    return Effect.runPromise(this.driver.mkdir(this.sandboxId, path))
  }

  /**
   * Remove a file or directory.
   *
   * @param path - Path to remove.
   * @param opts - Remove options.
   *
   * @example
   * ```ts
   * // Remove a file
   * await sandbox.fs.rm("/app/temp.txt");
   *
   * // Remove a directory recursively
   * await sandbox.fs.rm("/app/node_modules", { recursive: true });
   * ```
   */
  async rm(path: string, opts?: RmOptions): Promise<void> {
    const { Effect } = await import("effect")
    return Effect.runPromise(this.driver.rm(this.sandboxId, path, opts))
  }

  /**
   * Check if a path exists.
   *
   * @param path - Path to check.
   * @returns A promise resolving to true if the path exists.
   */
  async exists(path: string): Promise<boolean> {
    try {
      await this.readFile(path)
      return true
    } catch {
      return false
    }
  }
}
