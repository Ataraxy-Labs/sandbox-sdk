import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { Effect, Layer, Stream } from "effect"
import { ModalDriverLive, ModalConfigLive } from "@opencode-ai/sandbox-modal"
import { DaytonaDriverLive, DaytonaConfigLive } from "@opencode-ai/sandbox-daytona"
import { E2BDriverLive, E2BConfigLive } from "@opencode-ai/sandbox-e2b"
import { BlaxelDriverLive, BlaxelConfigLive } from "@opencode-ai/sandbox-blaxel"
import { CloudflareDriverLive, CloudflareConfigLive } from "@opencode-ai/sandbox-cloudflare"
import { VercelDriverLive, VercelConfigLive } from "@opencode-ai/sandbox-vercel"
import { DockerDriverLive, DockerConfigLive } from "@opencode-ai/sandbox-docker"
import { SandboxDriver } from "@opencode-ai/sandbox-sdk"
import { OPENCODE_PORT, generateSetupScript, generatePromptFile } from "./opencode-setup"
import { OpenCodeClient, waitForOpenCodeServer, subscribeToOpencodeSSE, type SSEStreamResult } from "./opencode-client"
import {
  createSandboxInDb,
  attachUrlToSandbox,
  createRalphInDb,
  addAgentEvent,
  updateRalphStatus,
  isConvexConfigured,
  writeSSEEventToConvex,
  type Id,
} from "./convex-client"

const app = new Hono()

// Types for run management
type RunStatus = "idle" | "cloning" | "installing" | "running" | "paused" | "completed" | "failed"

interface RunEvent {
  id: string
  type: "status" | "clone_progress" | "install_progress" | "output" | "error" | "thought" | "tool_call" | "tool_result" | "complete" | "opencode_ready" | "ralph_iteration" | "ralph_complete"
  timestamp: number
  data: unknown
  provider?: Provider
}

interface ProviderRun {
  provider: Provider
  sandboxId: string
  status: RunStatus
  events: RunEvent[]
  workDir: string
  opencodeUrl?: string
  opencodeClient?: OpenCodeClient
  sessionId?: string
  // Convex DB IDs for persistence
  dbSandboxId?: Id<"sandboxes">
  dbRalphId?: Id<"ralphs">
}

interface Run {
  id: string
  repoUrl: string
  branch: string
  task: string
  providers: Provider[]
  providerRuns: Map<Provider, ProviderRun>
  status: RunStatus
  startedAt: number
  completedAt?: number
  // User ID for Convex persistence (optional - from auth)
  userId?: Id<"users">
}

// In-memory store for runs and event subscribers
const runs = new Map<string, Run>()
const runSubscribers = new Map<string, Set<(event: RunEvent) => void>>()

app.use("/*", cors())

// Modal driver layer
const modalLayer = ModalDriverLive.pipe(
  Layer.provide(
    ModalConfigLive({
      appName: "ralph-runner",
      timeoutMs: 300000,
      idleTimeoutMs: 600000,
      defaultEncryptedPorts: [OPENCODE_PORT], // Expose opencode port for tunneling
    }),
  ),
)

// Daytona driver layer
const daytonaLayer = DaytonaDriverLive.pipe(
  Layer.provide(
    DaytonaConfigLive({
      apiKey: process.env.DAYTONA_API_KEY || "",
      baseUrl: process.env.DAYTONA_BASE_URL || "https://app.daytona.io/api",
      organizationId: process.env.DAYTONA_ORG_ID,
      timeoutMs: 300000,
    }),
  ),
)

// E2B driver layer
const e2bLayer = E2BDriverLive.pipe(
  Layer.provide(
    E2BConfigLive({
      apiKey: process.env.E2B_API_KEY || "",
      template: process.env.E2B_TEMPLATE || "base",
      timeoutMs: 300000,
    }),
  ),
)

// Blaxel driver layer
const blaxelLayer = BlaxelDriverLive.pipe(
  Layer.provide(
    BlaxelConfigLive({
      apiKey: process.env.BLAXEL_API_KEY || "",
      workspace: process.env.BLAXEL_WORKSPACE || "default",
      baseUrl: process.env.BLAXEL_BASE_URL || "https://api.blaxel.ai/v0",
      timeoutMs: 300000,
    }),
  ),
)

// Cloudflare driver layer
const cloudflareLayer = CloudflareDriverLive.pipe(
  Layer.provide(
    CloudflareConfigLive({
      apiToken: process.env.CLOUDFLARE_API_TOKEN || "",
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
      baseUrl: process.env.CLOUDFLARE_BASE_URL || "https://api.cloudflare.com/client/v4",
      timeoutMs: 300000,
    }),
  ),
)

// Vercel driver layer
const vercelLayer = VercelDriverLive.pipe(
  Layer.provide(
    VercelConfigLive({
      oidcToken: process.env.VERCEL_OIDC_TOKEN,
      accessToken: process.env.VERCEL_ACCESS_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
      timeoutMs: 600000,
    }),
  ),
)

// Docker driver layer (for local testing - fast feedback loop)
const dockerLayer = DockerDriverLive.pipe(
  Layer.provide(
    DockerConfigLive({
      advertiseHost: process.env.DOCKER_ADVERTISE_HOST || "127.0.0.1",
      timeoutMs: 300000,
      defaultPorts: [OPENCODE_PORT],
    }),
  ),
)

type Provider = "modal" | "daytona" | "e2b" | "blaxel" | "cloudflare" | "vercel" | "docker"

const layers: Record<Provider, typeof modalLayer> = {
  modal: modalLayer,
  daytona: daytonaLayer,
  e2b: e2bLayer,
  blaxel: blaxelLayer,
  cloudflare: cloudflareLayer,
  vercel: vercelLayer,
  docker: dockerLayer,
}

// Helper to run Effect programs with the appropriate provider
const runEffect = <A, E>(effect: Effect.Effect<A, E, SandboxDriver>, provider: Provider) => {
  return Effect.runPromise(Effect.provide(effect, layers[provider]))
}

// Helper to run stream effects with the appropriate provider
const runStream = <A, E>(stream: Stream.Stream<A, E, SandboxDriver>, provider: Provider) => {
  return Stream.runForEach(stream, () => Effect.void).pipe(Effect.provide(layers[provider]), Effect.runPromise)
}

// Default images per provider (using images with git pre-installed)
const defaultImages: Record<Provider, string> = {
  modal: "node:20",  // Full node image has git
  daytona: "node:20",
  e2b: "base",
  blaxel: "blaxel/base-image:latest",
  cloudflare: "node:20",
  vercel: "base",
  docker: "node:20",
}

// Helper to generate unique IDs
const generateId = () => `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

// Helper to emit events to subscribers (and optionally save to Convex)
const emitEvent = (runId: string, event: RunEvent) => {
  console.log(`[emitEvent] ${runId} | type=${event.type} | provider=${event.provider} | id=${event.id}`)
  const run = runs.get(runId)
  if (run) {
    const providerRun = run.providerRuns.get(event.provider!)
    providerRun?.events.push(event)
    console.log(`[emitEvent] Added to providerRun events, total: ${providerRun?.events.length}`)

    // Save to Convex if we have a dbRalphId
    if (providerRun?.dbRalphId) {
      addAgentEvent(providerRun.dbRalphId, event.type, event.data).catch((err) =>
        console.error(`[Convex] Failed to save event:`, err)
      )
    }
  } else {
    console.log(`[emitEvent] Run not found: ${runId}`)
  }
  const subscribers = runSubscribers.get(runId)
  if (subscribers) {
    console.log(`[emitEvent] Broadcasting to ${subscribers.size} subscribers`)
    subscribers.forEach((callback) => callback(event))
  } else {
    console.log(`[emitEvent] No subscribers for ${runId}`)
  }
}

// Start Ralph loop inside the sandbox using ralph-wiggum CLI
/**
 * Build the ralph prompt for a given iteration
 * Based on Th0rgal's ralph-wiggum prompt structure
 * 
 * Key changes from original:
 * - Explicit instruction to NOT ask questions
 * - TodoWrite instruction to track progress
 * - More explicit autonomous work instructions
 */
function buildRalphPrompt(task: string, iteration: number, maxIterations: number, completionPromise: string): string {
  return `# Ralph Wiggum Loop - Iteration ${iteration}

You are in an iterative development loop. Work on the task below until you can genuinely complete it.

## Your Task

${task}

## Instructions

1. Read the current state of files to understand what's been done
2. **Update your todo list** - Use the TodoWrite tool to track progress and plan remaining work
3. Make progress on the task
4. Run tests/verification if applicable
5. When the task is GENUINELY COMPLETE, output the following **on its own line** as the **last line** of your response (no backticks, no extra text around it):

