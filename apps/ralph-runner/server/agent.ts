import { Effect } from "effect"
import { generateText, tool } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { SandboxDriver } from "@opencode-ai/sandbox-sdk"

// Types for agent events
export type AgentEventType = "status" | "thought" | "tool_call" | "tool_result" | "output" | "error" | "complete"

export interface AgentEvent {
  id: string
  type: AgentEventType
  timestamp: number
  data: unknown
  provider?: string
}

interface AgentConfig {
  maxIterations: number
  doomLoopThreshold: number
}

interface AgentInput {
  sandboxId: string
  workDir: string
  task: string
  provider: string
  runId: string
  emitEvent: (event: AgentEvent) => void
  config?: Partial<AgentConfig>
}

// Default agent configuration
const defaultConfig: AgentConfig = {
  maxIterations: 50,
  doomLoopThreshold: 3,
}

// Tool call history for doom loop detection
interface ToolCallEntry {
  name: string
  args: string
}

// System prompt for the agent
const systemPrompt = `You are an autonomous coding agent working in a sandbox environment. Your task is to complete the user's request by reading, writing, and executing code.

Available tools:
- run_command: Execute shell commands in the sandbox
- read_file: Read the contents of a file
- write_file: Write content to a file
- list_dir: List files and directories
- search_files: Search for files matching a pattern using grep

Guidelines:
1. Always explore the codebase first to understand its structure
2. Read relevant files before making changes
3. Make incremental changes and verify they work
4. If you encounter errors, diagnose and fix them
5. When you've completed the task, explain what you did

When you're done with the task, respond with a summary of what was accomplished.`

// Create LLM provider based on environment
function createLLMProvider() {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (anthropicApiKey) {
    const anthropic = createAnthropic({ apiKey: anthropicApiKey })
    return {
      model: anthropic("claude-sonnet-4-20250514"),
      provider: "anthropic",
    }
  }

  if (openaiApiKey) {
    const openai = createOpenAI({ apiKey: openaiApiKey })
    return {
      model: openai("gpt-4o"),
      provider: "openai",
    }
  }

  throw new Error("No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY")
}

