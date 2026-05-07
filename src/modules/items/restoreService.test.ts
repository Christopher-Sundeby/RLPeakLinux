import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  join: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
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

vi.mock("./pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

vi.mock("./rocketLeaguePathService", () => ({
  getCookedPcConsolePath: mocked.getCookedPcConsolePath,
}));

vi.mock("./stateService", () => ({
  loadAppState: mocked.loadAppState,
  saveAppState: mocked.saveAppState,
}));

import { resetAll, resetBoost, resetSelectedCar, resetWheels } from "./restoreService";

describe("restoreService.resetSelectedCar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T14:20:30.000Z"));

    mocked.isTauri.mockReturnValue(true);
    mocked.join.mockImplementation((...parts: string[]) => parts.join("/"));
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
    mocked.loadAppState.mockResolvedValue({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: {
        Skin: {
          ACE: {
            skin_folder: "skin_aa_livery1_SF",
            display_name: "Ball Hog",
          },
          OCT: {
            skin_folder: "skin_bb_livery2_SF",
            display_name: "Octane Killer",
          },
        },
        Wheel: {
          current: {
            wheel_folder: "wheel_10year_SF",
            display_name: "10 Year",
          },
        },
      },
      uiSelections: {
        items: {
          selectedCarKey: "ACE",
          selectedSkinFolder: "skin_aa_livery1_SF",
          selectedWheelFolder: "wheel_10year_SF",
        },
      },
    });
    mocked.saveAppState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("restores backup files for a selected car and clears that car's active skin state", async () => {
    const backupDirectoryPath = "C:/RLHub/AppData/Backups/originals/Skin/ACE";
    const cookedPcConsolePath = "C:/Games/RocketLeague/TAGame/CookedPCConsole";
    const backupFiles = [
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk",
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_T_SF.upk",
    ];
    const destinationMain = `${cookedPcConsolePath}/skin_aa_flames_tierall_SF.upk`;
    const destinationThumbnail = `${cookedPcConsolePath}/skin_aa_flames_tierall_T_SF.upk`;

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return (
          args?.path === backupDirectoryPath ||
          args?.path === destinationMain ||
          args?.path === destinationThumbnail
        );
      }

      if (command === "list_files_in_directory") {
        return args?.path === backupDirectoryPath ? backupFiles : [];
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await resetSelectedCar({
      rocketLeaguePath: "C:/Games/RocketLeague",
      carKey: "ACE",
    });

    expect(result).toEqual({
      ok: true,
      message: "Restored successfully",
    });

    expect(mocked.invoke).toHaveBeenCalledWith("list_files_in_directory", {
      path: backupDirectoryPath,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[0],
      destinationPath: destinationMain,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[1],
      destinationPath: destinationThumbnail,
    });

    expect(mocked.saveAppState).toHaveBeenCalledTimes(1);
    expect(mocked.saveAppState).toHaveBeenCalledWith({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: {
        Skin: {
          OCT: {
            skin_folder: "skin_bb_livery2_SF",
            display_name: "Octane Killer",
          },
        },
        Wheel: {
          current: {
            wheel_folder: "wheel_10year_SF",
            display_name: "10 Year",
          },
        },
      },
      uiSelections: {
        items: {
          selectedCarKey: "ACE",
          selectedSkinFolder: "skin_aa_livery1_SF",
          selectedWheelFolder: "wheel_10year_SF",
        },
      },
      lastAction: {
        type: "restore",
        itemType: "Skin",
        displayName: "ACE",
        timestamp: "2026-05-06T14:20:30.000Z",
      },
    });
  });
});

