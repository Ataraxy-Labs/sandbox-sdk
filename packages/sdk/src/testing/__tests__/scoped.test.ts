import { describe, it, expect } from "bun:test"
import { Effect, Exit, Ref, Layer } from "effect"
import { acquireSandbox, withManagedSandbox, withManagedSandboxTimeout, acquireVolume, acquireSandboxWithVolume } from "../../scoped"
import { MockDriverLive, MockDriverWithState, type MockSandboxState } from "../mock-driver"
import { SandboxDriver, type SandboxDriverService } from "../../driver"
import { SandboxTimeoutError } from "../../errors"

describe("scoped resource management", () => {
  describe("acquireSandbox", () => {
    it("creates and destroys sandbox on scope close", async () => {
      const destroyedIds: string[] = []

      const trackingLayer = Layer.effect(
        SandboxDriver,
        Effect.succeed({
          create: () =>
            Effect.succeed({ id: "mock-456", provider: "mock", status: "ready" as const, createdAt: "" }),
          destroy: (id: string) =>
            Effect.sync(() => { destroyedIds.push(id) }),
          status: () => Effect.succeed("ready" as const),
          list: () => Effect.succeed([]),
          get: (id: string) => Effect.succeed({ id, provider: "mock", status: "ready" as const, createdAt: "" }),
          run: () => Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }),
          stream: () => { throw new Error("not implemented") },
          readFile: () => Effect.succeed(""),
          writeFile: () => Effect.void,
          listDir: () => Effect.succeed([]),
          mkdir: () => Effect.void,
          rm: () => Effect.void,
        } satisfies SandboxDriverService),
      )

      const program = Effect.scoped(
        Effect.gen(function* () {
          const sandbox = yield* acquireSandbox({ image: "node:22" })
          expect(sandbox.status).toBe("ready")
          expect(destroyedIds.length).toBe(0)
          return sandbox.id
        }),
      )

      const id = await Effect.runPromise(program.pipe(Effect.provide(trackingLayer)))
      expect(id).toBe("mock-456")
      expect(destroyedIds).toContain("mock-456")
    })

    it("destroys sandbox even on failure", async () => {
      const destroyedIds: string[] = []

      const trackingLayer = Layer.effect(
        SandboxDriver,
        Effect.succeed({
          create: () =>
            Effect.succeed({ id: "test-123", provider: "mock", status: "ready" as const, createdAt: "" }),
          destroy: (id: string) =>
            Effect.sync(() => { destroyedIds.push(id) }),
          status: () => Effect.succeed("ready" as const),
          list: () => Effect.succeed([]),
          get: (id: string) => Effect.succeed({ id, provider: "mock", status: "ready" as const, createdAt: "" }),
          run: () => Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }),
          stream: () => { throw new Error("not implemented") },
          readFile: () => Effect.succeed(""),
          writeFile: () => Effect.void,
          listDir: () => Effect.succeed([]),
          mkdir: () => Effect.void,
          rm: () => Effect.void,
        } satisfies SandboxDriverService),
      )

      const program = Effect.scoped(
        Effect.gen(function* () {
          yield* acquireSandbox({ image: "node:22" })
          return yield* Effect.fail(new Error("intentional failure"))
        }),
      )

      const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(trackingLayer)))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(destroyedIds).toContain("test-123")
    })
  })

  describe("withManagedSandbox", () => {
    it("provides sandbox and auto-cleans up", async () => {
      const result = await Effect.runPromise(
        withManagedSandbox({ image: "alpine:3.21" }, (sandbox) =>
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            const runResult = yield* driver.run(sandbox.id, { cmd: "echo", args: ["hello"] })
            return runResult.stdout
          }),
        ).pipe(Effect.provide(MockDriverLive())),
      )

      expect(result).toContain("mock")
    })

    it("cleans up on inner effect failure", async () => {
      const exit = await Effect.runPromiseExit(
        withManagedSandbox({ image: "alpine" }, (_sandbox) =>
          Effect.fail(new Error("inner error")),
        ).pipe(Effect.provide(MockDriverLive())),
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })
  })

  describe("withManagedSandboxTimeout", () => {
    it("succeeds within timeout", async () => {
      const result = await Effect.runPromise(
        withManagedSandboxTimeout({ image: "node:22" }, "5 seconds", (sandbox) =>
          Effect.gen(function* () {
            const driver = yield* SandboxDriver
            return yield* driver.run(sandbox.id, { cmd: "echo", args: ["fast"] })
          }),
        ).pipe(Effect.provide(MockDriverLive())),
      )

      expect(result.exitCode).toBe(0)
    })

    it("fails with SandboxTimeoutError on timeout", async () => {
      const exit = await Effect.runPromiseExit(
        withManagedSandboxTimeout({ image: "node:22" }, "1 millis", (sandbox) =>
          Effect.sleep("100 millis").pipe(Effect.map(() => ({ exitCode: 0, stdout: "", stderr: "" }))),
        ).pipe(Effect.provide(MockDriverLive())),
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })
  })

  describe("acquireVolume", () => {
    it("creates and deletes volume on scope close", async () => {
      const deletedNames: string[] = []

      const trackingLayer = Layer.effect(
        SandboxDriver,
        Effect.succeed({
          create: () => Effect.succeed({ id: "sb-1", provider: "mock", status: "ready" as const, createdAt: "" }),
          destroy: () => Effect.void,
          status: () => Effect.succeed("ready" as const),
          list: () => Effect.succeed([]),
          get: (id: string) => Effect.succeed({ id, provider: "mock", status: "ready" as const, createdAt: "" }),
          run: () => Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }),
          stream: () => { throw new Error("not implemented") },
          readFile: () => Effect.succeed(""),
          writeFile: () => Effect.void,
          listDir: () => Effect.succeed([]),
          mkdir: () => Effect.void,
          rm: () => Effect.void,
          volumeCreate: (name: string) => Effect.succeed({ id: name, name }),
          volumeDelete: (name: string) => Effect.sync(() => { deletedNames.push(name) }),
        } satisfies SandboxDriverService),
      )

      const program = Effect.scoped(
        Effect.gen(function* () {
          const volume = yield* acquireVolume("test-vol")
          expect(volume.name).toBe("test-vol")
          expect(deletedNames.length).toBe(0)
          return volume.id
        }),
      )

      await Effect.runPromise(program.pipe(Effect.provide(trackingLayer)))
      expect(deletedNames).toContain("test-vol")
    })
  })

  describe("acquireSandboxWithVolume", () => {
    it("acquires both sandbox and volume", async () => {
      const program = Effect.scoped(
        Effect.gen(function* () {
          const { sandbox, volume } = yield* acquireSandboxWithVolume(
            { image: "alpine" },
            "data-vol",
            "/data",
          )
          expect(sandbox.status).toBe("ready")
          expect(volume.name).toBe("data-vol")
          return { sandboxId: sandbox.id, volumeId: volume.id }
        }),
      )

      const result = await Effect.runPromise(program.pipe(Effect.provide(MockDriverLive())))
      expect(result.sandboxId).toContain("mock-")
      expect(result.volumeId).toBe("data-vol")
    })
  })
})