<promise>${completionPromise}</promise>

## Critical Rules

- ONLY output the promise tag when the task is truly done
- The promise MUST be on its own line with NO backticks or surrounding text
- Do NOT lie or output false promises to exit the loop
- Do NOT mention or discuss the promise tag in your response - just output it when done
- If stuck, try a different approach
- Check your work before claiming completion
- The loop will continue until you succeed
- **IMPORTANT**: Update your todo list at the start of each iteration to show progress
- **DO NOT ASK QUESTIONS** - You must work autonomously. Make reasonable assumptions if needed.
- **DO NOT WAIT FOR USER INPUT** - This is a headless environment with no user interaction.

## Current Iteration: ${iteration}${maxIterations > 0 ? ` / ${maxIterations}` : " (unlimited)"}

Now, work on the task. Good luck!
`.trim()
}

/**
 * Strip markdown code blocks and inline code spans from text
 * This prevents false positive matches when the agent "discusses" the completion marker
 */
function stripMarkdownCode(text: string): string {
  // Remove fenced code blocks (``` ... ```)
  let out = text.replace(/```[\s\S]*?```/g, "")
  // Remove inline code spans (`...`)
  out = out.replace(/`[^`]*`/g, "")
  return out
}

/**
 * Check if output contains the completion promise as a standalone line (not in code)
 * 
 * This is more robust than a simple includes() check because:
 * 1. It strips markdown code blocks/spans (agent might "discuss" the marker in backticks)
 * 2. It requires the marker to be on its own line (not embedded in prose)
 */
function checkCompletionPromise(text: string, completionPromise: string): boolean {
  const cleaned = stripMarkdownCode(text)
  // Require the promise to be on its own line (with optional whitespace)
  const escapedPromise = completionPromise.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    String.raw`(^|\n)\s*<promise>\s*${escapedPromise}\s*</promise>\s*($|\n)`,
    "i"
  )
  return pattern.test(cleaned)
}

/**
 * SDK-based Ralph Loop Implementation
 * 
 * Instead of spawning ralph-wiggum CLI (which spawns its own opencode subprocess),
 * we directly use the opencode SDK to:
 * 1. Create sessions on the running opencode server
 * 2. Send prompts via the SDK
 * 3. Stream events via SSE
 * 4. Detect completion and iterate
 * 
 * This ensures all sessions and events go through the same server we're listening to.
 */
