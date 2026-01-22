import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

const eventTypeValidator = v.union(
  v.literal("status"),
  v.literal("thought"),
  v.literal("tool_call"),
  v.literal("tool_result"),
  v.literal("output"),
  v.literal("error"),
  v.literal("complete"),
  v.literal("ralph_iteration"),
  v.literal("ralph_complete"),
  v.literal("opencode_ready"),
  v.literal("clone_progress"),
  v.literal("install_progress")
)

/**
 * Add an agent event
 */
export const add = mutation({
  args: {
    ralphId: v.id("ralphs"),
    type: eventTypeValidator,
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

/**
 * Get all events for a ralph session
 */
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
