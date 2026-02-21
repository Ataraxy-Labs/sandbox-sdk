import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireUser } from "./auth"

export const create = mutation({
  args: {
    sandboxId: v.string(),
    provider: v.string(),
    repoUrl: v.string(),
  },
  returns: v.id("sandboxes"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    return await ctx.db.insert("sandboxes", {
      userId: user._id,
      sandboxId: args.sandboxId,
      provider: args.provider,
      repoUrl: args.repoUrl,
      status: "creating",
      createdAt: Date.now(),
    })
  },
})

export const attachUrl = mutation({
  args: {
    dbSandboxId: v.id("sandboxes"),
    publicUrl: v.string(),
  },
  returns: v.id("sandboxes"),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.dbSandboxId, {
      publicUrl: args.publicUrl,
      status: "ready",
    })
    return args.dbSandboxId
  },
})

export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    return await ctx.db
      .query("sandboxes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect()
  },
})

export const getById = query({
  args: { id: v.id("sandboxes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const updateStatus = mutation({
  args: {
    id: v.id("sandboxes"),
    status: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status })
    return null
  },
})
