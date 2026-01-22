import { describe, it, expect } from "bun:test"
import { Effect, Layer, Clock, Random } from "effect"
import { SandboxDriver } from "../../driver"
import { MockDriverLive, FailingMockDriverLive, makeTestClock, makeTestRandom } from "../index"
import { generateId, currentTimestamp } from "../../errors"

describe("MockDriver", () => {
  const layer = MockDriverLive()

  it("should create and destroy sandbox", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      const info = yield* driver.create({ image: "node:20" })

      expect(info.id).toContain("mock-sbx")
      expect(info.provider).toBe("mock")
      expect(info.status).toBe("ready")

      yield* driver.destroy(info.id)
    })

    await Effect.runPromise(Effect.provide(program, layer))
  })

  it("should read and write files", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      const info = yield* driver.create({ image: "alpine" })

      yield* driver.writeFile(info.id, "/test.txt", "hello world")
      const content = yield* driver.readFile(info.id, "/test.txt", { encoding: "utf8" })

      expect(content).toBe("hello world")

      yield* driver.destroy(info.id)
    })

    await Effect.runPromise(Effect.provide(program, layer))
  })

  it("should list sandboxes", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      const info1 = yield* driver.create({ image: "alpine" })
      const info2 = yield* driver.create({ image: "node:20" })

      const list = yield* driver.list()
      expect(list.length).toBe(2)

      yield* driver.destroy(info1.id)
      yield* driver.destroy(info2.id)
    })

    await Effect.runPromise(Effect.provide(program, layer))
  })

  it("should handle volume operations", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver

      const vol = yield* driver.volumeCreate!("test-vol")
      expect(vol.name).toBe("test-vol")

      const list = yield* driver.volumeList!()
      expect(list.some((v) => v.name === "test-vol")).toBe(true)

      yield* driver.volumeDelete!("test-vol")
    })

    await Effect.runPromise(Effect.provide(program, layer))
  })

  it("should support custom command handler", async () => {
    const customLayer = MockDriverLive({
      commandHandler: (id, cmd) => ({
        exitCode: 0,
        stdout: `custom: ${cmd.cmd}`,
        stderr: "",
      }),
    })

    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      const info = yield* driver.create({ image: "alpine" })
      const result = yield* driver.run(info.id, { cmd: "echo", args: ["test"] })

      expect(result.stdout).toBe("custom: echo")

      yield* driver.destroy(info.id)
    })

    await Effect.runPromise(Effect.provide(program, customLayer))
  })
})

describe("FailingMockDriver", () => {
  it("should fail on create", async () => {
    const layer = FailingMockDriverLive("Intentional failure")

    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      yield* driver.create({ image: "alpine" })
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(layer),
        Effect.either,
      ),
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("SandboxProvider")
    }
  })
})

describe("TestServices", () => {
  it("should provide deterministic timestamps via withClock", async () => {
    const fixedTime = Date.parse("2024-01-15T10:00:00Z")

    const program = Effect.gen(function* () {
      const ts = yield* currentTimestamp
      expect(ts).toBe("2024-01-15T10:00:00.000Z")
    })

    await Effect.runPromise(
      Effect.withClock(makeTestClock(fixedTime))(program),
    )
  })

  it("should provide deterministic random via withRandom", async () => {
    const program = Effect.gen(function* () {
      const n1 = yield* Random.next
      const n2 = yield* Random.next
      expect(n1).toBe(0.5)
      expect(n2).toBe(0.5)
    })

    await Effect.runPromise(
      Effect.withRandom(makeTestRandom([0.5]))(program),
    )
  })

  it("should provide deterministic IDs with both services", async () => {
    const fixedTime = Date.parse("2024-01-15T10:00:00Z")

    const program = Effect.gen(function* () {
      const id = yield* generateId("test")
      expect(id).toBe(`test-${fixedTime}-i00000`)
    })

    await Effect.runPromise(
      program.pipe(
        Effect.withClock(makeTestClock(fixedTime)),
        Effect.withRandom(makeTestRandom([0.5])),
      ),
    )
  })

  it("should combine with MockDriver for fully deterministic tests", async () => {
    const fixedTime = Date.parse("2024-01-15T10:00:00Z")
    const testServiceLayer = Layer.mergeAll(
      Layer.setClock(makeTestClock(fixedTime)),
      Layer.setRandom(makeTestRandom([0.5])),
    )
    const fullLayer = Layer.provideMerge(MockDriverLive(), testServiceLayer)

    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      const info = yield* driver.create({ image: "alpine" })

      expect(info.createdAt).toBe("2024-01-15T10:00:00.000Z")
      expect(info.id).toBe(`mock-sbx-${fixedTime}-i00000`)

      yield* driver.destroy(info.id)
    })

    await Effect.runPromise(Effect.provide(program, fullLayer))
  })
})
