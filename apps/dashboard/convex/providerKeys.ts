import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireUser } from "./auth"

export const set = mutation({
  args: {
    provider: v.string(),
    keyName: v.string(),
    encryptedValue: v.string(),
  },
  returns: v.id("providerKeys"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const now = Date.now()

    // Check if key already exists for this user+provider+keyName
    const existing = await ctx.db
      .query("providerKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", user._id).eq("provider", args.provider))
      .filter((q) => q.eq(q.field("keyName"), args.keyName))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedValue: args.encryptedValue,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert("providerKeys", {
      userId: user._id,
      provider: args.provider,
      keyName: args.keyName,
      encryptedValue: args.encryptedValue,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const keys = await ctx.db
      .query("providerKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()

    // Return without the actual values (just metadata)
    return keys.map((k) => ({
      _id: k._id,
      provider: k.provider,
      keyName: k.keyName,
      hasValue: !!k.encryptedValue,
      updatedAt: k.updatedAt,
    }))
  },
})

export const getByUserProvider = query({
  args: { provider: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    return await ctx.db
      .query("providerKeys")
      .withIndex("by_user_provider", (q) => q.eq("userId", user._id).eq("provider", args.provider))
      .collect()
  },
})

export const remove = mutation({
  args: { id: v.id("providerKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const key = await ctx.db.get(args.id)
    if (!key || key.userId !== user._id) {
      throw new Error("Key not found")
    }
    await ctx.db.delete(args.id)
    return null
  },
})
