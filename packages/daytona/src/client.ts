import { Effect } from "effect"
import type { SandboxError, SandboxErrorContext } from "@ataraxy-labs/sandbox-sdk"
import {
  mapHttpErrorWithContext,
  isSandboxError,
  SandboxNetworkError,
  parseRetryAfterMs,
} from "@ataraxy-labs/sandbox-sdk"

export interface DaytonaClient {
  baseUrl: string
  apiKey: string
  request<T>(method: string, path: string, body?: unknown): Effect.Effect<T, SandboxError>
}

/**
 * Create error context for Daytona API requests.
 */
const makeContext = (method: string, path: string): SandboxErrorContext => ({
  provider: "daytona",
  operation: `${method} ${path}`,
})

export const createClient = (baseUrl: string, apiKey: string): DaytonaClient => ({
  baseUrl,
  apiKey,
  request: <T>(method: string, path: string, body?: unknown) =>
    Effect.tryPromise({
      try: async () => {
        const isDownload = path.includes("/files/download")
        const isUpload = path.includes("/files/upload")

        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
        }

        let requestBody: string | FormData | undefined
        if (body) {
          if (isUpload) {
            const content = typeof body === "string" ? body : String(body)
            const formData = new FormData()
            formData.append("file", new Blob([content]), "file")
            requestBody = formData
          } else {
            headers["Content-Type"] = "application/json"
            requestBody = JSON.stringify(body)
          }
        }

        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: requestBody,
        })

        if (!response.ok) {
          const text = await response.text()
          const idMatch = path.match(/\/sandbox\/([^/]+)/)
          throw mapHttpErrorWithContext(
            { status: response.status, body: text, headers: response.headers },
            makeContext(method, path),
            idMatch?.[1],
          )
        }

        if (response.status === 204) return undefined as T

        if (isDownload) return response.arrayBuffer() as Promise<T>

        const contentType = response.headers.get("content-type") ?? ""
        if (contentType.includes("application/json")) {
          return response.json() as Promise<T>
        }

        return response.text() as Promise<T>
      },
      catch: (err) => {
        if (isSandboxError(err)) {
          return err
        }
        return new SandboxNetworkError({
          cause: err,
          context: makeContext(method, path),
        })
      },
    }),
})
