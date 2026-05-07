import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("./pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

import {
  loadAppState,
  migrateAppState,
  readItemsGuideSeenState,
  saveItemsGuideSeenState,
  saveItemsUiSelectionState,
} from "./stateService";

describe("stateService migration", () => {
  beforeEach(() => {
    mocked.isTauri.mockReturnValue(true);
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

  it("adds missing Boost state and boost selection while preserving existing state", () => {
    const migrated = migrateAppState({
      rocketLeaguePath: "C:/Games/RocketLeague",
      activeItems: {
        Skin: {
          ACE: {
            skin_folder: "skin_ace",
          },
        },
        Wheel: {
          current: {
            wheel_folder: "wheel_ace",
          },
        },
      },
      uiSelections: {
        items: {
          selectedCarKey: "ACE",
          selectedSkinFolder: "skin_ace",
          selectedWheelFolder: "wheel_ace",
        },
      },
    });

    expect(migrated.rocketLeaguePath).toBe("C:/Games/RocketLeague");
    expect(migrated.activeItems?.Skin?.ACE?.skin_folder).toBe("skin_ace");
    expect(migrated.activeItems?.Wheel?.current?.wheel_folder).toBe("wheel_ace");
    expect(migrated.activeItems?.Boost?.current).toBe(null);
    expect(migrated.uiSelections?.items?.selectedBoostFolder).toBe(null);
    expect(migrated.uiState?.itemsGuideSeen).toBe(false);
    expect(migrated.uiSelections?.items?.selectedCarKey).toBe("ACE");
  });

  it("migrates loaded state from disk without resetting Rocket League path", async () => {
    mocked.invoke.mockResolvedValue(
      JSON.stringify({
        rocketLeaguePath: "C:/Program Files/Epic Games/rocketleague",
        activeItems: {
          Wheel: {
            current: {
              wheel_folder: "wheel_10year_SF",
            },
          },
        },
      }),
    );

    const state = await loadAppState();

    expect(state.rocketLeaguePath).toBe("C:/Program Files/Epic Games/rocketleague");
    expect(state.activeItems?.Wheel?.current?.wheel_folder).toBe("wheel_10year_SF");
    expect(state.activeItems?.Boost?.current).toBe(null);
    expect(state.uiSelections?.items?.selectedBoostFolder).toBe(null);
    expect(state.uiState?.itemsGuideSeen).toBe(false);
  });

  it("persists selected car and decal selections when saving items UI state", async () => {
    const writeCalls: Array<{ path: string; contents: string }> = [];

    mocked.invoke.mockImplementation(async (command, payload) => {
      if (command === "read_text_file") {
        return JSON.stringify({
          rocketLeaguePath: "C:/Program Files/Epic Games/rocketleague",
          uiSelections: {
            items: {
              selectedWheelFolder: "wheel_10year_SF",
            },
          },
        });
      }

      if (command === "write_text_file") {
        writeCalls.push({
          path: payload.path as string,
          contents: payload.contents as string,
        });
        return undefined;
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });

    await saveItemsUiSelectionState({
      selectedCarKey: "ACE",
      selectedSkinFolder: "skin_aa_livery1_SF",
    });

    expect(writeCalls).toHaveLength(1);
    const savedState = JSON.parse(writeCalls[0].contents);
    expect(savedState.uiSelections.items.selectedCarKey).toBe("ACE");
    expect(savedState.uiSelections.items.selectedSkinFolder).toBe("skin_aa_livery1_SF");
    expect(savedState.uiSelections.items.selectedWheelFolder).toBe("wheel_10year_SF");
  });

  it("defaults items guide seen to false when uiState is missing", () => {
    const migrated = migrateAppState({
      rocketLeaguePath: "C:/Games/RocketLeague",
    });

    expect(readItemsGuideSeenState(migrated)).toBe(false);
    expect(migrated.uiState?.itemsGuideSeen).toBe(false);
  });

  it("persists items guide seen preference without overwriting existing selections", async () => {
    const writeCalls: Array<{ path: string; contents: string }> = [];

    mocked.invoke.mockImplementation(async (command, payload) => {
      if (command === "read_text_file") {
        return JSON.stringify({
          rocketLeaguePath: "C:/Program Files/Epic Games/rocketleague",
          uiSelections: {
            items: {
              selectedCarKey: "ACE",
            },
          },
          uiState: {
            itemsGuideSeen: false,
          },
        });
      }

      if (command === "write_text_file") {
        writeCalls.push({
          path: payload.path as string,
          contents: payload.contents as string,
        });
        return undefined;
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });

    await saveItemsGuideSeenState(true);

    expect(writeCalls).toHaveLength(1);
    const savedState = JSON.parse(writeCalls[0].contents);
    expect(savedState.uiState.itemsGuideSeen).toBe(true);
    expect(savedState.uiSelections.items.selectedCarKey).toBe("ACE");
  });
});
