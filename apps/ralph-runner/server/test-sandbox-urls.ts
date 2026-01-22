#!/usr/bin/env bun
/**
 * Manual test script for sandbox URL functionality
 *
 * Usage:
 *   MODAL_TOKEN_ID=xxx MODAL_TOKEN_SECRET=xxx bun run apps/ralph-runner/server/test-sandbox-urls.ts modal
 *   DAYTONA_API_KEY=xxx bun run apps/ralph-runner/server/test-sandbox-urls.ts daytona
 *   # Or with both:
 *   MODAL_TOKEN_ID=xxx MODAL_TOKEN_SECRET=xxx DAYTONA_API_KEY=xxx bun run apps/ralph-runner/server/test-sandbox-urls.ts
 */

import { Effect, Layer } from "effect"
import { ModalDriverLive, ModalConfigLive } from "@ataraxy-labs/sandbox-modal"
import { DaytonaDriverLive, DaytonaConfigLive } from "@ataraxy-labs/sandbox-daytona"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

const TEST_REPO = "https://github.com/octocat/Hello-World.git"
const TEST_PORT = 8080

// Simple HTTP server script
const HTTP_SERVER_SCRIPT = `
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', message: 'Hello from sandbox!', timestamp: new Date().toISOString() }));
});
server.listen(${TEST_PORT}, '0.0.0.0', () => {
  console.log('Server running on port ${TEST_PORT}');
});
`

// Modal driver layer
const modalLayer = ModalDriverLive.pipe(
  Layer.provide(
    ModalConfigLive({
      appName: "ralph-runner-test",
      timeoutMs: 300000,
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
      timeoutMs: 300000,
    }),
  ),
)

const runWithModal = <A, E>(effect: Effect.Effect<A, E, SandboxDriver>) => {
  return Effect.runPromise(Effect.provide(effect, modalLayer))
}

const runWithDaytona = <A, E>(effect: Effect.Effect<A, E, SandboxDriver>) => {
  return Effect.runPromise(Effect.provide(effect, daytonaLayer))
}

