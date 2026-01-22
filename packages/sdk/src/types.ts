export interface CreateOptions {
  /**
   * The container image to use (e.g., "alpine:3.21", "node:22", "python:3.12").
   */
  image: string
  /**
   * Optional name for the sandbox.
   */
  name?: string
  /**
   * Timeout in milliseconds before the sandbox auto-terminates.
   * @default 300000 (5 minutes)
   */
  timeoutMs?: number
  /**
   * Idle timeout in milliseconds. Sandbox will terminate after this period of inactivity.
   */
  idleTimeoutMs?: number
  /**
   * GPU type to request (provider-specific, e.g., "T4", "A100").
   */
  gpu?: string
  /**
   * Number of CPU cores to allocate.
   */
  cpu?: number
  /**
   * Memory in MiB to allocate.
   */
  memoryMiB?: number
  /**
   * Environment variables to set in the sandbox.
   */
  env?: Record<string, string>
  /**
   * Working directory inside the sandbox.
   */
  workdir?: string
  /**
   * Volume mounts: { mountPath: volumeName }
   */
  volumes?: Record<string, string>
  /**
   * Cloud bucket mounts for persistent storage.
   */
  cloudBucketMounts?: Record<string, CloudBucketMount>
  /**
   * Command to run as the entrypoint (for long-running servers).
   */
  command?: string[]
  /**
   * Ports to expose via encrypted tunnels (TLS).
   */
  encryptedPorts?: number[]
  /**
   * Ports to expose via unencrypted tunnels (raw TCP).
   */
  unencryptedPorts?: number[]
  /**
   * Source to initialize the sandbox from (git repository or tarball).
   */
  source?: SandboxSource
  /**
   * Resources to allocate (alternative to cpu/memoryMiB for some providers).
   */
  resources?: { vcpus?: number; memoryMb?: number }
  /**
   * Runtime environment (provider-specific, e.g., "node22", "python3.13").
   */
  runtime?: string
}

/**
 * Source configuration for initializing a sandbox.
 */
export type SandboxSource =
  | {
      type: "git"
      url: string
      depth?: number
      revision?: string
      username?: string
      password?: string
    }
  | {
      type: "tarball"
      url: string
    }
  | {
      type: "snapshot"
      snapshotId: string
    }

export type SandboxStatus = "creating" | "ready" | "stopped" | "failed"

export interface SandboxInfo {
  id: string
  name?: string
  provider: string
  status: SandboxStatus
  url?: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface ProviderInfo {
  id: string
  name: string
  gpuTypes?: string[]
  features?: string[]
}

export interface RunCommand {
  cmd: string
  args?: ReadonlyArray<string>
  cwd?: string
  env?: Record<string, string>
  stdin?: string | Uint8Array
  timeoutMs?: number
}

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs?: number
}

export type StreamChannel = "stdout" | "stderr"

export interface ProcessChunk {
  channel: StreamChannel
  data: Uint8Array
}

export interface FsEntry {
  path: string
  type: "file" | "dir"
  size?: number
  modifiedAt?: string
}

export interface ReadFileOptions {
  encoding?: "utf8" | "binary"
}

export interface WriteFileOptions {
  create?: boolean
  truncate?: boolean
}

export interface ListOptions {
  recursive?: boolean
}

export interface RmOptions {
  recursive?: boolean
  force?: boolean
}

export interface SnapshotInfo {
  id: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface RunCodeInput {
  language: string
  code: string
  files?: Record<string, string>
  timeoutMs?: number
}

export interface RunCodeResult {
  stdout: string
  stderr: string
  exitCode: number
  artifacts?: Array<{ name: string; mime: string; data: Uint8Array }>
}

export interface ProviderCapabilities {
  lifecycle: { pauseResume: boolean; snapshots: boolean }
  fs: { watch: boolean; upload: boolean; download: boolean }
  process: { streaming: boolean; background: boolean }
  code: { languages: string[]; runCode: boolean }
  storage: { volumes: boolean; cloudBuckets: boolean }
}

export interface VolumeInfo {
  id: string
  name: string
  readOnly?: boolean
  createdAt?: string
}

export interface VolumeMount {
  path: string
  volume: string
  readOnly?: boolean
}

export interface CloudBucketMount {
  path: string
  bucketName: string
  bucketType: "s3" | "gcs" | "r2"
  secretName?: string
  readOnly?: boolean
  keyPrefix?: string
  endpoint?: string
}

export interface FileWatchEvent {
  type: "create" | "modify" | "delete" | "rename"
  path: string
  newPath?: string
}

export interface StartProcessOptions {
  cmd: string
  args?: ReadonlyArray<string>
  cwd?: string
  env?: Record<string, string>
  exposedPorts?: number[]
  background?: boolean
}

export interface ProcessInfo {
  id: string
  pid?: number
  urls?: Record<number, string>
  status: "running" | "stopped" | "failed"
}
