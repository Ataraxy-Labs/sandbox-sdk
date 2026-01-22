import { Data, Effect, Clock, Random, Schedule, Duration } from "effect"

/**
 * Context for sandbox errors providing debugging and tracing information.
 * All fields are optional for backward compatibility.
 */
export interface SandboxErrorContext {
  /** Provider name (e.g., "docker", "modal", "daytona") */
  provider?: string
  /** Capability being used (e.g., "lifecycle", "process", "fs") */
  capability?: string
  /** Operation name (e.g., "create", "run", "readFile") */
  operation?: string
  /** Sandbox ID involved in the operation */
  sandboxId?: string
  /** Request ID for correlation/tracing */
  requestId?: string
  /** Timestamp when the error occurred (ISO string) */
  timestamp?: string
  /** Duration of the operation in milliseconds */
  durationMs?: number
  /** Retry attempt number (1-indexed) */
  attempt?: number
}

/**
 * Error thrown when authentication or authorization fails.
 */
export class SandboxAuthError extends Data.TaggedError("SandboxAuth")<{
  message: string
  context?: SandboxErrorContext
}> {}

/**
 * Error thrown when a network operation fails.
 */
export class SandboxNetworkError extends Data.TaggedError("SandboxNetwork")<{
  cause: unknown
  context?: SandboxErrorContext
}> {}

/**
 * Error thrown when a sandbox is not found.
 */
export class SandboxNotFoundError extends Data.TaggedError("SandboxNotFound")<{
  id: string
  context?: SandboxErrorContext
}> {}

/**
 * Error thrown when rate limits are exceeded.
 */
export class SandboxRateLimitError extends Data.TaggedError("SandboxRateLimit")<{
  retryAfterMs?: number
  message?: string
  context?: SandboxErrorContext
}> {}

/**
 * Error thrown when an operation times out.
 */
export class SandboxTimeoutError extends Data.TaggedError("SandboxTimeout")<{
  timeoutMs?: number
  message?: string
  context?: SandboxErrorContext
}> {}

/**
 * Error thrown when input validation fails.
 */
export class SandboxValidationError extends Data.TaggedError("SandboxValidation")<{
  message: string
  context?: SandboxErrorContext
}> {}

/**
 * Error thrown when a provider-specific operation fails.
 */
export class SandboxProviderError extends Data.TaggedError("SandboxProvider")<{
  message: string
  cause?: unknown
  context?: SandboxErrorContext
}> {}

/**
 * Error thrown when a capability is not supported by the provider.
 */
export class SandboxCapabilityError extends Data.TaggedError("SandboxCapability")<{
  capability: string
  provider?: string
  message?: string
  context?: SandboxErrorContext
}> {}

/**
 * Union type of all sandbox errors.
 */
export type SandboxError =
  | SandboxAuthError
  | SandboxNetworkError
  | SandboxNotFoundError
  | SandboxRateLimitError
  | SandboxTimeoutError
  | SandboxValidationError
  | SandboxProviderError
  | SandboxCapabilityError

/**
 * Input for HTTP error mapping with optional headers for retry-after parsing.
 */
export interface HttpErrorInput {
  status: number
  body?: string
  headers?: Headers | Record<string, string>
}

/**
 * Parse Retry-After header value to milliseconds.
 * Supports both delta-seconds (e.g., "120") and HTTP-date formats.
 *
 * @param headers - Response headers containing Retry-After
 * @returns Retry delay in milliseconds, or undefined if not present/parseable
 */
export const parseRetryAfterMs = (
  headers: Headers | Record<string, string> | undefined,
): number | undefined => {
  if (!headers) return undefined

  const value = headers instanceof Headers ? headers.get("retry-after") : headers["retry-after"]
  if (!value) return undefined

  const seconds = parseInt(value, 10)
  if (!isNaN(seconds)) {
    return Math.max(100, Math.min(seconds * 1000, 60000))
  }

  const date = Date.parse(value)
  if (!isNaN(date)) {
    const delayMs = date - Date.now()
    return delayMs > 0 ? Math.min(delayMs, 60000) : undefined
  }

  return undefined
}

/**
 * Map an HTTP response to a typed SandboxError with full context.
 *
 * This is the preferred way to map HTTP errors as it:
 * - Parses Retry-After headers for rate limit errors
 * - Includes error context for debugging
 * - Preserves the response body as the error message
 *
 * @example
 * ```ts
 * const error = mapHttpErrorWithContext(
 *   { status: 429, body: "Rate limited", headers: response.headers },
 *   { provider: "modal", operation: "create", sandboxId: "sbx-123" },
 *   "sbx-123"
 * )
 * ```
 */
