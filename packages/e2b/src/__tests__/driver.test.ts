import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { E2BDriverLive, E2BConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("E2B Driver", () => {
  const config = {
    apiKey: process.env.E2B_API_KEY ?? "test-key",
    template: "code-interpreter-v1",
    timeoutMs: 60000,
  }

  const layer = E2BDriverLive.pipe(Layer.provide(E2BConfigLive(config)))

  it("should create driver with all core operations", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      expect(driver).toBeDefined()
      expect(driver.create).toBeDefined()
      expect(driver.destroy).toBeDefined()
      expect(driver.run).toBeDefined()
      expect(driver.stream).toBeDefined()
      expect(driver.readFile).toBeDefined()
      expect(driver.writeFile).toBeDefined()
      expect(driver.listDir).toBeDefined()
      expect(driver.runCode).toBeDefined()
    })

    await Effect.runPromise(Effect.provide(program, layer))
  })

  const itLive = process.env.E2B_API_KEY ? it : it.skip

  itLive(
    "should create and destroy sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        expect(info.id).toBeDefined()
        expect(info.provider).toBe("e2b")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
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

      await Effect.runPromise(Effect.provide(program, layer))
    },
    30000,
  )

  itLive(
    "should get sandbox by id",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        const fetched = yield* driver.get(info.id)
        expect(fetched.id).toBe(info.id)
        expect(fetched.provider).toBe("e2b")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    30000,
  )

  itLive(
    "should get sandbox status",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        const status = yield* driver.status(info.id)
        expect(["creating", "ready", "stopped"]).toContain(status)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    30000,
  )

  itLive(
    "should run command in sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        const result = yield* driver.run(info.id, { cmd: "echo", args: ["hello"] })
        expect(result.stdout.trim()).toBe("hello")
        expect(result.exitCode).toBe(0)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should run command with working directory",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        const result = yield* driver.run(info.id, { cmd: "pwd", cwd: "/tmp" })
        expect(result.stdout.trim()).toBe("/tmp")
        expect(result.exitCode).toBe(0)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should run command with environment variables",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        const result = yield* driver.run(info.id, {
          cmd: "sh",
          args: ["-c", "echo $MY_VAR"],
          env: { MY_VAR: "test_value" },
        })
        expect(result.stdout.trim()).toBe("test_value")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should handle command errors",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        const result = yield* driver.run(info.id, { cmd: "sh", args: ["-c", "exit 42"] })
        expect(result.exitCode).toBe(42)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should run Python code",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })

        const result = yield* driver.runCode!(info.id, {
          language: "python",
          code: 'print("Hello from Python")',
        })

        expect(result.stdout.trim()).toBe("Hello from Python")
        expect(result.exitCode).toBe(0)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should read and write files",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })

        yield* driver.writeFile(info.id, "/tmp/test.txt", "hello world")
        const content = yield* driver.readFile(info.id, "/tmp/test.txt", { encoding: "utf8" })
        expect(content).toBe("hello world")

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should create and list directories",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })

        yield* driver.mkdir(info.id, "/tmp/testdir")
        yield* driver.writeFile(info.id, "/tmp/testdir/file.txt", "content")

        const entries = yield* driver.listDir(info.id, "/tmp/testdir")
        expect(entries.length).toBeGreaterThan(0)
        expect(entries.some((e) => e.path.includes("file.txt"))).toBe(true)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should remove files",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })

        yield* driver.writeFile(info.id, "/tmp/todelete.txt", "delete me")
        yield* driver.rm(info.id, "/tmp/todelete.txt")

        const result = yield* driver.run(info.id, { cmd: "test", args: ["-f", "/tmp/todelete.txt"] })
        expect(result.exitCode).not.toBe(0)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )
})
