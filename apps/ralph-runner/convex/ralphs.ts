import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

const statusValidator = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed")
)

/**
 * Create ralph session
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    sandboxId: v.id("sandboxes"),
    task: v.string(),
  },
  returns: v.id("ralphs"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("ralphs", {
      userId: args.userId,
      sandboxId: args.sandboxId,
      task: args.task,
      status: "running",
      iterationCount: 0,
      createdAt: Date.now(),
    })
  },
})

/**
 * Attach OpenCode session ID
 */
export const attachSession = mutation({
  args: {
    dbRalphId: v.id("ralphs"),
    sessionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.dbRalphId, { sessionId: args.sessionId })
    return null
  },
})

/**
 * Get ralph sessions for a sandbox
 */
export const getBySandbox = query({
  args: { sandboxId: v.id("sandboxes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ralphs")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .order("desc")
      .collect()
  },
})

/**
 * Get a single ralph session
 */
export const getById = query({
  args: { id: v.id("ralphs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Update ralph status
 */
export const updateStatus = mutation({
  args: {
    id: v.id("ralphs"),
    status: statusValidator,
    iterationCount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { status: args.status }

    if (args.iterationCount !== undefined) {
      updates.iterationCount = args.iterationCount
    }

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now()
    }

    await ctx.db.patch(args.id, updates)
    return null
  },
})
