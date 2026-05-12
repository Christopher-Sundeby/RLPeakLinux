import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterWorkshopMapsByQuery,
  getWorkshopLoadPreflight,
  getWorkshopActiveMapStatus,
  getWorkshopMapsCatalog,
  loadWorkshopMap,
  refreshWorkshopMapsCatalog,
  restoreWorkshopOriginalMap,
} from "./workshopMapLoaderService";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  join: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

vi.mock("../items/pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

vi.mock("../metrics/metricsService", () => ({
  trackEvent: mocked.trackEvent,
}));

describe("workshopMapLoaderService", () => {
  beforeEach(() => {
    mocked.join.mockImplementation(async (...parts: string[]) => parts.join("/"));
    mocked.getLocalAppDataPaths.mockResolvedValue({
      appDataRoot: "C:/repo/AppData",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses maps catalog payload and preserves map card data", async () => {
    mocked.invoke.mockResolvedValueOnce({
      source: "remote",
      maps: [
        {
          id: 7,
          name: "Fractals Corridor",
          member_display_name: "fractalrl",
          metadata_path: "maps_files/7/metadata.json",
          banner_path: "maps_files/7/banner.jpg",
          final_file_path: "maps_files/7/Labs_Utopia_P.upk",
          short_description: "1.5x SCALED UP version of Labs corridor",
        },
      ],
    });

    const result = await getWorkshopMapsCatalog("C:/repo/AppData");

    expect(result.ok).toBe(true);
    expect(result.source).toBe("remote");
    expect(result.maps).toHaveLength(1);
    expect(result.maps[0]?.id).toBe(7);
    expect(result.maps[0]?.name).toBe("Fractals Corridor");
    expect(result.maps[0]?.memberDisplayName).toBe("fractalrl");
    expect(result.maps[0]?.shortDescription).toContain("Labs corridor");
  });

  it("falls back to friendly catalog error messages", async () => {
    mocked.invoke.mockRejectedValueOnce(new Error("WORKSHOP_CATALOG_UNAVAILABLE: timeout"));
    const result = await refreshWorkshopMapsCatalog("C:/repo/AppData");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Workshop maps catalog is unavailable. Please try Refresh maps.");
  });

  it("filters maps by map name and author", () => {
    const maps = [
      {
        id: 1,
        name: "Ice Rings",
        memberDisplayName: "Lethamyr",
        metadataPath: "maps_files/1/metadata.json",
        bannerPath: "maps_files/1/banner.jpg",
        finalFilePath: "maps_files/1/Labs_Utopia_P.upk",
        shortDescription: "Map one",
      },
      {
        id: 2,
        name: "Dribble Challenge",
        memberDisplayName: "CustomAuthor",
        metadataPath: "maps_files/2/metadata.json",
        bannerPath: "maps_files/2/banner.jpg",
        finalFilePath: "maps_files/2/Labs_Utopia_P.upk",
        shortDescription: "Map two",
      },
    ];

    expect(filterWorkshopMapsByQuery(maps, "rings")).toHaveLength(1);
    expect(filterWorkshopMapsByQuery(maps, "customauthor")).toHaveLength(1);
    expect(filterWorkshopMapsByQuery(maps, "unknown")).toHaveLength(0);
  });

  it("parses load map response and active map persistence snapshot", async () => {
    mocked.invoke.mockResolvedValueOnce({
      message: "Workshop map loaded.",
      restart_required: false,
      was_existing_mod_replaced: true,
      rocket_league_was_running: true,
      active_map: {
        map_id: 7,
        name: "Fractals Corridor",
        author: "fractalrl",
        banner_path: "maps_files/7/banner.jpg",
        metadata_path: "maps_files/7/metadata.json",
        final_file_path: "maps_files/7/Labs_Utopia_P.upk",
        short_description: "1.5x SCALED UP version of Labs corridor",
        activated_at: "2026-05-11T13:54:00Z",
      },
    });

    const result = await loadWorkshopMap({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
      mapId: 7,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.activeMap.mapId).toBe(7);
    expect(result.activeMap.author).toBe("fractalrl");
    expect(result.restartRequired).toBe(false);
    expect(result.wasExistingModReplaced).toBe(true);
    expect(result.rocketLeagueWasRunning).toBe(true);
    expect(mocked.trackEvent).toHaveBeenCalledWith("workshop_map_loaded", {
      pluginId: "workshop_map_loader",
    });
  });

  it("defaults workshop load restartRequired to true when backend field is missing", async () => {
    mocked.invoke.mockResolvedValueOnce({
      message: "Workshop map loaded.",
      active_map: {
        map_id: 7,
        name: "Fractals Corridor",
        author: "fractalrl",
        banner_path: "maps_files/7/banner.jpg",
        metadata_path: "maps_files/7/metadata.json",
        final_file_path: "maps_files/7/Labs_Utopia_P.upk",
        short_description: "Desc",
        activated_at: "2026-05-11T13:54:00Z",
      },
    });

    const result = await loadWorkshopMap({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
      mapId: 7,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.restartRequired).toBe(true);
      expect(result.wasExistingModReplaced).toBe(false);
      expect(result.rocketLeagueWasRunning).toBe(false);
    }
  });

  it("maps permission and file-in-use failures to friendly messages", async () => {
    mocked.invoke.mockRejectedValueOnce(new Error("WORKSHOP_PERMISSION_DENIED: access denied"));
    const permissionResult = await loadWorkshopMap({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
      mapId: 7,
    });
    expect(permissionResult.ok).toBe(false);
    expect(permissionResult.message).toContain("could not write the workshop map");

    mocked.invoke.mockRejectedValueOnce(new Error("WORKSHOP_FILE_IN_USE: The process cannot access the file because it is being used by another process."));
    const runningResult = await restoreWorkshopOriginalMap({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
    });
    expect(runningResult.ok).toBe(false);
    expect(runningResult.message).toContain("could not remove the map because it is currently in use");
  });

  it("maps load file-in-use failure to hot-swap friendly guidance", async () => {
    mocked.invoke.mockRejectedValueOnce(new Error("WORKSHOP_FILE_IN_USE: The process cannot access the file because it is being used by another process."));
    const result = await loadWorkshopMap({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
      mapId: 7,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe(
      "RLPeak could not replace the map because it is currently in use. Leave the current Free Play map or close Rocket League, then try again.",
    );
  });

  it("returns first-time setup required when mods file does not exist in preflight", async () => {
    mocked.invoke.mockResolvedValueOnce({
      rocket_league_running: true,
      mod_file_exists: false,
      first_time_setup_required: true,
    });

    const result = await getWorkshopLoadPreflight({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
    });

    expect(result.ok).toBe(true);
    expect(result.rocketLeagueRunning).toBe(true);
    expect(result.modFileExists).toBe(false);
    expect(result.firstTimeSetupRequired).toBe(true);
    expect(mocked.invoke).toHaveBeenCalledWith("get_workshop_load_preflight", {
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
    });
  });

  it("returns non-first-time setup when mods file already exists in preflight", async () => {
    mocked.invoke.mockResolvedValueOnce({
      rocket_league_running: false,
      mod_file_exists: true,
      first_time_setup_required: false,
    });

    const result = await getWorkshopLoadPreflight({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
    });

    expect(result.ok).toBe(true);
    expect(result.rocketLeagueRunning).toBe(false);
    expect(result.modFileExists).toBe(true);
    expect(result.firstTimeSetupRequired).toBe(false);
  });

  it("maps preflight failures to friendly user guidance", async () => {
    mocked.invoke.mockRejectedValueOnce(new Error("WORKSHOP_ROCKET_LEAGUE_PATH_MISSING"));

    const result = await getWorkshopLoadPreflight({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Choose your Rocket League folder in Settings");
  });

  it("tracks workshop restore success telemetry", async () => {
    mocked.invoke.mockResolvedValueOnce({
      restored: true,
      message: "Workshop map removed. Restart Rocket League to return to the normal Utopia Retro map.",
    });

    const result = await restoreWorkshopOriginalMap({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
    });

    expect(result.ok).toBe(true);
    expect(mocked.trackEvent).toHaveBeenCalledWith("workshop_map_restored", {
      pluginId: "workshop_map_loader",
    });
  });

  it("keeps workshop success flows intact even if metrics tracking throws", async () => {
    mocked.trackEvent.mockImplementation(() => {
      throw new Error("metrics unavailable");
    });
    mocked.invoke.mockResolvedValueOnce({
      message: "Workshop map loaded.",
      restart_required: true,
      was_existing_mod_replaced: false,
      rocket_league_was_running: false,
      active_map: {
        map_id: 7,
        name: "Fractals Corridor",
        author: "fractalrl",
        banner_path: "maps_files/7/banner.jpg",
        metadata_path: "maps_files/7/metadata.json",
        final_file_path: "maps_files/7/Labs_Utopia_P.upk",
        short_description: "1.5x SCALED UP version of Labs corridor",
        activated_at: "2026-05-11T13:54:00Z",
      },
    });

    const loadResult = await loadWorkshopMap({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
      mapId: 7,
    });
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.restartRequired).toBe(true);
      expect(loadResult.wasExistingModReplaced).toBe(false);
      expect(loadResult.rocketLeagueWasRunning).toBe(false);
    }

    mocked.invoke.mockResolvedValueOnce({
      restored: true,
      message: "Workshop map removed. Restart Rocket League to return to the normal Utopia Retro map.",
    });
    const restoreResult = await restoreWorkshopOriginalMap({
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
    });
    expect(restoreResult.ok).toBe(true);
  });

  it("reads active map status and handles empty state", async () => {
    mocked.invoke.mockResolvedValueOnce({
      active_map: {
        map_id: 187,
        name: "Neon Heights Rings",
        author: "Lethamyr",
        banner_path: "maps_files/187/banner.jpg",
        metadata_path: "maps_files/187/metadata.json",
        final_file_path: "maps_files/187/Labs_Utopia_P.upk",
        short_description: "Neon map",
        activated_at: "2026-05-11T10:00:00Z",
      },
      legacy_backup_detected: true,
      legacy_backup_notice: "Legacy workshop backup detected from older RLPeak builds.",
    });
    const activeResult = await getWorkshopActiveMapStatus("C:/repo/AppData", "C:/Games/rocketleague");
    expect(activeResult.ok).toBe(true);
    expect(activeResult.activeMap?.mapId).toBe(187);
    expect(activeResult.legacyBackupDetected).toBe(true);
    expect(activeResult.legacyBackupNotice).toContain("Legacy workshop backup detected");

    mocked.invoke.mockResolvedValueOnce({
      active_map: null,
      legacy_backup_detected: false,
      legacy_backup_notice: null,
    });
    const emptyResult = await getWorkshopActiveMapStatus("C:/repo/AppData", "C:/Games/rocketleague");
    expect(emptyResult.ok).toBe(true);
    expect(emptyResult.activeMap).toBeNull();
    expect(emptyResult.legacyBackupDetected).toBe(false);
    expect(emptyResult.legacyBackupNotice).toBeNull();
  });

  it("forwards rocket league path when reading active map status", async () => {
    mocked.invoke.mockResolvedValueOnce({
      active_map: null,
    });

    await getWorkshopActiveMapStatus("C:/repo/AppData", "C:/Games/rocketleague");

    expect(mocked.invoke).toHaveBeenCalledWith("get_workshop_active_map_status", {
      appDataRoot: "C:/repo/AppData",
      rocketLeaguePath: "C:/Games/rocketleague",
    });
  });
});
