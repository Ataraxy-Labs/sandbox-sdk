# Sandbox SDK

Multi-provider sandbox SDK with Effect-TS best practices for running isolated code execution environments.

## Packages

### Core
- **[@ataraxy-labs/sandbox-sdk](./packages/sdk)** - Core SDK with Effect-TS patterns for sandbox management

### Providers
- **[@ataraxy-labs/sandbox-modal](./packages/modal)** - Modal provider
- **[@ataraxy-labs/sandbox-daytona](./packages/daytona)** - Daytona provider
- **[@ataraxy-labs/sandbox-e2b](./packages/e2b)** - E2B provider
- **[@ataraxy-labs/sandbox-blaxel](./packages/blaxel)** - Blaxel provider
- **[@ataraxy-labs/sandbox-cloudflare](./packages/cloudflare)** - Cloudflare provider
- **[@ataraxy-labs/sandbox-vercel](./packages/vercel)** - Vercel provider
- **[@ataraxy-labs/sandbox-docker](./packages/docker)** - Docker provider (local development)

### Apps
- **[@ataraxy-labs/sandbox-playground](./apps/playground)** - Interactive sandbox playground UI
- **[@ataraxy-labs/ralph-runner](./apps/ralph-runner)** - Ralph autonomous agent runner

## Features

### Core SDK (`packages/sdk`)

- **Effect-TS First**: Built with Effect-TS best practices including proper error handling, resource management, and composable services
- **Multiple Providers**: Support for Docker, Modal, E2B, Vercel, Daytona, Cloudflare, and Blaxel
- **Capability-Based Architecture**: Modular services (Lifecycle, Process, Filesystem, Snapshots, Volumes, Code)
- **Observability**: Built-in spans via `withOperationContext`, structured logging with `Effect.log`
- **Retry & Rate Limiting**: Configurable retry schedules and optional semaphore-based concurrency limits
- **Validation**: Boundary validation for critical fields (image, ports, timeouts)
- **Testing Utilities**: TestHarness, MockDriver, TestClock, TestRandom for deterministic tests

### Effect-TS Patterns Implemented

1. **Effect.log instead of console.log** - Libraries never pollute stdout
2. **Effect.withSpan** - Automatic tracing at operation boundaries
3. **Semaphore rate limiting** - Optional, configurable concurrency control
4. **Boundary validation** - SandboxValidationError for invalid inputs
5. **Clock/Random effects** - Testable time and randomness

## Quick Start

```bash
# Install dependencies
bun install

# Run typecheck
bun run typecheck

# Run tests
bun run test

# Start playground
bun run dev --filter=@ataraxy-labs/sandbox-playground
```

## SDK Usage

```typescript
import { Effect, Layer } from "effect"
import { SandboxDriver, withOperationContext, validateCreateOptions } from "@ataraxy-labs/sandbox-sdk"
import { ModalDriverLive, ModalConfigLive } from "@ataraxy-labs/sandbox-modal"

// Configure the provider
const modalLayer = ModalDriverLive.pipe(
  Layer.provide(ModalConfigLive({ appName: "my-app", timeoutMs: 300000 }))
)

const program = Effect.gen(function* () {
  // Validate inputs at boundary
  yield* validateCreateOptions({ image: "node:22", encryptedPorts: [8080] })
  
  const driver = yield* SandboxDriver
  
  // Operations automatically get spans and error context
  const sandbox = yield* withOperationContext(
    { provider: "modal", capability: "lifecycle", operation: "create" },
    driver.create({ image: "node:22" })
  )
  
  const result = yield* driver.run(sandbox.id, { cmd: "node", args: ["-e", "console.log('hello')"] })
  
  yield* driver.destroy(sandbox.id)
  
  return result
})

// Run with provider layer
Effect.runPromise(Effect.provide(program, modalLayer))
```

## Development

```bash
# Typecheck all packages
bun run typecheck

# Run SDK tests
bun test --cwd packages/sdk

# Build all packages
bun run build
```

## License

MIT
