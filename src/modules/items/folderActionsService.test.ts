import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  getCookedPcConsolePath: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("./rocketLeaguePathService", () => ({
  getCookedPcConsolePath: mocked.getCookedPcConsolePath,
}));

vi.mock("./pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

import { openBackupsFolder, openCookedPcConsoleFolder } from "./folderActionsService";

describe("folderActionsService", () => {
  beforeEach(() => {
    mocked.isTauri.mockReturnValue(true);
    mocked.getCookedPcConsolePath.mockResolvedValue(
      "C:/Program Files/Epic Games/rocketleague/TAGame/CookedPCConsole",
    );
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a clear path-specific error when backups folder is missing", async () => {
    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "open_folder") {
        throw new Error(`FOLDER_MISSING: ${args?.path}`);
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await openBackupsFolder();
    expect(result).toEqual({
      ok: false,
      message: "Folder not found: C:/repo/AppData/Backups",
    });
  });

  it("returns a clear path-specific error when cooked folder is missing", async () => {
    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "open_folder") {
        throw new Error(`FOLDER_MISSING: ${args?.path}`);
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await openCookedPcConsoleFolder("C:/Program Files/Epic Games/rocketleague");
    expect(result).toEqual({
      ok: false,
      message: "Folder not found: C:/Program Files/Epic Games/rocketleague/TAGame/CookedPCConsole",
    });
  });

  it("returns an open failure with the exact path when opener fails", async () => {
    mocked.invoke.mockImplementation(async (command: string) => {
      if (command === "open_folder") {
        throw new Error("OPEN_FAILED: access denied");
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await openCookedPcConsoleFolder("C:/Program Files/Epic Games/rocketleague");
    expect(result).toEqual({
      ok: false,
      message: "Open folder failed: C:/Program Files/Epic Games/rocketleague/TAGame/CookedPCConsole - OPEN_FAILED: access denied",
    });
  });

  it("opens backups folder when it exists", async () => {
    mocked.invoke.mockImplementation(async (command: string) => {
      if (command === "open_folder") {
        return undefined;
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await openBackupsFolder();
    expect(result).toEqual({
      ok: true,
      message: "Folder opened: C:/repo/AppData/Backups",
    });
    expect(mocked.invoke).toHaveBeenCalledWith("open_folder", {
      path: "C:/repo/AppData/Backups",
    });
  });

  it("maps not-directory backend error to a clear UI message", async () => {
    mocked.invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
      if (command === "open_folder") {
        throw new Error(`NOT_DIRECTORY: ${args?.path}`);
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await openBackupsFolder();
    expect(result).toEqual({
      ok: false,
      message: "Not a folder: C:/repo/AppData/Backups",
    });
  });
});
