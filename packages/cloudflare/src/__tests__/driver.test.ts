import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { CloudflareDriverLive, CloudflareConfigLive } from "../index"
import { SandboxDriver } from "@ataraxy-labs/sandbox-sdk"

describe("Cloudflare Driver", () => {
  const testConfig = {
    apiToken: process.env.CLOUDFLARE_API_TOKEN ?? "test-token",
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "test-account",
    timeoutMs: 60000,
  }
  const testLayer = CloudflareDriverLive.pipe(Layer.provide(CloudflareConfigLive(testConfig)))

  it("should create driver (ephemeral, no pause/resume)", async () => {
    const program = Effect.gen(function* () {
      const driver = yield* SandboxDriver
      expect(driver).toBeDefined()
      expect(driver.pause).toBeUndefined()
      expect(driver.resume).toBeUndefined()
    })
    await Effect.runPromise(Effect.provide(program, testLayer))
  })

  const itLive = process.env.CLOUDFLARE_API_TOKEN ? it : it.skip
  itLive(
    "should create and destroy sandbox",
    async () => {
      const program = Effect.gen(function* () {
        const driver = yield* SandboxDriver
        const info = yield* driver.create({ image: "nodejs" })
        expect(info.provider).toBe("cloudflare")
        yield* driver.destroy(info.id)
      })
      await Effect.runPromise(Effect.provide(program, testLayer))
    },
    30000,
  )
})
