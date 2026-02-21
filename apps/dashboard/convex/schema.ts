import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  providerKeys: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    keyName: v.string(),
    encryptedValue: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  sandboxes: defineTable({
    userId: v.id("users"),
    sandboxId: v.string(),
    provider: v.string(),
    repoUrl: v.string(),
    publicUrl: v.optional(v.string()),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_sandbox_id", ["sandboxId"]),

  ralphs: defineTable({
    userId: v.id("users"),
    sandboxId: v.id("sandboxes"),
    sessionId: v.optional(v.string()),
    task: v.string(),
    status: v.string(),
    iterationCount: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_sandbox", ["sandboxId"]),

  agentEvents: defineTable({
    ralphId: v.id("ralphs"),
    type: v.string(),
    data: v.any(),
    timestamp: v.number(),
  }).index("by_ralph", ["ralphId"]),
})
