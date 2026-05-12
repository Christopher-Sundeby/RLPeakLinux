import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../items/types";
import { installPlugin, readPluginsState, setPluginEnabled, uninstallPlugin } from "./pluginInstallService";
import type { PluginManifestEntry } from "./types";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  join: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
  loadPluginDetail: vi.fn(),
  loadAppState: vi.fn(),
  saveAppState: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

vi.mock("../items/pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

vi.mock("./pluginCatalogService", () => ({
  loadPluginDetail: mocked.loadPluginDetail,
}));

vi.mock("../items/stateService", () => ({
  loadAppState: mocked.loadAppState,
  saveAppState: mocked.saveAppState,
}));

vi.mock("../metrics/metricsService", () => ({
  trackEvent: mocked.trackEvent,
}));

const manifestEntry: PluginManifestEntry = {
  id: "win_loss_overlay",
  name: "Win/Loss Overlay",
  version: "1.0.0",
  summary: "Shows your current Rocket League session wins, losses and streak in an overlay.",
  type: "overlay",
  runtime: "builtin.win_loss_overlay.v1",
  status: "active",
  manifest_path: "plugins/win_loss_overlay/plugin.json",
};

describe("pluginInstallService", () => {
  let currentState: AppState;
  let existingPaths: Set<string>;

  beforeEach(() => {
    currentState = {
      plugins: {},
    };
    existingPaths = new Set<string>();

    mocked.isTauri.mockReturnValue(true);
    mocked.join.mockImplementation(async (...parts: string[]) => parts.join("/"));
    mocked.getLocalAppDataPaths.mockResolvedValue({
      pathMode: "tauri-repo-root-appdata",
      appDataRoot: "C:/repo/AppData",
      catalogsDir: "C:/repo/AppData/catalogs",
      skinCatalogPath: "C:/repo/AppData/catalogs/output_skins_catalog.json",
      wheelCatalogPath: "C:/repo/AppData/catalogs/output_wheels_catalog.json",
      boostCatalogPath: "C:/repo/AppData/catalogs/output_boosts_catalog.json",
      itemsRoot: "C:/repo/AppData/ItemsFiles",
      itemsSkinDir: "C:/repo/AppData/ItemsFiles/Skin",
      itemsWheelDir: "C:/repo/AppData/ItemsFiles/Wheel",
      itemsBoostDir: "C:/repo/AppData/ItemsFiles/Boost",
      cacheRoot: "C:/repo/AppData/cache",
      cachePluginsRoot: "C:/repo/AppData/cache/Plugins",
      cacheItemsRoot: "C:/repo/AppData/cache/ItemsFiles",
      cacheItemsSkinDir: "C:/repo/AppData/cache/ItemsFiles/Skin",
      cacheItemsWheelDir: "C:/repo/AppData/cache/ItemsFiles/Wheel",
      cacheItemsBoostDir: "C:/repo/AppData/cache/ItemsFiles/Boost",
      backupsRoot: "C:/repo/AppData/Backups",
      backupsOriginalsDir: "C:/repo/AppData/Backups/originals",
      backupsSkinDir: "C:/repo/AppData/Backups/originals/Skin",
      backupsWheelDir: "C:/repo/AppData/Backups/originals/Wheel",
      backupsBoostDir: "C:/repo/AppData/Backups/originals/Boost",
      stateDir: "C:/repo/AppData/state",
      stateFilePath: "C:/repo/AppData/state/app_state.json",
    });

    mocked.loadAppState.mockImplementation(async () => currentState);
    mocked.saveAppState.mockImplementation(async (nextState: AppState) => {
      currentState = nextState;
    });

    mocked.invoke.mockImplementation(async (command: string, args?: { path?: string; destinationPath?: string }) => {
      if (command === "path_exists") {
        return existingPaths.has(args?.path ?? "");
      }
      if (command === "download_remote_file") {
        if (args?.destinationPath) {
          existingPaths.add(args.destinationPath);
        }
        return undefined;
      }
      if (command === "remove_path") {
        const prefix = args?.path ?? "";
        for (const path of Array.from(existingPaths)) {
          if (path.startsWith(prefix)) {
            existingPaths.delete(path);
          }
        }
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    mocked.loadPluginDetail.mockResolvedValue({
      ok: true,
      source: "remote",
      detail: {
        schema: "rlpeak_plugin.v1",
        id: "win_loss_overlay",
        name: "Win/Loss Overlay",
        version: "1.0.0",
        type: "overlay",
        runtime: "builtin.win_loss_overlay.v1",
        description: "A clean session overlay showing wins, losses and streak while playing Rocket League.",
        permissions: ["overlay_window"],
        default_config: {
          enabled: false,
        },
        files: [
          {
            filename: "icon.png",
            remote_path: "Plugins/win_loss_overlay/icon.png",
          },
          {
            filename: "overlay_theme.json",
            remote_path: "Plugins/win_loss_overlay/overlay_theme.json",
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("installs plugin assets and persists installed state", async () => {
    const result = await installPlugin(manifestEntry);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Plugin installed successfully.");
    expect(currentState.plugins?.win_loss_overlay?.installed).toBe(true);
    expect(mocked.invoke).toHaveBeenCalledWith("download_remote_file", {
      url: "https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/icon.png",
      destinationPath: "C:/repo/AppData/cache/Plugins/win_loss_overlay/icon.png",
    });
    expect(mocked.invoke).toHaveBeenCalledWith("download_remote_file", {
      url: "https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/overlay_theme.json",
      destinationPath: "C:/repo/AppData/cache/Plugins/win_loss_overlay/overlay_theme.json",
    });
    expect(mocked.trackEvent).toHaveBeenCalledWith("plugin_installed", {
      pluginId: "win_loss_overlay",
    });
  });

  it("rejects blocked plugin asset extensions during install", async () => {
    mocked.loadPluginDetail.mockResolvedValueOnce({
      ok: true,
      source: "remote",
      detail: {
        schema: "rlpeak_plugin.v1",
        id: "win_loss_overlay",
        name: "Win/Loss Overlay",
        version: "1.0.0",
        type: "overlay",
        runtime: "builtin.win_loss_overlay.v1",
        description: "desc",
        permissions: ["overlay_window"],
        default_config: {},
        files: [
          {
            filename: "script.js",
            remote_path: "Plugins/win_loss_overlay/script.js",
          },
        ],
      },
    });

    const result = await installPlugin(manifestEntry);

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Plugin install blocked: unsupported asset type.");
    const downloadCalls = mocked.invoke.mock.calls.filter(([command]) => command === "download_remote_file");
    expect(downloadCalls).toHaveLength(0);
  });

  it("persists enable and disable state without runtime execution", async () => {
    currentState = {
      plugins: {
        win_loss_overlay: {
          installed: true,
          enabled: false,
        },
      },
    };

    const enableResult = await setPluginEnabled("win_loss_overlay", true);
    expect(enableResult.ok).toBe(true);
    expect(enableResult.message).toBe("Plugin enabled.");
    expect(currentState.plugins?.win_loss_overlay?.enabled).toBe(true);

    const disableResult = await setPluginEnabled("win_loss_overlay", false);
    expect(disableResult.ok).toBe(true);
    expect(disableResult.message).toBe("Plugin disabled.");
    expect(currentState.plugins?.win_loss_overlay?.enabled).toBe(false);
    expect(mocked.trackEvent).toHaveBeenCalledWith("plugin_enabled", {
      pluginId: "win_loss_overlay",
    });
    expect(mocked.trackEvent).toHaveBeenCalledWith("plugin_disabled", {
      pluginId: "win_loss_overlay",
    });
  });

  it("uninstalls plugin cache and removes plugin state", async () => {
    currentState = {
      plugins: {
        win_loss_overlay: {
          installed: true,
          enabled: true,
        },
      },
    };
    existingPaths.add("C:/repo/AppData/cache/Plugins/win_loss_overlay/icon.png");
    existingPaths.add("C:/repo/AppData/cache/Plugins/win_loss_overlay/overlay_theme.json");

    const result = await uninstallPlugin("win_loss_overlay");

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Plugin uninstalled successfully.");
    expect(currentState.plugins?.win_loss_overlay).toBeUndefined();
    expect(mocked.invoke).toHaveBeenCalledWith("remove_path", {
      path: "C:/repo/AppData/cache/Plugins/win_loss_overlay",
    });
    expect(mocked.trackEvent).toHaveBeenCalledWith("plugin_uninstalled", {
      pluginId: "win_loss_overlay",
    });
  });

  it("keeps plugin actions successful even if metrics tracking throws", async () => {
    mocked.trackEvent.mockImplementation(() => {
      throw new Error("metrics unavailable");
    });

    const installResult = await installPlugin(manifestEntry);
    expect(installResult.ok).toBe(true);

    currentState = {
      plugins: {
        win_loss_overlay: {
          installed: true,
          enabled: false,
        },
      },
    };
    const enableResult = await setPluginEnabled("win_loss_overlay", true);
    expect(enableResult.ok).toBe(true);
  });

  it("returns an empty plugins state when app_state has no plugins section", async () => {
    currentState = {
      rocketLeaguePath: "C:/Program Files/Epic Games/rocketleague",
    };

    const plugins = await readPluginsState();
    expect(plugins).toEqual({});
  });
});
