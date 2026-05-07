import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoostCatalogItem, SkinCatalogItem, WheelCatalogItem } from "./types";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  join: vi.fn(),
  ensureBackup: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
  ensureRemoteFileCached: vi.fn(),
  ensureRemoteThumbnailCached: vi.fn(),
  isRemoteFileCached: vi.fn(),
  resolveRemoteCacheFilePath: vi.fn(),
  getSharedRemoteManifest: vi.fn(),
  getCookedPcConsolePath: vi.fn(),
  loadAppState: vi.fn(),
  saveAppState: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

vi.mock("./backupService", () => ({
  ensureBackup: mocked.ensureBackup,
}));

vi.mock("./pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

vi.mock("./remoteFileCacheService", () => ({
  ensureRemoteFileCached: mocked.ensureRemoteFileCached,
  ensureRemoteThumbnailCached: mocked.ensureRemoteThumbnailCached,
  isRemoteFileCached: mocked.isRemoteFileCached,
  resolveRemoteCacheFilePath: mocked.resolveRemoteCacheFilePath,
}));

vi.mock("./remoteApiService", () => ({
  getSharedRemoteManifest: mocked.getSharedRemoteManifest,
}));

vi.mock("./rocketLeaguePathService", () => ({
  getCookedPcConsolePath: mocked.getCookedPcConsolePath,
}));

vi.mock("./stateService", () => ({
  loadAppState: mocked.loadAppState,
  saveAppState: mocked.saveAppState,
}));

import { applyBoost, applySkin, applyWheel } from "./itemApplyService";

describe("itemApplyService.applySkin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:34:56.000Z"));

    mocked.join.mockImplementation((...parts: string[]) => parts.join("/"));
    mocked.isTauri.mockReturnValue(true);
    mocked.getLocalAppDataPaths.mockResolvedValue({
      pathMode: "tauri-resolve",
      appDataRoot: "C:/RLHub/AppData",
      catalogsDir: "C:/RLHub/AppData/catalogs",
      skinCatalogPath: "C:/RLHub/AppData/catalogs/output_skins_catalog.json",
      wheelCatalogPath: "C:/RLHub/AppData/catalogs/output_wheels_catalog.json",
      boostCatalogPath: "C:/RLHub/AppData/catalogs/output_boosts_catalog.json",
      itemsRoot: "C:/RLHub/AppData/ItemsFiles",
      itemsSkinDir: "C:/RLHub/AppData/ItemsFiles/Skin",
      itemsWheelDir: "C:/RLHub/AppData/ItemsFiles/Wheel",
      itemsBoostDir: "C:/RLHub/AppData/ItemsFiles/Boost",
      cacheRoot: "C:/RLHub/AppData/cache",
      cacheItemsRoot: "C:/RLHub/AppData/cache/ItemsFiles",
      cacheItemsSkinDir: "C:/RLHub/AppData/cache/ItemsFiles/Skin",
      cacheItemsWheelDir: "C:/RLHub/AppData/cache/ItemsFiles/Wheel",
      cacheItemsBoostDir: "C:/RLHub/AppData/cache/ItemsFiles/Boost",
      backupsRoot: "C:/RLHub/AppData/Backups",
      backupsOriginalsDir: "C:/RLHub/AppData/Backups/originals",
      backupsSkinDir: "C:/RLHub/AppData/Backups/originals/Skin",
      backupsWheelDir: "C:/RLHub/AppData/Backups/originals/Wheel",
      backupsBoostDir: "C:/RLHub/AppData/Backups/originals/Boost",
      stateDir: "C:/RLHub/AppData/state",
      stateFilePath: "C:/RLHub/AppData/state/app_state.json",
    });
    mocked.getCookedPcConsolePath.mockResolvedValue(
      "C:/Games/RocketLeague/TAGame/CookedPCConsole",
    );
    mocked.isRemoteFileCached.mockResolvedValue(false);
    mocked.resolveRemoteCacheFilePath.mockResolvedValue(null);
    mocked.ensureRemoteFileCached.mockResolvedValue({
      ok: true,
      cachePath: "C:/RLHub/AppData/cache/ItemsFiles/Skin/ACE/skin_aa_flames_tierall_SF.upk",
      wasDownloaded: true,
    });
    mocked.ensureRemoteThumbnailCached.mockResolvedValue(null);
    mocked.getSharedRemoteManifest.mockResolvedValue({
      schema: "rlpeak_manifest.v1",
      api_version: "v1",
      base_files_url: "https://api.rlpeak.com/v1/files",
      catalogs: {
        skins: "https://api.rlpeak.com/v1/catalogs/skins.json",
        wheels: "https://api.rlpeak.com/v1/catalogs/wheels.json",
        boosts: "https://api.rlpeak.com/v1/catalogs/boosts.json",
      },
      source: "https://api.rlpeak.com/v1/manifest.json",
    });
    mocked.ensureBackup.mockResolvedValue({
      ok: true,
      created: true,
      message: "Backup created",
    });
    mocked.loadAppState.mockResolvedValue({});
    mocked.saveAppState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("applies a skin successfully when source and destination files exist", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/skin_aa_flames_tierall_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path === sourcePath || args?.path === destinationPath;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
    });

    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath,
      destinationPath,
    });

    expect(mocked.saveAppState).toHaveBeenCalledTimes(1);
    expect(mocked.saveAppState).toHaveBeenCalledWith({
      activeItems: {
        Skin: {
          ACE: {
            skin_folder: "skin_aa_livery1_SF",
            display_name: "Ball Hog",
            base_file: "skin_aa_flames_tierall_SF.upk",
            applied_at: "2026-05-06T12:34:56.000Z",
          },
        },
      },
      lastAction: {
        type: "apply",
        itemType: "Skin",
        displayName: "Ball Hog",
        timestamp: "2026-05-06T12:34:56.000Z",
      },
    });
  });

  it("applies a wheel successfully when source and destination files exist", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Wheel/wheel_10year_SF/WHEEL_Vortex_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/WHEEL_Vortex_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path === sourcePath || args?.path === destinationPath;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const wheel: WheelCatalogItem = {
      wheel_folder: "wheel_10year_SF",
      ingame_wheel_name: "10 Year",
      item_type: "Wheel",
      output_upk_file: "WHEEL_Vortex_SF.upk",
    };

    const result = await applyWheel({
      rocketLeaguePath: "C:/Games/RocketLeague",
      wheel,
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
    });

    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath,
      destinationPath,
    });

    expect(mocked.saveAppState).toHaveBeenCalledTimes(1);
    expect(mocked.saveAppState).toHaveBeenCalledWith({
      activeItems: {
        Wheel: {
          current: {
            wheel_folder: "wheel_10year_SF",
            display_name: "10 Year",
            base_file: "WHEEL_Vortex_SF.upk",
            applied_at: "2026-05-06T12:34:56.000Z",
          },
        },
      },
      lastAction: {
        type: "apply",
        itemType: "Wheel",
        displayName: "10 Year",
        timestamp: "2026-05-06T12:34:56.000Z",
      },
    });
  });

  it("returns missing source file error for skin apply when source file does not exist", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path !== sourcePath;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
    });

    expect(result).toEqual({
      ok: false,
      code: "MissingItemFile",
      message: "Missing item file",
      details: `Source missing: ${sourcePath}`,
    });
    expect(mocked.ensureBackup).not.toHaveBeenCalled();
    expect(mocked.saveAppState).not.toHaveBeenCalled();
    expect(mocked.invoke).not.toHaveBeenCalledWith("copy_file", expect.anything());
  });

  it("returns missing source file error for wheel apply when source file does not exist", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Wheel/wheel_10year_SF/WHEEL_Vortex_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path !== sourcePath;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const wheel: WheelCatalogItem = {
      wheel_folder: "wheel_10year_SF",
      ingame_wheel_name: "10 Year",
      item_type: "Wheel",
      output_upk_file: "WHEEL_Vortex_SF.upk",
    };

    const result = await applyWheel({
      rocketLeaguePath: "C:/Games/RocketLeague",
      wheel,
    });

    expect(result).toEqual({
      ok: false,
      code: "MissingItemFile",
      message: "Missing item file",
      details: `Source missing: ${sourcePath}`,
    });
    expect(mocked.ensureBackup).not.toHaveBeenCalled();
    expect(mocked.saveAppState).not.toHaveBeenCalled();
    expect(mocked.invoke).not.toHaveBeenCalledWith("copy_file", expect.anything());
  });

  it("returns missing destination file error for skin apply when destination file does not exist", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/skin_aa_flames_tierall_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        const path = args?.path;
        if (path === sourcePath) {
          return true;
        }
        if (path === destinationPath) {
          return false;
        }
        return false;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
    });

    expect(result).toEqual({
      ok: false,
      code: "GameFileNotFound",
      message: "Game file not found",
      details: `Destination missing: ${destinationPath}`,
    });
    expect(mocked.ensureBackup).not.toHaveBeenCalled();
    expect(mocked.saveAppState).not.toHaveBeenCalled();
    expect(mocked.invoke).not.toHaveBeenCalledWith("copy_file", expect.anything());
  });

  it("returns missing destination file error for wheel apply when destination file does not exist", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Wheel/wheel_10year_SF/WHEEL_Vortex_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/WHEEL_Vortex_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        const path = args?.path;
        if (path === sourcePath) {
          return true;
        }
        if (path === destinationPath) {
          return false;
        }
        return false;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const wheel: WheelCatalogItem = {
      wheel_folder: "wheel_10year_SF",
      ingame_wheel_name: "10 Year",
      item_type: "Wheel",
      output_upk_file: "WHEEL_Vortex_SF.upk",
    };

    const result = await applyWheel({
      rocketLeaguePath: "C:/Games/RocketLeague",
      wheel,
    });

    expect(result).toEqual({
      ok: false,
      code: "GameFileNotFound",
      message: "Game file not found",
      details: `Destination missing: ${destinationPath}`,
    });
    expect(mocked.ensureBackup).not.toHaveBeenCalled();
    expect(mocked.saveAppState).not.toHaveBeenCalled();
    expect(mocked.invoke).not.toHaveBeenCalledWith("copy_file", expect.anything());
  });

  it("applies skin successfully with a warning when thumbnail source file is missing", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/skin_aa_flames_tierall_SF.upk";
    const thumbnailSourcePath =
      "C:/RLHub/AppData/ItemsFiles/Skin/ACE/_base_thumbnail/skin_aa_flames_tierall_T_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        const path = args?.path;
        if (path === sourcePath || path === destinationPath) {
          return true;
        }
        if (path === thumbnailSourcePath) {
          return false;
        }
        return false;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
      thumbnailFile: "skin_aa_flames_tierall_T_SF.upk",
      thumbnailPath: "ACE/_base_thumbnail/skin_aa_flames_tierall_T_SF.upk",
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
      warnings: ["Thumbnail skipped: Missing item file"],
    });

    expect(mocked.ensureBackup).toHaveBeenCalledTimes(1);
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.saveAppState).toHaveBeenCalledWith({
      activeItems: {
        Skin: {
          ACE: {
            skin_folder: "skin_aa_livery1_SF",
            display_name: "Ball Hog",
            base_file: "skin_aa_flames_tierall_SF.upk",
            applied_at: "2026-05-06T12:34:56.000Z",
          },
        },
      },
      lastAction: {
        type: "apply",
        itemType: "Skin",
        displayName: "Ball Hog",
        timestamp: "2026-05-06T12:34:56.000Z",
      },
    });
  });

  it("applies wheel successfully with a warning when thumbnail source file is missing", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Wheel/wheel_10year_SF/WHEEL_Vortex_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/WHEEL_Vortex_SF.upk";
    const thumbnailSourcePath =
      "C:/RLHub/AppData/ItemsFiles/Wheel/_base_thumbnail/WHEEL_Vortex_T_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        const path = args?.path;
        if (path === sourcePath || path === destinationPath) {
          return true;
        }
        if (path === thumbnailSourcePath) {
          return false;
        }
        return false;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const wheel: WheelCatalogItem = {
      wheel_folder: "wheel_10year_SF",
      ingame_wheel_name: "10 Year",
      item_type: "Wheel",
      output_upk_file: "WHEEL_Vortex_SF.upk",
    };

    const result = await applyWheel({
      rocketLeaguePath: "C:/Games/RocketLeague",
      wheel,
      thumbnailFile: "WHEEL_Vortex_T_SF.upk",
      thumbnailPath: "_base_thumbnail/WHEEL_Vortex_T_SF.upk",
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
      warnings: ["Thumbnail skipped: Missing item file"],
    });

    expect(mocked.ensureBackup).toHaveBeenCalledTimes(1);
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.saveAppState).toHaveBeenCalledWith({
      activeItems: {
        Wheel: {
          current: {
            wheel_folder: "wheel_10year_SF",
            display_name: "10 Year",
            base_file: "WHEEL_Vortex_SF.upk",
            applied_at: "2026-05-06T12:34:56.000Z",
          },
        },
      },
      lastAction: {
        type: "apply",
        itemType: "Wheel",
        displayName: "10 Year",
        timestamp: "2026-05-06T12:34:56.000Z",
      },
    });
  });

  it("returns admin permission required when skin apply copy fails with EPERM", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/skin_aa_flames_tierall_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk";
    const permissionError = "EPERM: operation not permitted, copy_file";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path === sourcePath || args?.path === destinationPath;
      }

      if (command === "copy_file") {
        throw new Error(permissionError);
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
    });

    expect(result).toEqual({
      ok: false,
      code: "ApplyFailed",
      message: "Admin permission required",
      details: permissionError,
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.saveAppState).not.toHaveBeenCalled();
  });

  it("returns admin permission required when wheel apply copy fails with EACCES", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Wheel/wheel_10year_SF/WHEEL_Vortex_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/WHEEL_Vortex_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_SF.upk";
    const permissionError = "EACCES: permission denied, copy_file";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path === sourcePath || args?.path === destinationPath;
      }

      if (command === "copy_file") {
        throw new Error(permissionError);
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const wheel: WheelCatalogItem = {
      wheel_folder: "wheel_10year_SF",
      ingame_wheel_name: "10 Year",
      item_type: "Wheel",
      output_upk_file: "WHEEL_Vortex_SF.upk",
    };

    const result = await applyWheel({
      rocketLeaguePath: "C:/Games/RocketLeague",
      wheel,
    });

    expect(result).toEqual({
      ok: false,
      code: "ApplyFailed",
      message: "Admin permission required",
      details: permissionError,
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.saveAppState).not.toHaveBeenCalled();
  });

  it("applies boost files successfully and backs up each destination once", async () => {
    const boostVisualSource =
      "C:/RLHub/AppData/ItemsFiles/Boost/Boost_AlphaReward/Boost_Standard_SF.upk";
    const boostAudioSource =
      "C:/RLHub/AppData/ItemsFiles/Boost/Boost_AlphaReward/SFX_Boost_Standard.bnk";
    const boostThumbnailSource =
      "C:/RLHub/AppData/ItemsFiles/Boost/_base_thumbnail/Boost_Standard_T_SF.upk";
    const boostVisualDestination =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/Boost_Standard_SF.upk";
    const boostAudioDestination =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/SFX_Boost_Standard.bnk";
    const boostThumbnailDestination =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/Boost_Standard_T_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        const path = args?.path;
        return (
          path === boostVisualSource
          || path === boostAudioSource
          || path === boostThumbnailSource
          || path === boostVisualDestination
          || path === boostAudioDestination
          || path === boostThumbnailDestination
        );
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const boost: BoostCatalogItem = {
      boost_folder: "Boost_AlphaReward",
      ingame_boost_name: "(Alpha Reward) Gold Rush",
      output_files: ["Boost_Standard_SF.upk", "SFX_Boost_Standard.bnk"],
      item_type: "Boost",
    };

    const result = await applyBoost({
      rocketLeaguePath: "C:/Games/RocketLeague",
      boost,
      thumbnailFile: "Boost_Standard_T_SF.upk",
      thumbnailPath: "_base_thumbnail/Boost_Standard_T_SF.upk",
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: boostVisualDestination,
      backupPath: "C:/RLHub/AppData/Backups/originals/Boost/Boost_Standard_SF.upk",
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: boostAudioDestination,
      backupPath: "C:/RLHub/AppData/Backups/originals/Boost/SFX_Boost_Standard.bnk",
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: boostThumbnailDestination,
      backupPath: "C:/RLHub/AppData/Backups/originals/Boost/Boost_Standard_T_SF.upk",
    });

    expect(mocked.saveAppState).toHaveBeenCalledWith({
      activeItems: {
        Boost: {
          current: {
            boost_folder: "Boost_AlphaReward",
            display_name: "(Alpha Reward) Gold Rush",
            base_files: ["Boost_Standard_SF.upk", "SFX_Boost_Standard.bnk"],
            thumbnail_file: "Boost_Standard_T_SF.upk",
            applied_at: "2026-05-06T12:34:56.000Z",
          },
        },
      },
      lastAction: {
        type: "apply",
        itemType: "Boost",
        displayName: "(Alpha Reward) Gold Rush",
        timestamp: "2026-05-06T12:34:56.000Z",
      },
    });
  });

  it("applies boost successfully when thumbnail source is missing and returns a warning", async () => {
    const boostVisualSource =
      "C:/RLHub/AppData/ItemsFiles/Boost/Boost_AlphaReward/Boost_Standard_SF.upk";
    const boostAudioSource =
      "C:/RLHub/AppData/ItemsFiles/Boost/Boost_AlphaReward/SFX_Boost_Standard.bnk";
    const boostThumbnailSource =
      "C:/RLHub/AppData/ItemsFiles/Boost/_base_thumbnail/Boost_Standard_T_SF.upk";
    const boostVisualDestination =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/Boost_Standard_SF.upk";
    const boostAudioDestination =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/SFX_Boost_Standard.bnk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        const path = args?.path;
        if (path === boostThumbnailSource) {
          return false;
        }
        return (
          path === boostVisualSource
          || path === boostAudioSource
          || path === boostVisualDestination
          || path === boostAudioDestination
        );
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const boost: BoostCatalogItem = {
      boost_folder: "Boost_AlphaReward",
      ingame_boost_name: "(Alpha Reward) Gold Rush",
      output_files: ["Boost_Standard_SF.upk", "SFX_Boost_Standard.bnk"],
      item_type: "Boost",
    };

    const result = await applyBoost({
      rocketLeaguePath: "C:/Games/RocketLeague",
      boost,
      thumbnailFile: "Boost_Standard_T_SF.upk",
      thumbnailPath: "_base_thumbnail/Boost_Standard_T_SF.upk",
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
      warnings: ["Thumbnail skipped: Missing item file"],
    });
    expect(mocked.ensureBackup).toHaveBeenCalledTimes(2);
  });

  it("does not block skin apply based on Rocket League process state checks", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/skin_aa_flames_tierall_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path === sourcePath || args?.path === destinationPath;
      }

      if (command === "copy_file") {
        return undefined;
      }

      if (command === "is_process_running" || command === "is_rocket_league_running") {
        return true;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.invoke).not.toHaveBeenCalledWith("is_process_running", expect.anything());
    expect(mocked.invoke).not.toHaveBeenCalledWith("is_rocket_league_running", expect.anything());
  });

  it("does not modify CookedPCConsole when remote file download fails", async () => {
    mocked.isRemoteFileCached.mockResolvedValue(false);
    mocked.ensureRemoteFileCached.mockResolvedValue({
      ok: false,
      message: "Download failed. Please check your connection and try again.",
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
      remote_files: [
        {
          filename: "skin_aa_flames_tierall_SF.upk",
          remote_path: "Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk",
        },
      ],
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
    });

    expect(result).toEqual({
      ok: false,
      code: "ApplyFailed",
      message: "Download failed. Please check your connection and try again.",
      details: undefined,
    });
    expect(mocked.ensureBackup).not.toHaveBeenCalled();
    expect(mocked.invoke).not.toHaveBeenCalledWith("copy_file", expect.anything());
  });

  it("reuses cached remote files and skips download on apply", async () => {
    const cachedSourcePath =
      "C:/RLHub/AppData/cache/ItemsFiles/Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/skin_aa_flames_tierall_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk";

    mocked.isRemoteFileCached.mockResolvedValue(true);
    mocked.resolveRemoteCacheFilePath.mockResolvedValue(cachedSourcePath);
    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path === cachedSourcePath || args?.path === destinationPath;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
      remote_files: [
        {
          filename: "skin_aa_flames_tierall_SF.upk",
          remote_path: "Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk",
        },
      ],
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.ensureRemoteFileCached).not.toHaveBeenCalled();
    expect(mocked.getSharedRemoteManifest).not.toHaveBeenCalled();
  });

  it("applies successfully offline when required remote file is already cached", async () => {
    const cachedSourcePath =
      "C:/RLHub/AppData/cache/ItemsFiles/Wheel/wheel_10year_SF/WHEEL_Vortex_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/WHEEL_Vortex_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_SF.upk";

    mocked.isRemoteFileCached.mockResolvedValue(true);
    mocked.resolveRemoteCacheFilePath.mockResolvedValue(cachedSourcePath);
    mocked.getSharedRemoteManifest.mockRejectedValue(new Error("offline"));
    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path === cachedSourcePath || args?.path === destinationPath;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const wheel: WheelCatalogItem = {
      wheel_folder: "wheel_10year_SF",
      ingame_wheel_name: "10 Year",
      item_type: "Wheel",
      output_upk_file: "WHEEL_Vortex_SF.upk",
      remote_files: [
        {
          filename: "WHEEL_Vortex_SF.upk",
          remote_path: "Wheel/wheel_10year_SF/WHEEL_Vortex_SF.upk",
        },
      ],
    };

    const result = await applyWheel({
      rocketLeaguePath: "C:/Games/RocketLeague",
      wheel,
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
    expect(mocked.ensureRemoteFileCached).not.toHaveBeenCalled();
  });

  it("returns server unavailable for uncached remote file when offline", async () => {
    mocked.isRemoteFileCached.mockResolvedValue(false);
    mocked.getSharedRemoteManifest.mockRejectedValue(new Error("network unreachable"));

    const wheel: WheelCatalogItem = {
      wheel_folder: "wheel_10year_SF",
      ingame_wheel_name: "10 Year",
      item_type: "Wheel",
      output_upk_file: "WHEEL_Vortex_SF.upk",
      remote_files: [
        {
          filename: "WHEEL_Vortex_SF.upk",
          remote_path: "Wheel/wheel_10year_SF/WHEEL_Vortex_SF.upk",
        },
      ],
    };

    const result = await applyWheel({
      rocketLeaguePath: "C:/Games/RocketLeague",
      wheel,
    });

    expect(result).toEqual({
      ok: false,
      code: "ApplyFailed",
      message: "RLPeak servers are unavailable. Please try again later.",
      details: undefined,
    });
    expect(mocked.ensureBackup).not.toHaveBeenCalled();
    expect(mocked.invoke).not.toHaveBeenCalledWith("copy_file", expect.anything());
  });

  it("keeps thumbnail download failures non-blocking for main apply", async () => {
    const sourcePath =
      "C:/RLHub/AppData/ItemsFiles/Skin/ACE/skin_aa_livery1_SF/skin_aa_flames_tierall_SF.upk";
    const destinationPath =
      "C:/Games/RocketLeague/TAGame/CookedPCConsole/skin_aa_flames_tierall_SF.upk";
    const backupPath =
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk";

    mocked.resolveRemoteCacheFilePath.mockResolvedValue(null);
    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return args?.path === sourcePath || args?.path === destinationPath;
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const skin: SkinCatalogItem = {
      car_folder: "ACE",
      skin_folder: "skin_aa_livery1_SF",
      ingame_decal_name: "Ball Hog",
      item_type: "Skin",
      output_upk_file: "skin_aa_flames_tierall_SF.upk",
    };

    const result = await applySkin({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
      skin,
      remoteThumbnail: {
        filename: "skin_aa_flames_tierall_T_SF.upk",
        remote_path: "Skin/ACE/_base_thumbnail/skin_aa_flames_tierall_T_SF.upk",
      },
      thumbnailFile: "skin_aa_flames_tierall_T_SF.upk",
      thumbnailPath: "ACE/_base_thumbnail/skin_aa_flames_tierall_T_SF.upk",
    });

    expect(result).toEqual({
      ok: true,
      message: "Applied successfully",
      warnings: ["Thumbnail skipped: Download failed. Please check your connection and try again."],
    });
    expect(mocked.ensureBackup).toHaveBeenCalledWith({
      sourcePath: destinationPath,
      backupPath,
    });
  });
});
