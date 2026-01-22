import { Config, Context, Effect, Layer } from "effect"

export interface CloudflareConfig {
  apiToken: string
  accountId: string
  baseUrl?: string
  timeoutMs?: number
}

export class CloudflareConfigTag extends Context.Tag("CloudflareConfig")<CloudflareConfigTag, CloudflareConfig>() {}

export const CloudflareConfigFromEnv = Layer.effect(
  CloudflareConfigTag,
  Effect.gen(function* () {
    const apiToken = yield* Config.string("CLOUDFLARE_API_TOKEN")
    const accountId = yield* Config.string("CLOUDFLARE_ACCOUNT_ID")
    const baseUrl = yield* Config.string("CLOUDFLARE_BASE_URL").pipe(
      Config.withDefault("https://api.cloudflare.com/client/v4"),
    )
    const timeoutMs = yield* Config.number("CLOUDFLARE_TIMEOUT_MS").pipe(Config.withDefault(300000))
    return { apiToken, accountId, baseUrl, timeoutMs }
  }),
)

export const CloudflareConfigLive = (config: CloudflareConfig) => Layer.succeed(CloudflareConfigTag, config)
