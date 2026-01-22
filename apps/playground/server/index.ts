import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamText } from "hono/streaming"
import { Effect, Layer } from "effect"
import { ModalDriverLive, ModalConfigLive } from "@opencode-ai/sandbox-modal"
import { DaytonaDriverLive, DaytonaConfigLive } from "@opencode-ai/sandbox-daytona"
import { E2BDriverLive, E2BConfigLive } from "@opencode-ai/sandbox-e2b"
import { BlaxelDriverLive, BlaxelConfigLive } from "@opencode-ai/sandbox-blaxel"
import { CloudflareDriverLive, CloudflareConfigLive } from "@opencode-ai/sandbox-cloudflare"
import { VercelDriverLive, VercelConfigLive } from "@opencode-ai/sandbox-vercel"
import { SandboxDriver } from "@opencode-ai/sandbox-sdk"
import { createOpenAI } from "@ai-sdk/openai"
import { streamText as aiStreamText } from "ai"

const app = new Hono()

app.use("/*", cors())

// Modal driver layer
const modalLayer = ModalDriverLive.pipe(
  Layer.provide(
    ModalConfigLive({
      appName: "sandbox-playground",
      timeoutMs: 300000,
      idleTimeoutMs: 600000,
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
const blaxelConfig = {
  apiKey: process.env.BLAXEL_API_KEY || "",
  workspace: process.env.BLAXEL_WORKSPACE || "default",
  baseUrl: process.env.BLAXEL_BASE_URL || "https://api.blaxel.ai/v0",
  timeoutMs: 300000,
}
console.log(
  `[Blaxel Config] apiKey: ${blaxelConfig.apiKey ? `${blaxelConfig.apiKey.slice(0, 8)}...` : "NOT SET"}, workspace: "${blaxelConfig.workspace}", baseUrl: ${blaxelConfig.baseUrl}`,
)

const blaxelLayer = BlaxelDriverLive.pipe(Layer.provide(BlaxelConfigLive(blaxelConfig)))

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

type Provider = "modal" | "daytona" | "e2b" | "blaxel" | "cloudflare" | "vercel"

// Store sandbox-to-provider mapping
const sandboxProviders = new Map<string, Provider>()

// Helper to run Effect programs with the appropriate provider
const runEffect = <A, E>(effect: Effect.Effect<A, E, SandboxDriver>, provider: Provider) => {
  const layers: Record<Provider, typeof modalLayer> = {
    modal: modalLayer,
    daytona: daytonaLayer,
    e2b: e2bLayer,
    blaxel: blaxelLayer,
    cloudflare: cloudflareLayer,
    vercel: vercelLayer,
  }
  return Effect.runPromise(Effect.provide(effect, layers[provider]))
}

// Default images per provider
const defaultImages: Record<Provider, string> = {
  modal: "python:3.12-slim",
  daytona: "python:3.12-slim",
  e2b: "code-interpreter-v1",
  blaxel: "blaxel/base-image:latest",
  cloudflare: "python:3.12-slim",
  vercel: "base",
}

// Create sandbox
app.post("/api/sandbox/create", async (c) => {
  try {
    const body = await c.req.json()
    console.log("[Create Sandbox] Request body:", JSON.stringify(body))
    const provider: Provider = body.provider || "modal"

    const result = await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.create({
          image: body.image || defaultImages[provider],
          name: body.name,
          env: body.env,
        })
      }),
      provider,
    )

    // Store provider mapping
    sandboxProviders.set(result.id, provider)

    return c.json({ ...result, provider })
  } catch (err) {
    console.error("Create sandbox error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// Destroy sandbox
app.post("/api/sandbox/:id/destroy", async (c) => {
  try {
    const id = c.req.param("id")
    // Use query param if provided (from SandboxManager), otherwise fall back to stored mapping
    const provider = (c.req.query("provider") as Provider) || sandboxProviders.get(id) || "modal"

    await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        yield* driver.destroy(id)
      }),
      provider,
    )

    sandboxProviders.delete(id)
    return c.json({ success: true })
  } catch (err) {
    console.error("Destroy sandbox error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// Get sandbox status
app.get("/api/sandbox/:id/status", async (c) => {
  try {
    const id = c.req.param("id")
    const provider = sandboxProviders.get(id) || "modal"

    const status = await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.status(id)
      }),
      provider,
    )
    return c.json({ status })
  } catch (err) {
    console.error("Status error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// Run code
app.post("/api/sandbox/:id/run", async (c) => {
  try {
    const id = c.req.param("id")
    const body = await c.req.json()
    const provider = sandboxProviders.get(id) || "modal"

    const result = await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.runCode!(id, {
          language: body.language,
          code: body.code,
          timeoutMs: body.timeoutMs || 60000,
        })
      }),
      provider,
    )
    return c.json(result)
  } catch (err) {
    console.error("Run code error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// Execute command
app.post("/api/sandbox/:id/exec", async (c) => {
  try {
    const id = c.req.param("id")
    const body = await c.req.json()
    const provider = sandboxProviders.get(id) || "modal"

    const result = await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.run(id, {
          cmd: body.cmd,
          args: body.args,
          cwd: body.cwd,
          env: body.env,
          timeoutMs: body.timeoutMs || 30000,
        })
      }),
      provider,
    )
    return c.json(result)
  } catch (err) {
    console.error("Exec error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// List directory
app.get("/api/sandbox/:id/ls", async (c) => {
  try {
    const id = c.req.param("id")
    const path = c.req.query("path") || "/"
    const provider = sandboxProviders.get(id) || "modal"

    const entries = await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.listDir(id, path)
      }),
      provider,
    )
    return c.json({ entries })
  } catch (err) {
    console.error("List dir error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// Read file
app.get("/api/sandbox/:id/read", async (c) => {
  try {
    const id = c.req.param("id")
    const path = c.req.query("path")
    const provider = sandboxProviders.get(id) || "modal"

    if (!path) {
      return c.json({ error: "Path required" }, 400)
    }

    const content = await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.readFile(id, path, { encoding: "utf8" })
      }),
      provider,
    )
    return c.json({ content })
  } catch (err) {
    console.error("Read file error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// Write file
app.post("/api/sandbox/:id/write", async (c) => {
  try {
    const id = c.req.param("id")
    const body = await c.req.json()
    const provider = sandboxProviders.get(id) || "modal"

    await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        yield* driver.writeFile(id, body.path, body.content)
      }),
      provider,
    )
    return c.json({ success: true })
  } catch (err) {
    console.error("Write file error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// List sandboxes (for a specific provider)
app.get("/api/sandboxes", async (c) => {
  try {
    const provider = (c.req.query("provider") as Provider) || "modal"

    const sandboxes = await runEffect(
      Effect.gen(function* () {
        const driver = yield* SandboxDriver
        return yield* driver.list()
      }),
      provider,
    )
    return c.json({ sandboxes })
  } catch (err) {
    console.error("List sandboxes error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

// AI Assistant endpoint
app.post("/api/assistant", async (c) => {
  try {
    const body = await c.req.json()
    const { code, language, question } = body

    if (!question) {
      return c.json({ error: "Question is required" }, 400)
    }

    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const systemPrompt = `You are a helpful coding assistant. Analyze the provided code and help the user understand, debug, or improve it.

When the user provides code, analyze it carefully and provide clear, helpful responses. Format your responses using markdown when appropriate for code blocks and emphasis.

Current code context:
- Language: ${language}
- Code:
\`\`\`${language}
${code}
\`\`\``

    const result = aiStreamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    })

    return streamText(c, async (stream) => {
      for await (const chunk of (await result).textStream) {
        await stream.write(chunk)
      }
    })
  } catch (err) {
    console.error("Assistant error:", err)
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500)
  }
})

const port = parseInt(process.env.PORT || "3002")

console.log(`🚀 Sandbox Playground API running on http://localhost:${port}`)
console.log(`   Providers:`)
console.log(
  `     Modal ${process.env.MODAL_TOKEN_ID ? "✓" : "✗"} | Daytona ${process.env.DAYTONA_API_KEY ? "✓" : "✗"} | E2B ${process.env.E2B_API_KEY ? "✓" : "✗"}`,
)
console.log(
  `     Blaxel ${process.env.BLAXEL_API_KEY ? "✓" : "✗"} | Cloudflare ${process.env.CLOUDFLARE_API_TOKEN ? "✓" : "✗"} | Vercel ${process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_ACCESS_TOKEN ? "✓" : "✗"}`,
)

export default {
  port,
  fetch: app.fetch,
}
