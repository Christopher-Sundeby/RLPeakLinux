import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import realBoostCatalog from "./__fixtures__/output_boosts_catalog.real.sample.json";
import realWheelCatalog from "./__fixtures__/output_wheels_catalog.real.sample.json";

const mocked = vi.hoisted(() => ({
  isTauri: vi.fn(),
  invoke: vi.fn(),
  join: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocked.isTauri,
  invoke: mocked.invoke,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

vi.mock("./pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

import {
  clearSharedCatalogSnapshot,
  getSharedCatalogSnapshot,
  loadBoostCatalog,
  loadWheelCatalog,
} from "./catalogService";

const remoteManifest = {
  schema: "rlpeak_manifest.v1",
  api_version: "v1",
  base_files_url: "https://api.rlpeak.com/v1/files",
  catalogs: {
    skins: "https://api.rlpeak.com/v1/catalogs/skins.json",
    wheels: "https://api.rlpeak.com/v1/catalogs/wheels.json",
    boosts: "https://api.rlpeak.com/v1/catalogs/boosts.json",
  },
};

const minimalSkinCatalog = {
  cars: {
    ACE: {
      car: "ACE",
      skin_count: 1,
      base_files: ["skin_ace.upk"],
      skins: [
        {
          car_folder: "ACE",
          skin_folder: "skin_ace",
          ingame_decal_name: "Ace Skin",
          item_type: "Skin",
          output_upk_file: "skin_ace.upk",
        },
      ],
    },
  },
};

const minimalWheelCatalog = {
  wheels: [
    {
      wheel_folder: "wheel_a",
      ingame_wheel_name: "Wheel A",
      output_upk_file: "wheel_a.upk",
    },
  ],
};

const minimalBoostCatalog = {
  boosts: [
    {
      boost_folder: "boost_a",
      ingame_boost_name: "Boost A",
      output_files: ["Boost_A.upk", "Boost_A.bnk"],
    },
  ],
};

function configureRemoteFetch(options: {
  skins?: unknown;
  wheels?: unknown;
  boosts?: unknown;
  manifest?: unknown;
} = {}): void {
  const manifestPayload = options.manifest ?? remoteManifest;
  const skinPayload = options.skins ?? minimalSkinCatalog;
  const wheelPayload = options.wheels ?? minimalWheelCatalog;
  const boostPayload = options.boosts ?? minimalBoostCatalog;

  vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
    const source = String(input);
    if (source === "https://api.rlpeak.com/v1/manifest.json") {
      return {
        ok: true,
        json: async () => manifestPayload,
      } as Response;
    }

    if (source === "https://api.rlpeak.com/v1/catalogs/skins.json") {
      return {
        ok: true,
        json: async () => skinPayload,
      } as Response;
    }

    if (source === "https://api.rlpeak.com/v1/catalogs/wheels.json") {
      return {
        ok: true,
        json: async () => wheelPayload,
      } as Response;
    }

    if (source === "https://api.rlpeak.com/v1/catalogs/boosts.json") {
      return {
        ok: true,
        json: async () => boostPayload,
      } as Response;
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response;
  });
}

describe("catalogService", () => {
  beforeEach(() => {
    mocked.isTauri.mockReturnValue(true);
    mocked.join.mockImplementation(async (...parts: string[]) => parts.join("/"));
    mocked.invoke.mockImplementation(async (command: string, args?: { path?: string; contents?: string }) => {
      if (command === "read_text_file") {
        throw new Error(`FILE_NOT_FOUND: ${args?.path ?? ""}`);
      }
      if (command === "write_text_file") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    mocked.getLocalAppDataPaths.mockResolvedValue({
      pathMode: "tauri-repo-root-appdata",
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
      cachePluginsRoot: "C:/RLHub/AppData/cache/Plugins",
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

    vi.stubGlobal("fetch", vi.fn());
    clearSharedCatalogSnapshot();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearSharedCatalogSnapshot();
  });

  it("loads the real wheel catalog file and accepts Wheels item_type values", async () => {
    configureRemoteFetch({
      wheels: realWheelCatalog,
    });

    const result = await loadWheelCatalog();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.schema).toBe(realWheelCatalog.schema);
    expect(result.data.total_wheels).toBe(realWheelCatalog.total_wheels);
    expect(result.data.wheels.length).toBe(realWheelCatalog.wheels.length);
    expect(result.data.base_files).toEqual(realWheelCatalog.base_files);
    expect(result.data.base_thumbnail).toBe(realWheelCatalog.base_thumbnail);
    expect(result.data.base_thumbnail_path).toBe(realWheelCatalog.base_thumbnail_path);
    expect(result.data.wheels.some((entry) => entry.item_type === "Wheels")).toBe(true);
    expect(
      result.data.wheels.every((entry) => entry.item_type === "Wheel" || entry.item_type === "Wheels"),
    ).toBe(true);
  });

  it("derives wheel base_files and defaults wheel item_type/base thumbnail fields when optional fields are missing", async () => {
    const payload = {
      wheels: [
        {
          wheel_folder: "wheel_a",
          ingame_wheel_name: "Wheel A",
          output_upk_file: "WHEEL_A.upk",
        },
        {
          wheel_folder: "wheel_b",
          ingame_wheel_name: "Wheel B",
          item_type: "Wheel",
          output_upk_file: "WHEEL_B.upk",
        },
        {
          wheel_folder: "wheel_c",
          ingame_wheel_name: "Wheel C",
          item_type: "",
          output_upk_file: "WHEEL_A.upk",
        },
      ],
    };

    configureRemoteFetch({
      wheels: payload,
    });

    const result = await loadWheelCatalog();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.base_files).toEqual(["WHEEL_A.upk", "WHEEL_B.upk"]);
    expect(result.data.base_thumbnail).toBe("");
    expect(result.data.base_thumbnail_path).toBe("");
    expect(result.data.wheels[0]?.item_type).toBe("Wheels");
    expect(result.data.wheels[1]?.item_type).toBe("Wheel");
    expect(result.data.wheels[2]?.item_type).toBe("Wheels");
  });

  it("loads the real boost catalog file", async () => {
    configureRemoteFetch({
      boosts: realBoostCatalog,
    });

    const result = await loadBoostCatalog();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.schema).toBe(realBoostCatalog.schema);
    expect(result.data.total_boosts).toBe(1);
    expect(result.data.base_files).toEqual(["Boost_Standard_SF.upk", "SFX_Boost_Standard.bnk"]);
    expect(result.data.base_thumbnail).toBe("Boost_Standard_T_SF.upk");
    expect(result.data.base_thumbnail_path).toBe("_base_thumbnail/Boost_Standard_T_SF.upk");
    expect(result.data.boosts[0]?.boost_folder).toBe("Boost_AlphaReward");
    expect(result.data.boosts[0]?.output_files).toEqual(["Boost_Standard_SF.upk", "SFX_Boost_Standard.bnk"]);
  });

  it("derives boost output_files and base_files when optional fields are missing", async () => {
    const payload = {
      boosts: [
        {
          boost_folder: "boost_a",
          ingame_boost_name: "Boost A",
          output_visual_upk_file: "Boost_A.upk",
          output_audio_bnk_file: "Boost_A.bnk",
        },
        {
          boost_folder: "boost_b",
          ingame_boost_name: "Boost B",
          output_files: ["Boost_B.upk", "SFX_Boost_B.bnk"],
        },
      ],
    };

    configureRemoteFetch({
      boosts: payload,
    });

    const result = await loadBoostCatalog();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.base_files).toEqual(["Boost_A.upk", "Boost_A.bnk", "Boost_B.upk", "SFX_Boost_B.bnk"]);
    expect(result.data.base_thumbnail).toBe("");
    expect(result.data.base_thumbnail_path).toBe("");
    expect(result.data.boosts[0]?.output_files).toEqual(["Boost_A.upk", "Boost_A.bnk"]);
    expect(result.data.boosts[1]?.output_files).toEqual(["Boost_B.upk", "SFX_Boost_B.bnk"]);
  });

  it("caches shared catalog snapshot and reloads only when forced", async () => {
    const fetchMock = vi.mocked(fetch);
    configureRemoteFetch({
      skins: minimalSkinCatalog,
      wheels: minimalWheelCatalog,
      boosts: minimalBoostCatalog,
    });

    const first = await getSharedCatalogSnapshot();
    const second = await getSharedCatalogSnapshot();
    const forced = await getSharedCatalogSnapshot({ forceReload: true });

    expect(first.snapshot.skin.ok).toBe(true);
    expect(second.snapshot.wheel.ok).toBe(true);
    expect(forced.snapshot.boost.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("falls back to cached catalog JSON when remote fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    mocked.invoke.mockImplementation(async (command: string, args?: { path?: string; contents?: string }) => {
      if (command === "read_text_file") {
        if (args?.path === "C:/RLHub/AppData/catalogs/output_wheels_catalog.json") {
          return JSON.stringify(realWheelCatalog);
        }
        throw new Error(`FILE_NOT_FOUND: ${args?.path ?? ""}`);
      }
      if (command === "write_text_file") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await loadWheelCatalog();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.source).toBe("C:/RLHub/AppData/catalogs/output_wheels_catalog.json");
    expect(result.data.total_wheels).toBe(realWheelCatalog.total_wheels);
  });
});



