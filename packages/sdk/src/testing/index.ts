/**
 * Testing utilities for sandbox packages.
 *
 * This module provides:
 * - TestClock and TestRandom for deterministic tests
 * - MockDriver for unit testing without real providers
 * - TestHarness for integration test lifecycle management
 *
 * @example
 * ```ts
 * import {
 *   MockDriverLive,
 *   TestServicesLayer,
 *   TestHarness,
 *   withSandbox
 * } from "@opencode-ai/sandbox-sdk/testing"
 * ```
 */

// Test services (Clock, Random)
export {
  makeTestClock,
  TestClockLayer,
  makeTestRandom,
  TestRandomLayer,
  TestServicesLayer,
  makeMutableTestClock,
  TestClock,
  runWithTestClock,
} from "./test-services"

// Mock driver
export {
  MockDriverLive,
  MockDriverWithState,
  FailingMockDriverLive,
  SlowMockDriverLive,
  type MockSandboxState,
  type MockDriverConfig,
} from "./mock-driver"

// Test harness
export {
  TestHarness,
  runIntegrationTest,
  createDriverTestSuite,
  waitForSandboxReady,
  runAndExpectSuccess,
  withSandbox,
  withSandboxTimeout,
  scopedSandbox,
  type TestHarnessConfig,
} from "./harness"
