/**
 * Capability-based sandbox services.
 *
 * This module provides fine-grained services for sandbox operations,
 * allowing providers to implement only the capabilities they support.
 *
 * Services:
 * - SandboxLifecycle: create/destroy/status/list/get/pause/resume
 * - SandboxProcess: run/stream/startProcess/stopProcess/getProcessUrls
 * - SandboxFs: readFile/writeFile/listDir/mkdir/rm/watch
 * - SandboxSnapshots: create/restore/list (optional)
 * - SandboxVolumes: create/delete/list/get (optional)
 * - SandboxCode: runCode (optional)
 */

export * from "./lifecycle"
export * from "./process"
export * from "./fs"
export * from "./snapshots"
export * from "./volumes"
export * from "./code"
export * from "./adapter"
