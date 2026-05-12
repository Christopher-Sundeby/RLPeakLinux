import { describe, expect, it, vi } from "vitest";
import { createDefaultWinLossOverlayState, type RuntimeActionResult } from "../../modules/plugins/winLossOverlayRuntimeService";
import {
  isAnyPluginActionBusyForPlugin,
  isPluginActionBusy,
  makePluginActionBusyKey,
  shouldShowDisableControl,
  runPluginActionWithBusyState,
  withPluginActionBusyState,
} from "./pluginsPageSelectors";

describe("pluginsPageSelectors", () => {
  it("keeps Disable visible while runtime is waiting", () => {
    const runtime = {
      ...createDefaultWinLossOverlayState(),
      status: "Waiting for Rocket League" as const,
    };

    expect(shouldShowDisableControl({
      isInstalled: true,
      isEnabled: false,
      isWinLossRuntime: true,
      runtimeState: runtime,
    })).toBe(true);
  });

  it("keeps Disable visible while runtime requires restart", () => {
    const runtime = {
      ...createDefaultWinLossOverlayState(),
      status: "Restart Rocket League" as const,
    };

    expect(shouldShowDisableControl({
      isInstalled: true,
      isEnabled: false,
      isWinLossRuntime: true,
      runtimeState: runtime,
    })).toBe(true);
  });

  it("keeps Disable visible while runtime is error", () => {
    const runtime = {
      ...createDefaultWinLossOverlayState(),
      status: "Error" as const,
    };

    expect(shouldShowDisableControl({
      isInstalled: true,
      isEnabled: false,
      isWinLossRuntime: true,
      runtimeState: runtime,
    })).toBe(true);
  });

  it("tracks busy state per action key", () => {
    let state = {};
    state = withPluginActionBusyState(state, "win_loss_overlay", "enable", true);
    expect(isPluginActionBusy(state, "win_loss_overlay", "enable")).toBe(true);
    expect(isAnyPluginActionBusyForPlugin(state, "win_loss_overlay")).toBe(true);
    expect(makePluginActionBusyKey("win_loss_overlay", "enable")).toBe("win_loss_overlay:enable");

    state = withPluginActionBusyState(state, "win_loss_overlay", "enable", false);
    expect(isPluginActionBusy(state, "win_loss_overlay", "enable")).toBe(false);
    expect(isAnyPluginActionBusyForPlugin(state, "win_loss_overlay")).toBe(false);
  });

  it("clears busy state even when action throws", async () => {
    let state = {};
    const setBusyState = (updater: (current: Record<string, boolean>) => Record<string, boolean>) => {
      state = updater(state);
    };

    const result = await runPluginActionWithBusyState({
      pluginId: "win_loss_overlay",
      action: "enable",
      actionRunner: async () => {
        throw new Error("enable failed");
      },
      setBusyState,
      fallbackMessage: "Plugin action failed.",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Plugin action failed.");
    expect(isAnyPluginActionBusyForPlugin(state, "win_loss_overlay")).toBe(false);
  });

  it("clears busy state when action times out", async () => {
    vi.useFakeTimers();
    let state = {};
    const setBusyState = (updater: (current: Record<string, boolean>) => Record<string, boolean>) => {
      state = updater(state);
    };

    const timeoutPromise = runPluginActionWithBusyState({
      pluginId: "win_loss_overlay",
      action: "enable",
      actionRunner: async () => new Promise(() => undefined),
      setBusyState,
      fallbackMessage: "Plugin action failed.",
      timeoutMs: 250,
      timeoutMessage: "Plugin action timed out.",
    });

    await vi.advanceTimersByTimeAsync(300);
    const result = await timeoutPromise;

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Plugin action timed out.");
    expect(isAnyPluginActionBusyForPlugin(state, "win_loss_overlay")).toBe(false);
    vi.useRealTimers();
  });

  it("supports no-timeout actions for long-running operations", async () => {
    vi.useFakeTimers();
    let state = {};
    const deferred: { resolve?: (value: RuntimeActionResult) => void } = {};
    let settled = false;
    const setBusyState = (updater: (current: Record<string, boolean>) => Record<string, boolean>) => {
      state = updater(state);
    };

    const actionPromise = runPluginActionWithBusyState({
      pluginId: "workshop_map_loader",
      action: "loadWorkshopMap",
      actionRunner: async () => new Promise<RuntimeActionResult>((resolve) => {
        deferred.resolve = resolve;
      }),
      setBusyState,
      fallbackMessage: "Plugin action failed.",
      timeoutMs: null,
    }).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(settled).toBe(false);
    expect(isAnyPluginActionBusyForPlugin(state, "workshop_map_loader")).toBe(true);

    if (deferred.resolve) {
      deferred.resolve({
        ok: true,
        message: "Workshop map loaded.",
      });
    }
    const result = await actionPromise;
    expect(result.ok).toBe(true);
    expect(isAnyPluginActionBusyForPlugin(state, "workshop_map_loader")).toBe(false);
    vi.useRealTimers();
  });
});
