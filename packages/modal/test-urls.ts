import { Effect, Layer } from "effect"
import { ModalDriverLive, ModalConfigLive } from "./modal/src/index"
import { SandboxDriver } from "./sdk/src/index"

const TEST_PORT = 8080

const layer = ModalDriverLive.pipe(
  Layer.provide(
    ModalConfigLive({
      appName: "test-urls",
      timeoutMs: 300000,
    })
  )
)

const program = Effect.gen(function* () {
  const driver = yield* SandboxDriver
  
  console.log("Creating sandbox...")
  const info = yield* driver.create({ image: "node:20" })
  console.log(`✓ Sandbox created: ${info.id}`)
  
  try {
    // Write and start a simple HTTP server
    console.log("Starting HTTP server on port 8080...")
    yield* driver.writeFile(info.id, "/tmp/server.js", `
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
}).listen(${TEST_PORT}, '0.0.0.0', () => console.log('Server running'));
`)
    
    // Start server in background
    yield* driver.run(info.id, {
      cmd: "sh",
      args: ["-c", "node /tmp/server.js &"],
      timeoutMs: 10000,
    })
    
    // Wait for server to start
    yield* driver.run(info.id, { cmd: "sleep", args: ["3"], timeoutMs: 10000 })
    console.log("✓ Server started")
    
    // Get process URLs
    console.log("Getting process URLs...")
    if (driver.getProcessUrls) {
      const urls = yield* driver.getProcessUrls(info.id, [TEST_PORT])
      console.log(`✓ URLs received:`, urls)
      
      const url = urls[TEST_PORT]
      if (url) {
        console.log(`\n🔗 Public URL: ${url}`)
      } else {
        console.log("⚠ No URL returned for port", TEST_PORT)
      }
      return { url, sandboxId: info.id }
    } else {
      console.log("⚠ getProcessUrls not available")
      return { url: null, sandboxId: info.id }
    }
  } catch (e) {
    console.log("\nCleaning up after error...")
    yield* driver.destroy(info.id)
    throw e
  }
})

const cleanup = (sandboxId: string) => Effect.gen(function* () {
  const driver = yield* SandboxDriver
  yield* driver.destroy(sandboxId)
  console.log("✓ Sandbox destroyed")
})

async function main() {
  const result = await Effect.runPromise(Effect.provide(program, layer))
  
  if (result.url) {
    console.log("\nTesting URL accessibility...")
    try {
      const response = await fetch(result.url, { signal: AbortSignal.timeout(15000) })
      console.log(`✓ HTTP Status: ${response.status}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`✓ Response:`, data)
      }
    } catch (e: any) {
      console.log(`⚠ Fetch failed:`, e.message || e)
    }
  }
  
  // Cleanup
  console.log("\nCleaning up...")
  await Effect.runPromise(Effect.provide(cleanup(result.sandboxId), layer))
  
  console.log("\n✅ Test complete")
}

main().catch((e) => console.error("\n❌ Test failed:", e))
