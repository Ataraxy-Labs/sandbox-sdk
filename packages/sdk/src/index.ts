// ─────────────────────────────────────────────────────────────────────────────
// Promise-based DX API (Vercel-like)
// ─────────────────────────────────────────────────────────────────────────────
export {
  Sandbox,
  Command,
  CommandResult,
  type ProviderConfig,
  type SandboxCreateOptions,
  type SandboxGetOptions,
  type SandboxListOptions,
  type CommandData,
} from "./api"

// ─────────────────────────────────────────────────────────────────────────────
// Types (shared between Promise and Effect APIs)
// ─────────────────────────────────────────────────────────────────────────────
export * from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Errors & Validation
// ─────────────────────────────────────────────────────────────────────────────
export * from "./errors"

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency Control (optional rate limiting)
// ─────────────────────────────────────────────────────────────────────────────
export {
  ConcurrencyLimiter,
  ConcurrencyLimiterLive,
  ConcurrencyLimiterNoop,
  withConcurrencyLimit,
  rateLimited,
  type ConcurrencyConfig,
  type ConcurrencyLimiterService,
} from "./concurrency"

// ─────────────────────────────────────────────────────────────────────────────
// Effect-based API (for power users)
// ─────────────────────────────────────────────────────────────────────────────
export { SandboxDriver, type SandboxDriverService } from "./driver"
export {
  Sandbox as EffectSandbox,
  SandboxLive,
  type SandboxHandle,
  type SandboxService,
} from "./sandbox"
export { defaultRetrySchedule, isTransientError, retryTransient } from "./retry"

// ─────────────────────────────────────────────────────────────────────────────
// Scoped resource management (Effect.acquireRelease)
// ─────────────────────────────────────────────────────────────────────────────
export {
  acquireSandbox,
  withManagedSandbox,
  withManagedSandboxTimeout,
  acquireVolume,
  withManagedVolume,
  acquireSandboxes,
  acquireSandboxWithVolume,
} from "./scoped"

// ─────────────────────────────────────────────────────────────────────────────
// Capability-based services (Phase 2 architecture)
// ─────────────────────────────────────────────────────────────────────────────
export {
  // Lifecycle
  SandboxLifecycle,
  type SandboxLifecycleService,
  create,
  destroy,
  status,
  list,
  get,
  // Process
  SandboxProcess,
  type SandboxProcessService,
  run,
  stream,
  // Filesystem
  SandboxFs,
  type SandboxFsService,
  readFile,
  writeFile,
  listDir,
  mkdir,
  rm,
  // Snapshots (optional)
  SandboxSnapshots,
  type SandboxSnapshotsService,
  createSnapshot,
  restoreSnapshot,
  listSnapshots,
  // Volumes (optional)
  SandboxVolumes,
  type SandboxVolumesService,
  createVolume,
  deleteVolume,
  listVolumes,
  getVolume,
  // Code (optional)
  SandboxCode,
  type SandboxCodeService,
  runCode,
  // Adapters
  SandboxDriverFromCapabilities,
  CapabilitiesFromDriver,
  AllCoreCapabilitiesFromDriver,
  OptionalCapabilitiesFromDriver,
} from "./capabilities"
