import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { VercelDriverLive, VercelConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Vercel Driver", () => {
  const config = {
    oidcToken: process.env.VERCEL_OIDC_TOKEN,
    accessToken: process.env.VERCEL_ACCESS_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
    timeoutMs: 600000,
  }

  const layer = VercelDriverLive.pipe(Layer.provide(VercelConfigLive(config)))

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

  const hasCredentials = process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_ACCESS_TOKEN
  const itLive = hasCredentials ? it : it.skip

  itLive(
    "should create and destroy sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        expect(info.id).toBeDefined()
        expect(info.provider).toBe("vercel")
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
        expect(fetched.provider).toBe("vercel")
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
    "should handle failing command",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })
        // Run a command that fails - Vercel SDK may not capture exit codes properly
        const result = yield* driver.run(info.id, { cmd: "ls", args: ["/nonexistent-path-12345"] })
        // Either stderr has content or exitCode is non-zero (SDK behavior varies)
        const hasError = result.stderr.length > 0 || result.exitCode !== 0
        expect(hasError || result.stdout.includes("cannot access")).toBe(true)
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
    "should read file",
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
    "should write file",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })

        yield* driver.writeFile(info.id, "/tmp/write-test.txt", "test content")
        const result = yield* driver.run(info.id, { cmd: "cat", args: ["/tmp/write-test.txt"] })
        expect(result.stdout).toBe("test content")

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should list directory",
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
    "should create directory",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "base" })

        yield* driver.mkdir(info.id, "/tmp/newdir/nested")
        const result = yield* driver.run(info.id, { cmd: "test", args: ["-d", "/tmp/newdir/nested"] })
        expect(result.exitCode).toBe(0)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )
})
