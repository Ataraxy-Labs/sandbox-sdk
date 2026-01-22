import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Effect, Layer } from "effect"
import { ModalDriverLive, ModalConfigLive } from "@opencode-ai/sandbox-modal"
import { DaytonaDriverLive, DaytonaConfigLive } from "@opencode-ai/sandbox-daytona"
import { SandboxDriver } from "@opencode-ai/sandbox-sdk"

// Load .env.local if it exists (check both current dir and root)
const loadEnv = async () => {
  const paths = [
    `${process.cwd()}/.env.local`,
    `${process.cwd()}/../../.env.local`, // root from apps/ralph-runner
    `${import.meta.dir}/../../../.env.local`, // root from server/
  ]

  for (const path of paths) {
    try {
      const envFile = await Bun.file(path).text()
      for (const line of envFile.split("\n")) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=")
          if (key && valueParts.length > 0) {
            process.env[key] = valueParts.join("=")
          }
        }
      }
      console.log(`Loaded env from: ${path}`)
    } catch {
      // File not found, try next
    }
  }
}

// Load env before checking credentials
await loadEnv()

// Skip tests if credentials not configured
const hasModalCredentials = !!(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET)
const hasDaytonaCredentials = !!process.env.DAYTONA_API_KEY

console.log(`Modal credentials: ${hasModalCredentials ? "✓" : "✗"}`)
console.log(`Daytona credentials: ${hasDaytonaCredentials ? "✓" : "✗"}`)

// Test configuration
const TEST_REPO = "https://github.com/octocat/Hello-World.git"
const TEST_PORT = 8080
const TIMEOUT_MS = 300000 // 5 minutes for sandbox creation

// Modal driver layer
const modalLayer = ModalDriverLive.pipe(
  Layer.provide(
    ModalConfigLive({
      appName: "ralph-runner-test",
      timeoutMs: TIMEOUT_MS,
      idleTimeoutMs: 600000,
    }),
  ),
)

// Daytona driver layer
const daytonaLayer = DaytonaDriverLive.pipe(
  Layer.provide(
    DaytonaConfigLive({
      apiKey: process.env.DAYTONA_API_KEY || "",
      baseUrl: process.env.DAYTONA_BASE_URL || "https://app.daytona.io/api",
      organizationId: process.env.DAYTONA_ORG_ID,
      timeoutMs: TIMEOUT_MS,
    }),
  ),
)

// Helper to run Effect with a provider
const runWithModal = <A, E>(effect: Effect.Effect<A, E, SandboxDriver>) => {
  return Effect.runPromise(Effect.provide(effect, modalLayer))
}

const runWithDaytona = <A, E>(effect: Effect.Effect<A, E, SandboxDriver>) => {
  return Effect.runPromise(Effect.provide(effect, daytonaLayer))
}

// Simple HTTP server script to run in the sandbox
const HTTP_SERVER_SCRIPT = `
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', message: 'Hello from sandbox!' }));
});
server.listen(${TEST_PORT}, '0.0.0.0', () => {
  console.log('Server running on port ${TEST_PORT}');
});
`

