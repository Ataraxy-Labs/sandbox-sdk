# @ataraxy-labs/sandbox-sdk

A multi-provider sandbox SDK with a Vercel-like DX for running isolated code execution environments.

## Features

- **Multi-Provider Support**: Works with Modal, E2B, Vercel, Daytona, Cloudflare, and Blaxel
- **Promise-based API**: Simple, intuitive API inspired by Vercel's @vercel/sandbox
- **Effect-based Internals**: Power users can access the Effect-based API for advanced use cases
- **AsyncDisposable Support**: Use `await using` for automatic cleanup
- **TypeScript First**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
pnpm add @ataraxy-labs/sandbox-sdk
```

## Quick Start

```typescript
import { Sandbox } from "@ataraxy-labs/sandbox-sdk";
import { ModalDriverLive } from "@ataraxy-labs/sandbox-modal"; // or your preferred provider

// Create a sandbox with automatic cleanup
await using sandbox = await Sandbox.create({
  image: "node:22",
  provider: { driver: modalDriver },
});

// Run a command
const result = await sandbox.runCommand("echo", ["Hello, World!"]);
console.log(result.stdout); // "Hello, World!\n"

// Sandbox automatically stopped at the end of the block
```

## API Reference

### Sandbox

The main class for interacting with sandboxes.

#### Static Methods

```typescript
// Create a new sandbox
const sandbox = await Sandbox.create({
  image: "alpine:3.21",
  timeoutMs: 600000, // 10 minutes
  env: { NODE_ENV: "production" },
  provider: { driver: yourDriver },
});

// Get an existing sandbox by ID
const sandbox = await Sandbox.get({
  id: "sbx-abc123",
  provider: { driver: yourDriver },
});

// List all sandboxes
const sandboxes = await Sandbox.list({
  provider: { driver: yourDriver },
});
```

#### Instance Methods

```typescript
// Run a command (simple form)
const result = await sandbox.runCommand("npm", ["install"]);

// Run a command (full options)
const result = await sandbox.runCommand({
  cmd: "npm",
  args: ["run", "build"],
  cwd: "/app",
  env: { NODE_ENV: "production" },
  timeoutMs: 60000,
});

// Access command results
console.log(result.exitCode);
console.log(result.stdout);
console.log(result.stderr);
console.log(result.text()); // trimmed stdout
console.log(result.json()); // parsed JSON from stdout

// Create a streaming command
const command = sandbox.command("npm", ["run", "dev"]);
for await (const chunk of command.stream()) {
  process.stdout.write(chunk.data);
}

// Get URL for an exposed port
const url = await sandbox.domain(3000);
console.log(`Open ${url} in your browser`);

// Stop the sandbox
await sandbox.stop();
```

#### File System Operations

```typescript
// Read a file
const content = await sandbox.fs.readFile("/app/config.json", { encoding: "utf8" });

// Convenience methods
const text = await sandbox.fs.readText("/app/README.md");
const json = await sandbox.fs.readJson<{ name: string }>("/app/package.json");

// Write files
await sandbox.fs.writeFile("/app/output.txt", "Hello");
await sandbox.fs.writeText("/app/config.json", JSON.stringify(config));
await sandbox.fs.writeJson("/app/data.json", { key: "value" });

// Directory operations
await sandbox.fs.mkdir("/app/dist");
const entries = await sandbox.fs.list("/app");
await sandbox.fs.rm("/app/temp", { recursive: true });

// Check existence
const exists = await sandbox.fs.exists("/app/package.json");
```

#### Snapshots (Provider-dependent)

```typescript
// Create a snapshot
const snapshot = await sandbox.snapshot({ name: "after-install" });
console.log(`Snapshot ID: ${snapshot.id}`);

// Restore from a snapshot
await sandbox.restoreSnapshot(snapshot.id);

// List snapshots
const snapshots = await sandbox.listSnapshots();
```

### Command

Represents a command execution in a sandbox.

```typescript
// Create a command without executing
const command = sandbox.command("npm", ["run", "dev"], {
  cwd: "/app",
  env: { PORT: "3000" },
});

// Execute and wait for completion
const result = await command.run();

// Stream output
for await (const chunk of command.stream()) {
  if (chunk.channel === "stdout") {
    process.stdout.write(chunk.data);
  } else {
    process.stderr.write(chunk.data);
  }
}

// Get output after streaming
const stdout = await command.getStdout();
const stderr = await command.getStderr();
const output = await command.getOutput(); // combined
```

### CommandResult

Represents a completed command execution.

```typescript
const result = await sandbox.runCommand("node", ["-e", "console.log(JSON.stringify({ok:true}))"]);

result.exitCode; // 0
result.stdout;   // '{"ok":true}\n'
result.stderr;   // ''
result.text();   // '{"ok":true}'
result.json();   // { ok: true }
```

## Using with AsyncDisposable

The SDK supports the `await using` syntax for automatic cleanup:

```typescript
async function runTask() {
  await using sandbox = await Sandbox.create({
    image: "node:22",
    provider: { driver: yourDriver },
  });

  // Do work...
  await sandbox.runCommand("npm", ["install"]);
  await sandbox.runCommand("npm", ["test"]);

  // Sandbox automatically stopped when the block exits
}
```

## Effect-based API

For advanced use cases, you can use the Effect-based API:

```typescript
import { EffectSandbox, SandboxLive, SandboxDriver } from "@ataraxy-labs/sandbox-sdk";
import { Effect, Layer } from "effect";

// Using the Effect service
const program = Effect.gen(function* () {
  const sandbox = yield* EffectSandbox;
  
  const handle = yield* sandbox.create({ image: "alpine:3.21" });
  const result = yield* handle.process.run({ cmd: "echo", args: ["Hello"] });
  
  console.log(result.stdout);
});

// Run with a provider layer
const layer = Layer.provide(SandboxLive, YourDriverLive);
Effect.runPromise(Effect.provide(program, layer));
```

## Providers

The SDK supports multiple sandbox providers:

| Provider | Package | Features |
|----------|---------|----------|
| Modal | `@ataraxy-labs/sandbox-modal` | GPU support, volumes, snapshots |
| E2B | `@ataraxy-labs/sandbox-e2b` | Fast startup, file watching |
| Vercel | `@ataraxy-labs/sandbox-vercel` | Git cloning, snapshots |
| Daytona | `@ataraxy-labs/sandbox-daytona` | Self-hosted option |
| Cloudflare | `@ataraxy-labs/sandbox-cloudflare` | Edge compute |
| Blaxel | `@ataraxy-labs/sandbox-blaxel` | Multi-region |

## Error Handling

The SDK provides typed errors for different failure scenarios:

```typescript
import {
  SandboxAuthError,
  SandboxNotFoundError,
  SandboxTimeoutError,
  SandboxNetworkError,
  SandboxValidationError,
  SandboxProviderError,
  SandboxCapabilityError,
} from "@ataraxy-labs/sandbox-sdk";

try {
  await sandbox.snapshot();
} catch (err) {
  if (err instanceof SandboxCapabilityError) {
    console.log("This provider doesn't support snapshots");
  }
}
```

## Types

```typescript
import type {
  CreateOptions,
  SandboxInfo,
  SandboxStatus,
  RunCommand,
  RunResult,
  ProcessChunk,
  FsEntry,
  SnapshotInfo,
} from "@ataraxy-labs/sandbox-sdk";
```

## License

MIT
