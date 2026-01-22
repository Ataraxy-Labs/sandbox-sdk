import { Context, Layer } from "effect"

export interface DockerConfig {
  /** Host to advertise for port URLs (default: 127.0.0.1) */
  advertiseHost?: string
  /** Default timeout in ms */
  timeoutMs?: number
  /** Default ports to expose */
  defaultPorts?: number[]
  /** Docker network to use (optional) */
  network?: string
}

export class DockerConfigTag extends Context.Tag("DockerConfig")<DockerConfigTag, DockerConfig>() {}

export const DockerConfigLive = (config: DockerConfig) =>
  Layer.succeed(DockerConfigTag, {
    advertiseHost: config.advertiseHost ?? "127.0.0.1",
    timeoutMs: config.timeoutMs ?? 300000,
    defaultPorts: config.defaultPorts ?? [],
    network: config.network,
  })