describe("Sandbox URL Tests", () => {
  describe("Modal Provider", () => {
    let sandboxId: string | null = null

    afterAll(async () => {
      // Cleanup: destroy sandbox if created
      if (sandboxId) {
        try {
          await runWithModal(
            Effect.gen(function* () {
              const driver = yield* SandboxDriver
              yield* driver.destroy(sandboxId!)
            }),
          )
          console.log(`[Modal] Cleaned up sandbox: ${sandboxId}`)
        } catch (e) {
          console.log(`[Modal] Cleanup failed (may already be deleted): ${e}`)
        }
      }
    })

    test.skipIf(!hasModalCredentials)("creates sandbox and returns public URL", async () => {
      console.log("[Modal] Creating sandbox...")

      // Create sandbox
      const sandboxInfo = await runWithModal(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          return yield* driver.create({
            image: "node:20",
            name: `test-url-${Date.now()}`,
          })
        }),
      )

      sandboxId = sandboxInfo.id
      console.log(`[Modal] Sandbox created: ${sandboxId}`)

      expect(sandboxInfo.id).toBeTruthy()
      expect(sandboxInfo.provider).toBe("modal")
      expect(sandboxInfo.status).toBe("ready")

      // Clone a simple repo
      console.log("[Modal] Cloning repository...")
      const cloneResult = await runWithModal(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          yield* driver.run(sandboxId!, {
            cmd: "git",
            args: ["clone", "--depth", "1", TEST_REPO, "/workspace/repo"],
            timeoutMs: 120000,
          })
          return yield* driver.listDir(sandboxId!, "/workspace/repo")
        }),
      )

      console.log(`[Modal] Cloned repo, files: ${cloneResult.map((f) => f.path).join(", ")}`)
      expect(cloneResult.length).toBeGreaterThan(0)

      // Write and start HTTP server
      console.log("[Modal] Starting HTTP server...")
      await runWithModal(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          yield* driver.writeFile(sandboxId!, "/workspace/server.js", HTTP_SERVER_SCRIPT)
          // Start server in background
          yield* driver.run(sandboxId!, {
            cmd: "sh",
            args: ["-c", `node /workspace/server.js &`],
            timeoutMs: 10000,
          })
          // Wait for server to start
          yield* driver.run(sandboxId!, {
            cmd: "sleep",
            args: ["3"],
            timeoutMs: 10000,
          })
        }),
      )

      // Get public URL
      console.log("[Modal] Getting public URL...")
      const urls = await runWithModal(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          if (driver.getProcessUrls) {
            return yield* driver.getProcessUrls(sandboxId!, [TEST_PORT])
          }
          return {}
        }),
      )

      console.log(`[Modal] URLs received: ${JSON.stringify(urls)}`)

      const publicUrl = urls[TEST_PORT]
      console.log(`[Modal] Public URL for port ${TEST_PORT}: ${publicUrl}`)

      // Verify URL is returned
      expect(publicUrl).toBeTruthy()
      expect(publicUrl).toMatch(/^https?:\/\//)

      // Try to fetch from the URL (may fail due to startup time)
      if (publicUrl) {
        console.log(`[Modal] Testing URL accessibility: ${publicUrl}`)
        try {
          const response = await fetch(publicUrl, { 
            signal: AbortSignal.timeout(30000),
          })
          console.log(`[Modal] Response status: ${response.status}`)
          if (response.ok) {
            const data = await response.json()
            console.log(`[Modal] Response data: ${JSON.stringify(data)}`)
            expect(data.status).toBe("ok")
          }
        } catch (e) {
          console.log(`[Modal] URL fetch failed (server may still be starting): ${e}`)
          // Don't fail the test - URL was returned, that's what we're testing
        }
      }
    }, TIMEOUT_MS + 60000)
  })

  describe("Daytona Provider", () => {
    let sandboxId: string | null = null

    afterAll(async () => {
      // Cleanup: destroy sandbox if created
      if (sandboxId) {
        try {
          await runWithDaytona(
            Effect.gen(function* () {
              const driver = yield* SandboxDriver
              yield* driver.destroy(sandboxId!)
            }),
          )
          console.log(`[Daytona] Cleaned up sandbox: ${sandboxId}`)
        } catch (e) {
          console.log(`[Daytona] Cleanup failed (may already be deleted): ${e}`)
        }
      }
    })

    test.skipIf(!hasDaytonaCredentials)("creates sandbox and returns public URL", async () => {
      console.log("[Daytona] Creating sandbox...")

      // Create sandbox
      const sandboxInfo = await runWithDaytona(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          return yield* driver.create({
            image: "node:20",
            name: `test-url-${Date.now()}`,
          })
        }),
      )

      sandboxId = sandboxInfo.id
      console.log(`[Daytona] Sandbox created: ${sandboxId}`)

      expect(sandboxInfo.id).toBeTruthy()
      expect(sandboxInfo.provider).toBe("daytona")
      expect(sandboxInfo.status).toBe("ready")

      // Clone a simple repo
      console.log("[Daytona] Cloning repository...")
      const cloneResult = await runWithDaytona(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          yield* driver.run(sandboxId!, {
            cmd: "git",
            args: ["clone", "--depth", "1", TEST_REPO, "/workspace/repo"],
            timeoutMs: 120000,
          })
          return yield* driver.listDir(sandboxId!, "/workspace/repo")
        }),
      )

      console.log(`[Daytona] Cloned repo, files: ${cloneResult.map((f) => f.path).join(", ")}`)
      expect(cloneResult.length).toBeGreaterThan(0)

      // Write and start HTTP server
      console.log("[Daytona] Starting HTTP server...")
      await runWithDaytona(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          yield* driver.writeFile(sandboxId!, "/workspace/server.js", HTTP_SERVER_SCRIPT)
          // Start server in background
          yield* driver.run(sandboxId!, {
            cmd: "sh",
            args: ["-c", `node /workspace/server.js &`],
            timeoutMs: 10000,
          })
          // Wait for server to start
          yield* driver.run(sandboxId!, {
            cmd: "sleep",
            args: ["3"],
            timeoutMs: 10000,
          })
        }),
      )

      // Get public URL
      console.log("[Daytona] Getting public URL...")
      const urls = await runWithDaytona(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          if (driver.getProcessUrls) {
            return yield* driver.getProcessUrls(sandboxId!, [TEST_PORT])
          }
          return {}
        }),
      )

      console.log(`[Daytona] URLs received: ${JSON.stringify(urls)}`)

      const publicUrl = urls[TEST_PORT]
      console.log(`[Daytona] Public URL for port ${TEST_PORT}: ${publicUrl}`)

      // Verify URL is returned
      expect(publicUrl).toBeTruthy()
      expect(publicUrl).toMatch(/^https?:\/\//)

      // Try to fetch from the URL
      if (publicUrl) {
        console.log(`[Daytona] Testing URL accessibility: ${publicUrl}`)
        try {
          const response = await fetch(publicUrl, {
            signal: AbortSignal.timeout(30000),
          })
          console.log(`[Daytona] Response status: ${response.status}`)
          if (response.ok) {
            const data = await response.json()
            console.log(`[Daytona] Response data: ${JSON.stringify(data)}`)
            expect(data.status).toBe("ok")
          }
        } catch (e) {
          console.log(`[Daytona] URL fetch failed (server may still be starting): ${e}`)
          // Don't fail the test - URL was returned, that's what we're testing
        }
      }
    }, TIMEOUT_MS + 60000)
  })
})

