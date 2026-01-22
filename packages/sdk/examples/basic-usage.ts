/**
 * Basic usage example for @opencode-ai/sandbox-sdk
 *
 * This example demonstrates the Vercel-like DX API for creating
 * and managing sandboxes across different providers.
 */

// When using the published package:
// import { Sandbox, Command, CommandResult } from "@opencode-ai/sandbox-sdk"
// import type { SandboxDriverService, CreateOptions, SandboxInfo } from "@opencode-ai/sandbox-sdk"

// For local development:
import { Sandbox } from "../src/api/sandbox"
import type { SandboxDriverService } from "../src/driver"
import type { CreateOptions, SandboxInfo } from "../src/types"

// Example: Create a mock driver for demonstration
// In practice, you'd use a real provider like:
// import { ModalDriverLive } from "@opencode-ai/sandbox-modal"
// import { E2BDriverLive } from "@opencode-ai/sandbox-e2b"

async function main() {
  // Note: This example uses a placeholder driver
  // Replace with your actual provider driver
  const mockDriver = createMockDriver()

  // ─────────────────────────────────────────────────────────────────────────────
  // Example 1: Basic sandbox creation with automatic cleanup
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Example 1: Basic sandbox with auto-cleanup")
  {
    await using sandbox = await Sandbox.create({
      image: "node:22",
      timeoutMs: 300000, // 5 minutes
      provider: { driver: mockDriver },
    })

    console.log(`Created sandbox: ${sandbox.id}`)

    // Run a simple command
    const result = await sandbox.runCommand("echo", ["Hello, World!"])
    console.log(`Exit code: ${result.exitCode}`)
    console.log(`Output: ${result.text()}`)

    // Sandbox automatically stops when block exits
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Example 2: Running commands with full options
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nExample 2: Commands with full options")
  {
    const sandbox = await Sandbox.create({
      image: "node:22",
      env: { NODE_ENV: "production" },
      provider: { driver: mockDriver },
    })

    try {
      // Run with environment variables and working directory
      const result = await sandbox.runCommand({
        cmd: "node",
        args: ["-e", "console.log(JSON.stringify({ env: process.env.NODE_ENV }))"],
        env: { EXTRA_VAR: "value" },
      })

      console.log(`JSON output: ${result.json<{ env: string }>().env}`)
    } finally {
      await sandbox.stop()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Example 3: File system operations
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nExample 3: File system operations")
  {
    await using sandbox = await Sandbox.create({
      image: "alpine:3.21",
      provider: { driver: mockDriver },
    })

    // Write files
    await sandbox.fs.writeText("/tmp/hello.txt", "Hello from sandbox!")
    await sandbox.fs.writeJson("/tmp/config.json", { debug: true, version: "1.0" })

    // Read files
    const text = await sandbox.fs.readText("/tmp/hello.txt")
    console.log(`Read text: ${text}`)

    const config = await sandbox.fs.readJson<{ debug: boolean }>("/tmp/config.json")
    console.log(`Read JSON: ${JSON.stringify(config)}`)

    // List directory
    const entries = await sandbox.fs.list("/tmp")
    console.log(`Files in /tmp: ${entries.map((e) => e.path).join(", ")}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Example 4: Streaming command output
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nExample 4: Streaming command output")
  {
    await using sandbox = await Sandbox.create({
      image: "alpine:3.21",
      provider: { driver: mockDriver },
    })

    const command = sandbox.command("sh", ["-c", "for i in 1 2 3; do echo $i; sleep 0.1; done"])

    process.stdout.write("Streaming: ")
    for await (const chunk of command.stream()) {
      const text = new TextDecoder().decode(chunk.data)
      process.stdout.write(text.trim() + " ")
    }
    console.log()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Example 5: Getting URLs for exposed ports
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nExample 5: Getting exposed port URLs")
  {
    await using sandbox = await Sandbox.create({
      image: "node:22",
      encryptedPorts: [3000],
      provider: { driver: mockDriver },
    })

    // Start a dev server (detached)
    await sandbox.runCommand({
      cmd: "node",
      args: ["-e", "require('http').createServer((req, res) => res.end('OK')).listen(3000)"],
    })

    try {
      const url = await sandbox.domain(3000)
      console.log(`Server URL: ${url}`)
    } catch (err) {
      console.log("Note: domain() requires provider support for getProcessUrls")
    }
  }

  console.log("\nAll examples completed!")
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock driver for demonstration purposes
// ─────────────────────────────────────────────────────────────────────────────

function createMockDriver(): SandboxDriverService {
  const { Effect, Stream } = require("effect")

  let sandboxCounter = 0
  const sandboxes = new Map<string, SandboxInfo>()

  return {
    create: (opts: CreateOptions) =>
      Effect.succeed({
        id: `mock-sbx-${++sandboxCounter}`,
        name: opts.name,
        provider: "mock",
        status: "ready" as const,
        createdAt: new Date().toISOString(),
      }),

    destroy: (id: string) =>
      Effect.sync(() => {
        sandboxes.delete(id)
      }),

    status: () => Effect.succeed("ready" as const),

    list: () => Effect.succeed(Array.from(sandboxes.values())),

    get: (id: string) =>
      Effect.succeed({
        id,
        provider: "mock",
        status: "ready" as const,
        createdAt: new Date().toISOString(),
      }),

    run: (_id: string, cmd: { cmd: string; args?: readonly string[] }) =>
      Effect.succeed({
        exitCode: 0,
        stdout: `Mock output for: ${cmd.cmd} ${(cmd.args ?? []).join(" ")}\n`,
        stderr: "",
      }),

    stream: (_id: string, cmd: { cmd: string; args?: readonly string[] }) =>
      Stream.make({
        channel: "stdout" as const,
        data: new TextEncoder().encode(`Mock stream output for: ${cmd.cmd}\n`),
      }),

    readFile: (_id: string, path: string, opts?: { encoding?: string }) =>
      Effect.succeed(opts?.encoding === "utf8" ? `Mock content of ${path}` : new TextEncoder().encode(`Mock content`)),

    writeFile: () => Effect.void,

    listDir: (_id: string, path: string) =>
      Effect.succeed([
        { path: `${path}/file1.txt`, type: "file" as const },
        { path: `${path}/dir1`, type: "dir" as const },
      ]),

    mkdir: () => Effect.void,

    rm: () => Effect.void,
  }
}

main().catch(console.error)
