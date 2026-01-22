import { Effect } from "effect"
import { create, get, list, remove } from "./effect/operations"
import { SandboxProvider, type SandboxProviderService } from "./effect/provider"
import type { CreateOptions, SandboxInfo } from "./types"
import type { SandboxError } from "./errors"

export interface SandboxClient {
  create(options: CreateOptions): Promise<SandboxInfo>
  list(): Promise<SandboxInfo[]>
  get(id: string): Promise<SandboxInfo>
  delete(id: string): Promise<void>
}

export function createSandboxClient(provider: SandboxProviderService): SandboxClient {
  const run = <A>(effect: Effect.Effect<A, SandboxError, SandboxProvider>): Promise<A> =>
    Effect.runPromise(effect.pipe(Effect.provideService(SandboxProvider, provider)))

  return {
    create: (options) => run(create(options)),
    list: () => run(list()),
    get: (id) => run(get(id)),
    delete: (id) => run(remove(id)),
  }
}
