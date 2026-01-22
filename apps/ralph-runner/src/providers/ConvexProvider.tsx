import { ConvexHttpClient } from "convex/browser"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { ParentProps } from "solid-js"

// Vite env type augmentation
declare global {
  interface ImportMetaEnv {
    readonly VITE_CONVEX_URL?: string
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

// Initialize Convex HTTP client (framework-agnostic, works with any frontend)
const convexUrl = import.meta.env.VITE_CONVEX_URL || ""
export const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null

// Initialize TanStack Query for Solid.js
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function ConvexProvider(props: ParentProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {props.children}
    </QueryClientProvider>
  )
}

export { queryClient }
