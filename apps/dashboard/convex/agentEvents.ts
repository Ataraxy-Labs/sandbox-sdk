import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const add = mutation({
  args: {
    ralphId: v.id("ralphs"),
    type: v.string(),
    data: v.any(),
  },
  returns: v.id("agentEvents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentEvents", {
      ralphId: args.ralphId,
      type: args.type,
      data: args.data,
      timestamp: Date.now(),
    })
  },
})

export const getByRalph = query({
  args: { ralphId: v.id("ralphs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentEvents")
      .withIndex("by_ralph", (q) => q.eq("ralphId", args.ralphId))
      .order("asc")
      .collect()
  },
})