async function startRalphLoop(
  runId: string,
  provider: Provider,
  _sandboxId: string, // Unused - we use SDK directly instead of running commands in container
  workDir: string,
  task: string,
  maxIterations: number
): Promise<{ success: boolean; summary: string; iterations: number }> {
  const completionPromise = "COMPLETE"
  
  console.log(`[${runId}][${provider}] Starting SDK-based Ralph loop with ${maxIterations} max iterations`)

  const run = runs.get(runId)
  if (!run) {
    throw new Error("Run not found")
  }

  const providerRun = run.providerRuns.get(provider)
  const opencodeUrl = providerRun?.opencodeUrl

  if (!opencodeUrl) {
    console.log(`[${runId}][${provider}] No opencode URL available`)
    emitEvent(runId, {
      id: `${runId}_${provider}_no_opencode_url`,
      type: "error",
      timestamp: Date.now(),
      data: { message: "OpenCode URL not available" },
      provider,
    })
    return { success: false, summary: "OpenCode URL not available", iterations: 0 }
  }

  emitEvent(runId, {
    id: `${runId}_${provider}_ralph_starting`,
    type: "status",
    timestamp: Date.now(),
    data: {
      message: "Starting SDK-based Ralph loop...",
      maxIterations,
      opencodeUrl,
    },
    provider,
  })

  // Create SDK client connected to the opencode server in the container
  const client = new OpenCodeClient({ baseUrl: opencodeUrl, directory: workDir })
  
  // Wait for server to be healthy
  try {
    const health = await client.health()
    console.log(`[${runId}][${provider}] OpenCode server healthy: ${health.version}`)
  } catch (e) {
    console.error(`[${runId}][${provider}] OpenCode server not healthy:`, e)
    return { success: false, summary: "OpenCode server not responding", iterations: 0 }
  }

  let completed = false
  let iteration = 0
  const abortController = new AbortController()
  
  // Set overall timeout
  const timeoutMs = maxIterations * 180000 // 3 min per iteration max
  const timeoutId = setTimeout(() => {
    console.log(`[${runId}][${provider}] Ralph timed out after ${timeoutMs}ms`)
    abortController.abort()
  }, timeoutMs)

  try {
    // Main iteration loop
    while (iteration < maxIterations && !completed && !abortController.signal.aborted) {
      iteration++
      const iterationStart = Date.now()
      
      console.log(`[${runId}][${provider}] === Iteration ${iteration}/${maxIterations} ===`)
      
      emitEvent(runId, {
        id: `${runId}_${provider}_iteration_${iteration}`,
        type: "ralph_iteration",
        timestamp: Date.now(),
        data: {
          iteration,
          maxIterations,
          message: `Starting iteration ${iteration}/${maxIterations}`,
        },
        provider,
      })

      // Build the prompt for this iteration
      const prompt = buildRalphPrompt(task, iteration, maxIterations, completionPromise)
      
      // Create a new session for this iteration
      let session
      try {
        session = await client.createSession(`Ralph iteration ${iteration}`)
        console.log(`[${runId}][${provider}] Created session: ${session.id}`)
        providerRun!.sessionId = session.id
      } catch (e) {
        console.error(`[${runId}][${provider}] Failed to create session:`, e)
        emitEvent(runId, {
          id: `${runId}_${provider}_session_error_${iteration}`,
          type: "error",
          timestamp: Date.now(),
          data: { message: `Failed to create session: ${(e as Error).message}` },
          provider,
        })
        // Wait and retry
        await new Promise(r => setTimeout(r, 2000))
        continue
      }

      // Subscribe to events for this session
      let iterationComplete = false
      let iterationOutput = ""
      
      // Start event listener in background
      const eventPromise = (async () => {
        try {
          for await (const { event } of client.subscribeToEvents(abortController.signal)) {
            if (iterationComplete) break
            
            const eventType = event.type
            const props = (event as { properties?: Record<string, unknown> }).properties || {}
            
            // Only process events for our session
            if (props.sessionID && props.sessionID !== session.id) continue

            if (eventType === "message.part.updated") {
              const part = props.part as Record<string, unknown>
              const partType = part?.type as string
              const partSessionId = part?.sessionID as string
              
              if (partSessionId && partSessionId !== session.id) continue

              if (partType === "tool") {
                const state = part?.state as Record<string, unknown>
                if (state?.status === "completed") {
                  const toolName = part?.tool as string
                  const title = state?.title as string || ""
                  console.log(`[${runId}][${provider}] Tool: ${toolName} - ${title}`)
                  emitEvent(runId, {
                    id: `${runId}_${provider}_tool_${Date.now()}`,
                    type: "tool_call",
                    timestamp: Date.now(),
                    data: { name: toolName, title, state },
                    provider,
                  })
                }
              } else if (partType === "text") {
                const text = part?.text as string || ""
                const timeEnd = (part?.time as Record<string, unknown>)?.end
                if (timeEnd && text) {
                  iterationOutput += text + "\n"
                  emitEvent(runId, {
                    id: `${runId}_${provider}_text_${Date.now()}`,
                    type: "thought",
                    timestamp: Date.now(),
                    data: text,
                    provider,
                  })
                }
              }
            } else if (eventType === "session.idle" && props.sessionID === session.id) {
              console.log(`[${runId}][${provider}] Session idle - iteration complete`)
              iterationComplete = true
              break
            } else if (eventType === "session.error" && props.sessionID === session.id) {
              const error = props.error as Record<string, unknown>
              console.error(`[${runId}][${provider}] Session error:`, error)
              emitEvent(runId, {
                id: `${runId}_${provider}_error_${Date.now()}`,
                type: "error",
                timestamp: Date.now(),
                data: { message: error?.message || "Unknown error" },
                provider,
              })
              iterationComplete = true
              break
            }
          }
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            console.error(`[${runId}][${provider}] Event stream error:`, e)
          }
        }
      })()

      // Send the prompt (non-blocking - response comes via events)
      console.log(`[${runId}][${provider}] Sending prompt to session ${session.id}...`)
      try {
        // Use chat() which waits for response, but we're also listening to events
        const response = await client.chat(session.id, prompt)
        console.log(`[${runId}][${provider}] Got response with ${response.parts.length} parts`)
        
        // Extract text from response parts
        for (const part of response.parts) {
          if (part.type === "text" && "text" in part) {
            iterationOutput += (part.text as string) + "\n"
          }
        }
        iterationComplete = true
      } catch (e) {
        console.error(`[${runId}][${provider}] Chat error:`, e)
        emitEvent(runId, {
          id: `${runId}_${provider}_chat_error_${iteration}`,
          type: "error",
          timestamp: Date.now(),
          data: { message: `Chat failed: ${(e as Error).message}` },
          provider,
        })
      }

      // Wait for event processing to complete
      iterationComplete = true
      abortController.signal.aborted || await Promise.race([
        eventPromise,
        new Promise(r => setTimeout(r, 5000)), // Max 5s wait for events after chat completes
      ])

      const iterationDuration = Date.now() - iterationStart
      console.log(`[${runId}][${provider}] Iteration ${iteration} completed in ${iterationDuration}ms`)

      // Check for completion promise in output
      if (checkCompletionPromise(iterationOutput, completionPromise)) {
        console.log(`[${runId}][${provider}] Completion promise detected!`)
        completed = true
        emitEvent(runId, {
          id: `${runId}_${provider}_completion_detected`,
          type: "status",
          timestamp: Date.now(),
          data: { message: "Completion promise detected", iteration },
          provider,
        })
        break
      }

      // Small delay between iterations
      if (!completed && iteration < maxIterations) {
        console.log(`[${runId}][${provider}] Waiting before next iteration...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  } finally {
    clearTimeout(timeoutId)
  }

  if (completed) {
    emitEvent(runId, {
      id: `${runId}_${provider}_ralph_complete`,
      type: "ralph_complete",
      timestamp: Date.now(),
      data: {
        success: true,
        iterations: iteration,
        message: `Ralph completed all tasks in ${iteration} iterations`,
      },
      provider,
    })
    return { success: true, summary: `Ralph completed in ${iteration} iterations`, iterations: iteration }
  }

  emitEvent(runId, {
    id: `${runId}_${provider}_ralph_timeout`,
    type: "error",
    timestamp: Date.now(),
    data: {
      message: `Ralph did not complete after ${iteration} iterations`,
    },
    provider,
  })

  return { success: false, summary: `Ralph stopped after ${iteration} iterations`, iterations: iteration }
}

/**
 * SSE-Based Ralph Loop Implementation
 * 
 * Proper iteration loop using SSE for real-time event streaming:
 * 1. Start ONE global SSE subscription to opencode's /event endpoint
 * 2. For each iteration:
 *    - Create a new session
 *    - Send the iteration prompt
 *    - Wait for session.idle (via SSE events)
 *    - Check for completion promise in accumulated output
 *    - If complete, stop. Otherwise, continue to next iteration.
 * 3. Activity-based idle detection (5 min of only heartbeats = done)
 */
async function startRalphLoopSSE(
  runId: string,
  provider: Provider,
  _sandboxId: string,
  workDir: string,
  task: string,
  config: { maxIterations?: number; idleTimeoutMs?: number } = {}
): Promise<{ success: boolean; summary: string; iterations: number; reason: SSEStreamResult["reason"] }> {
  const { maxIterations = 10, idleTimeoutMs = 5 * 60 * 1000 } = config
  // Use a unique nonce per run to prevent accidental mentions of the completion marker
  const nonce = Math.random().toString(36).substring(2, 10)
  const completionPromise = `DONE_${nonce}`
  
  console.log(`[${runId}][${provider}] Starting SSE-based Ralph loop (maxIterations: ${maxIterations}, idleTimeout: ${idleTimeoutMs}ms)`)

  const run = runs.get(runId)
  if (!run) {
    throw new Error("Run not found")
  }

  const providerRun = run.providerRuns.get(provider)
  const opencodeUrl = providerRun?.opencodeUrl
  const dbRalphId = providerRun?.dbRalphId

  if (!opencodeUrl) {
    console.log(`[${runId}][${provider}] No opencode URL available`)
    emitEvent(runId, {
      id: `${runId}_${provider}_no_opencode_url`,
      type: "error",
      timestamp: Date.now(),
      data: { message: "OpenCode URL not available" },
      provider,
    })
    return { success: false, summary: "OpenCode URL not available", iterations: 0, reason: "error" }
  }

  emitEvent(runId, {
    id: `${runId}_${provider}_sse_ralph_starting`,
    type: "status",
    timestamp: Date.now(),
    data: {
      message: "Starting SSE-based Ralph loop...",
      maxIterations,
      idleTimeoutMs,
      opencodeUrl,
    },
    provider,
  })

  // Create SDK client
  const client = new OpenCodeClient({ baseUrl: opencodeUrl, directory: workDir })
  
  // Wait for server health
  try {
    const health = await client.health()
    console.log(`[${runId}][${provider}] OpenCode server healthy: ${health.version}`)
  } catch (e) {
    console.error(`[${runId}][${provider}] OpenCode server not healthy:`, e)
    return { success: false, summary: "OpenCode server not responding", iterations: 0, reason: "error" }
  }

  // State for the iteration loop
  let completed = false
  let completionReason: SSEStreamResult["reason"] = "aborted"
  let iteration = 0
  let currentSessionId: string | undefined
  let accumulatedAssistantText = ""  // Only assistant responses
  let waitingForIdle = false
  let idleResolver: (() => void) | null = null
  let lastNonHeartbeatTime = Date.now()

  // Track message roles by messageID to filter out user prompts
  const messageRoles = new Map<string, string>()
  // Queue parts until we know the message role (parts can arrive before message.updated)
  const pendingParts = new Map<string, Array<{ text: string }>>()

  // SSE event handler - writes to Convex and handles iteration state
  const handleSSEEvent = async (event: { type: string; properties: Record<string, unknown>; directory: string }) => {
    const { type, properties } = event

    // Write to Convex if configured (skip heartbeats)
    if (dbRalphId && type !== "server.heartbeat") {
      await writeSSEEventToConvex(dbRalphId, event)
    }

    // Check for idle timeout on heartbeats
    if (type === "server.heartbeat") {
      const elapsed = Date.now() - lastNonHeartbeatTime
      if (elapsed >= idleTimeoutMs) {
        console.log(`[${runId}][${provider}] Idle timeout reached (${elapsed}ms since last activity)`)
        completed = true
        completionReason = "idle_timeout"
        if (idleResolver) idleResolver()
      }
      return
    }

    // Update last activity time
    lastNonHeartbeatTime = Date.now()

    // Filter by current session
    const eventSessionId = properties.sessionID as string | undefined
    if (currentSessionId && eventSessionId && eventSessionId !== currentSessionId) {
      return
    }

    // Track message roles and process any pending parts
    if (type === "message.updated") {
      const info = properties.info as { id?: string; role?: string } | undefined
      if (info?.id && info?.role) {
        messageRoles.set(info.id, info.role)
        console.log(`[${runId}][${provider}] Message ${info.id} role: ${info.role}`)
        
        // Process any pending parts now that we know the role
        const pending = pendingParts.get(info.id)
        if (pending && info.role === "assistant") {
          for (const part of pending) {
            accumulatedAssistantText += part.text
          }
          console.log(`[${runId}][${provider}] Processed ${pending.length} pending parts for assistant message`)
        }
        pendingParts.delete(info.id)
      }
    }

    // Handle message parts
    if (type === "message.part.updated") {
      const part = properties.part as { 
        type?: string; 
        text?: string; 
        tool?: string; 
        state?: unknown;
        messageID?: string;
      } | undefined
      
      // Get message role
      const messageRole = part?.messageID ? messageRoles.get(part.messageID) : undefined

      if (part?.type === "tool") {
        const state = part.state as { status?: string; title?: string } | undefined
        if (state?.status === "completed") {
          emitEvent(runId, {
            id: `${runId}_${provider}_tool_${Date.now()}`,
            type: "tool_call",
            timestamp: Date.now(),
            data: { name: part.tool, title: state.title, state },
            provider,
          })
        }
      } else if (part?.type === "text" && part.text && part.messageID) {
        // Only accumulate assistant responses, not user prompts
        if (messageRole === "assistant") {
          accumulatedAssistantText += part.text
        } else if (messageRole === undefined) {
          // Role not yet known - queue for later processing
          const pending = pendingParts.get(part.messageID) || []
          pending.push({ text: part.text })
          pendingParts.set(part.messageID, pending)
        }
        // If messageRole === "user", we intentionally skip accumulation
        
        emitEvent(runId, {
          id: `${runId}_${provider}_thought_${Date.now()}`,
          type: "thought",
          timestamp: Date.now(),
          data: part.text,
          provider,
        })
      }
    }

    // Handle session idle - iteration complete
    if (type === "session.idle" || (type === "session.status" && (properties.status as { type?: string })?.type === "idle")) {
      if (properties.sessionID === currentSessionId && waitingForIdle) {
        console.log(`[${runId}][${provider}] Session idle detected for ${currentSessionId}`)
        console.log(`[${runId}][${provider}] Accumulated assistant text length: ${accumulatedAssistantText.length}`)
        
        // Check for completion promise in accumulated assistant text ONLY
        // Uses robust detection that strips markdown code and requires standalone line
        if (checkCompletionPromise(accumulatedAssistantText, completionPromise)) {
          console.log(`[${runId}][${provider}] Completion promise found in assistant response!`)
          completed = true
          completionReason = "completion_promise"
        } else {
          console.log(`[${runId}][${provider}] No completion promise found, will continue to next iteration`)
        }
        
        // Signal that this iteration is done
        if (idleResolver) idleResolver()
      }
    }

    // Handle session errors
    if (type === "session.error" && properties.sessionID === currentSessionId) {
      console.error(`[${runId}][${provider}] Session error:`, properties.error)
      emitEvent(runId, {
        id: `${runId}_${provider}_error_${Date.now()}`,
        type: "error",
        timestamp: Date.now(),
        data: { message: (properties.error as { message?: string })?.message || "Session error" },
        provider,
      })
      completionReason = "error"
      if (idleResolver) idleResolver()
    }
  }

  // Start global SSE subscription
  console.log(`[${runId}][${provider}] Starting SSE subscription...`)
  const abortController = new AbortController()
  
  // Run SSE subscription in background
  const sseSubscription = (async () => {
    try {
      for await (const { directory: eventDir, event } of client.subscribeToEvents(abortController.signal)) {
        if (abortController.signal.aborted) break
        
        await handleSSEEvent({
          type: event.type,
          properties: (event as { properties?: Record<string, unknown> }).properties || {},
          directory: eventDir,
        })
        
        if (completed) break
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error(`[${runId}][${provider}] SSE subscription error:`, e)
      }
    }
  })()

  // Main iteration loop
  while (iteration < maxIterations && !completed) {
    iteration++
    console.log(`[${runId}][${provider}] === Iteration ${iteration}/${maxIterations} ===`)

    emitEvent(runId, {
      id: `${runId}_${provider}_iteration_${iteration}`,
      type: "ralph_iteration",
      timestamp: Date.now(),
      data: {
        iteration,
        maxIterations,
        message: `Starting iteration ${iteration}/${maxIterations}`,
      },
      provider,
    })

    // Reset state for this iteration
    accumulatedAssistantText = ""
    messageRoles.clear()
    pendingParts.clear()
    waitingForIdle = false
    lastNonHeartbeatTime = Date.now()

    // Create a new session for this iteration
    let session
    try {
      session = await client.createSession(`Ralph iteration ${iteration} - ${runId}`)
      currentSessionId = session.id
      providerRun!.sessionId = session.id
      console.log(`[${runId}][${provider}] Created session: ${session.id}`)
    } catch (e) {
      console.error(`[${runId}][${provider}] Failed to create session:`, e)
      completionReason = "error"
      break
    }

    // Build and send the prompt
    const prompt = buildRalphPrompt(task, iteration, maxIterations, completionPromise)
    console.log(`[${runId}][${provider}] Sending prompt to session ${session.id}...`)

    // Create a promise that resolves when we see session.idle
    const idlePromise = new Promise<void>((resolve) => {
      idleResolver = resolve
      waitingForIdle = true
    })

    // Send the prompt (non-blocking)
    client.chat(session.id, prompt).catch(e => {
      console.error(`[${runId}][${provider}] Chat error:`, e)
    })

    // Wait for session to become idle
    await idlePromise
    waitingForIdle = false
    idleResolver = null

    console.log(`[${runId}][${provider}] Iteration ${iteration} complete, completed=${completed}`)
  }

  // Stop SSE subscription
  abortController.abort()
  await sseSubscription.catch(() => {})

  console.log(`[${runId}][${provider}] Ralph loop finished: reason=${completionReason}, iterations=${iteration}`)

  // Emit completion event
  if (completed && (completionReason === "completion_promise" || completionReason === "idle_timeout")) {
    emitEvent(runId, {
      id: `${runId}_${provider}_ralph_complete`,
      type: "ralph_complete",
      timestamp: Date.now(),
      data: {
        success: true,
        iterations: iteration,
        reason: completionReason,
        message: `Ralph completed via ${completionReason} after ${iteration} iterations`,
      },
      provider,
    })
    
    if (dbRalphId) {
      await updateRalphStatus(dbRalphId, "completed", iteration)
    }
    
    return { 
      success: true, 
      summary: `Ralph completed in ${iteration} iterations (${completionReason})`, 
      iterations: iteration,
      reason: completionReason,
    }
  }

  // Max iterations reached without completion
  if (iteration >= maxIterations && !completed) {
    emitEvent(runId, {
      id: `${runId}_${provider}_ralph_max_iterations`,
      type: "ralph_complete",
      timestamp: Date.now(),
      data: {
        success: false,
        iterations: iteration,
        reason: "max_iterations",
        message: `Ralph reached max iterations (${maxIterations}) without completion`,
      },
      provider,
    })
    
    if (dbRalphId) {
      await updateRalphStatus(dbRalphId, "failed", iteration)
    }
    
    return { 
      success: false, 
      summary: `Ralph stopped after ${iteration} iterations (max reached)`, 
      iterations: iteration,
      reason: "aborted",
    }
  }

  // Error or other failure
  emitEvent(runId, {
    id: `${runId}_${provider}_ralph_failed`,
    type: "error",
    timestamp: Date.now(),
    data: {
      message: `Ralph stopped: ${completionReason}`,
      iterations: iteration,
    },
    provider,
  })
  
  if (dbRalphId) {
    await updateRalphStatus(dbRalphId, "failed", iteration)
  }

  return { 
    success: false, 
    summary: `Ralph stopped: ${completionReason} after ${iteration} iterations`, 
    iterations: iteration,
    reason: completionReason,
  }
}

// Parse GitHub URL to extract owner/repo
const parseGitHubUrl = (url: string): { owner: string; repo: string; cloneUrl: string } | null => {
  // Handle shorthand: owner/repo
  const shorthandMatch = url.match(/^([^/]+)\/([^/]+)$/)
  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      repo: shorthandMatch[2],
      cloneUrl: `https://github.com/${shorthandMatch[1]}/${shorthandMatch[2]}.git`,
    }
  }

  // Handle full URL: https://github.com/owner/repo
  const urlMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      cloneUrl: `https://github.com/${urlMatch[1]}/${urlMatch[2]}.git`,
    }
  }

  return null
}

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", docker: true })
})
app.get("/api/health", (c) => {
  return c.json({ status: "ok", docker: true })
})

