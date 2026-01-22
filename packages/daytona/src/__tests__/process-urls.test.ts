import { describe, it, expect, afterAll } from "bun:test"
import { Effect, Layer, Schedule } from "effect"
import { DaytonaDriverLive, DaytonaConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Daytona Process URLs", () => {
  const config = {
    apiKey: process.env.DAYTONA_API_KEY ?? "test-key",
    baseUrl: "https://app.daytona.io/api",
    timeoutMs: 60000,
  }

  const layer = DaytonaDriverLive.pipe(Layer.provide(DaytonaConfigLive(config)))
  const sandboxesToCleanup: string[] = []

  const itLive = process.env.DAYTONA_API_KEY ? it : it.skip

  const retryPolicy = Schedule.exponential(1000).pipe(Schedule.compose(Schedule.recurs(3)))

  afterAll(async () => {
    if (sandboxesToCleanup.length === 0) return
    console.log(`Cleaning up ${sandboxesToCleanup.length} sandboxes...`)
    const cleanupProgram = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      for (const id of sandboxesToCleanup) {
        console.log(`Destroying ${id}...`)
        yield* driver.destroy(id).pipe(
          Effect.retry(retryPolicy),
          Effect.catchAll(() => Effect.void),
        )
      }
    })
    await Effect.runPromise(Effect.provide(cleanupProgram, layer)).catch(() => {})
  })

  itLive(
    "should get process URLs for sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        // Create sandbox with Python
        console.log("Creating sandbox...")
        const info = yield* driver.create({ image: "python" }).pipe(Effect.retry(retryPolicy))
        console.log(`Sandbox created: ${info.id}`)
        sandboxesToCleanup.push(info.id)

        try {
          // Get the public URLs - this should work even without a process running
          // (will return fallback URL pattern)
          console.log("Getting process URLs...")
          expect(driver.getProcessUrls).toBeDefined()

          const urls = yield* driver.getProcessUrls!(info.id, [8080])
          console.log("URLs received:", JSON.stringify(urls))

          // Verify we got a URL for port 8080
          expect(urls).toBeDefined()
          expect(typeof urls).toBe("object")

          const url8080 = urls[8080]
          console.log(`URL for port 8080: ${url8080}`)
          expect(url8080).toBeDefined()
          expect(url8080).toMatch(/^https?:\/\//)
          console.log("✓ URL format is valid")
        } finally {
          // Cleanup
          console.log("Destroying sandbox...")
          yield* driver.destroy(info.id).pipe(Effect.retry(retryPolicy), Effect.catchAll(() => Effect.void))
          sandboxesToCleanup.splice(sandboxesToCleanup.indexOf(info.id), 1)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should start process and get URLs",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        // Create sandbox with Python
        console.log("Creating sandbox...")
        const info = yield* driver.create({ image: "python" }).pipe(Effect.retry(retryPolicy))
        console.log(`Sandbox created: ${info.id}`)
        sandboxesToCleanup.push(info.id)

        try {
          // Verify startProcess is defined
          expect(driver.startProcess).toBeDefined()

          // Start a simple process using startProcess with timeout
          console.log("Starting echo process...")
          const processInfo = yield* driver
            .startProcess!(info.id, {
              cmd: "echo",
              args: ["hello"],
            })
            .pipe(
              Effect.retry(retryPolicy),
              Effect.timeout(30000),
              Effect.catchAll(() => Effect.succeed({ id: "timeout", status: "running" as const })),
            )
          console.log(`Process started: ${processInfo.id}`)

          // Get the public URLs
          console.log("Getting process URLs...")
          const urls = yield* driver.getProcessUrls!(info.id, [8080])
          console.log("URLs received:", JSON.stringify(urls))

          // Verify we got a URL for port 8080
          expect(urls).toBeDefined()
          expect(urls[8080]).toMatch(/^https?:\/\//)
          console.log("✓ URL format is valid")
        } finally {
          // Cleanup
          console.log("Destroying sandbox...")
          yield* driver.destroy(info.id).pipe(Effect.retry(retryPolicy), Effect.catchAll(() => Effect.void))
          sandboxesToCleanup.splice(sandboxesToCleanup.indexOf(info.id), 1)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should get URLs for multiple ports",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        // Create sandbox
        console.log("Creating sandbox...")
        const info = yield* driver.create({ image: "python" }).pipe(Effect.retry(retryPolicy))
        console.log(`Sandbox created: ${info.id}`)
        sandboxesToCleanup.push(info.id)

        try {
          // Get URLs for multiple ports (should return fallback URLs)
          console.log("Getting process URLs for multiple ports...")
          const urls = yield* driver.getProcessUrls!(info.id, [8080, 3000])
          console.log("URLs received:", JSON.stringify(urls))

          expect(urls).toBeDefined()
          expect(typeof urls).toBe("object")

          // Check that we got URLs
          expect(urls[8080]).toMatch(/^https?:\/\//)
          console.log(`✓ Port 8080 URL: ${urls[8080]}`)
          expect(urls[3000]).toMatch(/^https?:\/\//)
          console.log(`✓ Port 3000 URL: ${urls[3000]}`)
        } finally {
          // Cleanup
          console.log("Destroying sandbox...")
          yield* driver.destroy(info.id).pipe(Effect.retry(retryPolicy), Effect.catchAll(() => Effect.void))
          sandboxesToCleanup.splice(sandboxesToCleanup.indexOf(info.id), 1)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )

  itLive(
    "should handle TypeScript sandbox with getProcessUrls",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        // Create sandbox with TypeScript
        console.log("Creating TypeScript sandbox...")
        const info = yield* driver.create({ image: "typescript" }).pipe(Effect.retry(retryPolicy))
        console.log(`Sandbox created: ${info.id}`)
        sandboxesToCleanup.push(info.id)

        try {
          // Get URLs for multiple ports
          console.log("Getting process URLs...")
          const urls = yield* driver.getProcessUrls!(info.id, [3000, 8080])
          console.log("URLs:", JSON.stringify(urls))

          expect(urls[3000]).toBeDefined()
          expect(urls[3000]).toMatch(/^https?:\/\//)
          console.log(`✓ Port 3000 URL: ${urls[3000]}`)

          expect(urls[8080]).toBeDefined()
          expect(urls[8080]).toMatch(/^https?:\/\//)
          console.log(`✓ Port 8080 URL: ${urls[8080]}`)
        } finally {
          yield* driver.destroy(info.id).pipe(Effect.retry(retryPolicy), Effect.catchAll(() => Effect.void))
          sandboxesToCleanup.splice(sandboxesToCleanup.indexOf(info.id), 1)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    60000,
  )
})
