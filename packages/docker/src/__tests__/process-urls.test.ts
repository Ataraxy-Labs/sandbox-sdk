import { describe, it, expect, beforeAll } from "bun:test"
import { Effect, Layer } from "effect"
import { DockerDriverLive, DockerConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Docker Process URLs", () => {
  // Use high random ports to avoid conflicts with host services
  // These are container-internal ports, Docker maps them to random host ports
  const testPort1 = 18080
  const testPort2 = 13000

  const config = {
    advertiseHost: "127.0.0.1",
    timeoutMs: 60000,
    defaultPorts: [], // Don't expose by default - tests specify their own ports
  }

  const layer = DockerDriverLive.pipe(Layer.provide(DockerConfigLive(config)))

  // Layer with default port for specific test
  const layerWithDefaultPort = DockerDriverLive.pipe(
    Layer.provide(
      DockerConfigLive({
        advertiseHost: "127.0.0.1",
        timeoutMs: 60000,
        defaultPorts: [testPort1],
      }),
    ),
  )

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

  const itLive = (name: string, fn: () => Promise<void>, timeout?: number) => {
    it(name, async () => {
      if (!dockerAvailable) {
        console.log(`  ⏭️  Skipping: ${name} (Docker not available)`)
        return
      }
      await fn()
    }, timeout)
  }

  itLive(
    "should get process URLs for exposed ports",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        // Create sandbox with Python HTTP server as entrypoint
        console.log("Creating sandbox with HTTP server...")
        const info = yield* driver.create({
          image: "python:3.12-alpine",
          command: ["python3", "-m", "http.server", String(testPort1)],
          encryptedPorts: [testPort1],
        })
        console.log(`Sandbox created: ${info.id}`)

        try {
          // Wait for server to start
          console.log("Waiting for server to start...")
          yield* Effect.tryPromise({
            try: () => new Promise((resolve) => setTimeout(resolve, 3000)),
            catch: (e) => new Error(String(e)),
          })

          // Get the URLs
          console.log("Getting process URLs...")
          expect(driver.getProcessUrls).toBeDefined()

          const urls = yield* driver.getProcessUrls!(info.id, [testPort1])
          console.log("URLs received:", JSON.stringify(urls))

          // Verify we got a URL for the port
          expect(urls).toBeDefined()
          expect(typeof urls).toBe("object")

          const url = urls[testPort1]
          console.log(`URL for port ${testPort1}: ${url}`)

          if (url) {
            expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
            console.log("✓ URL format is valid")

            // Try to fetch from the URL
            yield* Effect.tryPromise({
              try: async () => {
                console.log("Testing URL accessibility...")
                const response = await fetch(url, {
                  signal: AbortSignal.timeout(10000),
                })
                console.log(`Response status: ${response.status}`)
                if (response.ok) {
                  console.log("✓ Successfully connected to HTTP server!")
                }
              },
              catch: (e) => {
                console.log(`URL fetch failed: ${e}`)
                return new Error(String(e))
              },
            }).pipe(Effect.catchAll(() => Effect.void))
          }
        } finally {
          // Cleanup
          console.log("Destroying sandbox...")
          yield* driver.destroy(info.id)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    120000,
  )

  itLive(
    "should get URLs for multiple ports",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        // Create sandbox with Node.js server on multiple ports
        console.log("Creating sandbox with multi-port server...")
        const info = yield* driver.create({
          image: "node:20-alpine",
          command: [
            "node",
            "-e",
            `
            const http = require('http');
            http.createServer((req, res) => {
              res.writeHead(200);
              res.end('Port ${testPort2}');
            }).listen(${testPort2}, '0.0.0.0');
            http.createServer((req, res) => {
              res.writeHead(200);
              res.end('Port ${testPort1}');
            }).listen(${testPort1}, '0.0.0.0');
            console.log('Servers running');
          `,
          ],
          encryptedPorts: [testPort2, testPort1],
        })
        console.log(`Sandbox created: ${info.id}`)

        try {
          // Wait for servers to start
          yield* Effect.tryPromise({
            try: () => new Promise((resolve) => setTimeout(resolve, 3000)),
            catch: (e) => new Error(String(e)),
          })

          // Get URLs for both ports
          const urls = yield* driver.getProcessUrls!(info.id, [testPort2, testPort1])
          console.log("URLs:", JSON.stringify(urls))

          // Both ports should have URLs
          expect(urls[testPort2]).toBeDefined()
          expect(urls[testPort1]).toBeDefined()

          if (urls[testPort2] && urls[testPort1]) {
            expect(urls[testPort2]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
            expect(urls[testPort1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

            // Port mappings should be different
            expect(urls[testPort2]).not.toBe(urls[testPort1])
            console.log("✓ Both ports mapped successfully")
          }
        } finally {
          yield* driver.destroy(info.id)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    120000,
  )

  itLive(
    "should return empty object for non-exposed ports",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        // Create sandbox without exposing any ports
        const info = yield* driver.create({
          image: "alpine:3.21",
        })

        try {
          // Request URLs for ports that weren't exposed
          const urls = yield* driver.getProcessUrls!(info.id, [9999, 8888])
          console.log("URLs for non-exposed ports:", JSON.stringify(urls))

          // Should return empty object or undefined for non-exposed ports
          expect(urls[9999]).toBeUndefined()
          expect(urls[8888]).toBeUndefined()
        } finally {
          yield* driver.destroy(info.id)
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should expose ports specified in config defaultPorts",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        // Create sandbox - defaultPorts from config should be exposed (testPort1)
        console.log("Creating sandbox with default ports from config...")
        const info = yield* driver.create({
          image: "python:3.12-alpine",
          command: ["python3", "-m", "http.server", String(testPort1)],
        })

        try {
          yield* Effect.tryPromise({
            try: () => new Promise((resolve) => setTimeout(resolve, 2000)),
            catch: (e) => new Error(String(e)),
          })

          const urls = yield* driver.getProcessUrls!(info.id, [testPort1])
          console.log("URLs from default ports:", JSON.stringify(urls))

          // testPort1 should be available from defaultPorts
          expect(urls[testPort1]).toBeDefined()
          if (urls[testPort1]) {
            expect(urls[testPort1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
            console.log(`✓ Default port ${testPort1} exposed successfully`)
          }
        } finally {
          yield* driver.destroy(info.id)
        }
      })

      await Effect.runPromise(Effect.provide(program, layerWithDefaultPort))
    },
    90000,
  )
})
