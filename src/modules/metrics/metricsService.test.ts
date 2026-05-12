import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelemetryState } from "./types";

const mocked = vi.hoisted(() => ({
  getOrCreateTelemetryState: vi.fn(),
  saveTelemetryState: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./metricsStateService", () => ({
  getOrCreateTelemetryState: mocked.getOrCreateTelemetryState,
  saveTelemetryState: mocked.saveTelemetryState,
}));

import {
  buildMetricsPayload,
  mapItemApplyFailureToMetricsCode,
  resetMetricsLaunchStateForTests,
  trackAppStart,
  trackDailyActive,
  trackEvent,
} from "./metricsService";

function createTelemetryState(overrides?: Partial<TelemetryState>): TelemetryState {
  return {
    schema: "rlpeak_telemetry_state.v1",
    install_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-05-11T10:00:00.000Z",
    metrics_enabled: true,
    last_app_start_sent_at: null,
    last_daily_active_sent_at: null,
    ...overrides,
  };
}

describe("metricsService", () => {
  let currentState: TelemetryState;
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    currentState = createTelemetryState();
    mocked.getOrCreateTelemetryState.mockImplementation(async () => currentState);
    mocked.saveTelemetryState.mockImplementation(async (nextState: TelemetryState) => {
      currentState = nextState;
    });
    mocked.fetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
    originalFetch = globalThis.fetch;
    globalThis.fetch = mocked.fetch as unknown as typeof fetch;
    resetMetricsLaunchStateForTests();
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    vi.clearAllMocks();
  });

  it("does not send metrics when disabled", async () => {
    currentState = createTelemetryState({
      metrics_enabled: false,
    });

    await trackEvent("plugin_installed", { pluginId: "workshop_map_loader" });
    expect(mocked.fetch).not.toHaveBeenCalled();
  });

  it("resumes sends after metrics are enabled", async () => {
    currentState = createTelemetryState({
      metrics_enabled: false,
    });

    await trackEvent("plugin_installed", { pluginId: "workshop_map_loader" });
    expect(mocked.fetch).not.toHaveBeenCalled();

    currentState = {
      ...currentState,
      metrics_enabled: true,
    };

    await trackEvent("plugin_installed", { pluginId: "workshop_map_loader" });
    expect(mocked.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends daily_active at most once per UTC day", async () => {
    await trackDailyActive();
    await trackDailyActive();

    expect(mocked.fetch).toHaveBeenCalledTimes(1);
    expect(currentState.last_daily_active_sent_at).not.toBeNull();
  });

  it("sends app_start once per app launch", async () => {
    await trackAppStart();
    await trackAppStart();

    expect(mocked.fetch).toHaveBeenCalledTimes(1);
    expect(currentState.last_app_start_sent_at).not.toBeNull();
  });

  it("builds payload with only allowed fields", () => {
    const payload = buildMetricsPayload("plugin_enabled", createTelemetryState(), {
      pluginId: "win_loss_overlay",
      errorCode: "unknown",
      timestamp: "2026-05-11T12:00:00.000Z",
    });

    expect(Object.keys(payload).sort()).toEqual([
      "app_version",
      "error_code",
      "event",
      "install_id",
      "platform",
      "plugin_id",
      "schema",
      "timestamp",
    ]);
    expect(payload).not.toHaveProperty("rocket_league_path");
    expect(payload).not.toHaveProperty("windows_username");
    expect(payload).not.toHaveProperty("steam_id");
    expect(payload).not.toHaveProperty("epic_id");
    expect(payload).not.toHaveProperty("raw_log");
  });

  it("does not throw when metrics network request fails", async () => {
    mocked.fetch.mockRejectedValueOnce(new Error("network error"));

    await expect(trackEvent("plugin_installed", { pluginId: "win_loss_overlay" })).resolves.toBeUndefined();
  });

  it("includes plugin_id for plugin lifecycle events", async () => {
    await trackEvent("plugin_installed", { pluginId: "win_loss_overlay" });
    await trackEvent("plugin_enabled", { pluginId: "win_loss_overlay" });
    await trackEvent("plugin_disabled", { pluginId: "win_loss_overlay" });

    const payloads = mocked.fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(payloads[0].plugin_id).toBe("win_loss_overlay");
    expect(payloads[1].plugin_id).toBe("win_loss_overlay");
    expect(payloads[2].plugin_id).toBe("win_loss_overlay");
  });

  it("maps item apply failures to safe generic error codes", () => {
    expect(mapItemApplyFailureToMetricsCode({
      code: "ApplyFailed",
      message: "Admin permission required",
      details: "EACCES",
    })).toBe("permission_denied");

    expect(mapItemApplyFailureToMetricsCode({
      code: "ApplyFailed",
      message: "Download failed. Please check your connection and try again.",
    })).toBe("download_failed");

    expect(mapItemApplyFailureToMetricsCode({
      code: "MissingItemFile",
      message: "Missing item file",
    })).toBe("invalid_path");
  });

  it("supports workshop map telemetry events", async () => {
    await trackEvent("workshop_map_loaded", { pluginId: "workshop_map_loader" });
    await trackEvent("workshop_map_restored", { pluginId: "workshop_map_loader" });

    const payloads = mocked.fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(payloads[0].event).toBe("workshop_map_loaded");
    expect(payloads[1].event).toBe("workshop_map_restored");
    expect(payloads[0].plugin_id).toBe("workshop_map_loader");
    expect(payloads[1].plugin_id).toBe("workshop_map_loader");
  });
});
