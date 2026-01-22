import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  // Users
  users: defineTable({
    clerkId: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  // Sandboxes: container instances
  sandboxes: defineTable({
    userId: v.id("users"),
    sandboxId: v.string(),
    provider: v.string(), // "modal" | "daytona" | etc
    repoUrl: v.string(),
    publicUrl: v.optional(v.string()),
    status: v.string(), // "creating" | "ready" | "stopped" | "failed"
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_sandbox_id", ["sandboxId"]),

  // Ralph sessions: agent loops within a sandbox
  ralphs: defineTable({
    userId: v.id("users"),
    sandboxId: v.id("sandboxes"),
    sessionId: v.optional(v.string()),
    task: v.string(),
    status: v.string(), // "running" | "completed" | "failed"
    iterationCount: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_sandbox", ["sandboxId"]),

  // Agent events
  agentEvents: defineTable({
    ralphId: v.id("ralphs"),
    type: v.string(),
    data: v.any(),
    timestamp: v.number(),
  }).index("by_ralph", ["ralphId"]),
})
