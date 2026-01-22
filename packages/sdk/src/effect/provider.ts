import { Context, Effect } from "effect"
import type { SandboxError } from "../errors"
import type { CreateOptions, SandboxInfo } from "../types"

export interface SandboxProviderService {
  create(options: CreateOptions): Effect.Effect<SandboxInfo, SandboxError>
  list(): Effect.Effect<SandboxInfo[], SandboxError>
  get(id: string): Effect.Effect<SandboxInfo, SandboxError>
  delete(id: string): Effect.Effect<void, SandboxError>
}

export class SandboxProvider extends Context.Tag("SandboxProvider")<SandboxProvider, SandboxProviderService>() {}
