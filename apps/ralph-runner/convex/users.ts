import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

/**
 * Get user by ID
 */
export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * Create anonymous user (for demo/testing)
 */
export const createAnonymous = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    return await ctx.db.insert("users", {
      createdAt: Date.now(),
    })
  },
})
