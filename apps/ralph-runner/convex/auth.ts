import { ConvexError } from "convex/values"
import type { QueryCtx } from "./_generated/server"

/**
 * Get authenticated user ID
 * This is a placeholder - replace with your actual auth implementation
 * (Clerk, Auth0, custom JWT, etc.)
 */
export async function getUserId(ctx: QueryCtx): Promise<string> {
  // TODO: Implement actual authentication
  // For now, this will be passed from the client
  throw new ConvexError("getUserId not implemented - pass userId from client")
}

/**
 * Get user identity from context (placeholder)
 */
export async function getUserIdentity(ctx: QueryCtx) {
  // TODO: Implement actual auth identity lookup
  return null
}