export const mapHttpErrorWithContext = (
  input: HttpErrorInput,
  context?: SandboxErrorContext,
  idFor404?: string,
): SandboxError => {
  const { status, body = "", headers } = input
  const ctx = context ? { ...context, timestamp: context.timestamp ?? new Date().toISOString() } : undefined

  if (status === 401 || status === 403) {
    return new SandboxAuthError({ message: body, context: ctx })
  }
  if (status === 404) {
    return new SandboxNotFoundError({
      id: idFor404 ?? ctx?.sandboxId ?? "unknown",
      context: ctx,
    })
  }
  if (status === 408) {
    return new SandboxTimeoutError({ message: body, context: ctx })
  }
  if (status === 429) {
    return new SandboxRateLimitError({
      message: body,
      retryAfterMs: parseRetryAfterMs(headers),
      context: ctx,
    })
  }
  if (status >= 500) {
    return new SandboxNetworkError({ cause: new Error(`${status}: ${body}`), context: ctx })
  }
  return new SandboxProviderError({ message: `${status}: ${body}`, context: ctx })
}

/**
 * Map an HTTP status code to a specific SandboxError.
 * @deprecated Use `mapHttpErrorWithContext` for better error context
 */
export const mapHttpError = (status: number, body: string, id?: string): SandboxError =>
  mapHttpErrorWithContext({ status, body }, undefined, id)

/**
 * Check if an error is a transient error that can be retried.
 */
export const isTransientSandboxError = (err: SandboxError): boolean =>
  err._tag === "SandboxNetwork" || err._tag === "SandboxRateLimit" || err._tag === "SandboxTimeout"

/**
 * Error classification keywords used by mapErrorFromMessage.
 * Providers can extend these for provider-specific patterns.
 */
export const ErrorPatterns = {
  auth: [
    "unauthorized",
    "unauthenticated",
    "permission denied",
    "permission_denied",
    "forbidden",
    "401",
    "403",
    "api key",
    "invalid key",
    "token",
    "invalid token",
    "expired token",
  ],
  notFound: ["not found", "notfound", "not_found", "no such", "does not exist", "404"],
  timeout: ["timeout", "timed out", "deadline exceeded", "deadline_exceeded", "408"],
  rateLimit: ["rate limit", "ratelimit", "rate_limit", "too many requests", "429", "throttle"],
  network: [
    "network",
    "fetch failed",
    "fetch error",
    "econnrefused",
    "econnreset",
    "enotfound",
    "connection refused",
    "connection reset",
    "unavailable",
    "service unavailable",
    "503",
    "502",
    "bad gateway",
  ],
} as const

/**
 * Type for error pattern keywords - allows any string array.
 */
export type ErrorPatternKeywords = readonly string[]

/**
 * Interface for custom error patterns configuration.
 */
export interface ErrorPatternsConfig {
  auth?: ErrorPatternKeywords
  notFound?: ErrorPatternKeywords
  timeout?: ErrorPatternKeywords
  rateLimit?: ErrorPatternKeywords
  network?: ErrorPatternKeywords
}

/**
 * Options for mapErrorWithContext.
 */
export interface MapErrorOptions {
  /** Sandbox ID for NotFoundError context */
  id?: string
  /** Custom pattern keywords (defaults to ErrorPatterns) */
  patterns?: ErrorPatternsConfig
  /** Error context for debugging */
  context?: SandboxErrorContext
}

/**
 * Standardized error mapper that converts unknown errors to typed SandboxErrors.
 *
 * This function examines error messages for common patterns and maps them to
 * the appropriate SandboxError type. All drivers should use this for consistent
 * error classification.
 *
 * Features:
 * - Preserves already-typed SandboxErrors
 * - Maintains error cause chain for debugging
 * - Adds context for tracing
 *
 * @example
 * ```ts
 * // In a driver capability implementation
 * Effect.tryPromise({
 *   try: async () => { ... },
 *   catch: (err) => mapErrorWithContext(err, {
 *     id: sandboxId,
 *     context: { provider: "docker", operation: "create" }
 *   })
 * })
 * ```
 */
