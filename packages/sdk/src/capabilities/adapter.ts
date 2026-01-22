import { Effect, Layer, Option } from "effect"
import { SandboxDriver, type SandboxDriverService } from "../driver"
import { SandboxCapabilityError } from "../errors"
import { SandboxLifecycle, type SandboxLifecycleService } from "./lifecycle"
import { SandboxProcess, type SandboxProcessService } from "./process"
import { SandboxFs, type SandboxFsService } from "./fs"
import { SandboxSnapshots, type SandboxSnapshotsService } from "./snapshots"
import { SandboxVolumes, type SandboxVolumesService } from "./volumes"
import { SandboxCode, type SandboxCodeService } from "./code"

/**
 * Adapter layer that composes capability services into a SandboxDriver.
 *
 * This allows the legacy SandboxDriver interface to be used with the new
 * capability-based services. Providers can implement individual capabilities
 * and use this adapter to create a compatible SandboxDriver.
 *
 * Required services: SandboxLifecycle, SandboxProcess, SandboxFs
 * Optional services: SandboxSnapshots, SandboxVolumes, SandboxCode
 */
export const SandboxDriverFromCapabilities = Layer.effect(
  SandboxDriver,
  Effect.gen(function* () {
    const lifecycle = yield* SandboxLifecycle
    const process = yield* SandboxProcess
    const fs = yield* SandboxFs
    const snapshots = yield* Effect.serviceOption(SandboxSnapshots)
    const volumes = yield* Effect.serviceOption(SandboxVolumes)
    const code = yield* Effect.serviceOption(SandboxCode)

    const snapshotsService = Option.getOrUndefined(snapshots)
    const volumesService = Option.getOrUndefined(volumes)
    const codeService = Option.getOrUndefined(code)

    const driver: SandboxDriverService = {
      create: lifecycle.create,
      destroy: lifecycle.destroy,
      status: lifecycle.status,
      list: lifecycle.list,
      get: lifecycle.get,
      pause: lifecycle.pause,
      resume: lifecycle.resume,

      run: process.run,
      stream: process.stream,
      startProcess: process.startProcess,
      stopProcess: process.stopProcess,
      getProcessUrls: process.getProcessUrls,

      readFile: fs.readFile,
      writeFile: fs.writeFile,
      listDir: fs.listDir,
      mkdir: fs.mkdir,
      rm: fs.rm,
      watch: fs.watch,

      snapshotCreate: snapshotsService?.create,
      snapshotRestore: snapshotsService?.restore,
      snapshotList: snapshotsService?.list,

      volumeCreate: volumesService?.create,
      volumeDelete: volumesService?.delete,
      volumeList: volumesService?.list,
      volumeGet: volumesService?.get,

      runCode: codeService?.runCode,
    }

    return driver
  }),
)

/**
 * Creates layers that provide capability services from a SandboxDriver.
 *
 * This is the reverse of SandboxDriverFromCapabilities - it allows existing
 * SandboxDriver implementations to be used with capability-based code.
 */
export const CapabilitiesFromDriver = {
  lifecycle: Layer.effect(
    SandboxLifecycle,
    Effect.gen(function* () {
      const driver = yield* SandboxDriver
      return {
        create: driver.create,
        destroy: driver.destroy,
        status: driver.status,
        list: driver.list,
        get: driver.get,
        pause: driver.pause,
        resume: driver.resume,
      } satisfies SandboxLifecycleService
    }),
  ),

  process: Layer.effect(
    SandboxProcess,
    Effect.gen(function* () {
      const driver = yield* SandboxDriver
      return {
        run: driver.run,
        stream: driver.stream,
        startProcess: driver.startProcess,
        stopProcess: driver.stopProcess,
        getProcessUrls: driver.getProcessUrls,
      } satisfies SandboxProcessService
    }),
  ),

  fs: Layer.effect(
    SandboxFs,
    Effect.gen(function* () {
      const driver = yield* SandboxDriver
      return {
        readFile: driver.readFile,
        writeFile: driver.writeFile,
        listDir: driver.listDir,
        mkdir: driver.mkdir,
        rm: driver.rm,
        watch: driver.watch,
      } satisfies SandboxFsService
    }),
  ),

}

/**
 * All core capabilities merged into a single layer.
 * This is a convenience export that combines lifecycle, process, and fs.
 */
export const AllCoreCapabilitiesFromDriver = Layer.mergeAll(
  CapabilitiesFromDriver.lifecycle,
  CapabilitiesFromDriver.process,
  CapabilitiesFromDriver.fs,
)

/**
 * Creates optional capability layers from a SandboxDriver.
 *
 * These layers fail with SandboxCapabilityError if the capability is not
 * supported by the driver. This is a typed, recoverable error that allows
 * callers to use normal error recovery patterns.
 *
 * Usage:
 * ```ts
 * const snapshotsLayer = OptionalCapabilitiesFromDriver.snapshots.pipe(
 *   Layer.catchAll((error) => {
 *     // Handle unsupported capability gracefully
 *     console.log("Snapshots not available:", error.capability)
 *     return Layer.empty
 *   })
 * )
 * ```
 */
export const OptionalCapabilitiesFromDriver = {
  snapshots: Layer.effect(
    SandboxSnapshots,
    Effect.gen(function* () {
      const driver = yield* SandboxDriver
      if (!driver.snapshotCreate || !driver.snapshotRestore || !driver.snapshotList) {
        return yield* Effect.fail(
          new SandboxCapabilityError({
            capability: "snapshots",
            message: "Snapshots not supported by this driver",
          }),
        )
      }
      return {
        create: driver.snapshotCreate,
        restore: driver.snapshotRestore,
        list: driver.snapshotList,
      } satisfies SandboxSnapshotsService
    }),
  ),

  volumes: Layer.effect(
    SandboxVolumes,
    Effect.gen(function* () {
      const driver = yield* SandboxDriver
      if (!driver.volumeCreate || !driver.volumeDelete || !driver.volumeList || !driver.volumeGet) {
        return yield* Effect.fail(
          new SandboxCapabilityError({
            capability: "volumes",
            message: "Volumes not supported by this driver",
          }),
        )
      }
      return {
        create: driver.volumeCreate,
        delete: driver.volumeDelete,
        list: driver.volumeList,
        get: driver.volumeGet,
      } satisfies SandboxVolumesService
    }),
  ),

  code: Layer.effect(
    SandboxCode,
    Effect.gen(function* () {
      const driver = yield* SandboxDriver
      if (!driver.runCode) {
        return yield* Effect.fail(
          new SandboxCapabilityError({
            capability: "runCode",
            message: "Code execution not supported by this driver",
          }),
        )
      }
      return {
        runCode: driver.runCode,
      } satisfies SandboxCodeService
    }),
  ),
}
