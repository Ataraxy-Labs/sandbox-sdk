import { Context, Effect, Stream } from "effect"
import type { SandboxError } from "../errors"
import type { RunCommand, RunResult, ProcessChunk, StartProcessOptions, ProcessInfo } from "../types"

/**
 * Process execution operations for sandboxes.
 * All providers must implement run and stream.
 */
export interface SandboxProcessService {
  /**
   * Run a command and wait for completion.
   */
  readonly run: (id: string, cmd: RunCommand) => Effect.Effect<RunResult, SandboxError>

  /**
   * Run a command and stream output.
   */
  readonly stream: (id: string, cmd: RunCommand) => Stream.Stream<ProcessChunk, SandboxError>

  /**
   * Start a background process (optional capability).
   */
  readonly startProcess?: (
    id: string,
    opts: StartProcessOptions,
  ) => Effect.Effect<ProcessInfo, SandboxError>

  /**
   * Stop a background process (optional capability).
   */
  readonly stopProcess?: (id: string, processId: string) => Effect.Effect<void, SandboxError>

  /**
   * Get URLs for exposed ports (optional capability).
   */
  readonly getProcessUrls?: (
    id: string,
    ports: number[],
  ) => Effect.Effect<Record<number, string>, SandboxError>
}

export class SandboxProcess extends Context.Tag("SandboxProcess")<
  SandboxProcess,
  SandboxProcessService
>() {}

/**
 * Standalone effect functions for process operations.
 */
export const run = (
  id: string,
  cmd: RunCommand,
): Effect.Effect<RunResult, SandboxError, SandboxProcess> =>
  Effect.flatMap(SandboxProcess, (svc) => svc.run(id, cmd))

export const stream = (
  id: string,
  cmd: RunCommand,
): Stream.Stream<ProcessChunk, SandboxError, SandboxProcess> =>
  Stream.unwrap(Effect.map(SandboxProcess, (svc) => svc.stream(id, cmd)))
