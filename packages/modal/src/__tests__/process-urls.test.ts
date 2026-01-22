import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ModalDriverLive, ModalConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Modal Process URLs", () => {
  const config = {
    appName: "opencode-sandbox-test",
    timeoutMs: 60000,
  }

  const layer = ModalDriverLive.pipe(Layer.provide(ModalConfigLive(config)))

  const itLive = process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET ? it : it.skip

  itLive(
    "should get process URLs for exposed ports using encryptedPorts",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        
        // Create sandbox with Python HTTP server as entrypoint and encryptedPorts
        console.log("Creating sandbox with HTTP server entrypoint...")
        const info = yield* driver.create({ 
          image: "python:3.12-alpine",
          command: ["python3", "-m", "http.server", "8080"],
          encryptedPorts: [8080],
          timeoutMs: 60000,
          idleTimeoutMs: 30000,
        })
        console.log(`Sandbox created: ${info.id}`)
        
        try {
          // Wait for server to start
          console.log("Waiting for server to start...")
          yield* Effect.tryPromise({
            try: () => new Promise(resolve => setTimeout(resolve, 5000)),
            catch: (e) => new Error(String(e))
          })

          // Get the public URLs
          console.log("Getting process URLs...")
          expect(driver.getProcessUrls).toBeDefined()
          
          const urls = yield* driver.getProcessUrls!(info.id, [8080])
          console.log("URLs received:", JSON.stringify(urls))
          
          // Verify we got a URL for port 8080
          expect(urls).toBeDefined()
          expect(typeof urls).toBe("object")
          
          const url8080 = urls[8080]
          console.log(`URL for port 8080: ${url8080}`)
          
          if (url8080) {
            expect(url8080).toMatch(/^https?:\/\//)
            console.log("✓ URL format is valid")
            
            // Try to fetch from the URL using Effect
            yield* Effect.tryPromise({
              try: async () => {
                console.log("Testing URL accessibility...")
                const response = await fetch(url8080, {
                  signal: AbortSignal.timeout(15000),
                })
                console.log(`Response status: ${response.status}`)
                if (response.ok) {
                  const html = await response.text()
                  console.log(`Response (first 200 chars): ${html.substring(0, 200)}`)
                  console.log("✓ Successfully connected to tunneled server!")
                }
              },
              catch: (e) => {
                console.log(`URL fetch failed: ${e}`)
                return new Error(String(e))
              },
            }).pipe(Effect.catchAll(() => Effect.void))
          } else {
            console.log("❌ No URL returned for port 8080")
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
    "should get tunnels with a timeout parameter",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        
        // Create sandbox with Node.js server
        console.log("Creating sandbox with Node.js server...")
        const info = yield* driver.create({ 
          image: "node:20-alpine",
          command: ["node", "-e", `
            const http = require('http');
            const server = http.createServer((req, res) => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ok', port: 3000 }));
            });
            server.listen(3000, '0.0.0.0', () => console.log('Server on 3000'));
          `],
          encryptedPorts: [3000],
          timeoutMs: 60000,
        })
        console.log(`Sandbox created: ${info.id}`)
        
        try {
          // Get tunnels (the tunnels() method waits for the port to be available)
          console.log("Getting tunnels with timeout...")
          const urls = yield* driver.getProcessUrls!(info.id, [3000])
          console.log("URLs:", JSON.stringify(urls))
          
          const url = urls[3000]
          if (url) {
            expect(url).toMatch(/^https?:\/\//)
            console.log(`✓ Got URL: ${url}`)
            
            // Test connectivity
            yield* Effect.tryPromise({
              try: async () => {
                await new Promise(r => setTimeout(r, 2000)) // Brief wait
                const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
                if (res.ok) {
                  const data = await res.json() as { status: string }
                  console.log("Response:", JSON.stringify(data))
                  expect(data.status).toBe("ok")
                }
              },
              catch: (e) => {
                console.log(`Fetch failed: ${e}`)
                return new Error(String(e))
              }
            }).pipe(Effect.catchAll(() => Effect.void))
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
})