export const mapErrorWithContext = (err: unknown, options: MapErrorOptions = {}): SandboxError => {
  const { id, patterns = ErrorPatterns, context } = options
  const ctx = context ? { ...context, timestamp: context.timestamp ?? new Date().toISOString() } : undefined

  if (isSandboxError(err)) {
    if (ctx && !err.context) {
      return addContextToError(err, ctx)
    }
    return err
  }

  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  const matchesAny = (keywords: readonly string[]) => keywords.some((k) => lower.includes(k))

  if (matchesAny(patterns.auth ?? ErrorPatterns.auth)) {
    return new SandboxAuthError({ message: msg, context: ctx })
  }
  if (matchesAny(patterns.notFound ?? ErrorPatterns.notFound)) {
    return new SandboxNotFoundError({ id: id ?? ctx?.sandboxId ?? "unknown", context: ctx })
  }
  if (matchesAny(patterns.timeout ?? ErrorPatterns.timeout)) {
    return new SandboxTimeoutError({ message: msg, context: ctx })
  }
  if (matchesAny(patterns.rateLimit ?? ErrorPatterns.rateLimit)) {
    return new SandboxRateLimitError({ message: msg, context: ctx })
  }
  if (matchesAny(patterns.network ?? ErrorPatterns.network)) {
    return new SandboxNetworkError({ cause: err, context: ctx })
  }

  return new SandboxProviderError({ message: msg, cause: err, context: ctx })
}

/**
 * Standardized error mapper that converts unknown errors to typed SandboxErrors.
 * @deprecated Use `mapErrorWithContext` for better error context
 */
export const mapErrorFromMessage = (
  err: unknown,
  id?: string,
  patterns: ErrorPatternsConfig = ErrorPatterns,
): SandboxError => mapErrorWithContext(err, { id, patterns })

/**
 * Type guard to check if an error is already a SandboxError.
 */
export const isSandboxError = (err: unknown): err is SandboxError =>
  err instanceof SandboxAuthError ||
  err instanceof SandboxNetworkError ||
  err instanceof SandboxNotFoundError ||
  err instanceof SandboxRateLimitError ||
  err instanceof SandboxTimeoutError ||
  err instanceof SandboxValidationError ||
  err instanceof SandboxProviderError ||
  err instanceof SandboxCapabilityError

/**
 * Helper to require a capability or throw an error.
 * @deprecated Use `requireCapabilityEffect` for Effect-based code paths
 */
export function requireCapability<T>(
  fn: T | undefined,
  capability: string,
  provider?: string,
): asserts fn is T {
  if (!fn) {
    throw new SandboxCapabilityError({ capability, provider })
  }
}

/**
 * Effect-based helper to require a capability.
 * Returns Effect.succeed(fn) if defined, Effect.fail(SandboxCapabilityError) otherwise.
 */
export const requireCapabilityEffect = <T>(
  fn: T | undefined,
  capability: string,
  provider?: string,
): Effect.Effect<T, SandboxCapabilityError> =>
  fn !== undefined
    ? Effect.succeed(fn)
    : Effect.fail(new SandboxCapabilityError({ capability, provider }))

/**
 * Get current timestamp as ISO string using Effect Clock.
 * Use this instead of `new Date().toISOString()` for testability.
 */
export const currentTimestamp: Effect.Effect<string> = Effect.map(
  Clock.currentTimeMillis,
  (ms) => new Date(ms).toISOString(),
)

/**
 * Generate a unique ID with timestamp and random suffix using Effect services.
 * Use this instead of `Date.now()` for generating IDs for testability.
 */
export const generateId = (prefix: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const timestamp = yield* Clock.currentTimeMillis
    const n = yield* Random.next
    const suffix = Math.floor(n * 36 ** 6)
      .toString(36)
      .padStart(6, "0")
    return `${prefix}-${timestamp}-${suffix}`
  })

/**
 * Retry schedule configuration options.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number
  /** Initial delay between retries (default: 1 second) */
  initialDelay?: Duration.DurationInput
  /** Maximum delay between retries (default: 30 seconds) */
  maxDelay?: Duration.DurationInput
  /** Exponential backoff factor (default: 2) */
  factor?: number
  /** Jitter factor for randomizing delays 0-1 (default: 0.1) */
  jitter?: number
}

const defaultRetryConfig: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: Duration.seconds(1),
  maxDelay: Duration.seconds(30),
  factor: 2,
  jitter: 0.1,
}

/**
 * Creates a retry schedule for transient sandbox errors.
 *
 * Only retries errors that pass `isTransientSandboxError`:
 * - SandboxNetworkError
 * - SandboxRateLimitError
 * - SandboxTimeoutError
 *
 * Uses exponential backoff with jitter to avoid thundering herd.
 *
 * @example
 * ```ts
 * const effect = driver.create(options).pipe(
 *   Effect.retry(retryTransient({ maxAttempts: 5 }))
 * )
 * ```
 */
