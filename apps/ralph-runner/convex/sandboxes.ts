import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

const providerValidator = v.union(
  v.literal("modal"),
  v.literal("daytona"),
  v.literal("e2b"),
  v.literal("blaxel"),
  v.literal("cloudflare"),
  v.literal("vercel")
)

const statusValidator = v.union(
  v.literal("creating"),
  v.literal("ready"),
  v.literal("running"),
  v.literal("stopped"),
  v.literal("failed")
)

/**
 * Create sandbox when started
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    sandboxId: v.string(),
    provider: providerValidator,
    repoUrl: v.string(),
  },
  returns: v.id("sandboxes"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("sandboxes", {
      userId: args.userId,
      sandboxId: args.sandboxId,
      provider: args.provider,
      repoUrl: args.repoUrl,
      status: "creating",
      createdAt: Date.now(),
    })
  },
})

/**
 * Attach public URL once available
 */
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

/**
 * Get all sandboxes for a user
 */
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sandboxes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect()
  },
})

/**
 * Get a single sandbox
 */
export const getById = query({
  args: { id: v.id("sandboxes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Update sandbox status
 */
export const updateStatus = mutation({
  args: {
    id: v.id("sandboxes"),
    status: statusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status })
    return null
  },
})
