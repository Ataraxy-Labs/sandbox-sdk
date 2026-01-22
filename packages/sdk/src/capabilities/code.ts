import { Context, Effect } from "effect"
import type { SandboxError } from "../errors"
import type { RunCodeInput, RunCodeResult } from "../types"

/**
 * Code execution operations (optional capability).
 * Allows running code snippets in various languages.
 */
export interface SandboxCodeService {
  /**
   * Run code in the sandbox.
   */
  readonly runCode: (
    id: string,
    input: RunCodeInput,
  ) => Effect.Effect<RunCodeResult, SandboxError>
}

export class SandboxCode extends Context.Tag("SandboxCode")<
  SandboxCode,
  SandboxCodeService
>() {}

/**
 * Standalone effect function for code execution.
 */
export const runCode = (
  id: string,
  input: RunCodeInput,
): Effect.Effect<RunCodeResult, SandboxError, SandboxCode> =>
  Effect.flatMap(SandboxCode, (svc) => svc.runCode(id, input))
