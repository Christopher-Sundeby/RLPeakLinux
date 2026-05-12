import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("../items/pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

import {
  createAnonymousInstallId,
  getOrCreateTelemetryState,
  getTelemetryStatePath,
  setMetricsEnabled,
} from "./metricsStateService";

describe("metricsStateService", () => {
  let telemetryRawFile: string | null;

  beforeEach(() => {
    telemetryRawFile = null;

    mocked.isTauri.mockReturnValue(true);
    mocked.getLocalAppDataPaths.mockResolvedValue({
      appDataRoot: "C:/repo/AppData",
    });
    mocked.invoke.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      if (command === "read_text_file") {
        if (telemetryRawFile === null) {
          throw new Error("ENOENT");
        }
        return telemetryRawFile;
      }

      if (command === "write_text_file") {
        telemetryRawFile = String(payload?.contents ?? "");
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generates install_id once and reuses it across loads", async () => {
    const first = await getOrCreateTelemetryState();
    const second = await getOrCreateTelemetryState();

    expect(first.install_id).toBe(second.install_id);
    expect(mocked.invoke).toHaveBeenCalledWith("write_text_file", expect.any(Object));
  });

  it("creates random UUID-style anonymous install IDs", () => {
    const installId = createAnonymousInstallId();
    expect(installId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("defaults metrics_enabled=true for fresh telemetry state", async () => {
    const state = await getOrCreateTelemetryState();
    expect(state.metrics_enabled).toBe(true);
  });

  it("persists metrics toggle updates", async () => {
    const disabled = await setMetricsEnabled(false);
    expect(disabled.metrics_enabled).toBe(false);

    const enabled = await setMetricsEnabled(true);
    expect(enabled.metrics_enabled).toBe(true);
  });

  it("stores telemetry state at AppData/telemetry.json", async () => {
    await getOrCreateTelemetryState();
    expect(await getTelemetryStatePath()).toBe("C:/repo/AppData/telemetry.json");
  });

  it("writes telemetry state separately and never touches app_state.json", async () => {
    await getOrCreateTelemetryState();

    const writeCalls = mocked.invoke.mock.calls.filter(([command]) => command === "write_text_file");
    expect(writeCalls.length).toBeGreaterThan(0);
    for (const [, payload] of writeCalls) {
      const path = String((payload as { path?: unknown })?.path ?? "");
      expect(path).toContain("telemetry.json");
      expect(path).not.toContain("app_state.json");
    }
  });
});