// Get provider status
app.get("/api/providers", (c) => {
  const providers = [
    { id: "modal", name: "Modal", configured: !!(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET) },
    { id: "daytona", name: "Daytona", configured: !!process.env.DAYTONA_API_KEY },
    { id: "e2b", name: "E2B", configured: !!process.env.E2B_API_KEY },
    { id: "blaxel", name: "Blaxel", configured: !!process.env.BLAXEL_API_KEY },
    { id: "cloudflare", name: "Cloudflare", configured: !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) },
    { id: "vercel", name: "Vercel", configured: !!(process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_ACCESS_TOKEN) },
    { id: "docker", name: "Docker (Local)", configured: true }, // Docker is always available locally
  ]
  return c.json({ providers })
})

// Start a new run
app.post("/api/run/start", async (c) => {
  try {
    const body = await c.req.json()
    const { repoUrl, branch, task, providers: selectedProviders, config: agentConfig, userId } = body as {
      repoUrl: string
      branch?: string
      task: string
      providers: Provider[]
      config?: { maxIterations?: number; doomLoopThreshold?: number; idleTimeoutMs?: number; useSSE?: boolean }
      userId?: Id<"users">
    }

    // Validate inputs
    if (!repoUrl || !task || !selectedProviders?.length) {
      return c.json({ error: "Missing required fields: repoUrl, task, providers" }, 400)
    }

    const parsed = parseGitHubUrl(repoUrl)
    if (!parsed) {
      return c.json({ error: "Invalid GitHub URL" }, 400)
    }

    const runId = generateId()
    const branchToUse = branch || "main"
    const workDir = `/workspace/${parsed.repo}`

    // Create run record
    const run: Run = {
      id: runId,
      repoUrl,
      branch: branchToUse,
      task,
      providers: selectedProviders,
      providerRuns: new Map(),
      status: "cloning",
      startedAt: Date.now(),
      userId,
    }
    runs.set(runId, run)
    runSubscribers.set(runId, new Set())

    // Log Convex status
    if (isConvexConfigured()) {
      console.log(`[${runId}] Convex is configured, will persist sandbox/ralph data`)
    } else {
      console.log(`[${runId}] Convex not configured, running in memory-only mode`)
    }

    // Start sandbox creation and cloning for each provider (in parallel)
    const sandboxPromises = selectedProviders.map(async (provider) => {
      try {
        // Create sandbox
        console.log(`[${runId}][${provider}] Creating sandbox...`)
        emitEvent(runId, {
          id: `${runId}_${provider}_create`,
          type: "status",
          timestamp: Date.now(),
          data: { message: `Creating sandbox for ${provider}...` },
          provider,
        })

        const startTime = Date.now()
        const sandboxInfo = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            return yield* driver.create({
              image: defaultImages[provider],
              name: `ralph-${runId.substring(4, 15)}-${provider}`,
            })
          }),
          provider,
        )

        console.log(`[${runId}][${provider}] Sandbox created in ${Date.now() - startTime}ms: ${sandboxInfo.id}`)

        // Initialize provider run
        const providerRun: ProviderRun = {
          provider,
          sandboxId: sandboxInfo.id,
          status: "cloning",
          events: [],
          workDir,
        }
        run.providerRuns.set(provider, providerRun)

        // Persist sandbox to Convex if userId is available
        if (userId) {
          const dbSandboxId = await createSandboxInDb(userId, sandboxInfo.id, provider, repoUrl)
          if (dbSandboxId) {
            providerRun.dbSandboxId = dbSandboxId
            console.log(`[${runId}][${provider}] Sandbox persisted to Convex: ${dbSandboxId}`)
          }
        }

        emitEvent(runId, {
          id: `${runId}_${provider}_sandbox_created`,
          type: "status",
          timestamp: Date.now(),
          data: { message: `Sandbox created: ${sandboxInfo.id}`, sandboxId: sandboxInfo.id },
          provider,
        })

        // Clone the repository
        console.log(`[${runId}][${provider}] Starting clone...`)
        const cloneStartTime = Date.now()
        emitEvent(runId, {
          id: `${runId}_${provider}_clone_start`,
          type: "clone_progress",
          timestamp: Date.now(),
          data: { message: `Preparing to clone ${parsed.cloneUrl}...`, progress: 10 },
          provider,
        })

        // Install git if needed and clone
        const cloneResult = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver

            // Check if git is installed
            const gitCheck = yield* driver.run(sandboxInfo.id, {
              cmd: "sh",
              args: ["-c", "which git"],
              timeoutMs: 10000,
            }).pipe(Effect.either)

            if (gitCheck._tag === "Left" || gitCheck.right.exitCode !== 0) {
              // Git not installed, install it
              console.log(`[${runId}][${provider}] Git not found, installing...`)
              emitEvent(runId, {
                id: `${runId}_${provider}_installing_git`,
                type: "clone_progress",
                timestamp: Date.now(),
                data: { message: "Installing git...", progress: 20 },
                provider,
              })
              yield* driver.run(sandboxInfo.id, {
                cmd: "sh",
                args: ["-c", "apt-get update -qq && apt-get install -y -qq git"],
                timeoutMs: 120000,
              })
              console.log(`[${runId}][${provider}] Git installed`)
            } else {
              console.log(`[${runId}][${provider}] Git already installed`)
            }

            emitEvent(runId, {
              id: `${runId}_${provider}_creating_workspace`,
              type: "clone_progress",
              timestamp: Date.now(),
              data: { message: "Creating workspace directory...", progress: 40 },
              provider,
            })

            // Create workspace directory
            yield* driver.run(sandboxInfo.id, {
              cmd: "mkdir",
              args: ["-p", "/workspace"],
              timeoutMs: 10000,
            })

            emitEvent(runId, {
              id: `${runId}_${provider}_cloning`,
              type: "clone_progress",
              timestamp: Date.now(),
              data: { message: `Cloning ${parsed.repo} (branch: ${branchToUse})...`, progress: 50 },
              provider,
            })

            console.log(`[${runId}][${provider}] Running git clone...`)
            // Clone the repo with progress
            return yield* driver.run(sandboxInfo.id, {
              cmd: "git",
              args: ["clone", "--branch", branchToUse, "--single-branch", "--depth", "1", "--progress", parsed.cloneUrl, workDir],
              timeoutMs: 300000,
            })
          }),
          provider,
        )

        console.log(`[${runId}][${provider}] Clone completed in ${Date.now() - cloneStartTime}ms`)
        emitEvent(runId, {
          id: `${runId}_${provider}_clone_complete`,
          type: "clone_progress",
          timestamp: Date.now(),
          data: {
            message: "Repository cloned successfully",
            progress: 100,
            output: cloneResult.stdout,
            stderr: cloneResult.stderr,
          },
          provider,
        })

        // Detect and install dependencies
        console.log(`[${runId}][${provider}] Starting dependency installation...`)
        const installStartTime = Date.now()
        providerRun.status = "installing"
        emitEvent(runId, {
          id: `${runId}_${provider}_install_start`,
          type: "install_progress",
          timestamp: Date.now(),
          data: { message: "Detecting project dependencies...", progress: 0 },
          provider,
        })

        const installResult = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver

            // List files in the cloned directory to detect project type
            const files = yield* driver.listDir(sandboxInfo.id, workDir)
            const fileNames = files.map((f) => f.path.split("/").pop() || f.path)

            // Detect package manager and install dependencies
            if (fileNames.includes("package.json")) {
              // Node.js project - detect package manager
              let installCmd = "npm install"
              if (fileNames.includes("bun.lock") || fileNames.includes("bun.lockb")) {
                // Install bun first
                yield* driver.run(sandboxInfo.id, {
                  cmd: "sh",
                  args: ["-c", "which bun || npm install -g bun"],
                  cwd: workDir,
                  timeoutMs: 60000,
                })
                installCmd = "bun install"
              } else if (fileNames.includes("pnpm-lock.yaml")) {
                yield* driver.run(sandboxInfo.id, {
                  cmd: "sh",
                  args: ["-c", "which pnpm || npm install -g pnpm"],
                  cwd: workDir,
                  timeoutMs: 60000,
                })
                installCmd = "pnpm install"
              } else if (fileNames.includes("yarn.lock")) {
                installCmd = "yarn install"
              }

              return yield* driver.run(sandboxInfo.id, {
                cmd: "sh",
                args: ["-c", installCmd],
                cwd: workDir,
                timeoutMs: 300000,
              })
            } else if (fileNames.includes("requirements.txt")) {
              // Python project
              yield* driver.run(sandboxInfo.id, {
                cmd: "sh",
                args: ["-c", "which pip || apt-get install -y python3-pip"],
                timeoutMs: 60000,
              })
              return yield* driver.run(sandboxInfo.id, {
                cmd: "pip",
                args: ["install", "-r", "requirements.txt"],
                cwd: workDir,
                timeoutMs: 300000,
              })
            } else if (fileNames.includes("pyproject.toml")) {
              // Python project with pyproject.toml
              yield* driver.run(sandboxInfo.id, {
                cmd: "sh",
                args: ["-c", "which pip || apt-get install -y python3-pip"],
                timeoutMs: 60000,
              })
              return yield* driver.run(sandboxInfo.id, {
                cmd: "pip",
                args: ["install", "."],
                cwd: workDir,
                timeoutMs: 300000,
              })
            } else if (fileNames.includes("Cargo.toml")) {
              // Rust project
              return yield* driver.run(sandboxInfo.id, {
                cmd: "cargo",
                args: ["build"],
                cwd: workDir,
                timeoutMs: 600000,
              })
            } else if (fileNames.includes("go.mod")) {
              // Go project
              return yield* driver.run(sandboxInfo.id, {
                cmd: "go",
                args: ["mod", "download"],
                cwd: workDir,
                timeoutMs: 300000,
              })
            }

            // No recognized dependency file
            return { exitCode: 0, stdout: "No dependencies to install", stderr: "" }
          }),
          provider,
        )

        console.log(`[${runId}][${provider}] Dependencies installed in ${Date.now() - installStartTime}ms`)
        emitEvent(runId, {
          id: `${runId}_${provider}_install_complete`,
          type: "install_progress",
          timestamp: Date.now(),
          data: {
            message: "Dependencies installed successfully",
            progress: 100,
            output: installResult.stdout,
            stderr: installResult.stderr,
          },
          provider,
        })

        providerRun.status = "running"
        console.log(`[${runId}][${provider}] Setting up OpenCode server...`)

        // Install opencode and start server
        emitEvent(runId, {
          id: `${runId}_${provider}_opencode_setup`,
          type: "status",
          timestamp: Date.now(),
          data: { message: "Installing OpenCode..." },
          provider,
        })

        // Install Bun first (required by ralph-wiggum)
        console.log(`[${runId}][${provider}] Installing Bun...`)
        const bunInstallResult = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            return yield* driver.run(sandboxInfo.id, {
              cmd: "sh",
              args: ["-c", `
                export HOME=/root
                which bun && echo "bun already installed" && exit 0
                echo "Installing Bun..."
                curl -fsSL https://bun.sh/install | bash
                export PATH="/root/.bun/bin:$PATH"
                bun --version
              `],
              cwd: workDir,
              env: { HOME: "/root" },
              timeoutMs: 120000,
            })
          }),
          provider,
        )
        console.log(`[${runId}][${provider}] Bun install result:`, bunInstallResult.stdout)

        // Install opencode (installs to /root/.opencode/bin/)
        const opencodeInstallResult = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            return yield* driver.run(sandboxInfo.id, {
              cmd: "sh",
              args: ["-c", `
                export HOME=/root
                export PATH="/root/.opencode/bin:/root/.bun/bin:/usr/local/bin:/usr/bin:/bin"
                echo "Checking for opencode..."
                which opencode && echo "opencode already installed" && exit 0
                echo "Installing opencode..."
                curl -fsSL https://opencode.ai/install | bash
                echo "Install complete, checking location..."
                ls -la /root/.opencode/bin/ || echo "No /root/.opencode/bin"
                which opencode || echo "opencode not found in PATH"
              `],
              cwd: workDir,
              env: {
                HOME: "/root",
                PATH: "/root/.opencode/bin:/root/.bun/bin:/usr/local/bin:/usr/bin:/bin",
              },
              timeoutMs: 180000,
            })
          }),
          provider,
        )
        console.log(`[${runId}][${provider}] OpenCode install result:`, opencodeInstallResult.stdout, opencodeInstallResult.stderr)
        
        // Emit install result as event so we can debug
        emitEvent(runId, {
          id: `${runId}_${provider}_opencode_install_debug`,
          type: "output",
          timestamp: Date.now(),
          data: {
            message: "OpenCode install output",
            stdout: opencodeInstallResult.stdout,
            stderr: opencodeInstallResult.stderr,
            exitCode: opencodeInstallResult.exitCode,
          },
          provider,
        })

        // Install ralph-wiggum CLI
        emitEvent(runId, {
          id: `${runId}_${provider}_ralph_setup`,
          type: "status",
          timestamp: Date.now(),
          data: { message: "Installing ralph-wiggum..." },
          provider,
        })

        const ralphInstallResult = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            return yield* driver.run(sandboxInfo.id, {
              cmd: "sh",
              args: ["-c", `
                export HOME=/root
                export PATH="/root/.opencode/bin:/root/.local/bin:/root/.bun/bin:/usr/local/bin:/usr/bin:/bin"
                echo "Installing ralph-wiggum..."
                # Try npm first, fall back to bun
                npm install -g @th0rgal/ralph-wiggum 2>/dev/null || bun add -g @th0rgal/ralph-wiggum 2>/dev/null || echo "Could not install ralph-wiggum"
                which ralph && echo "ralph installed successfully" || echo "ralph not found after install"
              `],
              cwd: workDir,
              env: {
                HOME: "/root",
                PATH: "/root/.opencode/bin:/root/.local/bin:/root/.bun/bin:/usr/local/bin:/usr/bin:/bin",
              },
              timeoutMs: 120000,
            })
          }),
          provider,
        )
        console.log(`[${runId}][${provider}] Ralph-wiggum install result:`, ralphInstallResult.stdout, ralphInstallResult.stderr)

        emitEvent(runId, {
          id: `${runId}_${provider}_ralph_install_debug`,
          type: "output",
          timestamp: Date.now(),
          data: {
            message: "Ralph-wiggum install output",
            stdout: ralphInstallResult.stdout,
            stderr: ralphInstallResult.stderr,
            exitCode: ralphInstallResult.exitCode,
          },
          provider,
        })

        // Write the prompt file with the user's task
        await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            yield* driver.writeFile(sandboxInfo.id, `${workDir}/prompt.md`, generatePromptFile(task))
          }),
          provider,
        )

        // Create opencode config for headless mode (prevents questions and permission prompts)
        const opencodeConfig = JSON.stringify({
          "$schema": "https://opencode.ai/config.json",
          "permission": {
            "read": "allow",
            "edit": "allow",
            "glob": "allow",
            "grep": "allow",
            "list": "allow",
            "bash": "allow",
            "task": "allow",
            "webfetch": "allow",
            "websearch": "allow",
            "codesearch": "allow",
            "todowrite": "allow",
            "todoread": "allow",
            "question": "deny",  // CRITICAL: Prevents agent from asking questions
            "lsp": "allow",
            "external_directory": "allow",
            "plan_enter": "deny",
            "plan_exit": "deny"
          }
        }, null, 2)

        await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            // Create .opencode directory and config
            yield* driver.run(sandboxInfo.id, {
              cmd: "mkdir",
              args: ["-p", `${workDir}/.opencode`],
              timeoutMs: 5000,
            })
            yield* driver.writeFile(sandboxInfo.id, `${workDir}/.opencode/opencode.json`, opencodeConfig)
          }),
          provider,
        )
        console.log(`[${runId}][${provider}] Created opencode config for headless mode`)

        // Start opencode server in background
        emitEvent(runId, {
          id: `${runId}_${provider}_opencode_starting`,
          type: "status",
          timestamp: Date.now(),
          data: { message: "Starting OpenCode server..." },
          provider,
        })

        const opencodeConfigPath = `${workDir}/.opencode/opencode.json`
        await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            // Start opencode server in background with OPENCODE_CONFIG pointing to our headless config
            yield* driver.run(sandboxInfo.id, {
              cmd: "sh",
              args: [
                "-c",
                `export PATH="/root/.opencode/bin:/root/.local/bin:/root/.bun/bin:$PATH" && \
                 export ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY || ""}" && \
                 export OPENAI_API_KEY="${process.env.OPENAI_API_KEY || ""}" && \
                 export OPENCODE_CONFIG="${opencodeConfigPath}" && \
                 cd ${workDir} && \
                 nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &`,
              ],
              cwd: workDir,
              timeoutMs: 30000,
            })
            // Wait a bit for server to start
            yield* driver.run(sandboxInfo.id, {
              cmd: "sh",
              args: ["-c", "sleep 5"],
              timeoutMs: 10000,
            })
          }),
          provider,
        )

        // Get the exposed URL for opencode
        let opencodeUrl = ""
        try {
          const urls = await runEffect(
            Effect.gen(function* () {
              const driver = yield* SandboxDriver
              if (driver.getProcessUrls) {
                const result = yield* driver.getProcessUrls(sandboxInfo.id, [OPENCODE_PORT])
                console.log(`[${runId}][${provider}] getProcessUrls result:`, JSON.stringify(result))
                return result
              }
              console.log(`[${runId}][${provider}] getProcessUrls not available on driver`)
              return {}
            }),
            provider,
          )
          opencodeUrl = urls[OPENCODE_PORT] || ""
          console.log(`[${runId}][${provider}] OpenCode URL: ${opencodeUrl}`)
          
          // Emit URL info as event
          emitEvent(runId, {
            id: `${runId}_${provider}_url_debug`,
            type: "output",
            timestamp: Date.now(),
            data: {
              message: "Process URLs result",
              urls,
              opencodeUrl,
              port: OPENCODE_PORT,
            },
            provider,
          })
        } catch (e) {
          console.log(`[${runId}][${provider}] Could not get opencode URL:`, e)
        }

        // Store the opencode URL
        providerRun.opencodeUrl = opencodeUrl

        // Attach URL to Convex sandbox record
        if (providerRun.dbSandboxId && opencodeUrl) {
          await attachUrlToSandbox(providerRun.dbSandboxId, opencodeUrl)
        }

        // Create Ralph session in Convex if we have a sandbox
        if (userId && providerRun.dbSandboxId) {
          const dbRalphId = await createRalphInDb(userId, providerRun.dbSandboxId, task)
          if (dbRalphId) {
            providerRun.dbRalphId = dbRalphId
            console.log(`[${runId}][${provider}] Ralph session persisted to Convex: ${dbRalphId}`)
          }
        }

        emitEvent(runId, {
          id: `${runId}_${provider}_opencode_ready`,
          type: "opencode_ready",
          timestamp: Date.now(),
          data: {
            message: "OpenCode server is ready",
            url: opencodeUrl,
            port: OPENCODE_PORT,
          },
          provider,
        })

        // Start Ralph loop asynchronously
        // Use SSE-based loop by default (no hardcoded timeouts, activity-based idle detection)
        // Can be overridden via env var or API config
        const useSSE = agentConfig?.useSSE ?? (process.env.RALPH_USE_SSE !== "false")
        const ralphConfig = {
          maxIterations: agentConfig?.maxIterations || 10,
          idleTimeoutMs: agentConfig?.idleTimeoutMs || 5 * 60 * 1000, // 5 min default
        }
        
        console.log(`[${runId}][${provider}] Ralph config: useSSE=${useSSE}, maxIterations=${ralphConfig.maxIterations}, idleTimeoutMs=${ralphConfig.idleTimeoutMs}`)
        
        const ralphPromise = useSSE
          ? startRalphLoopSSE(runId, provider, sandboxInfo.id, workDir, task, ralphConfig)
          : startRalphLoop(runId, provider, sandboxInfo.id, workDir, task, ralphConfig.maxIterations)
        
        ralphPromise
          .then(async (result) => {
            const pr = run.providerRuns.get(provider)
            if (pr) {
              pr.status = result.success ? "completed" : "failed"

              // Update ralph status in Convex (SSE version handles this internally)
              if (!useSSE && pr.dbRalphId) {
                await updateRalphStatus(
                  pr.dbRalphId,
                  result.success ? "completed" : "failed",
                  result.iterations
                )
              }
            }
            const allDone = Array.from(run.providerRuns.values()).every(
              (pr) => pr.status === "completed" || pr.status === "failed",
            )
            if (allDone) {
              run.status = "completed"
              run.completedAt = Date.now()
            }
          })
          .catch(async (error) => {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            emitEvent(runId, {
              id: `${runId}_${provider}_ralph_error`,
              type: "error",
              timestamp: Date.now(),
              data: { message: `Ralph error: ${errorMessage}` },
              provider,
            })
            const pr = run.providerRuns.get(provider)
            if (pr) {
              pr.status = "failed"

              // Update ralph status in Convex
              if (pr.dbRalphId) {
                await updateRalphStatus(pr.dbRalphId, "failed")
              }
            }
          })

        return { provider, sandboxId: sandboxInfo.id, success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error(`[${runId}][${provider}] Error:`, error)
        emitEvent(runId, {
          id: `${runId}_${provider}_error`,
          type: "error",
          timestamp: Date.now(),
          data: { message: `Error: ${errorMessage}` },
          provider,
        })
        const providerRun = run.providerRuns.get(provider)
        if (providerRun) {
          providerRun.status = "failed"
        }
        return { provider, sandboxId: null, success: false, error: errorMessage }
      }
    })

    // Return immediately with run ID, sandbox creation happens in background
    const results = await Promise.all(sandboxPromises)

    // Update overall run status
    const allSuccess = results.every((r) => r.success)
    const anySuccess = results.some((r) => r.success)
    run.status = allSuccess ? "running" : anySuccess ? "running" : "failed"

    return c.json({
      runId,
      repoUrl,
      branch: branchToUse,
      task,
      providers: results.map((r) => ({
        provider: r.provider,
        sandboxId: r.sandboxId,
        success: r.success,
        error: r.error,
      })),
    })
  } catch (err) {
    console.error("Start run error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// Get run status
app.get("/api/run/:id", (c) => {
  const runId = c.req.param("id")
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  const providerRuns: Record<string, { sandboxId: string; status: RunStatus; events: RunEvent[]; opencodeUrl?: string; sessionId?: string }> = {}
  run.providerRuns.forEach((pr, provider) => {
    providerRuns[provider] = {
      sandboxId: pr.sandboxId,
      status: pr.status,
      events: pr.events,
      opencodeUrl: pr.opencodeUrl,
      sessionId: pr.sessionId,
    }
  })

  return c.json({
    id: run.id,
    repoUrl: run.repoUrl,
    branch: run.branch,
    task: run.task,
    providers: run.providers,
    providerRuns,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  })
})

// SSE stream for run events
app.get("/api/run/:id/stream", async (c) => {
  const runId = c.req.param("id")
  console.log(`[SSE] Stream requested for runId: ${runId}`)
  const run = runs.get(runId)

  if (!run) {
    console.log(`[SSE] Run not found: ${runId}`)
    return c.json({ error: "Run not found" }, 404)
  }

  console.log(`[SSE] Found run, providers: ${Array.from(run.providerRuns.keys()).join(", ")}`)

  return streamSSE(c, async (stream) => {
    console.log(`[SSE] Stream opened for ${runId}`)
    
    // Send all existing events first (properly awaited)
    let replayCount = 0
    for (const pr of run.providerRuns.values()) {
      for (const event of pr.events) {
        try {
          await stream.writeSSE({
            data: JSON.stringify(event),
            event: event.type,
            id: event.id,
          })
          replayCount++
        } catch (err) {
          console.log(`[SSE] Client disconnected during replay:`, err)
          return
        }
      }
    }
    console.log(`[SSE] Replayed ${replayCount} existing events`)

    // Subscribe to new events
    const callback = async (event: RunEvent) => {
      console.log(`[SSE] Sending new event: ${event.type} (${event.id})`)
      try {
        await stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
          id: event.id,
        })
      } catch (err) {
        console.log(`[SSE] Failed to send event:`, err)
      }
    }

    const subscribers = runSubscribers.get(runId)
    if (subscribers) {
      subscribers.add(callback)
      console.log(`[SSE] Added subscriber, total subscribers: ${subscribers.size}`)
    } else {
      console.log(`[SSE] No subscriber set found for ${runId}`)
    }

    // Keep connection alive
    const keepAlive = setInterval(async () => {
      try {
        await stream.writeSSE({ data: "ping", event: "ping" })
        console.log(`[SSE] Sent ping to ${runId}`)
      } catch {
        console.log(`[SSE] Ping failed, clearing interval`)
        clearInterval(keepAlive)
      }
    }, 30000)

    // Cleanup on close (this won't actually trigger in Hono SSE, but good practice)
    stream.onAbort(() => {
      clearInterval(keepAlive)
      const subscribers = runSubscribers.get(runId)
      if (subscribers) {
        subscribers.delete(callback)
      }
    })

    // Keep the stream open
    await new Promise(() => {})
  })
})