export const retryTransient = (config: RetryConfig = {}) => {
  const { maxAttempts, initialDelay, maxDelay, factor } = { ...defaultRetryConfig, ...config }

  return Schedule.exponential(initialDelay, factor).pipe(
    Schedule.jittered,
    Schedule.union(Schedule.spaced(maxDelay)),
    Schedule.compose(Schedule.recurs(maxAttempts - 1)),
    Schedule.whileInput(isTransientSandboxError),
  )
}

/**
 * Creates a retry schedule specifically for rate limit errors.
 *
 * @example
 * ```ts
 * const effect = driver.create(options).pipe(
 *   Effect.retry(retryRateLimit({ maxAttempts: 5 }))
 * )
 * ```
 */
export const retryRateLimit = (config: RetryConfig = {}) => {
  const { maxAttempts, initialDelay, maxDelay } = { ...defaultRetryConfig, ...config }

  return Schedule.exponential(initialDelay).pipe(
    Schedule.union(Schedule.spaced(maxDelay)),
    Schedule.compose(Schedule.recurs(maxAttempts - 1)),
    Schedule.whileInput((err: SandboxError) => err._tag === "SandboxRateLimit"),
  )
}

/**
 * Wraps an effect with automatic retry for transient errors.
 *
 * @example
 * ```ts
 * const safeCreate = withRetry(driver.create(options), { maxAttempts: 5 })
 * ```
 */
export const withRetry = <A, R>(
  effect: Effect.Effect<A, SandboxError, R>,
  config?: RetryConfig,
): Effect.Effect<A, SandboxError, R> => Effect.retry(effect, retryTransient(config))

/**
 * Wraps an effect with rate-limit-aware retry.
 *
 * This function honors the `retryAfterMs` field in SandboxRateLimitError,
 * waiting the specified time before retrying. Falls back to exponential
 * backoff when retryAfterMs is not available.
 *
 * @example
 * ```ts
 * const safeEffect = withRateLimitRetry(effect, { maxAttempts: 5 })
 * ```
 */
export const withRateLimitRetry = <A, R>(
  effect: Effect.Effect<A, SandboxError, R>,
  config: RetryConfig = {},
): Effect.Effect<A, SandboxError, R> => {
  const { maxAttempts = 3 } = { ...defaultRetryConfig, ...config }

  const loop = (attempt: number): Effect.Effect<A, SandboxError, R> =>
    Effect.catchTag(effect, "SandboxRateLimit", (err) => {
      if (attempt >= maxAttempts) {
        return Effect.fail(err)
      }
      const delayMs = err.retryAfterMs ?? Math.min(1000 * 2 ** attempt, 30000)
      return Effect.sleep(Duration.millis(delayMs)).pipe(Effect.flatMap(() => loop(attempt + 1)))
    })

  return loop(1)
}

/**
 * Wraps an effect with operation context, timing, and tracing spans.
 *
 * This helper:
 * - Creates a span for observability/tracing
 * - Measures operation duration
 * - Adds error context on failure
 * - Annotates logs with operation info
 *
 * @example
 * ```ts
 * const createSandbox = withOperationContext(
 *   { provider: "docker", capability: "lifecycle", operation: "create" },
 *   driver.create(options)
 * )
 * ```
 */
export const withOperationContext = <A, R>(
  context: SandboxErrorContext,
  effect: Effect.Effect<A, SandboxError, R>,
): Effect.Effect<A, SandboxError, R> => {
  const spanName = [context.provider, context.capability, context.operation].filter(Boolean).join(".")

  return Effect.gen(function* () {
    const startTime = yield* Clock.currentTimeMillis
    const result = yield* Effect.either(effect)

    if (result._tag === "Left") {
      const endTime = yield* Clock.currentTimeMillis
      const durationMs = endTime - startTime
      const timestamp = new Date(endTime).toISOString()
      const enrichedContext = { ...context, durationMs, timestamp }
      const enrichedError = addContextToError(result.left, enrichedContext)
      return yield* Effect.fail(enrichedError)
    }

    return result.right
  }).pipe(
    Effect.withSpan(spanName || "sandbox.operation", {
      attributes: {
        "sandbox.provider": context.provider ?? "",
        "sandbox.capability": context.capability ?? "",
        "sandbox.operation": context.operation ?? "",
        "sandbox.id": context.sandboxId ?? "",
      },
    }),
    Effect.annotateLogs({
      provider: context.provider ?? "",
      operation: context.operation ?? "",
      sandboxId: context.sandboxId ?? "",
    }),
  )
}

/**
 * Add context to an existing SandboxError (returns a new error with context).
 * Exported for use in custom error handling scenarios.
 */
