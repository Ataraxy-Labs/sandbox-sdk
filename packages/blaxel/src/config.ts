import { Config, Context, Effect, Layer } from "effect"

export interface BlaxelConfig {
  apiKey: string
  workspace: string
  baseUrl?: string
  timeoutMs?: number
}

export class BlaxelConfigTag extends Context.Tag("BlaxelConfig")<BlaxelConfigTag, BlaxelConfig>() {}

export const BlaxelConfigFromEnv = Layer.effect(
  BlaxelConfigTag,
  Effect.gen(function* () {
    const apiKey = yield* Config.string("BLAXEL_API_KEY")
    const workspace = yield* Config.string("BLAXEL_WORKSPACE")
    const baseUrl = yield* Config.string("BLAXEL_BASE_URL").pipe(Config.withDefault("https://api.blaxel.ai/v0"))
    const timeoutMs = yield* Config.number("BLAXEL_TIMEOUT_MS").pipe(Config.withDefault(300000))
    return { apiKey, workspace, baseUrl, timeoutMs }
  }),
)

export const BlaxelConfigLive = (config: BlaxelConfig) => Layer.succeed(BlaxelConfigTag, config)
