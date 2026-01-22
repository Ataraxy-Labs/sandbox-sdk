import { Context } from "effect"
import {
  mapErrorWithContext,
  ErrorPatterns,
  type SandboxError,
  type SandboxErrorContext,
} from "@ataraxy-labs/sandbox-sdk"

export const exec = async (
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

/**
 * Docker-specific error patterns extending the base patterns.
 */
export const dockerErrorPatterns = {
  ...ErrorPatterns,
  notFound: [...ErrorPatterns.notFound, "no such container"],
}

/**
 * Create an error context for Docker operations.
 */
export const dockerContext = (
  operation: string,
  sandboxId?: string,
  capability?: string,
): SandboxErrorContext => ({
  provider: "docker",
  capability,
  operation,
  sandboxId,
})

/**
 * Map an error to a SandboxError with Docker context.
 * @deprecated Use mapErrorWithContext directly with dockerContext for better context
 */
export const mapError = (err: unknown, id?: string): SandboxError =>
  mapErrorWithContext(err, {
    id,
    patterns: dockerErrorPatterns,
    context: { provider: "docker", sandboxId: id },
  })

export interface ContainerInfo {
  id: string
  name?: string
  ports: Record<number, number>
}

export interface DockerState {
  containerCache: Map<string, ContainerInfo>
  advertiseHost: string
}

export class DockerStateTag extends Context.Tag("DockerState")<DockerStateTag, DockerState>() {}
