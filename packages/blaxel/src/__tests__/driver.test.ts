import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { BlaxelDriverLive, BlaxelConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Blaxel Driver", () => {
  const testConfig = {
    apiKey: process.env.BLAXEL_API_KEY ?? "test-key",
    workspace: process.env.BLAXEL_WORKSPACE ?? "default",
    timeoutMs: 60000,
  }

  const testLayer = BlaxelDriverLive.pipe(Layer.provide(BlaxelConfigLive(testConfig)))

  it("should create driver with all core operations", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      expect(driver).toBeDefined()
      expect(driver.create).toBeDefined()
      expect(driver.destroy).toBeDefined()
      expect(driver.run).toBeDefined()
      expect(driver.readFile).toBeDefined()
      expect(driver.writeFile).toBeDefined()
      expect(driver.listDir).toBeDefined()
      expect(driver.runCode).toBeDefined()
    })
    await Effect.runPromise(Effect.provide(program, testLayer))
  })

  const itLive = process.env.BLAXEL_API_KEY ? it : it.skip

  itLive(
    "should create and destroy sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })
        expect(info.id).toBeDefined()
        expect(info.provider).toBe("blaxel")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
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
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })
        const fetched = yield* driver.get(info.id)
        expect(fetched.id).toBe(info.id)
        expect(fetched.provider).toBe("blaxel")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should get sandbox status",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })
        const status = yield* driver.status(info.id)
        expect(["creating", "ready", "stopped"]).toContain(status)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should run command in sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })
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
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })
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
    "should handle command errors",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })
        const result = yield* driver.run(info.id, { cmd: "ls", args: ["/nonexistent-path-12345"] })
        expect(result.exitCode).not.toBe(0)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    60000,
  )

  itLive(
    "should run bash code",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })

        const result = yield* driver.runCode!(info.id, {
          language: "bash",
          code: 'echo "Hello from Bash"',
        })

        expect(result.stdout.trim()).toBe("Hello from Bash")
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
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })

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
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })

        yield* driver.run(info.id, { cmd: "mkdir", args: ["-p", "/tmp/testdir"] })
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
        const info = yield* driver.create({ name: `test-${Date.now()}`, image: "blaxel/base-image:latest" })

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
})
