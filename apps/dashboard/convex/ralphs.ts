import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireUser } from "./auth"

export const create = mutation({
  args: {
    sandboxId: v.id("sandboxes"),
    task: v.string(),
  },
  returns: v.id("ralphs"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    return await ctx.db.insert("ralphs", {
      userId: user._id,
      sandboxId: args.sandboxId,
      task: args.task,
      status: "running",
      iterationCount: 0,
      createdAt: Date.now(),
    })
  },
})

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

export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    return await ctx.db
      .query("ralphs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect()
  },
})

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

export const getById = query({
  args: { id: v.id("ralphs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const updateStatus = mutation({
  args: {
    id: v.id("ralphs"),
    status: v.string(),
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
