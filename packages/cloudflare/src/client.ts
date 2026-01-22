import { Effect } from "effect"
import type { SandboxError, SandboxErrorContext } from "@ataraxy-labs/sandbox-sdk"
import { mapHttpErrorWithContext, isSandboxError, SandboxNetworkError } from "@ataraxy-labs/sandbox-sdk"

const makeContext = (method: string, path: string): SandboxErrorContext => ({
  provider: "cloudflare",
  operation: `${method} ${path}`,
})

export const createClient = (baseUrl: string, apiToken: string, accountId: string) => ({
  baseUrl,
  apiToken,
  accountId,
  request: <T>(method: string, path: string, body?: unknown): Effect.Effect<T, SandboxError> =>
    Effect.tryPromise({
      try: async () => {
        const url = `${baseUrl}/accounts/${accountId}${path}`
        const response = await fetch(url, {
          method,
          headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        })

        const json = (await response.json()) as { success: boolean; result?: T; errors?: Array<{ message: string }> }

        if (!response.ok || !json.success) {
          const msg = json.errors?.[0]?.message ?? `HTTP ${response.status}`
          throw mapHttpErrorWithContext(
            { status: response.status, body: msg, headers: response.headers },
            makeContext(method, path),
            path,
          )
        }

        return json.result as T
      },
      catch: (err) => {
        if (isSandboxError(err)) return err
        return new SandboxNetworkError({ cause: err, context: makeContext(method, path) })
      },
    }),
})
