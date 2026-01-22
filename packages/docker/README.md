# @ataraxy-labs/sandbox-docker

Docker sandbox driver for local development and testing. Uses the Docker CLI to create and manage containers as sandboxes.

## Features

- **Fast local testing** - No cloud latency, instant container creation
- **Full sandbox interface** - Implements all `SandboxDriverService` methods
- **Port mapping** - Automatic random port allocation with `getProcessUrls()`
- **Volume support** - Create, mount, and persist data with Docker volumes
- **Code execution** - Run Python, JavaScript, TypeScript, and Bash code
- **Snapshot support** - Create container snapshots via `docker commit`

## Installation

```bash
bun add @ataraxy-labs/sandbox-docker
```

## Prerequisites

- Docker installed and running
- Docker daemon accessible (check with `docker version`)

## Usage

```typescript
import { Effect, Layer } from "effect"
import { DockerDriverLive, DockerConfigLive } from "@ataraxy-labs/sandbox-docker"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

const dockerLayer = DockerDriverLive.pipe(
  Layer.provide(
    DockerConfigLive({
      advertiseHost: "127.0.0.1",
      timeoutMs: 300000,
      defaultPorts: [4096, 8080],
    }),
  ),
)

const program = Effect.gen(function* () {
  const driver = yield* SandboxDriver

  // Create a sandbox
  const sandbox = yield* driver.create({
    image: "node:20",
    name: "my-sandbox",
    workdir: "/workspace",
    encryptedPorts: [3000],
    env: { NODE_ENV: "development" },
  })

  // Run commands
  const result = yield* driver.run(sandbox.id, {
    cmd: "node",
    args: ["-e", "console.log('Hello!')"],
  })
  console.log(result.stdout) // "Hello!"

  // Get port URLs
  const urls = yield* driver.getProcessUrls!(sandbox.id, [3000])
  console.log(urls[3000]) // "http://127.0.0.1:32768"

  // File operations
  yield* driver.writeFile(sandbox.id, "/workspace/test.txt", "Hello World")
  const content = yield* driver.readFile(sandbox.id, "/workspace/test.txt", { encoding: "utf8" })

  // Cleanup
  yield* driver.destroy(sandbox.id)
})

await Effect.runPromise(Effect.provide(program, dockerLayer))
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `advertiseHost` | `string` | `"127.0.0.1"` | Host to use in URLs returned by `getProcessUrls()` |
| `timeoutMs` | `number` | `300000` | Default timeout for operations |
| `defaultPorts` | `number[]` | `[]` | Ports to expose by default on all sandboxes |
| `network` | `string` | `undefined` | Docker network to attach containers to |

## API

### Sandbox Lifecycle

- `create(opts)` - Create a new container sandbox
- `destroy(id)` - Remove container
- `status(id)` - Get container status (`ready` or `stopped`)
- `list()` - List all containers
- `get(id)` - Get container info by ID

### Command Execution

- `run(id, cmd)` - Run command and wait for completion
- `stream(id, cmd)` - Stream command output
- `runCode(id, input)` - Execute code in a language (python, javascript, bash, etc.)

### File System

- `readFile(id, path, opts)` - Read file contents
- `writeFile(id, path, content)` - Write file
- `listDir(id, path, opts)` - List directory contents
- `mkdir(id, path)` - Create directory (recursive)
- `rm(id, path, opts)` - Remove file or directory

### Volumes

- `volumeCreate(name)` - Create Docker volume
- `volumeDelete(name)` - Delete Docker volume
- `volumeList()` - List volumes
- `volumeGet(name)` - Get volume info

### Processes

- `startProcess(id, opts)` - Start background process
- `getProcessUrls(id, ports)` - Get mapped URLs for container ports

### Snapshots

- `snapshotCreate(id, metadata)` - Create container snapshot via `docker commit`

## Testing

```bash
# Run tests (skips if Docker not available)
bun test

# Run tests with Docker
docker version && bun test
```

## Comparison with Cloud Providers

| Feature | Docker | Modal | Daytona |
|---------|--------|-------|---------|
| Latency | ~100ms | ~2-5s | ~3-10s |
| Cost | Free | Pay per use | Pay per use |
| Tunneling | Local ports | HTTPS tunnel | HTTPS tunnel |
| Scalability | Local only | Auto-scale | Auto-scale |
| Best for | Development | Production | Production |

## License

MIT
