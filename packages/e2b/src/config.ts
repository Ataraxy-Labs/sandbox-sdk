import { Config, Context, Effect, Layer } from "effect"

export interface E2BConfig {
  apiKey: string
  template?: string
  timeoutMs?: number
}

export class E2BConfigTag extends Context.Tag("E2BConfig")<E2BConfigTag, E2BConfig>() {}

export const E2BConfigFromEnv = Layer.effect(
  E2BConfigTag,
  Effect.gen(function* () {
    const apiKey = yield* Config.string("E2B_API_KEY")
    const template = yield* Config.string("E2B_TEMPLATE").pipe(Config.withDefault("base"))
    const timeoutMs = yield* Config.number("E2B_TIMEOUT_MS").pipe(Config.withDefault(300000))
    return { apiKey, template, timeoutMs }
  }),
)

export const E2BConfigLive = (config: E2BConfig) => Layer.succeed(E2BConfigTag, config)
