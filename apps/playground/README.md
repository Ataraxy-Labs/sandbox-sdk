# Sandbox Playground

A beautiful demo app showcasing the GitArsenal Sandbox SDK - execute code in real cloud sandboxes powered by Modal.

![Sandbox Playground](./screenshot.png)

## Features

- 🎨 **Monaco Editor** - Full-featured code editor with syntax highlighting
- 🐍 **Multi-language Support** - Python, JavaScript, and Bash
- 📁 **File Explorer** - Browse and preview files in the sandbox
- 💻 **Interactive Terminal** - Execute commands in real-time
- 🔄 **Real-time Output** - Stream execution results
- 🎯 **Multiple Images** - Python, Node.js, Alpine, Ubuntu, Go, Rust

## Quick Start

### Prerequisites

- Modal account with API tokens
- Bun runtime

### Setup

1. **Set Modal credentials:**

```bash
export MODAL_TOKEN_ID="your-token-id"
export MODAL_TOKEN_SECRET="your-token-secret"
```

2. **Install dependencies:**

```bash
cd apps/sandbox-playground
bun install

cd server
bun install
```

3. **Start the API server:**

```bash
cd server
bun dev
```

4. **Start the frontend (in another terminal):**

```bash
cd apps/sandbox-playground
bun dev
```

5. **Open** http://localhost:3001

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Sandbox Playground UI                     │
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │   Code Editor   │  │    Output / Terminal / Files    │  │
│  │    (Monaco)     │  │                                 │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Server (Hono)                         │
│  POST /api/sandbox/create    GET /api/sandbox/:id/ls        │
│  POST /api/sandbox/:id/run   GET /api/sandbox/:id/read      │
│  POST /api/sandbox/:id/exec  POST /api/sandbox/:id/destroy  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 GitArsenal Sandbox SDK                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   create    │  │   runCode   │  │   readFile  │         │
│  │   destroy   │  │   stream    │  │  writeFile  │         │
│  │   status    │  │    run      │  │   listDir   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Modal Cloud                             │
│              Real sandboxes running containers               │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Endpoint                   | Method | Description             |
| -------------------------- | ------ | ----------------------- |
| `/api/sandbox/create`      | POST   | Create a new sandbox    |
| `/api/sandbox/:id/destroy` | POST   | Destroy a sandbox       |
| `/api/sandbox/:id/status`  | GET    | Get sandbox status      |
| `/api/sandbox/:id/run`     | POST   | Run code in sandbox     |
| `/api/sandbox/:id/exec`    | POST   | Execute shell command   |
| `/api/sandbox/:id/ls`      | GET    | List directory contents |
| `/api/sandbox/:id/read`    | GET    | Read file contents      |
| `/api/sandbox/:id/write`   | POST   | Write file contents     |
| `/api/sandboxes`           | GET    | List all sandboxes      |

## Tech Stack

- **Frontend**: SolidJS, Vite, TailwindCSS, Monaco Editor
- **Backend**: Hono, Bun
- **SDK**: @ataraxy-labs/sandbox-sdk, Effect-TS
- **Provider**: Modal (cloud sandboxes)

## Development

```bash
# Run both frontend and server
cd apps/sandbox-playground
bun dev &
cd server && bun dev
```

## License

MIT