// Get opencode server URL for a provider
app.get("/api/run/:id/opencode/:provider", (c) => {
  const runId = c.req.param("id")
  const provider = c.req.param("provider") as Provider
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  const providerRun = run.providerRuns.get(provider)
  if (!providerRun) {
    return c.json({ error: "Provider run not found" }, 404)
  }

  return c.json({
    url: providerRun.opencodeUrl,
    port: OPENCODE_PORT,
    sessionId: providerRun.sessionId,
    sandboxId: providerRun.sandboxId,
    status: providerRun.status,
  })
})

// Stop a run and destroy sandboxes
app.post("/api/run/:id/stop", async (c) => {
  const runId = c.req.param("id")
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  // Destroy all sandboxes
  const destroyPromises = Array.from(run.providerRuns.values()).map(async (pr) => {
    try {
      await runEffect(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          yield* driver.destroy(pr.sandboxId)
        }),
        pr.provider,
      )
      return { provider: pr.provider, success: true }
    } catch (error) {
      return { provider: pr.provider, success: false, error: error instanceof Error ? error.message : "Unknown error" }
    }
  })

  const results = await Promise.all(destroyPromises)
  run.status = "completed"
  run.completedAt = Date.now()

  // Emit completion event
  run.providers.forEach((provider) => {
    emitEvent(runId, {
      id: `${runId}_${provider}_stopped`,
      type: "status",
      timestamp: Date.now(),
      data: { message: "Run stopped" },
      provider,
    })
  })

  return c.json({ success: true, results })
})

