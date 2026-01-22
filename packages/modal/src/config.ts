import { Config, Context, Effect, Layer } from "effect"

export interface ModalConfig {
  appName?: string
  timeoutMs?: number
  idleTimeoutMs?: number
  /** Default encrypted ports to expose for tunneling (e.g., [4096] for opencode) */
  defaultEncryptedPorts?: number[]
  /** Default unencrypted ports to expose */
  defaultUnencryptedPorts?: number[]
}

export class ModalConfigTag extends Context.Tag("ModalConfig")<ModalConfigTag, ModalConfig>() {}

export const ModalConfigFromEnv = Layer.effect(
  ModalConfigTag,
  Effect.gen(function* () {
    const appName = yield* Config.string("MODAL_APP_NAME").pipe(Config.withDefault("opencode-sandbox"))
    const timeoutMs = yield* Config.number("MODAL_TIMEOUT_MS").pipe(Config.withDefault(300000))
    const idleTimeoutMs = yield* Config.number("MODAL_IDLE_TIMEOUT_MS").pipe(Config.option)
    return { appName, timeoutMs, idleTimeoutMs: idleTimeoutMs._tag === "Some" ? idleTimeoutMs.value : undefined }
  }),
)

export const ModalConfigLive = (config: ModalConfig) =>
  Layer.succeed(ModalConfigTag, {
    appName: config.appName ?? "opencode-sandbox",
    timeoutMs: config.timeoutMs ?? 300000,
    idleTimeoutMs: config.idleTimeoutMs,
    defaultEncryptedPorts: config.defaultEncryptedPorts,
    defaultUnencryptedPorts: config.defaultUnencryptedPorts,
  })