describe("restoreService.resetWheels", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T15:10:20.000Z"));

    mocked.isTauri.mockReturnValue(true);
    mocked.join.mockImplementation((...parts: string[]) => parts.join("/"));
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
    mocked.loadAppState.mockResolvedValue({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: {
        Skin: {
          ACE: {
            skin_folder: "skin_aa_livery1_SF",
            display_name: "Ball Hog",
          },
        },
        Wheel: {
          current: {
            wheel_folder: "wheel_10year_SF",
            display_name: "10 Year",
          },
        },
      },
      uiSelections: {
        items: {
          selectedCarKey: "ACE",
          selectedSkinFolder: "skin_aa_livery1_SF",
          selectedWheelFolder: "wheel_10year_SF",
        },
      },
    });
    mocked.saveAppState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("restores wheel backups and clears active wheel state", async () => {
    const backupDirectoryPath = "C:/RLHub/AppData/Backups/originals/Wheel";
    const cookedPcConsolePath = "C:/Games/RocketLeague/TAGame/CookedPCConsole";
    const backupFiles = [
      "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_SF.upk",
      "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_T_SF.upk",
    ];
    const destinationMain = `${cookedPcConsolePath}/WHEEL_Vortex_SF.upk`;
    const destinationThumbnail = `${cookedPcConsolePath}/WHEEL_Vortex_T_SF.upk`;

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return (
          args?.path === backupDirectoryPath ||
          args?.path === destinationMain ||
          args?.path === destinationThumbnail
        );
      }

      if (command === "list_files_in_directory") {
        return args?.path === backupDirectoryPath ? backupFiles : [];
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await resetWheels({
      rocketLeaguePath: "C:/Games/RocketLeague",
    });

    expect(result).toEqual({
      ok: true,
      message: "Restored successfully",
    });

    expect(mocked.invoke).toHaveBeenCalledWith("list_files_in_directory", {
      path: backupDirectoryPath,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[0],
      destinationPath: destinationMain,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[1],
      destinationPath: destinationThumbnail,
    });

    expect(mocked.saveAppState).toHaveBeenCalledTimes(1);
    expect(mocked.saveAppState).toHaveBeenCalledWith({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: {
        Skin: {
          ACE: {
            skin_folder: "skin_aa_livery1_SF",
            display_name: "Ball Hog",
          },
        },
        Wheel: undefined,
      },
      uiSelections: {
        items: {
          selectedCarKey: "ACE",
          selectedSkinFolder: "skin_aa_livery1_SF",
          selectedWheelFolder: "wheel_10year_SF",
        },
      },
      lastAction: {
        type: "restore",
        itemType: "Wheel",
        displayName: "Wheels",
        timestamp: "2026-05-06T15:10:20.000Z",
      },
    });
  });
});

describe("restoreService.resetBoost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T15:25:00.000Z"));

    mocked.isTauri.mockReturnValue(true);
    mocked.join.mockImplementation((...parts: string[]) => parts.join("/"));
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
    mocked.loadAppState.mockResolvedValue({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: {
        Boost: {
          current: {
            boost_folder: "Boost_AlphaReward",
            display_name: "(Alpha Reward) Gold Rush",
          },
        },
      },
    });
    mocked.saveAppState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("restores boost backups and clears active boost state", async () => {
    const backupDirectoryPath = "C:/RLHub/AppData/Backups/originals/Boost";
    const cookedPcConsolePath = "C:/Games/RocketLeague/TAGame/CookedPCConsole";
    const backupFiles = [
      "C:/RLHub/AppData/Backups/originals/Boost/Boost_Standard_SF.upk",
      "C:/RLHub/AppData/Backups/originals/Boost/SFX_Boost_Standard.bnk",
      "C:/RLHub/AppData/Backups/originals/Boost/Boost_Standard_T_SF.upk",
    ];
    const destinationVisual = `${cookedPcConsolePath}/Boost_Standard_SF.upk`;
    const destinationAudio = `${cookedPcConsolePath}/SFX_Boost_Standard.bnk`;
    const destinationThumbnail = `${cookedPcConsolePath}/Boost_Standard_T_SF.upk`;

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "path_exists") {
        return (
          args?.path === backupDirectoryPath
          || args?.path === destinationVisual
          || args?.path === destinationAudio
          || args?.path === destinationThumbnail
        );
      }

      if (command === "list_files_in_directory") {
        return args?.path === backupDirectoryPath ? backupFiles : [];
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await resetBoost({
      rocketLeaguePath: "C:/Games/RocketLeague",
    });

    expect(result).toEqual({
      ok: true,
      message: "Restored successfully",
    });

    expect(mocked.invoke).toHaveBeenCalledWith("list_files_in_directory", {
      path: backupDirectoryPath,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[0],
      destinationPath: destinationVisual,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[1],
      destinationPath: destinationAudio,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[2],
      destinationPath: destinationThumbnail,
    });
    expect(mocked.saveAppState).toHaveBeenCalledWith({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: undefined,
      lastAction: {
        type: "restore",
        itemType: "Boost",
        displayName: "Boost",
        timestamp: "2026-05-06T15:25:00.000Z",
      },
    });
  });
});

