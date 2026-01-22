import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Effect, Layer } from "effect"
import { DockerDriverLive, DockerConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Docker Driver", () => {
  const config = {
    advertiseHost: "127.0.0.1",
    timeoutMs: 60000,
    defaultPorts: [8080],
  }

  const layer = DockerDriverLive.pipe(Layer.provide(DockerConfigLive(config)))

  // Check if Docker is available
  const checkDocker = async (): Promise<boolean> => {
    try {
      const proc = Bun.spawn(["docker", "version"], { stdout: "pipe", stderr: "pipe" })
      const exitCode = await proc.exited
      return exitCode === 0
    } catch {
      return false
    }
  }

  let dockerAvailable = false

  beforeAll(async () => {
    dockerAvailable = await checkDocker()
    if (!dockerAvailable) {
      console.log("⚠️  Docker not available, skipping live tests")
    }
  })

  // Unit test - always runs
  it("should create driver with all required methods", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      expect(driver).toBeDefined()
      expect(driver.create).toBeDefined()
      expect(driver.destroy).toBeDefined()
      expect(driver.status).toBeDefined()
      expect(driver.list).toBeDefined()
      expect(driver.get).toBeDefined()
      expect(driver.run).toBeDefined()
      expect(driver.stream).toBeDefined()
      expect(driver.readFile).toBeDefined()
      expect(driver.writeFile).toBeDefined()
      expect(driver.listDir).toBeDefined()
      expect(driver.mkdir).toBeDefined()
      expect(driver.rm).toBeDefined()
      expect(driver.snapshotCreate).toBeDefined()
      expect(driver.runCode).toBeDefined()
      expect(driver.volumeCreate).toBeDefined()
      expect(driver.volumeDelete).toBeDefined()
      expect(driver.volumeList).toBeDefined()
      expect(driver.volumeGet).toBeDefined()
      expect(driver.startProcess).toBeDefined()
      expect(driver.getProcessUrls).toBeDefined()
    })

    await Effect.runPromise(Effect.provide(program, layer))
  })

  // Helper to conditionally run tests based on Docker availability
  const itLive = (name: string, fn: () => Promise<void>, timeout?: number) => {
    it(name, async () => {
      if (!dockerAvailable) {
        console.log(`  ⏭️  Skipping: ${name} (Docker not available)`)
        return
      }
      await fn()
    }, timeout)
  }

  // ==========================================
  // Sandbox Lifecycle Tests
  // ==========================================

  itLive(
    "should create and destroy sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })
        expect(info.id).toBeDefined()
        expect(info.provider).toBe("docker")
        expect(info.status).toBe("ready")
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
        const name = `test-docker-${Date.now()}`
        const info = yield* driver.create({ image: "alpine:3.21", name })
        expect(info.id).toBeDefined()
        expect(info.name).toBe(name)
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should create sandbox with working directory",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({
          image: "alpine:3.21",
          workdir: "/workspace",
        })
        const result = yield* driver.run(info.id, { cmd: "pwd" })
        expect(result.stdout.trim()).toBe("/workspace")
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
          env: { TEST_VAR: "docker_value", ANOTHER_VAR: "123" },
        })
        const result = yield* driver.run(info.id, { cmd: "printenv", args: ["TEST_VAR"] })
        expect(result.stdout.trim()).toBe("docker_value")
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
        expect(fetched.provider).toBe("docker")
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
        expect(status).toBe("ready")
        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  // ==========================================
  // Command Execution Tests
  // ==========================================

  itLive(
    "should run command in sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })
        const result = yield* driver.run(info.id, { cmd: "echo", args: ["hello docker"] })
        expect(result.stdout.trim()).toBe("hello docker")
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

  // ==========================================
  // File System Tests
  // ==========================================

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

        const binary = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
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
    "should create nested directories",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })

        yield* driver.mkdir(info.id, "/tmp/a/b/c/d")
        const result = yield* driver.run(info.id, { cmd: "ls", args: ["-la", "/tmp/a/b/c"] })
        expect(result.stdout).toContain("d")
        expect(result.exitCode).toBe(0)

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

        const result = yield* driver.run(info.id, { cmd: "ls", args: ["/tmp/todelete.txt"] })
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

        const result = yield* driver.run(info.id, { cmd: "ls", args: ["/tmp/rmdir"] })
        expect(result.exitCode).not.toBe(0)

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  // ==========================================
  // Code Execution Tests
  // ==========================================

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
    "should run JavaScript code",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "node:20-alpine" })

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
    "should run Python code",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python:3.12-alpine" })

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
    "should handle runCode errors",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "python:3.12-alpine" })

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

  // ==========================================
  // Volume Tests
  // ==========================================

  itLive(
    "should create and delete volumes",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const name = `test-vol-${Date.now()}`

        const vol = yield* driver.volumeCreate!(name)
        expect(vol.id).toBe(name)
        expect(vol.name).toBe(name)

        const list = yield* driver.volumeList!()
        expect(list.some((v) => v.name === name)).toBe(true)

        yield* driver.volumeDelete!(name)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should get volume by name",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const name = `test-vol-get-${Date.now()}`

        yield* driver.volumeCreate!(name)
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

        // First sandbox - write data
        const info1 = yield* driver.create({
          image: "alpine:3.21",
          volumes: { "/data": volName },
        })
        yield* driver.writeFile(info1.id, "/data/persist.txt", "persistent data")
        yield* driver.destroy(info1.id)

        // Second sandbox - read data
        const info2 = yield* driver.create({
          image: "alpine:3.21",
          volumes: { "/data": volName },
        })
        const content = yield* driver.readFile(info2.id, "/data/persist.txt", { encoding: "utf8" })
        expect(content).toBe("persistent data")

        yield* driver.destroy(info2.id)
        yield* driver.volumeDelete!(volName)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    120000,
  )

  // ==========================================
  // Snapshot Tests
  // ==========================================

  itLive(
    "should create filesystem snapshot (docker commit)",
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

  // ==========================================
  // Process Tests
  // ==========================================

  itLive(
    "should start background process",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "alpine:3.21" })

        const processInfo = yield* driver.startProcess!(info.id, {
          cmd: "sleep",
          args: ["10"],
          background: true,
        })
        expect(processInfo.id).toBeDefined()
        expect(processInfo.status).toBe("running")

        yield* driver.destroy(info.id)
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )
})
