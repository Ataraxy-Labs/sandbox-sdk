import { QueryCtx, MutationCtx } from "./_generated/server"

/**
 * Get the authenticated user from Clerk token.
 * Looks up user in DB by clerkId, creates one if not found.
 */
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Not authenticated")
  }

  const clerkId = identity.subject
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first()

  if (existing) return existing

  // Auto-create user on first login (only in mutation context)
  if ("insert" in ctx.db) {
    const id = await (ctx as MutationCtx).db.insert("users", {
      clerkId,
      email: identity.email,
      name: identity.name,
      imageUrl: identity.pictureUrl,
      createdAt: Date.now(),
    })
    return (await ctx.db.get(id))!
  }

  throw new Error("User not found")
}