// Create sandbox tools that execute via the driver
function createSandboxTools(
  sandboxId: string,
  workDir: string,
  runEffect: <A, E>(effect: Effect.Effect<A, E, SandboxDriver>) => Promise<A>,
) {
  return {
    run_command: tool({
      description: "Execute a shell command in the sandbox. Use this to run build commands, tests, linters, etc.",
      inputSchema: z.object({
        command: z.string().describe("The command to run (e.g., 'npm test', 'ls -la')"),
        cwd: z.string().nullable().describe("Working directory (defaults to repo root)"),
      }),
      execute: async ({ command, cwd }) => {
        const result = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            return yield* driver.run(sandboxId, {
              cmd: "sh",
              args: ["-c", command],
              cwd: cwd ?? workDir,
              timeoutMs: 300000,
            })
          }),
        )
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        }
      },
    }),

    read_file: tool({
      description: "Read the contents of a file from the sandbox filesystem.",
      inputSchema: z.object({
        path: z.string().describe("Path to the file (relative to repo root or absolute)"),
      }),
      execute: async ({ path: filePath }) => {
        const fullPath = filePath.startsWith("/") ? filePath : `${workDir}/${filePath}`
        const content = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            return yield* driver.readFile(sandboxId, fullPath, { encoding: "utf-8" })
          }),
        )
        return { content: content.toString() }
      },
    }),

    write_file: tool({
      description: "Write content to a file in the sandbox filesystem. Creates parent directories if needed.",
      inputSchema: z.object({
        path: z.string().describe("Path to the file (relative to repo root or absolute)"),
        content: z.string().describe("Content to write to the file"),
      }),
      execute: async ({ path: filePath, content }) => {
        const fullPath = filePath.startsWith("/") ? filePath : `${workDir}/${filePath}`
        await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            // Create parent directory if needed
            const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
            if (dir) {
              yield* driver.run(sandboxId, {
                cmd: "mkdir",
                args: ["-p", dir],
                timeoutMs: 10000,
              })
            }
            yield* driver.writeFile(sandboxId, fullPath, content)
          }),
        )
        return { success: true, path: fullPath }
      },
    }),

    list_dir: tool({
      description: "List files and directories in a path.",
      inputSchema: z.object({
        path: z.string().describe("Path to list (relative to repo root or absolute)"),
      }),
      execute: async ({ path: dirPath }) => {
        const fullPath = dirPath.startsWith("/") ? dirPath : `${workDir}/${dirPath}`
        const entries = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            return yield* driver.listDir(sandboxId, fullPath)
          }),
        )
        return {
          entries: entries.map((e) => ({
            name: e.path.split("/").pop() || e.path,
            type: e.type === "dir" ? "directory" : e.type,
            size: e.size,
          })),
        }
      },
    }),

    search_files: tool({
      description:
        "Search for files containing a pattern using grep. Returns matching lines with file paths and line numbers.",
      inputSchema: z.object({
        pattern: z.string().describe("The pattern to search for (supports regex)"),
        path: z.string().nullable().describe("Directory to search in (defaults to repo root)"),
        filePattern: z.string().nullable().describe("File pattern to match (e.g., '*.ts', '*.py')"),
      }),
      execute: async ({ pattern, path: searchPath, filePattern }) => {
        const fullPath = searchPath?.startsWith("/") ? searchPath : `${workDir}/${searchPath || ""}`
        const result = await runEffect(
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            const args = ["-rn", "--color=never"]
            if (filePattern) {
              args.push("--include", filePattern)
            }
            args.push(pattern, fullPath)
            return yield* driver.run(sandboxId, {
              cmd: "grep",
              args,
              cwd: workDir,
              timeoutMs: 60000,
            })
          }),
        )
        return {
          matches: result.stdout,
          exitCode: result.exitCode,
        }
      },
    }),
  }
}

// Check for doom loop (same tool call repeated consecutively)
function checkDoomLoop(history: ToolCallEntry[], threshold: number): boolean {
  if (history.length < threshold) return false

  const recent = history.slice(-threshold)
  const first = recent[0]
  return recent.every((entry) => entry.name === first.name && entry.args === first.args)
}

