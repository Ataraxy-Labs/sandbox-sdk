import { Effect, Layer } from "effect"
import {
  SandboxFs,
  type SandboxFsService,
  type FsEntry,
  type ReadFileOptions,
  type WriteFileOptions,
  type ListOptions,
  type RmOptions,
} from "@ataraxy-labs/sandbox-sdk"
import { exec, mapError } from "./shared"

export const DockerFsLive = Layer.effect(
  SandboxFs,
  Effect.gen(function* () {
    const fs: SandboxFsService = {
      readFile: (id: string, path: string, opts?: ReadFileOptions) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["exec", id, "cat", path])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to read file: ${result.stderr}`)
            }
            return opts?.encoding === "utf8"
              ? result.stdout
              : new TextEncoder().encode(result.stdout)
          },
          catch: (err) => mapError(err, id),
        }),

      writeFile: (
        id: string,
        path: string,
        content: Uint8Array | string,
        _opts?: WriteFileOptions,
      ) =>
        Effect.tryPromise({
          try: async () => {
            const text = typeof content === "string" ? content : new TextDecoder().decode(content)
            const b64 = Buffer.from(text).toString("base64")
            const result = await exec("docker", [
              "exec",
              id,
              "sh",
              "-c",
              `echo '${b64}' | base64 -d > '${path}'`,
            ])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to write file: ${result.stderr}`)
            }
          },
          catch: (err) => mapError(err, id),
        }),

      listDir: (id: string, path: string, _opts?: ListOptions) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["exec", id, "ls", "-la", path])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to list directory: ${result.stderr}`)
            }

            const lines = result.stdout.split("\n").filter((l) => l.trim())
            return lines.slice(1).map((line): FsEntry => {
              const parts = line.split(/\s+/)
              const name = parts[parts.length - 1] ?? ""
              const isDir = line.startsWith("d")
              const sizeStr = parts[4]
              return {
                path: `${path}/${name}`.replace("//", "/"),
                type: isDir ? "dir" : "file",
                size: sizeStr ? parseInt(sizeStr) || undefined : undefined,
              }
            })
          },
          catch: (err) => mapError(err, id),
        }),

      mkdir: (id: string, path: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await exec("docker", ["exec", id, "mkdir", "-p", path])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to mkdir: ${result.stderr}`)
            }
          },
          catch: (err) => mapError(err, id),
        }),

      rm: (id: string, path: string, opts?: RmOptions) =>
        Effect.tryPromise({
          try: async () => {
            const flags: string[] = []
            if (opts?.recursive) flags.push("-r")
            if (opts?.force) flags.push("-f")

            const result = await exec("docker", ["exec", id, "rm", ...flags, path])
            if (result.exitCode !== 0) {
              throw new Error(`Failed to rm: ${result.stderr}`)
            }
          },
          catch: (err) => mapError(err, id),
        }),

      watch: undefined,
    }

    return fs
  }),
)
