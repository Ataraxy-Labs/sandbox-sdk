// Auto-generated stub. Real file is created by `npx convex dev`.
// This exists so TypeScript doesn't error on dynamic imports before Convex codegen runs.

import type { FunctionReference } from "convex/server"

export declare const api: {
  sandboxes: {
    create: FunctionReference<"mutation", "public">
    getByUser: FunctionReference<"query", "public">
    getById: FunctionReference<"query", "public">
    attachUrl: FunctionReference<"mutation", "public">
    updateStatus: FunctionReference<"mutation", "public">
  }
  ralphs: {
    create: FunctionReference<"mutation", "public">
    getByUser: FunctionReference<"query", "public">
    getBySandbox: FunctionReference<"query", "public">
    getById: FunctionReference<"query", "public">
    attachSession: FunctionReference<"mutation", "public">
    updateStatus: FunctionReference<"mutation", "public">
  }
  agentEvents: {
    add: FunctionReference<"mutation", "public">
    getByRalph: FunctionReference<"query", "public">
  }
  users: {
    me: FunctionReference<"query", "public">
    getById: FunctionReference<"query", "public">
    upsertFromClerk: FunctionReference<"mutation", "public">
    createAnonymous: FunctionReference<"mutation", "public">
  }
  providerKeys: {
    set: FunctionReference<"mutation", "public">
    getByUser: FunctionReference<"query", "public">
    getByUserProvider: FunctionReference<"query", "public">
    remove: FunctionReference<"mutation", "public">
  }
}