// Main agent loop
export async function runAgentLoop(
  input: AgentInput,
  runEffect: <A, E>(effect: Effect.Effect<A, E, SandboxDriver>) => Promise<A>,
): Promise<{ success: boolean; summary: string; iterations: number }> {
  const config = { ...defaultConfig, ...input.config }
  const { sandboxId, workDir, task, provider, runId, emitEvent } = input

  console.log(`[${runId}][${provider}] Agent loop starting, creating tools...`)
  const tools = createSandboxTools(sandboxId, workDir, runEffect)
  
  console.log(`[${runId}][${provider}] Creating LLM provider...`)
  const llm = createLLMProvider()
  console.log(`[${runId}][${provider}] Using LLM provider: ${llm.provider}`)

  const toolCallHistory: ToolCallEntry[] = []
  let iteration = 0
  let completed = false
  let summary = ""

  // Emit initial status
  emitEvent({
    id: `${runId}_${provider}_agent_start`,
    type: "status",
    timestamp: Date.now(),
    data: { message: "Agent loop started", maxIterations: config.maxIterations },
    provider,
  })

  const messages: { role: "user" | "assistant"; content: string }[] = [
    {
      role: "user",
      content: `Task: ${task}\n\nYou are working in a sandbox at ${workDir}. Start by exploring the codebase structure.`,
    },
  ]

  while (iteration < config.maxIterations && !completed) {
    iteration++
    console.log(`[${runId}][${provider}] Starting iteration ${iteration}/${config.maxIterations}`)

    emitEvent({
      id: `${runId}_${provider}_iteration_${iteration}`,
      type: "status",
      timestamp: Date.now(),
      data: { message: `Iteration ${iteration}/${config.maxIterations}`, iteration },
      provider,
    })

    try {
      console.log(`[${runId}][${provider}] Calling generateText...`)
      const result = await generateText({
        model: llm.model,
        system: systemPrompt,
        messages,
        tools,
        maxSteps: 10,
        onStepStart: ({ toolCalls }) => {
          if (toolCalls && toolCalls.length > 0) {
            for (const call of toolCalls) {
              // Log tool call
              emitEvent({
                id: `${runId}_${provider}_tool_call_${Date.now()}`,
                type: "tool_call",
                timestamp: Date.now(),
                data: {
                  name: call.toolName,
                  arguments: call.args,
                },
                provider,
              })

              // Add to history for doom loop detection
              toolCallHistory.push({
                name: call.toolName,
                args: JSON.stringify(call.args),
              })
            }
          }
        },
        onStepFinish: ({ toolResults, text }) => {
          // Log tool results
          if (toolResults && toolResults.length > 0) {
            for (const result of toolResults) {
              emitEvent({
                id: `${runId}_${provider}_tool_result_${Date.now()}`,
                type: "tool_result",
                timestamp: Date.now(),
                data: {
                  name: result.toolName,
                  result: result.result,
                },
                provider,
              })
            }
          }

          // Log thoughts/text
          if (text) {
            emitEvent({
              id: `${runId}_${provider}_thought_${Date.now()}`,
              type: "thought",
              timestamp: Date.now(),
              data: { text },
              provider,
            })
          }
        },
      })

      console.log(`[${runId}][${provider}] generateText completed, text length: ${result.text?.length || 0}`)

      // Check for doom loop
      if (checkDoomLoop(toolCallHistory, config.doomLoopThreshold)) {
        emitEvent({
          id: `${runId}_${provider}_doom_loop`,
          type: "error",
          timestamp: Date.now(),
          data: {
            message: `Doom loop detected: same tool call repeated ${config.doomLoopThreshold} times`,
            lastCall: toolCallHistory[toolCallHistory.length - 1],
          },
          provider,
        })
        return {
          success: false,
          summary: "Agent stopped due to doom loop detection",
          iterations: iteration,
        }
      }

      // Check if agent completed (no more tool calls, final text response)
      const hasToolCalls = result.response.messages.some(
        (m) => Array.isArray(m.content) && m.content.some((c: { type: string }) => c.type === "tool-call"),
      )

      if (!hasToolCalls && result.text) {
        // Agent completed
        completed = true
        summary = result.text

        emitEvent({
          id: `${runId}_${provider}_complete`,
          type: "complete",
          timestamp: Date.now(),
          data: { summary, iterations: iteration },
          provider,
        })
      } else {
        // Add assistant response to messages for next iteration
        messages.push({
          role: "assistant",
          content: result.text || "Continuing...",
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error(`[${runId}][${provider}] Iteration ${iteration} error:`, error)
      emitEvent({
        id: `${runId}_${provider}_error_${Date.now()}`,
        type: "error",
        timestamp: Date.now(),
        data: { message: errorMessage, error },
        provider,
      })

      return {
        success: false,
        summary: `Agent failed with error: ${errorMessage}`,
        iterations: iteration,
      }
    }
  }

  if (!completed) {
    emitEvent({
      id: `${runId}_${provider}_max_iterations`,
      type: "status",
      timestamp: Date.now(),
      data: { message: `Max iterations (${config.maxIterations}) reached` },
      provider,
    })
    return {
      success: false,
      summary: `Agent stopped after reaching max iterations (${config.maxIterations})`,
      iterations: iteration,
    }
  }

  return {
    success: true,
    summary,
    iterations: iteration,
  }
}
