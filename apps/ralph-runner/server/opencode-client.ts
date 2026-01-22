/**
 * OpenCode Server Client
 *
 * Wrapper around the official @opencode-ai/sdk v2 to interact with opencode server.
 * Uses the client-only mode to connect to an existing server instance.
 */

import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { Event, Session, Message, Part } from "@opencode-ai/sdk/v2/client"

export type { Event, Session, Message, Part }

export interface OpenCodeClientOptions {
  baseUrl: string
  directory?: string
}

export class OpenCodeClient {
  private client: ReturnType<typeof createOpencodeClient>
  public readonly baseUrl: string

  constructor(options: OpenCodeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.client = createOpencodeClient({
      baseUrl: this.baseUrl,
      directory: options.directory,
    })
  }

  /**
   * Check server health
   */
  async health(): Promise<{ healthy: boolean; version: string }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch(`${this.baseUrl}/global/health`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`)
      }
      return response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<Session[]> {
    const result = await this.client.session.list()
    return result.data ?? []
  }

  /**
   * Create a new session
   */
  async createSession(title?: string, parentID?: string): Promise<Session> {
    const result = await this.client.session.create({ title, parentID })
    if (!result.data) {
      throw new Error("Failed to create session")
    }
    return result.data
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<Session> {
    const result = await this.client.session.get({ sessionID: sessionId })
    if (!result.data) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    return result.data
  }

  /**
   * Get session status for all sessions
   */
  async getSessionStatus(): Promise<Record<string, { status: string }>> {
    const result = await this.client.session.status()
    return (result.data as Record<string, { status: string }>) ?? {}
  }

  /**
   * Get messages for a session
   */
  async getMessages(
    sessionId: string,
    limit?: number
  ): Promise<Array<{ info: Message; parts: Part[] }>> {
    const result = await this.client.session.messages({
      sessionID: sessionId,
      limit,
    })
    return (result.data as Array<{ info: Message; parts: Part[] }>) ?? []
  }

  /**
   * Send a chat message and get response (blocking)
   */
  async chat(
    sessionId: string,
    message: string,
    options?: { agent?: string }
  ): Promise<{ info: Message; parts: Part[] }> {
    const result = await this.client.session.prompt({
      sessionID: sessionId,
      parts: [{ type: "text", text: message }],
      agent: options?.agent,
    })
    if (!result.data) {
      throw new Error("Failed to send chat message")
    }
    return result.data as { info: Message; parts: Part[] }
  }

  /**
   * Abort a running session
   */
  async abortSession(sessionId: string): Promise<boolean> {
    const result = await this.client.session.abort({ sessionID: sessionId })
    return result.data ?? false
  }

  /**
   * Subscribe to server-sent events using the official SDK
   * Returns an async generator that yields events with directory context
   */
  async *subscribeToEvents(
    signal?: AbortSignal
  ): AsyncGenerator<{ directory: string; event: Event }> {
    const result = await this.client.global.event()

    if (!result.stream) {
      throw new Error("Failed to subscribe to events")
    }

    for await (const event of result.stream) {
      if (signal?.aborted) break

      const directory = (event as { directory?: string }).directory ?? "global"
      const payload = (event as { payload?: Event }).payload ?? (event as Event)

      yield { directory, event: payload }
    }
  }

  /**
   * Run a shell command in the session's context
   */
  async runShell(
    sessionId: string,
    command: string,
    options?: { agent?: string }
  ): Promise<{ info: Message; parts: Part[] }> {
    const result = await this.client.session.shell({
      sessionID: sessionId,
      command,
      agent: options?.agent,
    })
    if (!result.data) {
      throw new Error("Failed to run shell command")
    }
    return result.data as { info: Message; parts: Part[] }
  }

  /**
   * Get config info
   */
  async getConfig(): Promise<unknown> {
    const result = await this.client.config.get()
    return result.data
  }

  /**
   * Get provider info
   */
  async getProviders(): Promise<{
    providers: unknown[]
    default: Record<string, string>
  }> {
    const result = await this.client.config.providers()
    return result.data as { providers: unknown[]; default: Record<string, string> }
  }

  /**
   * Get the underlying SDK client for advanced usage
   */
  get sdk() {
    return this.client
  }
}

/**
 * Wait for the opencode server to be healthy
 */
export async function waitForOpenCodeServer(
  baseUrl: string,
  options: { maxWaitMs?: number; intervalMs?: number; directory?: string } = {}
): Promise<OpenCodeClient> {
  const { maxWaitMs = 60000, intervalMs = 1000, directory } = options
  const client = new OpenCodeClient({ baseUrl, directory })
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const health = await client.health()
      if (health.healthy) {
        console.log(`OpenCode server ready (version: ${health.version})`)
        return client
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error(`OpenCode server not ready after ${maxWaitMs}ms`)
}

/**
 * SSE Event stream result with completion detection
 */
export interface SSEStreamResult {
  completed: boolean
  reason: "session_idle" | "completion_promise" | "idle_timeout" | "error" | "aborted"
  sessionId?: string
  iterations: number
  lastEventTime: number
}

/**
 * SSE Event handler callback
 */
export type SSEEventHandler = (event: {
  type: string
  properties: Record<string, unknown>
  directory: string
}) => void | Promise<void>

/**
 * Subscribe to opencode SSE events with activity-based idle detection
 * 
 * @param baseUrl - The opencode server URL
 * @param options - Configuration options
 * @returns Promise that resolves when the stream ends
 */
export async function subscribeToOpencodeSSE(
  baseUrl: string,
  options: {
    directory?: string
    onEvent: SSEEventHandler
    completionPromise?: string
    idleTimeoutMs?: number
    signal?: AbortSignal
    targetSessionId?: string
  }
): Promise<SSEStreamResult> {
  const {
    directory,
    onEvent,
    completionPromise = "COMPLETE",
    idleTimeoutMs = 5 * 60 * 1000, // 5 minutes default
    signal,
    targetSessionId,
  } = options

  const client = new OpenCodeClient({ baseUrl, directory })
  let lastNonHeartbeatEvent = Date.now()
  let completed = false
  let completionReason: SSEStreamResult["reason"] = "aborted"
  let detectedSessionId: string | undefined = targetSessionId
  let iterations = 0
  let accumulatedText = ""
  let sawFirstIdle = false // Only check for completion after agent has done some work
  let currentMessageRole: string | undefined = undefined

  const checkIdleTimeout = () => {
    const elapsed = Date.now() - lastNonHeartbeatEvent
    if (elapsed >= idleTimeoutMs) {
      console.log(`[SSE] Idle timeout reached (${elapsed}ms since last activity)`)
      return true
    }
    return false
  }

  try {
    for await (const { directory: eventDir, event } of client.subscribeToEvents(signal)) {
      if (signal?.aborted) {
        completionReason = "aborted"
        break
      }

      const eventType = event.type
      const properties = (event as { properties?: Record<string, unknown> }).properties || {}

      // Emit to handler
      await onEvent({
        type: eventType,
        properties,
        directory: eventDir,
      })

      // Check for heartbeat - don't update lastNonHeartbeatEvent
      if (eventType === "server.heartbeat") {
        if (checkIdleTimeout()) {
          completed = true
          completionReason = "idle_timeout"
          break
        }
        continue
      }

      // Update last activity time for non-heartbeat events
      lastNonHeartbeatEvent = Date.now()

      // Track session ID if not already set
      if (!detectedSessionId && properties.sessionID) {
        detectedSessionId = properties.sessionID as string
      }

      // Filter events by session if we have a target
      if (targetSessionId && properties.sessionID && properties.sessionID !== targetSessionId) {
        continue
      }

      // Track message role changes
      if (eventType === "message.updated") {
        const info = properties.info as { role?: string } | undefined
        currentMessageRole = info?.role
        console.log(`[SSE] Message role: ${currentMessageRole}`)
      }

      // Handle session idle - indicates iteration complete
      if (eventType === "session.idle" || eventType === "session.status") {
        const status = properties.status as { type?: string } | undefined
        if (eventType === "session.idle" || status?.type === "idle") {
          console.log(`[SSE] Session idle detected, iterations: ${iterations + 1}`)
          sawFirstIdle = true
          iterations++
          
          // Check if completion promise was found in accumulated assistant text
          if (accumulatedText.includes(`<promise>${completionPromise}</promise>`)) {
            console.log(`[SSE] Completion promise detected in accumulated output`)
            completed = true
            completionReason = "completion_promise"
            break
          }
          
          // Reset text accumulator for next iteration
          accumulatedText = ""
          currentMessageRole = undefined
        }
      }

      // Accumulate text from message parts (only from assistant messages, not user prompts)
      if (eventType === "message.part.updated") {
        const part = properties.part as { type?: string; text?: string } | undefined
        
        // Only accumulate text from assistant responses, not the user prompt
        // The user prompt contains the completion marker as instruction
        if (part?.type === "text" && part.text && currentMessageRole === "assistant") {
          accumulatedText += part.text
          
          // Only check for completion after at least one idle (agent did some work)
          if (sawFirstIdle && accumulatedText.includes(`<promise>${completionPromise}</promise>`)) {
            console.log(`[SSE] Completion promise detected in assistant response!`)
            completed = true
            completionReason = "completion_promise"
            break
          }
        }
      }

      // Handle session errors
      if (eventType === "session.error") {
        console.log(`[SSE] Session error:`, properties.error)
        completionReason = "error"
        break
      }

      // Handle global dispose
      if (eventType === "global.disposed" || eventType === "instance.disposed") {
        console.log(`[SSE] Instance disposed`)
        completed = true
        completionReason = "session_idle"
        break
      }
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      console.error(`[SSE] Stream error:`, e)
      completionReason = "error"
    }
  }

  return {
    completed,
    reason: completionReason,
    sessionId: detectedSessionId,
    iterations,
    lastEventTime: lastNonHeartbeatEvent,
  }
}
