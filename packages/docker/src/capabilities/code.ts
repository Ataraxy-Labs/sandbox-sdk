import { Effect, Layer } from "effect"
import {
  SandboxCode,
  type SandboxCodeService,
  type RunCodeInput,
  type RunCodeResult,
} from "@ataraxy-labs/sandbox-sdk"
import { exec, mapError } from "./shared"

export const DockerCodeLive = Layer.effect(
  SandboxCode,
  Effect.gen(function* () {
    const code: SandboxCodeService = {
      runCode: (id: string, input: RunCodeInput) =>
        Effect.tryPromise({
          try: async () => {
            const lang = input.language.toLowerCase()
            let command: string[]
            const b64 = Buffer.from(input.code).toString("base64")

            switch (lang) {
              case "python":
              case "py":
                command = [
                  "python3",
                  "-u",
                  "-c",
                  `exec(__import__('base64').b64decode('${b64}').decode())`,
                ]
                break
              case "javascript":
              case "js":
                command = ["node", "-e", `eval(Buffer.from('${b64}','base64').toString())`]
                break
              case "typescript":
              case "ts":
                command = [
                  "sh",
                  "-c",
                  `echo '${b64}' | base64 -d > /tmp/code.ts && npx tsx /tmp/code.ts`,
                ]
                break
              case "bash":
              case "sh":
                command = ["sh", "-c", `echo '${b64}' | base64 -d | sh`]
                break
              default:
                throw new Error(`Unsupported language: ${input.language}`)
            }

            const result = await exec("docker", ["exec", id, ...command])
            return {
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            } satisfies RunCodeResult
          },
          catch: (err) => mapError(err, id),
        }),
    }

    return code
  }),
)