// File tree interface
interface FileTreeNode {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileTreeNode[]
}

// List files in sandbox (recursive tree)
app.post("/api/run/:id/files", async (c) => {
  const runId = c.req.param("id")
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  try {
    const body = await c.req.json()
    const { provider, path: rootPath } = body as { provider?: Provider; path?: string }

    // Use first provider if not specified
    const targetProvider = provider || run.providers[0]
    const providerRun = run.providerRuns.get(targetProvider)

    if (!providerRun) {
      return c.json({ error: "Provider run not found" }, 404)
    }

    const basePath = rootPath || providerRun.workDir

    // Recursively build file tree
    const buildTree = async (dirPath: string, depth: number = 0): Promise<FileTreeNode[]> => {
      if (depth > 5) return [] // Max depth to prevent infinite recursion

      const entries = await runEffect(
        Effect.gen(function* () {
          const driver = yield* SandboxDriver
          return yield* driver.listDir(providerRun.sandboxId, dirPath)
        }),
        targetProvider,
      )

      const nodes: FileTreeNode[] = []

      // Extract name from path for each entry (FsEntry only has path, not name)
      const entriesWithName = entries
        .filter((e) => e && e.path)
        .map((e) => ({
          ...e,
          name: e.path.split("/").pop() || e.path,
          type: e.type === "dir" ? "directory" : e.type,
        }))

      // Sort: directories first, then files, alphabetically
      const sortedEntries = entriesWithName.sort((a, b) => {
        if (a.type === "directory" && b.type !== "directory") return -1
        if (a.type !== "directory" && b.type === "directory") return 1
        return a.name.localeCompare(b.name)
      })

      for (const entry of sortedEntries) {
        // Skip hidden files and common non-essential directories
        if (entry.name.startsWith(".") && !entry.name.startsWith(".env")) continue
        if (entry.name === "node_modules" || entry.name === "__pycache__" || entry.name === ".git") continue

        const fullPath = entry.path.startsWith("/") ? entry.path : `${dirPath}/${entry.name}`
        const node: FileTreeNode = {
          name: entry.name,
          path: fullPath,
          type: entry.type === "directory" ? "directory" : "file",
        }

        if (entry.type === "directory") {
          try {
            node.children = await buildTree(fullPath, depth + 1)
          } catch {
            node.children = []
          }
        }

        nodes.push(node)
      }

      return nodes
    }

    const tree = await buildTree(basePath)

    return c.json({ tree, basePath })
  } catch (err) {
    console.error("List files error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Failed to list files" }, 500)
  }
})

