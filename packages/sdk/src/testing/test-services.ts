import { Effect, Clock, Random, Layer, Duration, TestClock, Chunk } from "effect"

/**
 * Create a mock Clock service with a fixed time.
 * Useful for deterministic tests that depend on timestamps.
 *
 * @example
 * ```ts
 * const fixedTime = new Date("2024-01-15T10:00:00Z").getTime()
 * const program = Effect.gen(function* () {
 *   const ts = yield* currentTimestamp
 *   expect(ts).toBe("2024-01-15T10:00:00.000Z")
 * })
 *
 * Effect.runPromise(program.pipe(
 *   Effect.provide(makeTestClock(fixedTime))
 * ))
 * ```
 */
export const makeTestClock = (timeMs: number): Clock.Clock => ({
  currentTimeMillis: Effect.succeed(timeMs),
  currentTimeNanos: Effect.succeed(BigInt(timeMs * 1_000_000)),
  sleep: (_duration: Duration.Duration) => Effect.void,
  unsafeCurrentTimeMillis: () => timeMs,
  unsafeCurrentTimeNanos: () => BigInt(timeMs * 1_000_000),
  [Clock.ClockTypeId]: Clock.ClockTypeId,
})

/**
 * Layer that provides a fixed-time Clock using Layer.setClock.
 *
 * @example
 * ```ts
 * const testLayer = TestClockLayer(Date.parse("2024-01-15T10:00:00Z"))
 * Effect.runPromise(program.pipe(Effect.provide(testLayer)))
 * ```
 *
 * Or use Effect.withClock for simpler cases:
 * ```ts
 * const fixedTime = Date.parse("2024-01-15T10:00:00Z")
 * Effect.runPromise(Effect.withClock(makeTestClock(fixedTime))(program))
 * ```
 */
export const TestClockLayer = (timeMs: number) => Layer.setClock(makeTestClock(timeMs))

/**
 * Create a mock Random service with predictable values.
 * The sequence repeats once exhausted.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const n1 = yield* Random.next // 0.5
 *   const n2 = yield* Random.next // 0.25
 *   const n3 = yield* Random.next // 0.5 (repeats)
 * })
 *
 * Effect.runPromise(program.pipe(
 *   Effect.provide(makeTestRandom([0.5, 0.25]))
 * ))
 * ```
 */
export const makeTestRandom = (values: number[]): Random.Random => {
  let index = 0
  const nextValue = () => {
    const val = values[index % values.length]!
    index++
    return val
  }

  return {
    next: Effect.sync(nextValue),
    nextBoolean: Effect.sync(() => nextValue() >= 0.5),
    nextInt: Effect.sync(() => Math.floor(nextValue() * 2147483647)),
    nextIntBetween: (low: number, high: number) => Effect.sync(() => Math.floor(nextValue() * (high - low) + low)),
    nextRange: (min: number, max: number) => Effect.sync(() => nextValue() * (max - min) + min),
    shuffle: <A>(elements: Iterable<A>) => Effect.succeed(Chunk.fromIterable(elements)),
    [Random.RandomTypeId]: Random.RandomTypeId,
  }
}

/**
 * Layer that provides a predictable Random service using Layer.setRandom.
 *
 * @example
 * ```ts
 * const testLayer = TestRandomLayer([0.5, 0.25, 0.75])
 * Effect.runPromise(program.pipe(Effect.provide(testLayer)))
 * ```
 *
 * Or use Effect.withRandom for simpler cases:
 * ```ts
 * Effect.runPromise(Effect.withRandom(makeTestRandom([0.5]))(program))
 * ```
 */
export const TestRandomLayer = (values: number[]) => Layer.setRandom(makeTestRandom(values))

/**
 * Combined layer providing both fixed Clock and predictable Random.
 * Ideal for testing code that uses `currentTimestamp` or `generateId`.
 *
 * @example
 * ```ts
 * const testLayer = TestServicesLayer({
 *   timeMs: Date.parse("2024-01-15T10:00:00Z"),
 *   randomValues: [0.5],
 * })
 *
 * const program = Effect.gen(function* () {
 *   const id = yield* generateId("test")
 *   expect(id).toBe("test-1705312800000-hzzzzz")
 * })
 *
 * Effect.runPromise(program.pipe(Effect.provide(testLayer)))
 * ```
 */
export const TestServicesLayer = (config: { timeMs: number; randomValues: number[] }) =>
  Layer.mergeAll(TestClockLayer(config.timeMs), TestRandomLayer(config.randomValues))

/**
 * Advance a mutable test clock by a duration.
 * Creates a new clock with the advanced time.
 */
export const advanceTestClock = (clock: { currentTime: number }, duration: Duration.DurationInput): void => {
  clock.currentTime += Duration.toMillis(duration)
}

/**
 * Create a mutable test clock that can be advanced during tests.
 *
 * @example
 * ```ts
 * const { clock, advance } = makeMutableTestClock(Date.now())
 *
 * const program = Effect.gen(function* () {
 *   const t1 = yield* Clock.currentTimeMillis
 *   advance("1 second")
 *   const t2 = yield* Clock.currentTimeMillis
 *   expect(t2 - t1).toBe(1000)
 * })
 *
 * Effect.runPromise(program.pipe(
 *   Effect.provide(Layer.succeed(Clock.Clock, clock))
 * ))
 * ```
 */
export const makeMutableTestClock = (initialTimeMs: number) => {
  const state = { currentTime: initialTimeMs }

  const clock: Clock.Clock = {
    currentTimeMillis: Effect.sync(() => state.currentTime),
    currentTimeNanos: Effect.sync(() => BigInt(state.currentTime * 1_000_000)),
    sleep: (_duration: Duration.Duration) => Effect.void,
    unsafeCurrentTimeMillis: () => state.currentTime,
    unsafeCurrentTimeNanos: () => BigInt(state.currentTime * 1_000_000),
    [Clock.ClockTypeId]: Clock.ClockTypeId,
  }

  const advance = (duration: Duration.DurationInput) => {
    state.currentTime += Duration.toMillis(duration)
  }

  const set = (timeMs: number) => {
    state.currentTime = timeMs
  }

  return { clock, advance, set, state }
}

/**
 * Re-export Effect's TestClock for fiber-based time control.
 * Use this when testing effects that use Effect.sleep or timeouts.
 */
export { TestClock }

/**
 * Helper to run a program with TestClock and manually advance time.
 * The TestClock layer must be provided separately.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const fiber = yield* Effect.fork(
 *     Effect.gen(function* () {
 *       yield* Effect.sleep("1 second")
 *       return "done"
 *     })
 *   )
 *   yield* TestClock.adjust("2 seconds")
 *   return yield* fiber
 * })
 *
 * const result = await Effect.runPromise(
 *   program.pipe(Effect.provide(TestClock.live))
 * )
 * expect(result).toBe("done")
 * ```
 */
export const runWithTestClock = <A, E>(
  effect: Effect.Effect<A, E>,
  advanceBy: Duration.DurationInput,
) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(effect)
    yield* TestClock.adjust(advanceBy)
    return yield* fiber
  })
