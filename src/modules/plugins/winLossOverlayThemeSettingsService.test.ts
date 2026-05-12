import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  emitTo: vi.fn(),
  loadAppState: vi.fn(),
  saveAppState: vi.fn(),
  updateWinLossOverlayWindowLayout: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: mocked.emitTo,
}));

vi.mock("../items/stateService", () => ({
  loadAppState: mocked.loadAppState,
  saveAppState: mocked.saveAppState,
}));

vi.mock("./winLossOverlayRuntimeService", () => ({
  updateWinLossOverlayWindowLayout: mocked.updateWinLossOverlayWindowLayout,
}));

import {
  applyWinLossOverlayWindowLayout,
  getDefaultWinLossOverlayThemeSettings,
  loadWinLossOverlayThemeSettings,
  readWinLossOverlayThemeSettingsFromPluginEntry,
  readWinLossOverlayThemeSettingsFromPluginsState,
  readWinLossOverlayThemeSettingsFromState,
  resetWinLossOverlayThemeSettings,
  resolveWinLossOverlayWindowLayout,
  saveWinLossOverlayThemeSettings,
  sanitizeWinLossOverlayThemeSettings,
} from "./winLossOverlayThemeSettingsService";

describe("winLossOverlayThemeSettingsService", () => {
  let currentState: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    currentState = {
      plugins: {
        win_loss_overlay: {
          installed: true,
          enabled: true,
          runtime: "builtin.win_loss_overlay.v1",
        },
      },
    };
    mocked.loadAppState.mockImplementation(async () => currentState);
    mocked.saveAppState.mockImplementation(async (nextState: unknown) => {
      currentState = nextState as Record<string, unknown>;
    });
    mocked.updateWinLossOverlayWindowLayout.mockResolvedValue({
      ok: true,
      message: "Overlay window layout updated.",
    });
  });

  it("returns safe defaults for invalid settings payloads", () => {
    const defaults = getDefaultWinLossOverlayThemeSettings();
    expect(sanitizeWinLossOverlayThemeSettings(null)).toEqual(defaults);
    expect(sanitizeWinLossOverlayThemeSettings("broken")).toEqual(defaults);
  });

  it("uses RocketStats-aligned defaults", () => {
    const defaults = getDefaultWinLossOverlayThemeSettings();
    expect(defaults.theme_id).toBe("rocketstats_circle");
    expect(defaults.scale).toBe(1);
    expect(defaults.show_status).toBe(false);
  });

  it("reads plugin entry settings with safe fallbacks", () => {
    const settings = readWinLossOverlayThemeSettingsFromPluginEntry({
      overlay_settings: {
        theme_id: "unknown_theme",
        x: 200,
        y: 180,
        scale: 0.7,
        opacity: 0.88,
        show_status: true,
      },
    });

    expect(settings.theme_id).toBe("rocketstats_circle");
    expect(settings.x).toBe(200);
    expect(settings.y).toBe(180);
    expect(settings.scale).toBe(0.7);
    expect(settings.opacity).toBe(0.88);
    expect(settings.show_status).toBe(true);
  });

  it("scales Circle window dimensions from base 400x300", () => {
    const layout = resolveWinLossOverlayWindowLayout({
      theme_id: "rocketstats_circle",
      x: 50,
      y: 70,
      scale: 0.56,
      opacity: 0.92,
      show_status: true,
    });

    expect(layout).toEqual({
      x: 50,
      y: 70,
      width: 224,
      height: 168,
    });
  });

  it("scales JSTKISS window dimensions from base 400x300", () => {
    const layout = resolveWinLossOverlayWindowLayout({
      theme_id: "rocketstats_jstkiss",
      x: 48,
      y: 72,
      scale: 1.5,
      opacity: 0.92,
      show_status: false,
    });

    expect(layout).toEqual({
      x: 48,
      y: 72,
      width: 600,
      height: 450,
    });
  });

  it("scales NativeTheme window dimensions from base 264x275", () => {
    const layout = resolveWinLossOverlayWindowLayout({
      theme_id: "rocketstats_native",
      x: 64,
      y: 92,
      scale: 1.5,
      opacity: 0.92,
      show_status: false,
    });

    expect(layout).toEqual({
      x: 64,
      y: 92,
      width: 396,
      height: 413,
    });
  });

  it("scales Minimalist window dimensions from base 146x177 without clamping above theme size", () => {
    const defaultScaleLayout = resolveWinLossOverlayWindowLayout({
      theme_id: "minimalist",
      x: 72,
      y: 96,
      scale: 1,
      opacity: 0.92,
      show_status: false,
    });
    expect(defaultScaleLayout).toEqual({
      x: 72,
      y: 96,
      width: 146,
      height: 177,
    });

    const layout = resolveWinLossOverlayWindowLayout({
      theme_id: "minimalist",
      x: 72,
      y: 96,
      scale: 1.5,
      opacity: 0.92,
      show_status: false,
    });

    expect(layout).toEqual({
      x: 72,
      y: 96,
      width: 219,
      height: 266,
    });
  });

  it("persists overlay settings inside plugin state", async () => {
    const persisted = await saveWinLossOverlayThemeSettings({
      theme_id: "rocketstats_circle",
      x: 120,
      y: 96,
      scale: 0.62,
      opacity: 0.9,
      show_status: true,
    });

    expect(persisted.x).toBe(120);
    expect(persisted.scale).toBe(0.62);
    expect(mocked.saveAppState).toHaveBeenCalledTimes(1);
    const savedPayload = mocked.saveAppState.mock.calls[0][0] as Record<string, unknown>;
    const plugins = savedPayload.plugins as Record<string, unknown>;
    const plugin = plugins.win_loss_overlay as Record<string, unknown>;
    const overlaySettings = plugin.overlay_settings as Record<string, unknown>;
    expect(overlaySettings.theme_id).toBe("rocketstats_circle");
    expect(overlaySettings.x).toBe(120);
    expect(overlaySettings.y).toBe(96);
  });

  it("persists numeric scale values for 50, 100, and 150 percent", async () => {
    const half = await saveWinLossOverlayThemeSettings({ scale: 0.5 });
    expect(half.scale).toBe(0.5);

    const full = await saveWinLossOverlayThemeSettings({ scale: 1 });
    expect(full.scale).toBe(1);

    const oneFifty = await saveWinLossOverlayThemeSettings({ scale: 1.5 });
    expect(oneFifty.scale).toBe(1.5);
  });

  it("reset restores default overlay settings", async () => {
    const resetSettings = await resetWinLossOverlayThemeSettings();
    const defaults = getDefaultWinLossOverlayThemeSettings();
    expect(resetSettings).toEqual(defaults);
  });

  it("forwards resolved layout to runtime layout updater", async () => {
    const result = await applyWinLossOverlayWindowLayout({
      theme_id: "rocketstats_circle",
      x: 80,
      y: 90,
      scale: 0.56,
      opacity: 0.92,
      show_status: true,
    });

    expect(result.ok).toBe(true);
    expect(mocked.updateWinLossOverlayWindowLayout).toHaveBeenCalledWith({
      x: 80,
      y: 90,
      width: 224,
      height: 168,
    });
  });

  it("clamps scale to supported 50-150 percent range", () => {
    const settings = sanitizeWinLossOverlayThemeSettings({
      theme_id: "rocketstats_circle",
      x: 40,
      y: 40,
      scale: 0.25,
      opacity: 0.92,
      show_status: false,
    });
    expect(settings.scale).toBe(0.5);

    const largeSettings = sanitizeWinLossOverlayThemeSettings({
      ...settings,
      scale: 2.5,
    });
    expect(largeSettings.scale).toBe(1.5);
  });

  it("clamps opacity to supported 30-100 percent range", () => {
    const lowOpacity = sanitizeWinLossOverlayThemeSettings({
      theme_id: "rocketstats_circle",
      x: 40,
      y: 40,
      scale: 1,
      opacity: 0.1,
      show_status: false,
    });
    expect(lowOpacity.opacity).toBe(0.3);

    const highOpacity = sanitizeWinLossOverlayThemeSettings({
      ...lowOpacity,
      opacity: 1.5,
    });
    expect(highOpacity.opacity).toBe(1);
  });

  it("restores saved non-default theme_id after state reload", async () => {
    await saveWinLossOverlayThemeSettings({
      theme_id: "rocketstats_jstkiss",
      x: 90,
      y: 120,
      scale: 1.1,
      opacity: 0.9,
      show_status: false,
    });

    const reloadedSettings = await loadWinLossOverlayThemeSettings();
    expect(reloadedSettings.theme_id).toBe("rocketstats_jstkiss");
    expect(reloadedSettings.x).toBe(90);
    expect(reloadedSettings.y).toBe(120);
  });

  it("reads saved settings from runtime-matching plugin entry even when plugin id differs", () => {
    const settings = readWinLossOverlayThemeSettingsFromPluginsState({
      rocketstats: {
        installed: true,
        enabled: true,
        runtime: "builtin.win_loss_overlay.v1",
        overlay_settings: {
          theme_id: "minimalist",
          x: 222,
          y: 333,
          scale: 1.2,
          opacity: 0.87,
          show_status: false,
        },
      },
    });

    expect(settings.theme_id).toBe("minimalist");
    expect(settings.x).toBe(222);
    expect(settings.y).toBe(333);
    expect(settings.scale).toBe(1.2);
    expect(settings.opacity).toBe(0.87);
  });

  it("state reader resolves runtime-matching plugin entry when canonical plugin id is missing", () => {
    const settings = readWinLossOverlayThemeSettingsFromState({
      plugins: {
        rocketstats: {
          installed: true,
          enabled: true,
          runtime: "builtin.win_loss_overlay.v1",
          overlay_settings: {
            theme_id: "rocketstats_native",
            x: 140,
            y: 280,
            scale: 0.8,
            opacity: 1,
            show_status: false,
          },
        },
      },
    });

    expect(settings.theme_id).toBe("rocketstats_native");
    expect(settings.x).toBe(140);
    expect(settings.y).toBe(280);
  });

  it("does not overwrite unknown stored theme id when saving unrelated setting patches", async () => {
    currentState = {
      plugins: {
        rocketstats: {
          installed: true,
          enabled: true,
          runtime: "builtin.win_loss_overlay.v1",
          overlay_settings: {
            theme_id: "future_theme_v2",
            x: 40,
            y: 40,
            scale: 1,
            opacity: 0.92,
            show_status: false,
          },
        },
      },
    };

    await saveWinLossOverlayThemeSettings({
      x: 144,
    });

    const persistedPlugins = (currentState.plugins ?? {}) as Record<string, unknown>;
    const persistedEntry = persistedPlugins.rocketstats as Record<string, unknown>;
    const persistedSettings = persistedEntry.overlay_settings as Record<string, unknown>;
    expect(persistedSettings.theme_id).toBe("future_theme_v2");
    expect(persistedSettings.x).toBe(144);
  });
});
