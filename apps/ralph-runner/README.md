# Ralph Runner

Autonomous agent loop showcase that demonstrates the Sandbox SDK by allowing users to spin up autonomous agent loops inside cloud sandboxes.

## Features

- Provide a GitHub repository URL and a task description
- Clone the repo into a sandbox and run an autonomous coding agent
- Stream agent actions, tool calls, and output in real-time
- Support for multiple sandbox providers: Modal, Daytona, E2B, Blaxel, Cloudflare, Vercel
- Run the same task across multiple providers simultaneously for comparison
- Real-time persistence with Convex

## Tech Stack

- **Frontend**: SolidJS + Vite + shadcn-solid (TailwindCSS)
- **Backend**: Hono + Bun
- **Database**: Convex (realtime)
- **UI Components**: shadcn-solid (Kobalte-based)

## Development

### Prerequisites

1. Install dependencies from the monorepo root:
   ```bash
   bun install
   ```

2. Set up Convex:
   ```bash
   cd apps/ralph-runner
   npx convex dev
   ```
   This will create a Convex deployment and regenerate the `convex/_generated/` files.

### Frontend (SolidJS + Vite)

```bash
cd apps/ralph-runner
bun run dev
```

The frontend will be available at http://localhost:3003

### Backend (Hono + Bun)

```bash
cd apps/ralph-runner/server
bun run dev
```

The API server will be available at http://localhost:3004

## Environment Variables

Create `.env.local`:

```bash
# Convex
CONVEX_URL=https://your-deployment.convex.cloud

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

## Convex Schema

The app uses Convex for realtime data persistence:

- **users**: User accounts (anonymous or authenticated)
- **sandboxes**: Container instances per provider
- **ralphs**: Agent loop sessions within sandboxes
- **agentEvents**: Stream of agent events (thoughts, tool calls, outputs)

## Architecture

```
apps/ralph-runner/
├── src/                    # Frontend SolidJS app
│   ├── components/         # UI components
│   │   └── ui/            # shadcn-solid components
│   ├── hooks/             # Custom hooks (useRun, useConvex)
│   ├── lib/               # Utilities (cn)
│   ├── providers/         # Context providers
│   ├── App.tsx            # Main app component
│   ├── entry.tsx          # App entry point
│   ├── index.css          # Global styles + shadcn theme
│   └── types.ts           # TypeScript types
├── convex/                 # Convex backend
│   ├── _generated/        # Auto-generated types
│   ├── schema.ts          # Database schema
│   ├── users.ts           # User functions
│   ├── sandboxes.ts       # Sandbox functions
│   ├── ralphs.ts          # Ralph session functions
│   └── agentEvents.ts     # Event functions
├── server/                 # Hono API server
│   ├── index.ts           # Main server
│   ├── agent.ts           # Agent loop logic
│   └── convex-client.ts   # Convex HTTP client
├── public/                 # Static assets
├── components.json         # shadcn-solid config
├── convex.json            # Convex config
├── package.json           # Dependencies
├── vite.config.ts         # Vite configuration
└── tsconfig.json          # TypeScript config
```
