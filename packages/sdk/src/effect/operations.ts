import { Effect } from "effect"
import { SandboxProvider } from "./provider"
import type { CreateOptions, SandboxInfo } from "../types"
import type { SandboxError } from "../errors"

export const create = (options: CreateOptions): Effect.Effect<SandboxInfo, SandboxError, SandboxProvider> =>
  Effect.gen(function* () {
    const provider = yield* SandboxProvider
    return yield* provider.create(options)
  })

export const list = (): Effect.Effect<SandboxInfo[], SandboxError, SandboxProvider> =>
  Effect.gen(function* () {
    const provider = yield* SandboxProvider
    return yield* provider.list()
  })

export const get = (id: string): Effect.Effect<SandboxInfo, SandboxError, SandboxProvider> =>
  Effect.gen(function* () {
    const provider = yield* SandboxProvider
    return yield* provider.get(id)
  })

export const remove = (id: string): Effect.Effect<void, SandboxError, SandboxProvider> =>
  Effect.gen(function* () {
    const provider = yield* SandboxProvider
    return yield* provider.delete(id)
  })
