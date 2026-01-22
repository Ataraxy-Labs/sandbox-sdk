import { Config, Context, Effect, Layer } from "effect"

export interface VercelConfig {
  oidcToken?: string
  accessToken?: string
  teamId?: string
  projectId?: string
  timeoutMs?: number
}

export class VercelConfigTag extends Context.Tag("VercelConfig")<VercelConfigTag, VercelConfig>() {}

export const VercelConfigFromEnv = Layer.effect(
  VercelConfigTag,
  Effect.gen(function* () {
    const oidcToken = yield* Config.string("VERCEL_OIDC_TOKEN").pipe(Config.option)
    const accessToken = yield* Config.string("VERCEL_ACCESS_TOKEN").pipe(Config.option)
    const teamId = yield* Config.string("VERCEL_TEAM_ID").pipe(Config.option)
    const projectId = yield* Config.string("VERCEL_PROJECT_ID").pipe(Config.option)
    const timeoutMs = yield* Config.number("VERCEL_SANDBOX_TIMEOUT_MS").pipe(Config.withDefault(600000))

    return {
      oidcToken: oidcToken._tag === "Some" ? oidcToken.value : undefined,
      accessToken: accessToken._tag === "Some" ? accessToken.value : undefined,
      teamId: teamId._tag === "Some" ? teamId.value : undefined,
      projectId: projectId._tag === "Some" ? projectId.value : undefined,
      timeoutMs,
    }
  }),
)

export const VercelConfigLive = (config: VercelConfig) => Layer.succeed(VercelConfigTag, config)
