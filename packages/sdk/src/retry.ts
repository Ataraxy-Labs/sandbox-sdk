import { Effect, Schedule } from "effect"
import { isTransientSandboxError, retryTransient as retryTransientSchedule, type SandboxError } from "./errors"

/**
 * Default retry schedule with exponential backoff.
 * @deprecated Use `retryTransient` from errors.ts for configurable retries
 */
export const defaultRetrySchedule = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(5)),
  Schedule.upTo("30 seconds"),
)

/**
 * Check if an error is transient and retryable.
 * @deprecated Use `isTransientSandboxError` from errors.ts
 */
export const isTransientError = isTransientSandboxError

/**
 * Wrap an effect with retry logic for transient errors.
 * Uses the new configurable retry schedule under the hood.
 */
export const retryTransient = <A, R>(effect: Effect.Effect<A, SandboxError, R>) =>
  effect.pipe(Effect.retry(retryTransientSchedule()))
