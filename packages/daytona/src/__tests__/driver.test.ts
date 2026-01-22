import { describe, it, expect } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { DaytonaDriverLive, DaytonaConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Daytona Driver", () => {
  const testConfig = {
    apiKey: process.env.DAYTONA_API_KEY ?? "test-key",
    baseUrl: "https://app.daytona.io/api",
    timeoutMs: 60000,
  }

  const testLayer = DaytonaDriverLive.pipe(Layer.provide(DaytonaConfigLive(testConfig)))

  it("should create driver", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      expect(driver).toBeDefined()
      expect(driver.create).toBeDefined()
      expect(driver.run).toBeDefined()
      expect(driver.stream).toBeDefined()
      expect(driver.readFile).toBeDefined()
      expect(driver.writeFile).toBeDefined()
      expect(driver.pause).toBeDefined()
      expect(driver.resume).toBeDefined()
      expect(driver.runCode).toBeDefined()
    })

    await Effect.runPromise(Effect.provide(program, testLayer))
  })

  const itLive = process.env.DAYTONA_API_KEY ? it : it.skip

  itLive(
    "should create and destroy sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })
        expect(info.id).toBeDefined()
        expect(info.provider).toBe("daytona")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    30000,
  )

  itLive(
    "should list sandboxes",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const list = yield* driver.list()
        expect(Array.isArray(list)).toBe(true)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    30000,
  )

  itLive(
    "should get sandbox by id",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })
        const fetched = yield* driver.get(info.id)
        expect(fetched.id).toBe(info.id)
        expect(fetched.provider).toBe("daytona")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    30000,
  )

  itLive(
    "should get sandbox status",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })
        const status = yield* driver.status(info.id)
        expect(["creating", "ready", "stopped"]).toContain(status)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    30000,
  )

  itLive(
    "should create sandbox with custom name",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const name = `test-sandbox-${Date.now()}`
        const info = yield* driver.create({ image: "python", name })
        expect(info.id).toBeDefined()
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    30000,
  )

  itLive(
    "should create sandbox with environment variables",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({
          image: "python",
          env: { TEST_VAR: "test_value" },
        })
        expect(info.id).toBeDefined()
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    30000,
  )

  itLive(
    "should run command in sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })
        const result = yield* driver.run(info.id, { cmd: "echo", args: ["hello"] })
        expect(result.stdout.trim()).toBe("hello")
        expect(result.exitCode).toBe(0)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should run command with working directory",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })
        const result = yield* driver.run(info.id, { cmd: "pwd", cwd: "/tmp" })
        expect(result.stdout.trim()).toBe("/tmp")
        expect(result.exitCode).toBe(0)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should run command with environment variables",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })
        const result = yield* driver.run(info.id, {
          cmd: "sh",
          args: ["-c", "echo $MY_VAR"],
          env: { MY_VAR: "test_value" },
        })
        expect(result.stdout.trim()).toBe("test_value")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should handle command errors",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })
        const result = yield* driver.run(info.id, { cmd: "sh", args: ["-c", "exit 42"] })
        expect(result.exitCode).toBe(42)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should run Python code",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })

        const result = yield* driver.runCode!(info.id, {
          language: "python",
          code: 'print("Hello from Python")',
        })

        expect(result.stdout.trim()).toBe("Hello from Python")
        expect(result.exitCode).toBe(0)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should read and write files",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })

        yield* driver.writeFile(info.id, "/tmp/test.txt", "hello world")
        const content = yield* driver.readFile(info.id, "/tmp/test.txt", { encoding: "utf8" })
        expect(content).toBe("hello world")

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should create and list directories",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })

        yield* driver.mkdir(info.id, "/tmp/testdir")
        yield* driver.writeFile(info.id, "/tmp/testdir/file.txt", "content")

        const entries = yield* driver.listDir(info.id, "/tmp/testdir")
        expect(entries.length).toBeGreaterThan(0)
        expect(entries.some((e) => e.path.includes("file.txt"))).toBe(true)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should remove files",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })

        yield* driver.writeFile(info.id, "/tmp/todelete.txt", "delete me")
        yield* driver.rm(info.id, "/tmp/todelete.txt")

        const result = yield* driver.run(info.id, { cmd: "test", args: ["-f", "/tmp/todelete.txt"] })
        expect(result.exitCode).not.toBe(0)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should pause and resume sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python" })

        yield* driver.pause!(info.id)
        yield* Effect.sleep(3000)
        const statusAfterPause = yield* driver.status(info.id)
        expect(statusAfterPause).toBe("stopped")

        yield* driver.resume!(info.id)
        yield* Effect.sleep(3000)
        const statusAfterResume = yield* driver.status(info.id)
        expect(statusAfterResume).toBe("ready")

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    90000,
  )
})