describe("restoreService.resetAll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T15:40:50.000Z"));

    mocked.isTauri.mockReturnValue(true);
    mocked.join.mockImplementation((...parts: string[]) => parts.join("/"));
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
    mocked.loadAppState.mockResolvedValue({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: {
        Skin: {
          ACE: {
            skin_folder: "skin_aa_livery1_SF",
            display_name: "Ball Hog",
          },
        },
        Wheel: {
          current: {
            wheel_folder: "wheel_10year_SF",
            display_name: "10 Year",
          },
        },
      },
      uiSelections: {
        items: {
          selectedCarKey: "ACE",
          selectedSkinFolder: "skin_aa_livery1_SF",
          selectedWheelFolder: "wheel_10year_SF",
        },
      },
    });
    mocked.saveAppState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("restores all backups recursively and clears all active item state", async () => {
    const backupsOriginalsDir = "C:/RLHub/AppData/Backups/originals";
    const cookedPcConsolePath = "C:/Games/RocketLeague/TAGame/CookedPCConsole";
    const backupFiles = [
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_SF.upk",
      "C:/RLHub/AppData/Backups/originals/Skin/ACE/skin_aa_flames_tierall_T_SF.upk",
      "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_SF.upk",
      "C:/RLHub/AppData/Backups/originals/Boost/Boost_Standard_SF.upk",
      "C:/RLHub/AppData/Backups/originals/Boost/SFX_Boost_Standard.bnk",
    ];
    const destinationSkin = `${cookedPcConsolePath}/skin_aa_flames_tierall_SF.upk`;
    const destinationSkinThumbnail = `${cookedPcConsolePath}/skin_aa_flames_tierall_T_SF.upk`;
    const destinationWheel = `${cookedPcConsolePath}/WHEEL_Vortex_SF.upk`;
    const destinationBoostVisual = `${cookedPcConsolePath}/Boost_Standard_SF.upk`;
    const destinationBoostAudio = `${cookedPcConsolePath}/SFX_Boost_Standard.bnk`;

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "list_files_recursive") {
        return args?.path === backupsOriginalsDir ? backupFiles : [];
      }

      if (command === "path_exists") {
        return (
          args?.path === destinationSkin ||
          args?.path === destinationSkinThumbnail ||
          args?.path === destinationWheel ||
          args?.path === destinationBoostVisual ||
          args?.path === destinationBoostAudio
        );
      }

      if (command === "copy_file") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await resetAll({
      rocketLeaguePath: "C:/Games/RocketLeague",
    });

    expect(result).toEqual({
      ok: true,
      message: "Restored successfully",
    });

    expect(mocked.invoke).toHaveBeenCalledWith("list_files_recursive", {
      path: backupsOriginalsDir,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[0],
      destinationPath: destinationSkin,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[1],
      destinationPath: destinationSkinThumbnail,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[2],
      destinationPath: destinationWheel,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[3],
      destinationPath: destinationBoostVisual,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("copy_file", {
      sourcePath: backupFiles[4],
      destinationPath: destinationBoostAudio,
    });
    expect(mocked.invoke).not.toHaveBeenCalledWith("is_process_running", expect.anything());
    expect(mocked.invoke).not.toHaveBeenCalledWith("is_rocket_league_running", expect.anything());

    expect(mocked.saveAppState).toHaveBeenCalledTimes(1);
    expect(mocked.saveAppState).toHaveBeenCalledWith({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: undefined,
      uiSelections: {
        items: {
          selectedCarKey: "ACE",
          selectedSkinFolder: "skin_aa_livery1_SF",
          selectedWheelFolder: "wheel_10year_SF",
        },
      },
      lastAction: {
        type: "restore",
        itemType: "All",
        displayName: "All",
        timestamp: "2026-05-06T15:40:50.000Z",
      },
    });
  });

  it("returns admin permission required when reset all copy fails with EACCES", async () => {
    const backupsOriginalsDir = "C:/RLHub/AppData/Backups/originals";
    const cookedPcConsolePath = "C:/Games/RocketLeague/TAGame/CookedPCConsole";
    const backupFile = "C:/RLHub/AppData/Backups/originals/Wheel/WHEEL_Vortex_SF.upk";
    const destinationWheel = `${cookedPcConsolePath}/WHEEL_Vortex_SF.upk`;
    const permissionError = "EACCES: permission denied while restoring";

    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "list_files_recursive") {
        return args?.path === backupsOriginalsDir ? [backupFile] : [];
      }

      if (command === "path_exists") {
        return args?.path === destinationWheel;
      }

      if (command === "copy_file") {
        throw new Error(permissionError);
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await resetAll({
      rocketLeaguePath: "C:/Games/RocketLeague",
    });

    expect(result).toEqual({
      ok: false,
      code: "RestoreFailed",
      message: "Admin permission required",
      details: permissionError,
    });
    expect(mocked.saveAppState).not.toHaveBeenCalled();
  });
});