export const addContextToError = (err: SandboxError, ctx: SandboxErrorContext): SandboxError => {
  switch (err._tag) {
    case "SandboxAuth":
      return new SandboxAuthError({ ...err, context: ctx })
    case "SandboxNetwork":
      return new SandboxNetworkError({ ...err, context: ctx })
    case "SandboxNotFound":
      return new SandboxNotFoundError({ ...err, context: ctx })
    case "SandboxRateLimit":
      return new SandboxRateLimitError({ ...err, context: ctx })
    case "SandboxTimeout":
      return new SandboxTimeoutError({ ...err, context: ctx })
    case "SandboxValidation":
      return new SandboxValidationError({ ...err, context: ctx })
    case "SandboxProvider":
      return new SandboxProviderError({ ...err, context: ctx })
    case "SandboxCapability":
      return new SandboxCapabilityError({ ...err, context: ctx })
  }
}

/**
 * Convert a SandboxError to a log-friendly object (safe for structured logging).
 */
export const sandboxErrorToLog = (err: SandboxError): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    tag: err._tag,
  }

  if (err.context) {
    base.provider = err.context.provider
    base.capability = err.context.capability
    base.operation = err.context.operation
    base.sandboxId = err.context.sandboxId
    base.durationMs = err.context.durationMs
    base.attempt = err.context.attempt
  }

  switch (err._tag) {
    case "SandboxAuth":
      base.message = err.message
      break
    case "SandboxNetwork":
      base.cause = err.cause instanceof Error ? err.cause.message : String(err.cause)
      break
    case "SandboxNotFound":
      base.id = err.id
      break
    case "SandboxRateLimit":
      base.message = err.message
      base.retryAfterMs = err.retryAfterMs
      break
    case "SandboxTimeout":
      base.message = err.message
      base.timeoutMs = err.timeoutMs
      break
    case "SandboxValidation":
      base.message = err.message
      break
    case "SandboxProvider":
      base.message = err.message
      base.cause = err.cause instanceof Error ? err.cause.message : err.cause
      break
    case "SandboxCapability":
      base.capability = err.capability
      base.provider = err.provider
      base.message = err.message
      break
  }

  return base
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validation result type.
 */
export type ValidationResult = { valid: true } | { valid: false; message: string }

/**
 * Validate that a port number is within the valid range (1-65535).
 */
export const validatePort = (port: number): ValidationResult => {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { valid: false, message: `Port must be an integer between 1 and 65535, got: ${port}` }
  }
  return { valid: true }
}

/**
 * Validate that a timeout is a positive number.
 */
export const validateTimeout = (timeoutMs: number): ValidationResult => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { valid: false, message: `Timeout must be a positive number, got: ${timeoutMs}` }
  }
  return { valid: true }
}

/**
 * Validate that an image name is non-empty.
 */
export const validateImage = (image: string): ValidationResult => {
  if (!image || image.trim().length === 0) {
    return { valid: false, message: "Image name cannot be empty" }
  }
  return { valid: true }
}

/**
 * Validate CreateOptions at the boundary.
 * Only validates critical fields that would cause runtime failures.
 *
 * @example
 * ```ts
 * const validated = yield* validateCreateOptions(options)
 * ```
 */
export const validateCreateOptions = (
  options: {
    image: string
    timeoutMs?: number
    encryptedPorts?: number[]
    unencryptedPorts?: number[]
  },
  context?: SandboxErrorContext,
): Effect.Effect<void, SandboxValidationError> => {
  const errors: string[] = []

  const imageResult = validateImage(options.image)
  if (!imageResult.valid) errors.push(imageResult.message)

  if (options.timeoutMs !== undefined) {
    const timeoutResult = validateTimeout(options.timeoutMs)
    if (!timeoutResult.valid) errors.push(timeoutResult.message)
  }

  const allPorts = [...(options.encryptedPorts ?? []), ...(options.unencryptedPorts ?? [])]
  for (const port of allPorts) {
    const portResult = validatePort(port)
    if (!portResult.valid) {
      errors.push(portResult.message)
      break
    }
  }

  if (errors.length > 0) {
    return Effect.fail(
      new SandboxValidationError({
        message: errors.join("; "),
        context: context ? { ...context, timestamp: new Date().toISOString() } : undefined,
      }),
    )
  }

  return Effect.void
}

/**
 * Validate a sandbox ID is non-empty.
 */
export const validateSandboxId = (
  id: string,
  context?: SandboxErrorContext,
): Effect.Effect<void, SandboxValidationError> => {
  if (!id || id.trim().length === 0) {
    return Effect.fail(
      new SandboxValidationError({
        message: "Sandbox ID cannot be empty",
        context: context ? { ...context, timestamp: new Date().toISOString() } : undefined,
      }),
    )
  }
  return Effect.void
}
