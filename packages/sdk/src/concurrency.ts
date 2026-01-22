import { Context, Effect, Layer } from "effect"
import type { SandboxError } from "./errors"

/**
 * Configuration for concurrency limits.
 */
export interface ConcurrencyConfig {
  /** Maximum concurrent requests (default: unlimited) */
  maxConcurrency?: number
}

/**
 * Concurrency limiter service for rate limiting.
 * This is optional and default-off. Providers can opt-in by including this in their layer.
 */
export interface ConcurrencyLimiterService {
  /** Wrap an effect with the concurrency limiter */
  withLimit: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}

export class ConcurrencyLimiter extends Context.Tag("ConcurrencyLimiter")<
  ConcurrencyLimiter,
  ConcurrencyLimiterService
>() {}

/**
 * Create a concurrency limiter layer with the specified max concurrency.
 *
 * @example
 * ```ts
 * const layer = ConcurrencyLimiterLive({ maxConcurrency: 5 })
 * const effect = program.pipe(Effect.provide(layer))
 * ```
 */
export const ConcurrencyLimiterLive = (config: ConcurrencyConfig = {}) =>
  Layer.effect(
    ConcurrencyLimiter,
    Effect.gen(function* () {
      const { maxConcurrency } = config

      if (maxConcurrency === undefined || maxConcurrency <= 0) {
        return {
          withLimit: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
        }
      }

      const semaphore = yield* Effect.makeSemaphore(maxConcurrency)

      return {
        withLimit: <A, E, R>(effect: Effect.Effect<A, E, R>) => semaphore.withPermits(1)(effect),
      }
    }),
  )

/**
 * No-op concurrency limiter (unlimited concurrency).
 */
export const ConcurrencyLimiterNoop = Layer.succeed(ConcurrencyLimiter, {
  withLimit: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
})

/**
 * Wrap an effect with the concurrency limiter if available.
 * Falls back to no limiting if the service is not provided.
 *
 * @example
 * ```ts
 * const limited = withConcurrencyLimit(
 *   client.request("GET", "/sandboxes")
 * )
 * ```
 */
export const withConcurrencyLimit = <A, R>(
  effect: Effect.Effect<A, SandboxError, R>,
): Effect.Effect<A, SandboxError, R | ConcurrencyLimiter> =>
  Effect.gen(function* () {
    const limiter = yield* ConcurrencyLimiter
    return yield* limiter.withLimit(effect)
  })

/**
 * Create a rate-limited version of an effect function.
 *
 * @example
 * ```ts
 * const limitedCreate = rateLimited(
 *   (opts: CreateOptions) => driver.create(opts)
 * )
 * ```
 */
export const rateLimited = <Args extends unknown[], A, R>(
  fn: (...args: Args) => Effect.Effect<A, SandboxError, R>,
): ((...args: Args) => Effect.Effect<A, SandboxError, R | ConcurrencyLimiter>) =>
  (...args) => withConcurrencyLimit(fn(...args))
