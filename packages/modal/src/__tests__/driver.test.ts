import { describe, it, expect } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { ModalDriverLive, ModalConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Modal Driver", () => {
  const config = {
    appName: "opencode-sandbox-test",
    timeoutMs: 60000,
  }

  const layer = ModalDriverLive.pipe(Layer.provide(ModalConfigLive(config)))

  it("should create driver", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      expect(driver).toBeDefined()
      expect(driver.create).toBeDefined()
      expect(driver.run).toBeDefined()
      expect(driver.stream).toBeDefined()
      expect(driver.readFile).toBeDefined()
      expect(driver.writeFile).toBeDefined()
      expect(driver.listDir).toBeDefined()
      expect(driver.mkdir).toBeDefined()
      expect(driver.rm).toBeDefined()
    })

    await Effect.runPromise(Effect.provide(program, layer))
  })

  const itLive = process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET ? it : it.skip

  itLive(
    "should create and destroy sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })
        expect(info.id).toBeDefined()
        expect(info.provider).toBe("modal")
        expect(info.status).toBe("ready")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
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

      await Effect.runPromise(Effect.provide(program, layer))
    },
    30000,
  )

  itLive(
    "should get sandbox by id",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })
        const fetched = yield* driver.get(info.id)
        expect(fetched.id).toBe(info.id)
        expect(fetched.provider).toBe("modal")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should get sandbox status",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })
        const status = yield* driver.status(info.id)
        expect(["creating", "ready", "stopped"]).toContain(status)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should run command in sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })
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
        const info = yield* driver.create({ image: "alpine:3.21" })
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
        const info = yield* driver.create({ image: "alpine:3.21" })
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
        const info = yield* driver.create({ image: "alpine:3.21" })
        const result = yield* driver.run(info.id, { cmd: "sh", args: ["-c", "exit 42"] })
        expect(result.exitCode).toBe(42)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should capture stderr",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })
        const result = yield* driver.run(info.id, { cmd: "sh", args: ["-c", "echo error >&2"] })
        expect(result.stderr.trim()).toBe("error")
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
        const info = yield* driver.create({ image: "alpine:3.21" })

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
    "should read and write binary files",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })

        const binary = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
        yield* driver.writeFile(info.id, "/tmp/binary.bin", binary)
        const content = yield* driver.readFile(info.id, "/tmp/binary.bin")
        expect(content instanceof Uint8Array).toBe(true)

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
        const info = yield* driver.create({ image: "alpine:3.21" })

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
    "should list directory recursively",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })

        yield* driver.mkdir(info.id, "/tmp/parent")
        yield* driver.mkdir(info.id, "/tmp/parent/child")
        yield* driver.writeFile(info.id, "/tmp/parent/child/deep.txt", "nested")

        const entries = yield* driver.listDir(info.id, "/tmp/parent", { recursive: true })
        expect(entries.some((e) => e.path.includes("deep.txt"))).toBe(true)

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
        const info = yield* driver.create({ image: "alpine:3.21" })

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

  itLive(
    "should remove directories recursively",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })

        yield* driver.mkdir(info.id, "/tmp/rmdir")
        yield* driver.writeFile(info.id, "/tmp/rmdir/file.txt", "content")
        yield* driver.rm(info.id, "/tmp/rmdir", { recursive: true })

        const result = yield* driver.run(info.id, { cmd: "test", args: ["-d", "/tmp/rmdir"] })
        expect(result.exitCode).not.toBe(0)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should stream command output",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })

        const chunks: string[] = []
        const stream = driver.stream(info.id, { cmd: "sh", args: ["-c", "echo line1; echo line2"] })

        yield* Stream.runForEach(stream, (chunk) => {
          chunks.push(new TextDecoder().decode(chunk.data))
          return Effect.void
        })

        expect(chunks.join("")).toContain("line1")
        expect(chunks.join("")).toContain("line2")

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should create sandbox with custom name",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const name = `test-sandbox-${Date.now()}`
        const info = yield* driver.create({ image: "alpine:3.21", name })
        expect(info.id).toBeDefined()
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should create sandbox with environment variables",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({
          image: "alpine:3.21",
          env: { TEST_VAR: "sandbox_value" },
        })

        const result = yield* driver.run(info.id, { cmd: "printenv", args: ["TEST_VAR"] })
        expect(result.stdout.trim()).toBe("sandbox_value")

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should create filesystem snapshot",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })

        yield* driver.writeFile(info.id, "/tmp/snapshot-test.txt", "snapshot data")

        const snapshot = yield* driver.snapshotCreate!(info.id, { note: "test snapshot" })
        expect(snapshot.id).toBeDefined()
        expect(snapshot.createdAt).toBeDefined()

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    90000,
  )

  itLive(
    "should run Python code",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python:3.12-slim" })

        const result = yield* driver.runCode!(info.id, {
          language: "python",
          code: "print('Hello from Python!')",
        })
        expect(result.stdout.trim()).toBe("Hello from Python!")
        expect(result.exitCode).toBe(0)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    90000,
  )

  itLive(
    "should run JavaScript code",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "node:22-alpine" })

        const result = yield* driver.runCode!(info.id, {
          language: "javascript",
          code: "console.log('Hello from JS!')",
        })
        expect(result.stdout.trim()).toBe("Hello from JS!")
        expect(result.exitCode).toBe(0)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    90000,
  )

  itLive(
    "should run bash code",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })

        const result = yield* driver.runCode!(info.id, {
          language: "bash",
          code: "echo 'Hello from Bash!'",
        })
        expect(result.stdout.trim()).toBe("Hello from Bash!")
        expect(result.exitCode).toBe(0)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should handle runCode errors",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python:3.12-slim" })

        const result = yield* driver.runCode!(info.id, {
          language: "python",
          code: "raise Exception('test error')",
        })
        expect(result.exitCode).not.toBe(0)
        expect(result.stderr).toContain("Exception")

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    90000,
  )

  itLive(
    "should support idleTimeoutMs in create options",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({
          image: "alpine:3.21",
          idleTimeoutMs: 60000,
        })
        expect(info.id).toBeDefined()
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should create and delete volumes",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const name = `test-vol-${Date.now()}`

        const vol = yield* driver.volumeCreate!(name)
        expect(vol.id).toBe(name)
        expect(vol.name).toBe(name)

        const fetched = yield* driver.volumeGet!(name)
        expect(fetched.name).toBe(name)

        yield* driver.volumeDelete!(name)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should create sandbox with mounted volume",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const volName = `test-mount-vol-${Date.now()}`

        yield* driver.volumeCreate!(volName)

        const info = yield* driver.create({
          image: "alpine:3.21",
          volumes: { "/data": volName },
        })

        yield* driver.writeFile(info.id, "/data/test.txt", "volume data")
        const content = yield* driver.readFile(info.id, "/data/test.txt", { encoding: "utf8" })
        expect(content).toBe("volume data")

        yield* driver.destroy(info.id)
        yield* driver.volumeDelete!(volName)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    90000,
  )

  itLive(
    "should persist data across sandbox instances via volume",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const volName = `test-persist-vol-${Date.now()}`

        yield* driver.volumeCreate!(volName)

        const info1 = yield* driver.create({
          image: "alpine:3.21",
          volumes: { "/data": volName },
        })
        const writeResult = yield* driver.run(info1.id, {
          cmd: "sh",
          args: ["-c", "echo -n 'persistent data' > /data/persist.txt && sync && cat /data/persist.txt"],
        })
        expect(writeResult.stdout).toBe("persistent data")
        yield* Effect.sleep("5 seconds")
        yield* driver.destroy(info1.id)

        yield* Effect.sleep("3 seconds")

        const info2 = yield* driver.create({
          image: "alpine:3.21",
          volumes: { "/data": volName },
        })
        const lsResult = yield* driver.run(info2.id, { cmd: "ls", args: ["-la", "/data"] })
        console.log("Volume contents:", lsResult.stdout)

        const result = yield* driver.run(info2.id, { cmd: "cat", args: ["/data/persist.txt"] })
        console.log("File content:", result.stdout, "Exit:", result.exitCode)
        expect(result.stdout).toBe("persistent data")

        yield* driver.destroy(info2.id)
        yield* driver.volumeDelete!(volName)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    180000,
  )
})
