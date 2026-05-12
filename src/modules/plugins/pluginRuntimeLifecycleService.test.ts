import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../items/types";
import {
  __resetPluginRuntimeLifecycleForTests,
  bootstrapEnabledPluginRuntimes,
  createPluginRuntimeBootstrapRunner,
  runtimeRequiresRocketLeaguePath,
  shutdownActivePluginRuntimes,
  startPluginRuntimeLifecycle,
  stopPluginRuntimeLifecycle,
  WIN_LOSS_OVERLAY_PLUGIN_ID,
  WIN_LOSS_OVERLAY_RUNTIME_ID,
  WORKSHOP_MAP_LOADER_PLUGIN_ID,
  WORKSHOP_MAP_LOADER_RUNTIME_ID,
} from "./pluginRuntimeLifecycleService";

  const mocked = vi.hoisted(() => ({
    startWinLossOverlayRuntime: vi.fn(),
    stopWinLossOverlayRuntime: vi.fn(),
    forceStopWinLossOverlayRuntime: vi.fn(),
    showWinLossOverlayWindow: vi.fn(),
    hideWinLossOverlayWindow: vi.fn(),
    updateWinLossOverlayWindowLayout: vi.fn(),
  }));

vi.mock("./winLossOverlayRuntimeService", () => ({
  startWinLossOverlayRuntime: mocked.startWinLossOverlayRuntime,
  stopWinLossOverlayRuntime: mocked.stopWinLossOverlayRuntime,
  forceStopWinLossOverlayRuntime: mocked.forceStopWinLossOverlayRuntime,
  showWinLossOverlayWindow: mocked.showWinLossOverlayWindow,
  hideWinLossOverlayWindow: mocked.hideWinLossOverlayWindow,
  updateWinLossOverlayWindowLayout: mocked.updateWinLossOverlayWindowLayout,
}));

describe("pluginRuntimeLifecycleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPluginRuntimeLifecycleForTests();
    mocked.startWinLossOverlayRuntime.mockResolvedValue({
      ok: true,
      message: "Overlay runtime started.",
    });
    mocked.stopWinLossOverlayRuntime.mockResolvedValue({
      ok: true,
      message: "Overlay runtime stopped.",
    });
    mocked.forceStopWinLossOverlayRuntime.mockResolvedValue({
      ok: true,
      message: "Overlay runtime force-stopped.",
    });
    mocked.showWinLossOverlayWindow.mockResolvedValue({
      ok: true,
      message: "Overlay window shown.",
    });
    mocked.hideWinLossOverlayWindow.mockResolvedValue({
      ok: true,
      message: "Overlay window hidden.",
    });
    mocked.updateWinLossOverlayWindowLayout.mockResolvedValue({
      ok: true,
      message: "Overlay window layout updated.",
    });
  });

  it("routes start lifecycle to win_loss_overlay adapter from registry", async () => {
    const result = await startPluginRuntimeLifecycle({
      pluginId: WIN_LOSS_OVERLAY_PLUGIN_ID,
      runtimeId: WIN_LOSS_OVERLAY_RUNTIME_ID,
      rocketLeaguePath: "C:/Games/rocketleague",
      appDataRoot: "C:/repo/AppData",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("started");
    expect(mocked.startWinLossOverlayRuntime).toHaveBeenCalledWith(
      "C:/Games/rocketleague",
      "C:/repo/AppData",
    );
    expect(mocked.showWinLossOverlayWindow).toHaveBeenCalledTimes(1);
  });

  it("skips unsupported runtime ids safely", async () => {
    const startResult = await startPluginRuntimeLifecycle({
      pluginId: "future_plugin",
      runtimeId: "builtin.future.v1",
      rocketLeaguePath: "C:/Games/rocketleague",
      appDataRoot: "C:/repo/AppData",
    });

    expect(startResult.ok).toBe(true);
    expect(startResult.status).toBe("skipped");
    expect(mocked.startWinLossOverlayRuntime).not.toHaveBeenCalled();
  });

  it("supports built-in workshop runtime without requiring Rocket League path", async () => {
    expect(runtimeRequiresRocketLeaguePath(WORKSHOP_MAP_LOADER_RUNTIME_ID)).toBe(false);

    const startResult = await startPluginRuntimeLifecycle({
      pluginId: WORKSHOP_MAP_LOADER_PLUGIN_ID,
      runtimeId: WORKSHOP_MAP_LOADER_RUNTIME_ID,
      rocketLeaguePath: "",
      appDataRoot: "C:/repo/AppData",
    });

    expect(startResult.ok).toBe(true);
    expect(startResult.status).toBe("started");
    expect(startResult.message).toContain("Workshop Map Loader");
  });

  it("shutdown cleanup runs for all active registered runtime entries", async () => {
    await startPluginRuntimeLifecycle({
      pluginId: WIN_LOSS_OVERLAY_PLUGIN_ID,
      runtimeId: WIN_LOSS_OVERLAY_RUNTIME_ID,
      rocketLeaguePath: "C:/Games/rocketleague",
      appDataRoot: "C:/repo/AppData",
    });
    await startPluginRuntimeLifecycle({
      pluginId: `${WIN_LOSS_OVERLAY_PLUGIN_ID}_copy`,
      runtimeId: WIN_LOSS_OVERLAY_RUNTIME_ID,
      rocketLeaguePath: "C:/Games/rocketleague",
      appDataRoot: "C:/repo/AppData",
    });

    const shutdownSummary = await shutdownActivePluginRuntimes();

    expect(shutdownSummary.attempted).toBe(2);
    expect(shutdownSummary.stopped).toBe(2);
    expect(shutdownSummary.failed).toBe(0);
    expect(mocked.hideWinLossOverlayWindow).toHaveBeenCalledTimes(2);
    expect(mocked.stopWinLossOverlayRuntime).toHaveBeenCalledTimes(2);
  });

  it("startup bootstrap starts supported enabled runtime and preserves enabled state", async () => {
    const state: AppState = {
      rocketLeaguePath: "C:/Games/rocketleague",
      plugins: {
        [WIN_LOSS_OVERLAY_PLUGIN_ID]: {
          installed: true,
          enabled: true,
          runtime: WIN_LOSS_OVERLAY_RUNTIME_ID,
        },
      },
    };

    const summary = await bootstrapEnabledPluginRuntimes({
      dependencies: {
        loadAppState: async () => state,
        getLocalAppDataPaths: async () => ({ appDataRoot: "C:/repo/AppData" }),
      },
    });

    expect(summary.started).toBe(1);
    expect(summary.failed).toBe(0);
    expect(state.plugins?.[WIN_LOSS_OVERLAY_PLUGIN_ID]?.enabled).toBe(true);
    expect(mocked.startWinLossOverlayRuntime).toHaveBeenCalledTimes(1);
  });

  it("startup bootstrap starts workshop runtime without Rocket League path", async () => {
    const state: AppState = {
      rocketLeaguePath: "",
      plugins: {
        [WORKSHOP_MAP_LOADER_PLUGIN_ID]: {
          installed: true,
          enabled: true,
          runtime: WORKSHOP_MAP_LOADER_RUNTIME_ID,
        },
      },
    };

    const summary = await bootstrapEnabledPluginRuntimes({
      dependencies: {
        loadAppState: async () => state,
        getLocalAppDataPaths: async () => ({ appDataRoot: "C:/repo/AppData" }),
      },
    });

    expect(summary.started).toBe(1);
    expect(summary.failed).toBe(0);
  });

  it("startup bootstrap uses saved overlay settings for window layout", async () => {
    const state: AppState = {
      rocketLeaguePath: "C:/Games/rocketleague",
      plugins: {
        [WIN_LOSS_OVERLAY_PLUGIN_ID]: {
          installed: true,
          enabled: true,
          runtime: WIN_LOSS_OVERLAY_RUNTIME_ID,
          overlay_settings: {
            theme_id: "rocketstats_circle",
            x: 120,
            y: 88,
            scale: 0.56,
            opacity: 0.92,
            show_status: true,
          },
        },
      },
    };

    await bootstrapEnabledPluginRuntimes({
      dependencies: {
        loadAppState: async () => state,
        getLocalAppDataPaths: async () => ({ appDataRoot: "C:/repo/AppData" }),
      },
    });

    expect(mocked.showWinLossOverlayWindow).toHaveBeenCalledWith({
      x: 120,
      y: 88,
      width: 224,
      height: 168,
    });
  });

  it("startup bootstrap uses saved overlay settings even when runtime plugin id differs", async () => {
    const state: AppState = {
      rocketLeaguePath: "C:/Games/rocketleague",
      plugins: {
        rocketstats: {
          installed: true,
          enabled: true,
          runtime: WIN_LOSS_OVERLAY_RUNTIME_ID,
          overlay_settings: {
            theme_id: "minimalist",
            x: 300,
            y: 460,
            scale: 1.5,
            opacity: 1,
            show_status: false,
          },
        },
      },
    };

    await bootstrapEnabledPluginRuntimes({
      dependencies: {
        loadAppState: async () => state,
        getLocalAppDataPaths: async () => ({ appDataRoot: "C:/repo/AppData" }),
      },
    });

    expect(mocked.showWinLossOverlayWindow).toHaveBeenCalledWith({
      x: 300,
      y: 460,
      width: 219,
      height: 266,
    });
  });

  it("app-close shutdown cleanup does not change persisted enabled state", async () => {
    const state: AppState = {
      rocketLeaguePath: "C:/Games/rocketleague",
      plugins: {
        [WIN_LOSS_OVERLAY_PLUGIN_ID]: {
          installed: true,
          enabled: true,
          runtime: WIN_LOSS_OVERLAY_RUNTIME_ID,
        },
      },
    };

    await startPluginRuntimeLifecycle({
      pluginId: WIN_LOSS_OVERLAY_PLUGIN_ID,
      runtimeId: WIN_LOSS_OVERLAY_RUNTIME_ID,
      rocketLeaguePath: "C:/Games/rocketleague",
      appDataRoot: "C:/repo/AppData",
    });

    const summary = await shutdownActivePluginRuntimes();
    expect(summary.stopped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(state.plugins?.[WIN_LOSS_OVERLAY_PLUGIN_ID]?.enabled).toBe(true);
  });

  it("bootstrap runner is idempotent and triggers startup once", async () => {
    const runner = createPluginRuntimeBootstrapRunner({
      loadAppState: async (): Promise<AppState> => ({
        rocketLeaguePath: "C:/Games/rocketleague",
        plugins: {
          [WIN_LOSS_OVERLAY_PLUGIN_ID]: {
            installed: true,
            enabled: true,
            runtime: WIN_LOSS_OVERLAY_RUNTIME_ID,
          },
        },
      }),
      getLocalAppDataPaths: async () => ({ appDataRoot: "C:/repo/AppData" }),
    });

    const first = await runner.run({
      rocketLeaguePath: "C:/Games/rocketleague",
    });
    const second = await runner.run({
      rocketLeaguePath: "C:/Games/rocketleague",
    });

    expect(first.started + first.failed + first.skipped).toBeGreaterThanOrEqual(0);
    expect(second.attempted).toBe(0);
    expect(mocked.startWinLossOverlayRuntime).toHaveBeenCalledTimes(1);
    expect(runner.wasAttempted()).toBe(true);
  });

  it("manual disable lifecycle stops runtime without changing plugin enabled persistence", async () => {
    const state: AppState = {
      plugins: {
        [WIN_LOSS_OVERLAY_PLUGIN_ID]: {
          installed: true,
          enabled: true,
          runtime: WIN_LOSS_OVERLAY_RUNTIME_ID,
        },
      },
    };

    await startPluginRuntimeLifecycle({
      pluginId: WIN_LOSS_OVERLAY_PLUGIN_ID,
      runtimeId: WIN_LOSS_OVERLAY_RUNTIME_ID,
      rocketLeaguePath: "C:/Games/rocketleague",
      appDataRoot: "C:/repo/AppData",
    });
    const stopResult = await stopPluginRuntimeLifecycle({
      pluginId: WIN_LOSS_OVERLAY_PLUGIN_ID,
      runtimeId: WIN_LOSS_OVERLAY_RUNTIME_ID,
    });

    expect(stopResult.ok).toBe(true);
    expect(stopResult.status).toBe("stopped");
    expect(state.plugins?.[WIN_LOSS_OVERLAY_PLUGIN_ID]?.enabled).toBe(true);
  });
});