// Read file content from sandbox
app.post("/api/run/:id/file", async (c) => {
  const runId = c.req.param("id")
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  try {
    const body = await c.req.json()
    const { provider, path: filePath } = body as { provider?: Provider; path: string }

    if (!filePath) {
      return c.json({ error: "Path is required" }, 400)
    }

    // Use first provider if not specified
    const targetProvider = provider || run.providers[0]
    const providerRun = run.providerRuns.get(targetProvider)

    if (!providerRun) {
      return c.json({ error: "Provider run not found" }, 404)
    }

    const content = await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.readFile(providerRun.sandboxId, filePath, { encoding: "utf-8" })
      }),
      targetProvider,
    )

    return c.json({ content: content.toString(), path: filePath })
  } catch (err) {
    console.error("Read file error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Failed to read file" }, 500)
  }
})

// ============================================
// OpenCode Server Proxy Routes
// These proxy requests to the opencode server running inside the sandbox
// ============================================

// Get all sessions from opencode server
app.get("/api/run/:id/:provider/opencode/session", async (c) => {
  const runId = c.req.param("id")
  const provider = c.req.param("provider") as Provider
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  const providerRun = run.providerRuns.get(provider)
  if (!providerRun?.opencodeUrl) {
    return c.json({ error: "OpenCode URL not available" }, 404)
  }

  try {
    // Include directory filter and get root sessions only
    const params = new URLSearchParams()
    if (providerRun.workDir) {
      params.set("directory", providerRun.workDir)
    }
    params.set("roots", "true")
    const url = `${providerRun.opencodeUrl}/session?${params.toString()}`
    const response = await fetch(url)
    const data = await response.json()
    return c.json(data)
  } catch (err) {
    console.error("OpenCode proxy error:", err)
    return c.json({ error: "Failed to fetch sessions" }, 500)
  }
})

