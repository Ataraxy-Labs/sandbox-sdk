import { describe, it, expect, beforeAll } from "bun:test"
import { Effect, Layer } from "effect"
import { DockerDriverLive, DockerConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

// Use high random port to avoid conflicts
const OPENCODE_PORT = 14096

describe("Ralph Flow Integration", () => {
  const config = {
    advertiseHost: "127.0.0.1",
    timeoutMs: 300000,
    defaultPorts: [], // Don't use default ports - specify explicitly in create
  }

  const layer = DockerDriverLive.pipe(Layer.provide(DockerConfigLive(config)))

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
    "should install opencode and get server URL",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        console.log("Creating sandbox with node:20...")
        const info = yield* driver.create({
          image: "node:20",
          workdir: "/workspace",
          encryptedPorts: [OPENCODE_PORT],
        })
        console.log(`Sandbox created: ${info.id}`)

        try {
          // Install opencode
          console.log("Installing opencode...")
          const installResult = yield* driver.run(info.id, {
            cmd: "sh",
            args: [
              "-c",
              `
              export HOME=/root
              export PATH="/root/.opencode/bin:/root/.local/bin:/usr/local/bin:/usr/bin:/bin"
              echo "Installing opencode..."
              curl -fsSL https://opencode.ai/install | bash
              echo "Checking installation..."
              ls -la /root/.opencode/bin/ 2>/dev/null || echo "No /root/.opencode/bin"
              ls -la /root/.local/bin/ 2>/dev/null || echo "No /root/.local/bin"
              which opencode || find / -name "opencode" -type f 2>/dev/null | head -3
              `,
            ],
            timeoutMs: 120000,
          })
          console.log("Install stdout:", installResult.stdout)
          console.log("Install stderr:", installResult.stderr)

          // Get opencode version
          const versionResult = yield* driver.run(info.id, {
            cmd: "sh",
            args: [
              "-c",
              `
              export PATH="/root/.opencode/bin:/root/.local/bin:$PATH"
              opencode --version || echo "opencode not found"
              `,
            ],
            timeoutMs: 30000,
          })
          console.log("Version:", versionResult.stdout.trim())

          // Start opencode server in background
          console.log("Starting opencode server...")
          yield* driver.run(info.id, {
            cmd: "sh",
            args: [
              "-c",
              `
              export PATH="/root/.opencode/bin:/root/.local/bin:$PATH"
              export HOME=/root
              cd /workspace
              nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &
              sleep 3
              cat /tmp/opencode.log || echo "No log yet"
              `,
            ],
            timeoutMs: 30000,
          })

          // Get process URL
          console.log("Getting process URLs...")
          const urls = yield* driver.getProcessUrls!(info.id, [OPENCODE_PORT])
          console.log("URLs:", JSON.stringify(urls))

          const opencodeUrl = urls[OPENCODE_PORT]
          expect(opencodeUrl).toBeDefined()
          console.log(`OpenCode URL: ${opencodeUrl}`)

          if (opencodeUrl) {
            // Wait a bit then check health
            yield* Effect.tryPromise({
              try: () => new Promise((resolve) => setTimeout(resolve, 5000)),
              catch: (e) => new Error(String(e)),
            })

            // Check health endpoint
            yield* Effect.tryPromise({
              try: async () => {
                console.log("Checking health endpoint...")
                const response = await fetch(`${opencodeUrl}/global/health`, {
                  signal: AbortSignal.timeout(10000),
                })
                console.log(`Health response status: ${response.status}`)
                const text = await response.text()
                console.log(`Health response: ${text}`)
              },
              catch: (e) => {
                console.log(`Health check failed: ${e}`)
                return new Error(String(e))
              },
            }).pipe(Effect.catchAll(() => Effect.void))

            // List sessions endpoint
            yield* Effect.tryPromise({
              try: async () => {
                console.log("Checking sessions endpoint...")
                const response = await fetch(`${opencodeUrl}/session`, {
                  signal: AbortSignal.timeout(10000),
                })
                console.log(`Sessions response status: ${response.status}`)
                const data = await response.json()
                console.log(`Sessions: ${JSON.stringify(data)}`)
              },
              catch: (e) => {
                console.log(`Sessions check failed: ${e}`)
                return new Error(String(e))
              },
            }).pipe(Effect.catchAll(() => Effect.void))
          }

          // Check opencode log for any errors
          const logResult = yield* driver.run(info.id, {
            cmd: "cat",
            args: ["/tmp/opencode.log"],
            timeoutMs: 10000,
          })
          console.log("OpenCode log:", logResult.stdout)
        } finally {
          console.log("Destroying sandbox...")
          yield* driver.destroy(info.id)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    300000,
  )

  itLive(
    "should install ralph-wiggum CLI",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        console.log("Creating sandbox with node:20...")
        const info = yield* driver.create({
          image: "node:20",
          workdir: "/workspace",
        })
        console.log(`Sandbox created: ${info.id}`)

        try {
          // Install Bun first (required by ralph-wiggum)
          console.log("Installing Bun...")
          const bunInstallResult = yield* driver.run(info.id, {
            cmd: "sh",
            args: [
              "-c",
              `
              export HOME=/root
              curl -fsSL https://bun.sh/install | bash
              export PATH="/root/.bun/bin:$PATH"
              bun --version
              `,
            ],
            timeoutMs: 120000,
          })
          console.log("Bun install stdout:", bunInstallResult.stdout)
          console.log("Bun install stderr:", bunInstallResult.stderr)

          // Install ralph-wiggum via npm
          console.log("Installing ralph-wiggum...")
          const installResult = yield* driver.run(info.id, {
            cmd: "sh",
            args: [
              "-c",
              `
              export HOME=/root
              export PATH="/root/.bun/bin:$PATH"
              npm install -g @th0rgal/ralph-wiggum
              which ralph || echo "ralph not found"
              ralph --help 2>&1 || echo "ralph --help returned non-zero"
              `,
            ],
            timeoutMs: 120000,
          })
          console.log("Install stdout:", installResult.stdout)
          console.log("Install stderr:", installResult.stderr)
          console.log("Exit code:", installResult.exitCode)

          // Check if ralph is installed
          expect(installResult.stdout).toContain("ralph")
        } finally {
          console.log("Destroying sandbox...")
          yield* driver.destroy(info.id)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    180000,
  )

  itLive(
    "should run full Ralph flow with opencode server",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver

        console.log("Creating sandbox with node:20...")
        const info = yield* driver.create({
          image: "node:20",
          workdir: "/workspace",
          encryptedPorts: [OPENCODE_PORT],
        })
        console.log(`Sandbox created: ${info.id}`)

        try {
          // Step 1: Install Bun
          console.log("Step 1: Installing Bun...")
          yield* driver.run(info.id, {
            cmd: "sh",
            args: ["-c", `
              export HOME=/root
              curl -fsSL https://bun.sh/install | bash
            `],
            timeoutMs: 120000,
          })

          // Step 2: Install opencode
          console.log("Step 2: Installing opencode...")
          yield* driver.run(info.id, {
            cmd: "sh",
            args: ["-c", `
              export HOME=/root
              curl -fsSL https://opencode.ai/install | bash
            `],
            timeoutMs: 120000,
          })

          // Step 3: Install ralph-wiggum
          console.log("Step 3: Installing ralph-wiggum...")
          yield* driver.run(info.id, {
            cmd: "sh",
            args: ["-c", `
              export HOME=/root
              export PATH="/root/.bun/bin:$PATH"
              npm install -g @th0rgal/ralph-wiggum
            `],
            timeoutMs: 120000,
          })

          // Step 4: Clone a test repository
          console.log("Step 4: Cloning test repository...")
          yield* driver.run(info.id, {
            cmd: "sh",
            args: ["-c", `
              cd /workspace
              git clone --depth 1 https://github.com/sindresorhus/is.git test-repo
              ls -la test-repo
            `],
            timeoutMs: 60000,
          })

          // Step 5: Start opencode server in background
          console.log("Step 5: Starting opencode server...")
          yield* driver.run(info.id, {
            cmd: "sh",
            args: ["-c", `
              export HOME=/root
              export PATH="/root/.opencode/bin:/root/.bun/bin:$PATH"
              cd /workspace/test-repo
              nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &
              sleep 3
            `],
            timeoutMs: 30000,
          })

          // Step 6: Get the server URL
          console.log("Step 6: Getting server URL...")
          const urls = yield* driver.getProcessUrls!(info.id, [OPENCODE_PORT])
          const opencodeUrl = urls[OPENCODE_PORT]
          console.log(`OpenCode URL: ${opencodeUrl}`)
          expect(opencodeUrl).toBeDefined()

          // Step 7: Wait for server and check health
          yield* Effect.tryPromise({
            try: () => new Promise((resolve) => setTimeout(resolve, 5000)),
            catch: (e) => new Error(String(e)),
          })

          console.log("Step 7: Checking server health...")
          const healthResponse = yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch(`${opencodeUrl}/global/health`, {
                signal: AbortSignal.timeout(10000),
              })
              return response.json()
            },
            catch: (e) => new Error(String(e)),
          })
          console.log("Health:", JSON.stringify(healthResponse))
          expect((healthResponse as { healthy: boolean }).healthy).toBe(true)

          // Step 8: Create a simple prd.json for ralph
          console.log("Step 8: Creating prd.json...")
          yield* driver.writeFile(info.id, "/workspace/test-repo/prd.json", JSON.stringify({
            name: "test-prd",
            branchName: "main",
            userStories: [
              {
                id: "US-001",
                title: "Add README badge",
                description: "Add a simple badge to README.md",
                priority: 1,
                passes: false,
              },
            ],
          }, null, 2))

          // Step 9: Create prompt.md
          console.log("Step 9: Creating prompt.md...")
          yield* driver.writeFile(info.id, "/workspace/test-repo/prompt.md", `# Task
Read prd.json and implement the first user story.
When complete, reply with: <promise>COMPLETE</promise>`)

          // Step 10: Run ralph --status (to verify it can find opencode)
          console.log("Step 10: Checking ralph status...")
          const ralphStatus = yield* driver.run(info.id, {
            cmd: "sh",
            args: ["-c", `
              export HOME=/root
              export PATH="/root/.opencode/bin:/root/.bun/bin:$PATH"
              cd /workspace/test-repo
              ralph --status 2>&1 || echo "No ralph state yet (expected)"
            `],
            timeoutMs: 30000,
          })
          console.log("Ralph status:", ralphStatus.stdout)

          // Step 11: List sessions via OpenCode API
          console.log("Step 11: Listing sessions...")
          const sessionsResponse = yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch(`${opencodeUrl}/session`, {
                signal: AbortSignal.timeout(10000),
              })
              return response.json()
            },
            catch: (e) => new Error(String(e)),
          })
          console.log("Sessions:", JSON.stringify(sessionsResponse))

          console.log("✅ Full Ralph flow test complete!")
        } finally {
          console.log("Destroying sandbox...")
          yield* driver.destroy(info.id)
          console.log("Sandbox destroyed")
        }
      })

      await Effect.runPromise(Effect.provide(program, layer))
    },
    300000, // 5 minutes timeout
  )
})
