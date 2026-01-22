# Ralph Runner

Autonomous agent loop showcase that demonstrates the GitArsenal Sandbox SDK by allowing users to spin up autonomous agent loops inside cloud sandboxes.

## Features

- Provide a GitHub repository URL and a task description
- Clone the repo into a sandbox and run an autonomous coding agent
- Stream agent actions, tool calls, and output in real-time
- Support for multiple sandbox providers: Modal, Daytona, E2B, Blaxel, Cloudflare, Vercel
- Run the same task across multiple providers simultaneously for comparison

## Development

### Frontend (SolidJS + Vite)

```bash
cd apps/ralph-runner
bun install
bun run dev
```

The frontend will be available at http://localhost:3003

### Backend (Hono + Bun)

```bash
cd apps/ralph-runner/server
bun install
bun run dev
```

The API server will be available at http://localhost:3004

## Environment Variables

```bash
# LLM Provider (choose one)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Sandbox Providers (configure available ones)
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=
DAYTONA_API_KEY=
DAYTONA_BASE_URL=
E2B_API_KEY=
BLAXEL_API_KEY=
BLAXEL_WORKSPACE=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
VERCEL_ACCESS_TOKEN=
```

## Architecture

```
apps/ralph-runner/
├── src/                    # Frontend SolidJS app
│   ├── components/         # UI components
│   ├── App.tsx            # Main app component
│   ├── entry.tsx          # App entry point
│   ├── index.css          # Global styles
│   └── types.ts           # TypeScript types
├── server/                 # Backend Hono server
│   └── index.ts           # API server
├── public/                 # Static assets
├── package.json           # Frontend dependencies
├── vite.config.ts         # Vite configuration
└── tsconfig.json          # TypeScript config
```
