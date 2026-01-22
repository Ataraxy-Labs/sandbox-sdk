import { Effect } from "effect"
import type { SandboxError, SandboxErrorContext } from "@ataraxy-labs/sandbox-sdk"
import { mapHttpErrorWithContext, isSandboxError, SandboxNetworkError } from "@ataraxy-labs/sandbox-sdk"

const makeContext = (method: string, url: string): SandboxErrorContext => ({
  provider: "blaxel",
  operation: `${method} ${url}`,
})

const makeRequest = <T>(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
): Effect.Effect<T, SandboxError> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Blaxel request").pipe(
      Effect.annotateLogs({
        method,
        url,
        headers: JSON.stringify({ ...headers, Authorization: headers.Authorization ? "Bearer ***" : undefined }),
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    )

    return yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, {
          method,
          headers: { ...headers, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        })
        if (!response.ok) {
          const text = await response.text()
          throw { status: response.status, body: text, headers: response.headers }
        }
        const contentType = response.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          return response.json() as Promise<T>
        }
        return response.text() as unknown as T
      },
      catch: (err) => {
        if (isSandboxError(err)) return err
        if (typeof err === "object" && err !== null && "status" in err) {
          const httpErr = err as { status: number; body: string; headers: Headers }
          return mapHttpErrorWithContext(
            { status: httpErr.status, body: httpErr.body, headers: httpErr.headers },
            makeContext(method, url),
          )
        }
        return new SandboxNetworkError({ cause: err, context: makeContext(method, url) })
      },
    })
  })

export const createClient = (baseUrl: string, apiKey: string, workspace: string) => ({
  baseUrl,
  apiKey,
  workspace,
  request: <T>(method: string, path: string, body?: unknown): Effect.Effect<T, SandboxError> =>
    makeRequest<T>(
      `${baseUrl}${path}`,
      method,
      {
        Authorization: `Bearer ${apiKey}`,
        "x-blaxel-workspace": workspace,
      },
      body,
    ),
  sandboxRequest: <T>(
    sandboxUrl: string,
    method: string,
    path: string,
    body?: unknown,
  ): Effect.Effect<T, SandboxError> =>
    makeRequest<T>(
      `${sandboxUrl}${path}`,
      method,
      {
        Authorization: `Bearer ${apiKey}`,
        "x-blaxel-workspace": workspace,
      },
      body,
    ),
})