// Get single session
app.get("/api/run/:id/:provider/opencode/session/:sessionId", async (c) => {
  const runId = c.req.param("id")
  const provider = c.req.param("provider") as Provider
  const sessionId = c.req.param("sessionId")
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  const providerRun = run.providerRuns.get(provider)
  if (!providerRun?.opencodeUrl) {
    return c.json({ error: "OpenCode URL not available" }, 404)
  }

  try {
    const response = await fetch(`${providerRun.opencodeUrl}/session/${sessionId}`)
    const data = await response.json()
    return c.json(data)
  } catch (err) {
    console.error("OpenCode proxy error:", err)
    return c.json({ error: "Failed to fetch session" }, 500)
  }
})

// Get session messages
app.get("/api/run/:id/:provider/opencode/session/:sessionId/message", async (c) => {
  const runId = c.req.param("id")
  const provider = c.req.param("provider") as Provider
  const sessionId = c.req.param("sessionId")
  const limit = c.req.query("limit") || "50"
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  const providerRun = run.providerRuns.get(provider)
  if (!providerRun?.opencodeUrl) {
    return c.json({ error: "OpenCode URL not available" }, 404)
  }

  try {
    const url = `${providerRun.opencodeUrl}/session/${sessionId}/message?limit=${limit}`
    const response = await fetch(url)
    const data = await response.json()
    return c.json(data)
  } catch (err) {
    console.error("OpenCode proxy error:", err)
    return c.json({ error: "Failed to fetch messages" }, 500)
  }
})

// Get session children (for agent hierarchy)
app.get("/api/run/:id/:provider/opencode/session/:sessionId/children", async (c) => {
  const runId = c.req.param("id")
  const provider = c.req.param("provider") as Provider
  const sessionId = c.req.param("sessionId")
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  const providerRun = run.providerRuns.get(provider)
  if (!providerRun?.opencodeUrl) {
    return c.json({ error: "OpenCode URL not available" }, 404)
  }

  try {
    const response = await fetch(`${providerRun.opencodeUrl}/session/${sessionId}/children`)
    const data = await response.json()
    return c.json(data)
  } catch (err) {
    console.error("OpenCode proxy error:", err)
    return c.json({ error: "Failed to fetch children" }, 500)
  }
})

// SSE proxy for opencode events
app.get("/api/run/:id/:provider/opencode/event", async (c) => {
  const runId = c.req.param("id")
  const provider = c.req.param("provider") as Provider
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  const providerRun = run.providerRuns.get(provider)
  if (!providerRun?.opencodeUrl) {
    return c.json({ error: "OpenCode URL not available" }, 404)
  }

  try {
    // Use /event endpoint with optional directory filter
    const eventUrl = providerRun.workDir 
      ? `${providerRun.opencodeUrl}/event?directory=${encodeURIComponent(providerRun.workDir)}`
      : `${providerRun.opencodeUrl}/event`
    const response = await fetch(eventUrl, {
      headers: {
        Accept: "text/event-stream",
      },
    })

    if (!response.ok || !response.body) {
      return c.json({ error: "Failed to connect to opencode event stream" }, 500)
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    console.error("OpenCode proxy error:", err)
    return c.json({ error: "Failed to connect to opencode" }, 500)
  }
})

// Health check for opencode server
app.get("/api/run/:id/:provider/opencode/health", async (c) => {
  const runId = c.req.param("id")
  const provider = c.req.param("provider") as Provider
  const run = runs.get(runId)

  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  const providerRun = run.providerRuns.get(provider)
  if (!providerRun?.opencodeUrl) {
    return c.json({ healthy: false, error: "OpenCode URL not available" })
  }

  try {
    const response = await fetch(`${providerRun.opencodeUrl}/global/health`, {
      signal: AbortSignal.timeout(5000),
    })
    return c.json({ healthy: response.ok, url: providerRun.opencodeUrl })
  } catch {
    return c.json({ healthy: false, url: providerRun.opencodeUrl })
  }
})

// ============================================

// Use port 0 to let the OS assign a random available port, or use PORT env var
const requestedPort = parseInt(process.env.PORT || "0")

// Start server and get the actual port
const server = Bun.serve({
  port: requestedPort,
  fetch: app.fetch,
  idleTimeout: 0, // Disable idle timeout for SSE streams
})

const actualPort = server.port

// Write port to file so Vite can read it
const portFilePath = new URL("../.server-port", import.meta.url).pathname
await Bun.write(portFilePath, String(actualPort))

console.log(`🚀 Ralph Runner API running on http://localhost:${actualPort}`)
console.log(`   Port file: ${portFilePath}`)
console.log(`   Providers:`)
console.log(
  `     Modal ${process.env.MODAL_TOKEN_ID ? "✓" : "✗"} | Daytona ${process.env.DAYTONA_API_KEY ? "✓" : "✗"} | E2B ${process.env.E2B_API_KEY ? "✓" : "✗"} | Docker ✓`,
)
console.log(
  `     Blaxel ${process.env.BLAXEL_API_KEY ? "✓" : "✗"} | Cloudflare ${process.env.CLOUDFLARE_API_TOKEN ? "✓" : "✗"} | Vercel ${process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_ACCESS_TOKEN ? "✓" : "✗"}`,
)
