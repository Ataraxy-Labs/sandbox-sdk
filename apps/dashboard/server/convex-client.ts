import { ConvexHttpClient } from "convex/browser"
import { api } from "../convex/_generated/api"
import type { Id } from "../convex/_generated/dataModel"

export type { Id }

const convexUrl = process.env.CONVEX_URL || ""
const client = convexUrl ? new ConvexHttpClient(convexUrl) : null

export function isConvexConfigured(): boolean {
  return !!client
}

export async function createSandboxInDb(
  userId: Id<"users">,
  sandboxId: string,
  provider: string,
  repoUrl: string
): Promise<Id<"sandboxes"> | null> {
  if (!client) return null
  try {
    const id = await client.mutation(api.sandboxes.create, {
      sandboxId,
      provider,
      repoUrl,
    })
    console.log(`[Convex] Sandbox created: ${id}`)
    return id
  } catch (err) {
    console.error(`[Convex] Failed to create sandbox:`, err)
    return null
  }
}

export async function attachUrlToSandbox(
  dbSandboxId: Id<"sandboxes">,
  publicUrl: string
): Promise<void> {
  if (!client) return
  try {
    await client.mutation(api.sandboxes.attachUrl, { dbSandboxId, publicUrl })
    console.log(`[Convex] URL attached: ${publicUrl}`)
  } catch (err) {
    console.error(`[Convex] Failed to attach URL:`, err)
  }
}

export async function createRalphInDb(
  userId: Id<"users">,
  sandboxId: Id<"sandboxes">,
  task: string
): Promise<Id<"ralphs"> | null> {
  if (!client) return null
  try {
    const id = await client.mutation(api.ralphs.create, { sandboxId, task })
    console.log(`[Convex] Ralph created: ${id}`)
    return id
  } catch (err) {
    console.error(`[Convex] Failed to create ralph:`, err)
    return null
  }
}

export async function addAgentEvent(
  ralphId: Id<"ralphs">,
  type: string,
  data: unknown
): Promise<void> {
  if (!client) return
  try {
    await client.mutation(api.agentEvents.add, {
      ralphId,
      type,
      data,
    })
  } catch (err) {
    console.error(`[Convex] Failed to add event:`, err)
  }
}

export async function updateRalphStatus(
  ralphId: Id<"ralphs">,
  status: "running" | "completed" | "failed",
  iterationCount?: number
): Promise<void> {
  if (!client) return
  try {
    await client.mutation(api.ralphs.updateStatus, { id: ralphId, status, iterationCount })
    console.log(`[Convex] Ralph status: ${status}`)
  } catch (err) {
    console.error(`[Convex] Failed to update status:`, err)
  }
}

/**
 * Write an SSE event from opencode to Convex
 * Maps opencode event types to our agentEvents schema
 */
export async function writeSSEEventToConvex(
  ralphId: Id<"ralphs">,
  event: {
    type: string
    properties: Record<string, unknown>
    directory: string
  }
): Promise<void> {
  if (!client) return

  // Map opencode event types to our schema types
  const typeMapping: Record<string, string> = {
    "session.created": "status",
    "session.idle": "status",
    "session.status": "status",
    "session.error": "error",
    "message.part.updated": "thought",
    "message.updated": "output",
    "message.removed": "status",
    "server.heartbeat": "status",
    "server.connected": "status",
    "global.disposed": "complete",
    "instance.disposed": "complete",
  }

  // Extract tool calls from message parts
  const part = event.properties.part as { type?: string; tool?: string; state?: unknown } | undefined
  if (part?.type === "tool") {
    try {
      await client.mutation(api.agentEvents.add, {
        ralphId,
        type: "tool_call",
        data: {
          tool: part.tool,
          state: part.state,
          sessionID: event.properties.sessionID,
        },
      })
    } catch (err) {
      console.error(`[Convex] Failed to write tool event:`, err)
    }
    return
  }

  // Map to our event type or skip unknown events
  const mappedType = typeMapping[event.type]
  if (!mappedType) {
    // Skip unmapped events (like server.heartbeat in some cases)
    return
  }

  try {
    await client.mutation(api.agentEvents.add, {
      ralphId,
      type: mappedType,
      data: {
        eventType: event.type,
        ...event.properties,
        directory: event.directory,
      },
    })
  } catch (err) {
    console.error(`[Convex] Failed to write SSE event:`, err)
  }
}

/**
 * Get user's provider keys from Convex
 * Used by the server to look up stored API keys
 */
export async function getUserProviderKeys(
  clerkUserId: string,
  provider?: string
): Promise<Array<{ provider: string; keyName: string; encryptedValue: string }>> {
  if (!client) return []
  try {
    // We need to query directly since we don't have auth context on the server side
    // Use a server-side query that accepts clerkId
    const result = await client.query(api.providerKeys.getByUser, {})
    // The query requires auth, so this will only work if we set up Convex auth token
    // For now, return empty and let callers fall back to env vars
    return []
  } catch (err) {
    console.error(`[Convex] Failed to get provider keys:`, err)
    return []
  }
}
