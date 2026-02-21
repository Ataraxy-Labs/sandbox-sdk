import { createQuery, createMutation } from "@tanstack/solid-query"
import { ConvexHttpClient } from "convex/browser"

// Initialize Convex HTTP client (framework-agnostic, works with any frontend)
const convexUrl = import.meta.env.VITE_CONVEX_URL || ""
export const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null

const isConfigured = () => !!convex

// Note: Convex _generated types are not available until `npx convex dev` is run.
// These hooks use dynamic imports to avoid build errors when _generated is missing.
// If you need these hooks, run `npx convex dev` first to generate the API types.

// ============================================================================
// SANDBOX HOOKS
// ============================================================================

export function useSandboxes(userId: () => string | undefined) {
  return createQuery(() => ({
    queryKey: ["sandboxes", userId()],
    queryFn: async () => {
      if (!isConfigured() || !userId()) return []
      // Dynamic import to avoid build errors when convex/_generated is missing
      try {
        const { api } = await import("../../convex/_generated/api")
        return await convex!.query(api.sandboxes.getByUser, { userId: userId()! as any })
      } catch {
        console.warn("[useConvex] Convex API not generated yet. Run `npx convex dev` first.")
        return []
      }
    },
    enabled: isConfigured() && !!userId(),
  }))
}

export function useSandbox(sandboxId: () => string | undefined) {
  return createQuery(() => ({
    queryKey: ["sandbox", sandboxId()],
    queryFn: async () => {
      if (!isConfigured() || !sandboxId()) return null
      try {
        const { api } = await import("../../convex/_generated/api")
        return await convex!.query(api.sandboxes.getById, { id: sandboxId()! as any })
      } catch {
        console.warn("[useConvex] Convex API not generated yet. Run `npx convex dev` first.")
        return null
      }
    },
    enabled: isConfigured() && !!sandboxId(),
  }))
}

// ============================================================================
// RALPH HOOKS
// ============================================================================

export function useRalphs(sandboxId: () => string | undefined) {
  return createQuery(() => ({
    queryKey: ["ralphs", sandboxId()],
    queryFn: async () => {
      if (!isConfigured() || !sandboxId()) return []
      try {
        const { api } = await import("../../convex/_generated/api")
        return await convex!.query(api.ralphs.getBySandbox, { sandboxId: sandboxId()! as any })
      } catch {
        console.warn("[useConvex] Convex API not generated yet. Run `npx convex dev` first.")
        return []
      }
    },
    enabled: isConfigured() && !!sandboxId(),
  }))
}

export function useRalph(ralphId: () => string | undefined) {
  return createQuery(() => ({
    queryKey: ["ralph", ralphId()],
    queryFn: async () => {
      if (!isConfigured() || !ralphId()) return null
      try {
        const { api } = await import("../../convex/_generated/api")
        return await convex!.query(api.ralphs.getById, { id: ralphId()! as any })
      } catch {
        console.warn("[useConvex] Convex API not generated yet. Run `npx convex dev` first.")
        return null
      }
    },
    enabled: isConfigured() && !!ralphId(),
  }))
}

// ============================================================================
// AGENT EVENTS HOOKS
// ============================================================================

export function useAgentEvents(ralphId: () => string | undefined) {
  return createQuery(() => ({
    queryKey: ["agentEvents", ralphId()],
    queryFn: async () => {
      if (!isConfigured() || !ralphId()) return []
      try {
        const { api } = await import("../../convex/_generated/api")
        return await convex!.query(api.agentEvents.getByRalph, { ralphId: ralphId()! as any })
      } catch {
        console.warn("[useConvex] Convex API not generated yet. Run `npx convex dev` first.")
        return []
      }
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
      try {
        const { api } = await import("../../convex/_generated/api")
        return await convex!.mutation(api.users.createAnonymous, {})
      } catch {
        throw new Error("Convex API not generated yet. Run `npx convex dev` first.")
      }
    },
  }))
}