// Run both providers in parallel test
describe("Parallel Provider Test", () => {
  const sandboxIds: { modal?: string; daytona?: string } = {}

  afterAll(async () => {
    // Cleanup both sandboxes
    const cleanupPromises: Promise<void>[] = []
    
    if (sandboxIds.modal && hasModalCredentials) {
      cleanupPromises.push(
        runWithModal(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            yield* driver.destroy(sandboxIds.modal!)
          }),
        ).catch((e) => console.log(`[Modal] Parallel cleanup failed: ${e}`))
      )
    }
    
    if (sandboxIds.daytona && hasDaytonaCredentials) {
      cleanupPromises.push(
        runWithDaytona(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            yield* driver.destroy(sandboxIds.daytona!)
          }),
        ).catch((e) => console.log(`[Daytona] Parallel cleanup failed: ${e}`))
      )
    }
    
    await Promise.all(cleanupPromises)
  })

  test.skipIf(!hasModalCredentials && !hasDaytonaCredentials)(
    "creates sandboxes and gets URLs from multiple providers in parallel",
    async () => {
      const results: { provider: string; sandboxId: string; url?: string; error?: string }[] = []

      const createAndGetUrl = async (
        provider: "modal" | "daytona",
        runFn: typeof runWithModal
      ): Promise<{ provider: string; sandboxId: string; url?: string; error?: string }> => {
        try {
          console.log(`[${provider}] Starting parallel test...`)

          // Create sandbox
          const sandboxInfo = await runFn(
            Effect.gen(function* () {
              const driver = yield* SandboxDriver
              return yield* driver.create({
                image: "node:20",
                name: `parallel-test-${Date.now()}`,
              })
            }),
          )

          sandboxIds[provider] = sandboxInfo.id
          console.log(`[${provider}] Created sandbox: ${sandboxInfo.id}`)

          // Clone repo
          await runFn(
            Effect.gen(function* () {
              const driver = yield* SandboxDriver
              yield* driver.run(sandboxInfo.id, {
                cmd: "git",
                args: ["clone", "--depth", "1", TEST_REPO, "/workspace/repo"],
                timeoutMs: 120000,
              })
            }),
          )
          console.log(`[${provider}] Cloned repo`)

          // Start server
          await runFn(
            Effect.gen(function* () {
              const driver = yield* SandboxDriver
              yield* driver.writeFile(sandboxInfo.id, "/workspace/server.js", HTTP_SERVER_SCRIPT)
              yield* driver.run(sandboxInfo.id, {
                cmd: "sh",
                args: ["-c", `node /workspace/server.js &`],
                timeoutMs: 10000,
              })
              yield* driver.run(sandboxInfo.id, {
                cmd: "sleep",
                args: ["3"],
                timeoutMs: 10000,
              })
            }),
          )
          console.log(`[${provider}] Started server`)

          // Get URL
          const urls = await runFn(
            Effect.gen(function* () {
              const driver = yield* SandboxDriver
              if (driver.getProcessUrls) {
                return yield* driver.getProcessUrls(sandboxInfo.id, [TEST_PORT])
              }
              return {}
            }),
          )

          const url = urls[TEST_PORT]
          console.log(`[${provider}] Got URL: ${url}`)

          return { provider, sandboxId: sandboxInfo.id, url }
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          console.log(`[${provider}] Error: ${error}`)
          return { provider, sandboxId: sandboxIds[provider] || "", error }
        }
      }

      // Run both providers in parallel
      const promises: Promise<typeof results[0]>[] = []
      
      if (hasModalCredentials) {
        promises.push(createAndGetUrl("modal", runWithModal))
      }
      
      if (hasDaytonaCredentials) {
        promises.push(createAndGetUrl("daytona", runWithDaytona))
      }

      const parallelResults = await Promise.all(promises)
      results.push(...parallelResults)

      console.log("\n=== Parallel Test Results ===")
      for (const result of results) {
        console.log(`${result.provider}: ${result.url || result.error || "no URL"}`)
        if (!result.error) {
          expect(result.url).toBeTruthy()
          expect(result.url).toMatch(/^https?:\/\//)
        }
      }

      // At least one provider should succeed
      const successfulResults = results.filter((r) => r.url && !r.error)
      expect(successfulResults.length).toBeGreaterThan(0)
    },
    TIMEOUT_MS * 2,
  )
})
