import { Config, Context, Effect, Layer } from "effect"

export interface DaytonaConfig {
  apiKey: string
  baseUrl?: string
  organizationId?: string
  timeoutMs?: number
}

export class DaytonaConfigTag extends Context.Tag("DaytonaConfig")<DaytonaConfigTag, DaytonaConfig>() {}

export const DaytonaConfigFromEnv = Layer.effect(
  DaytonaConfigTag,
  Effect.gen(function* () {
    const apiKey = yield* Config.string("DAYTONA_API_KEY")
    const baseUrl = yield* Config.string("DAYTONA_BASE_URL").pipe(Config.withDefault("https://app.daytona.io/api"))
    const organizationId = yield* Config.string("DAYTONA_ORG_ID").pipe(Config.option)
    const timeoutMs = yield* Config.number("DAYTONA_TIMEOUT_MS").pipe(Config.withDefault(300000))
    return {
      apiKey,
      baseUrl,
      organizationId: organizationId._tag === "Some" ? organizationId.value : undefined,
      timeoutMs,
    }
  }),
)

export const DaytonaConfigLive = (config: DaytonaConfig) => Layer.succeed(DaytonaConfigTag, config)
