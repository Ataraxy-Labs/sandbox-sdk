import { createQuery, createMutation } from "@tanstack/solid-query"
import { convex } from "../providers/ConvexProvider"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

export type { Id }

const isConfigured = () => !!convex

// ============================================================================
// SANDBOX HOOKS
// ============================================================================

export function useSandboxes(userId: () => Id<"users"> | undefined) {
  return createQuery(() => ({
    queryKey: ["sandboxes", userId()],
    queryFn: async () => {
      if (!isConfigured() || !userId()) return []
      return await convex!.query(api.sandboxes.getByUser, { userId: userId()! })
    },
    enabled: isConfigured() && !!userId(),
  }))
}

export function useSandbox(sandboxId: () => Id<"sandboxes"> | undefined) {
  return createQuery(() => ({
    queryKey: ["sandbox", sandboxId()],
    queryFn: async () => {
      if (!isConfigured() || !sandboxId()) return null
      return await convex!.query(api.sandboxes.getById, { id: sandboxId()! })
    },
    enabled: isConfigured() && !!sandboxId(),
  }))
}

// ============================================================================
// RALPH HOOKS
// ============================================================================

export function useRalphs(sandboxId: () => Id<"sandboxes"> | undefined) {
  return createQuery(() => ({
    queryKey: ["ralphs", sandboxId()],
    queryFn: async () => {
      if (!isConfigured() || !sandboxId()) return []
      return await convex!.query(api.ralphs.getBySandbox, { sandboxId: sandboxId()! })
    },
    enabled: isConfigured() && !!sandboxId(),
  }))
}

export function useRalph(ralphId: () => Id<"ralphs"> | undefined) {
  return createQuery(() => ({
    queryKey: ["ralph", ralphId()],
    queryFn: async () => {
      if (!isConfigured() || !ralphId()) return null
      return await convex!.query(api.ralphs.getById, { id: ralphId()! })
    },
    enabled: isConfigured() && !!ralphId(),
  }))
}

// ============================================================================
// AGENT EVENTS HOOKS
// ============================================================================

export function useAgentEvents(ralphId: () => Id<"ralphs"> | undefined) {
  return createQuery(() => ({
    queryKey: ["agentEvents", ralphId()],
    queryFn: async () => {
      if (!isConfigured() || !ralphId()) return []
      return await convex!.query(api.agentEvents.getByRalph, { ralphId: ralphId()! })
    },
    enabled: isConfigured() && !!ralphId(),
    refetchInterval: 500, // Real-time polling
  }))
}

// ============================================================================
// MUTATIONS (for direct client-side use if needed)
// ============================================================================

export function useCreateAnonymousUser() {
  return createMutation(() => ({
    mutationFn: async () => {
      if (!isConfigured()) throw new Error("Convex not configured")
      return await convex!.mutation(api.users.createAnonymous, {})
    },
  }))
}