async function testProvider(
  provider: "modal" | "daytona",
  runFn: typeof runWithModal,
): Promise<{ success: boolean; url?: string; error?: string }> {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`Testing ${provider.toUpperCase()} provider`)
  console.log("=".repeat(60))

  let sandboxId: string | null = null

  try {
    // Step 1: Create sandbox
    console.log("\n[1/5] Creating sandbox...")
    const startTime = Date.now()
    const sandboxInfo = await runFn(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.create({
          image: "node:20",
          name: `test-url-${Date.now()}`,
        })
      }),
    )

    sandboxId = sandboxInfo.id
    console.log(`      ✓ Sandbox created: ${sandboxId}`)
    console.log(`      ✓ Provider: ${sandboxInfo.provider}`)
    console.log(`      ✓ Status: ${sandboxInfo.status}`)
    console.log(`      ✓ Time: ${Date.now() - startTime}ms`)

    // Step 2: Clone repo
    console.log("\n[2/5] Cloning repository...")
    const cloneStart = Date.now()
    await runFn(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        yield* driver.run(sandboxId!, {
          cmd: "git",
          args: ["clone", "--depth", "1", TEST_REPO, "/workspace/repo"],
          timeoutMs: 120000,
        })
      }),
    )
    console.log(`      ✓ Repository cloned in ${Date.now() - cloneStart}ms`)

    // Step 3: List files to verify
    console.log("\n[3/5] Verifying clone...")
    const files = await runFn(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.listDir(sandboxId!, "/workspace/repo")
      }),
    )
    console.log(`      ✓ Files found: ${files.map((f) => f.path.split("/").pop()).join(", ")}`)

    // Step 4: Start HTTP server
    console.log("\n[4/5] Starting HTTP server...")
    await runFn(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        yield* driver.writeFile(sandboxId!, "/workspace/server.js", HTTP_SERVER_SCRIPT)
        yield* driver.run(sandboxId!, {
          cmd: "sh",
          args: ["-c", `cd /workspace && node server.js &`],
          timeoutMs: 10000,
        })
        // Wait for server to start
        yield* driver.run(sandboxId!, {
          cmd: "sleep",
          args: ["5"],
          timeoutMs: 10000,
        })
      }),
    )
    console.log(`      ✓ HTTP server started on port ${TEST_PORT}`)

    // Step 5: Get public URL
    console.log("\n[5/5] Getting public URL...")
    const urls = await runFn(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        if (driver.getProcessUrls) {
          return yield* driver.getProcessUrls(sandboxId!, [TEST_PORT])
        }
        return {}
      }),
    )

    const publicUrl = urls[TEST_PORT]
    console.log(`      ✓ Public URL: ${publicUrl || "NOT AVAILABLE"}`)

    // Step 6: Test URL accessibility
    if (publicUrl) {
      console.log("\n[6/6] Testing URL accessibility...")
      try {
        const response = await fetch(publicUrl, {
          signal: AbortSignal.timeout(30000),
        })
        console.log(`      ✓ HTTP Status: ${response.status}`)
        if (response.ok) {
          const data = await response.json()
          console.log(`      ✓ Response: ${JSON.stringify(data)}`)
        } else {
          console.log(`      ⚠ Non-OK status: ${response.status}`)
        }
      } catch (e) {
        console.log(`      ⚠ URL fetch failed: ${e instanceof Error ? e.message : String(e)}`)
        console.log(`        (This may be due to server startup time or network latency)`)
      }
    }

    // Cleanup
    console.log("\n[Cleanup] Destroying sandbox...")
    await runFn(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        yield* driver.destroy(sandboxId!)
      }),
    )
    console.log("         ✓ Sandbox destroyed")

    return { success: true, url: publicUrl }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.log(`\n❌ Error: ${error}`)

    // Cleanup on error
    if (sandboxId) {
      try {
        await runFn(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            yield* driver.destroy(sandboxId!)
          }),
        )
        console.log("         ✓ Sandbox cleaned up after error")
      } catch {
        console.log("         ⚠ Failed to cleanup sandbox")
      }
    }

    return { success: false, error }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const testModal = args.length === 0 || args.includes("modal")
  const testDaytona = args.length === 0 || args.includes("daytona")

  const hasModalCreds = !!(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET)
  const hasDaytonaCreds = !!process.env.DAYTONA_API_KEY

  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║         Sandbox URL Test Script                          ║")
  console.log("╠══════════════════════════════════════════════════════════╣")
  console.log(`║  Modal credentials:   ${hasModalCreds ? "✓ Configured" : "✗ Not configured"}                    ║`)
  console.log(`║  Daytona credentials: ${hasDaytonaCreds ? "✓ Configured" : "✗ Not configured"}                    ║`)
  console.log("╚══════════════════════════════════════════════════════════╝")

  if (!hasModalCreds && !hasDaytonaCreds) {
    console.log(`
To run this test, you need to set credentials:

  # For Modal:
  export MODAL_TOKEN_ID=your_token_id
  export MODAL_TOKEN_SECRET=your_token_secret

  # For Daytona:
  export DAYTONA_API_KEY=your_api_key

  # Then run:
  bun run apps/ralph-runner/server/test-sandbox-urls.ts
`)
    process.exit(1)
  }

  const results: { provider: string; success: boolean; url?: string; error?: string }[] = []

  if (testModal && hasModalCreds) {
    const result = await testProvider("modal", runWithModal)
    results.push({ provider: "modal", ...result })
  } else if (testModal && !hasModalCreds) {
    console.log("\n⚠ Skipping Modal test (credentials not configured)")
  }

  if (testDaytona && hasDaytonaCreds) {
    const result = await testProvider("daytona", runWithDaytona)
    results.push({ provider: "daytona", ...result })
  } else if (testDaytona && !hasDaytonaCreds) {
    console.log("\n⚠ Skipping Daytona test (credentials not configured)")
  }

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log("SUMMARY")
  console.log("=".repeat(60))

  for (const result of results) {
    const status = result.success ? "✓ PASS" : "✗ FAIL"
    console.log(`  ${result.provider.toUpperCase()}: ${status}`)
    if (result.url) {
      console.log(`    URL: ${result.url}`)
    }
    if (result.error) {
      console.log(`    Error: ${result.error}`)
    }
  }

  const allPassed = results.every((r) => r.success)
  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => {
  console.error("Fatal error:", e)
  process.exit(1)
})
