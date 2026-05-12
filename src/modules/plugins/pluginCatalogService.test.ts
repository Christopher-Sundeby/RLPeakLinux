import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  join: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
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

import {
  clearSharedPluginManifest,
  loadPluginDetail,
  loadPluginManifest,
  parsePluginDetail,
  parsePluginManifest,
} from "./pluginCatalogService";

const pluginManifestPayload = {
  schema: "rlpeak_plugins_manifest.v1",
  version: "2026.05.1",
  plugins: [
    {
      id: "win_loss_overlay",
      name: "Win/Loss Overlay",
      title: "RocketStats",
      version: "1.0.0",
      summary: "Shows your current Rocket League session wins, losses and streak in an overlay.",
      short_description: "RocketStats is an in-game Rocket League overlay for session MMR, wins, losses and streaks.",
      type: "overlay",
      runtime: "builtin.win_loss_overlay.v1",
      status: "active",
      manifest_path: "plugins/win_loss_overlay/plugin.json",
      icon_remote_path: "Plugins/win_loss_overlay/icon.png",
      banner_remote_path: "Plugins/win_loss_overlay/banner.png",
      tags: ["Overlay", "Stats"],
      categories: ["Built-in runtime"],
    },
  ],
};

const pluginDetailPayload = {
  schema: "rlpeak_plugin.v1",
  id: "win_loss_overlay",
  name: "Win/Loss Overlay",
  version: "1.0.0",
  type: "overlay",
  runtime: "builtin.win_loss_overlay.v1",
  description: "A clean session overlay showing wins, losses and streak while playing Rocket League.",
  title: "RocketStats",
  short_description: "RocketStats is an in-game Rocket League overlay for session MMR, wins, losses and streaks, re-integrated into RLPeak.",
  long_description_html: "<p><strong>RocketStats</strong> paragraph.</p>",
  long_description_markdown: "### Features\n\n- Session wins/losses/streak",
  permissions: [
    "rocket_league_stats_api",
    "overlay_window",
    "local_settings",
  ],
  default_config: {
    enabled: false,
  },
  icon_remote_path: "Plugins/win_loss_overlay/icon.png",
  banner_remote_path: "Plugins/win_loss_overlay/banner.png",
  screenshot_remote_paths: ["Plugins/win_loss_overlay/screenshots/circle.png"],
  screenshots: [
    {
      remote_path: "Plugins/win_loss_overlay/screenshots/circle.png",
      caption: "RocketStats Circle",
    },
  ],
  tags: ["Overlay", "Stats"],
  categories: ["Built-in runtime"],
  credits: [
    {
      name: "RocketStats Team",
      role: "Original plugin",
      url: "https://github.com/Lyliya/RocketStats",
      license: "MIT",
    },
  ],
  attribution: "RocketStats assets/theme are from the RocketStats project.",
  external_links: [
    {
      label: "Original RocketStats source",
      url: "https://github.com/Lyliya/RocketStats",
    },
  ],
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
};

describe("pluginCatalogService", () => {
  const cacheStore = new Map<string, string>();

  beforeEach(() => {
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
    mocked.invoke.mockImplementation(async (command: string, args?: { path?: string; contents?: string }) => {
      if (command === "read_text_file") {
        const value = cacheStore.get(args?.path ?? "");
        if (!value) {
          throw new Error("FILE_NOT_FOUND");
        }
        return value;
      }
      if (command === "write_text_file") {
        cacheStore.set(args?.path ?? "", args?.contents ?? "");
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
  });

  afterEach(() => {
    clearSharedPluginManifest();
    cacheStore.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("parses a valid plugin manifest payload", () => {
    const manifest = parsePluginManifest(pluginManifestPayload);
    expect(manifest.plugins).toHaveLength(1);
    expect(manifest.plugins[0]?.id).toBe("win_loss_overlay");
    expect(manifest.plugins[0]?.title).toBe("RocketStats");
    expect(manifest.plugins[0]?.short_description).toContain("RocketStats");
    expect(manifest.plugins[0]?.tags).toEqual(["Overlay", "Stats"]);
  });

  it("parses a valid plugin detail payload without requiring sha256", () => {
    const detail = parsePluginDetail(pluginDetailPayload);
    expect(detail.files).toHaveLength(2);
    expect(detail.files[0]?.sha256).toBeUndefined();
    expect(detail.icon_remote_path).toBe("Plugins/win_loss_overlay/icon.png");
    expect(detail.banner_remote_path).toBe("Plugins/win_loss_overlay/banner.png");
    expect(detail.screenshot_remote_paths).toEqual(["Plugins/win_loss_overlay/screenshots/circle.png"]);
    expect(detail.title).toBe("RocketStats");
    expect(detail.short_description).toContain("RocketStats");
    expect(detail.long_description_markdown).toContain("Features");
    expect(detail.screenshots?.[0]?.caption).toBe("RocketStats Circle");
    expect(detail.tags).toEqual(["Overlay", "Stats"]);
    expect(detail.categories).toEqual(["Built-in runtime"]);
    expect(detail.credits?.[0]?.license).toBe("MIT");
    expect(detail.external_links?.[0]?.url).toBe("https://github.com/Lyliya/RocketStats");
  });

  it("fetches plugin manifest from remote", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => pluginManifestPayload,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPluginManifest();

    expect(result.ok).toBe(true);
    expect(result.source).toBe("remote");
    expect(result.manifest?.plugins[0]?.name).toBe("Win/Loss Overlay");
    expect(result.manifest?.plugins.some((entry) => entry.id === "workshop_map_loader")).toBe(true);
  });

  it("falls back to cached manifest when remote fetch fails", async () => {
    cacheStore.set(
      "C:/repo/AppData/cache/Plugins/manifest.json",
      JSON.stringify(pluginManifestPayload),
    );
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPluginManifest({ forceReload: true });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("cache");
    expect(result.manifest?.plugins[0]?.id).toBe("win_loss_overlay");
  });

  it("returns friendly unavailable state when remote and cache are unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPluginManifest({ forceReload: true });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("RLPeak plugin catalog is unavailable. Please try again later.");
  });

  it("fetches plugin detail and parses files", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => pluginDetailPayload,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPluginDetail("win_loss_overlay", "plugins/win_loss_overlay/plugin.json");

    expect(result.ok).toBe(true);
    expect(result.source).toBe("remote");
    expect(result.detail?.files.map((file) => file.filename)).toEqual([
      "icon.png",
      "overlay_theme.json",
    ]);
  });

  it("returns built-in fallback detail for workshop map loader when remote detail is unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPluginDetail(
      "workshop_map_loader",
      "plugins/workshop_map_loader/plugin.json",
      { allowCacheFallback: true },
    );

    expect(result.ok).toBe(true);
    expect(result.detail?.id).toBe("workshop_map_loader");
    expect(result.detail?.runtime).toBe("builtin.workshop_map_loader.v1");
  });
});
