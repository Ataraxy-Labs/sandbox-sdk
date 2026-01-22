# Sandbox SDK

Multi-provider sandbox SDK with Effect-TS best practices for running isolated code execution environments.

## Packages

- **[@sandbox-sdk/core](./packages/sdk)** - Core SDK with Effect-TS patterns for sandbox management
- **[@sandbox-sdk/playground](./apps/playground)** - Interactive sandbox playground UI
- **[@sandbox-sdk/ralph-runner](./apps/ralph-runner)** - Ralph autonomous agent runner

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

# Start playground
bun run dev --filter=@sandbox-sdk/playground
```

## SDK Usage

```typescript
import { Effect } from "effect"
import { SandboxDriver, withOperationContext, validateCreateOptions } from "@sandbox-sdk/core"

const program = Effect.gen(function* () {
  // Validate inputs at boundary
  yield* validateCreateOptions({ image: "node:22", encryptedPorts: [8080] })
  
  const driver = yield* SandboxDriver
  
  // Operations automatically get spans and error context
  const sandbox = yield* withOperationContext(
    { provider: "docker", capability: "lifecycle", operation: "create" },
    driver.create({ image: "node:22" })
  )
  
  const result = yield* driver.run(sandbox.id, { cmd: "node", args: ["-e", "console.log('hello')"] })
  
  yield* driver.destroy(sandbox.id)
  
  return result
})
```

## Development

```bash
# Typecheck all packages
bun run typecheck

# Build all packages
bun run build
```

## License

MIT
