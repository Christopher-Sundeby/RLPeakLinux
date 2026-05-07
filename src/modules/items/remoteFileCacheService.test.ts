import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalAppDataPaths } from "./pathService";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  join: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

import { ensureRemoteFileCached, resolveRemoteCacheFilePath } from "./remoteFileCacheService";

function createPaths(): LocalAppDataPaths {
  return {
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
  };
}

const manifest = {
  schema: "rlpeak_manifest.v1",
  api_version: "v1",
  base_files_url: "https://api.rlpeak.com/v1/files",
  catalogs: {
    skins: "https://api.rlpeak.com/v1/catalogs/skins.json",
    wheels: "https://api.rlpeak.com/v1/catalogs/wheels.json",
    boosts: "https://api.rlpeak.com/v1/catalogs/boosts.json",
  },
  source: "https://api.rlpeak.com/v1/manifest.json",
};

describe("remoteFileCacheService", () => {
  beforeEach(() => {
    mocked.isTauri.mockReturnValue(true);
    mocked.join.mockImplementation(async (...parts: string[]) => parts.join("/"));
    mocked.invoke.mockImplementation(async (command: string) => {
      if (command === "path_exists") {
        return false;
      }
      if (command === "download_remote_file") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("constructs cache file paths from remote_path under AppData/cache/ItemsFiles", async () => {
    const cachePath = await resolveRemoteCacheFilePath({
      paths: createPaths(),
      remoteFile: {
        filename: "Boost_Standard_SF.upk",
        remote_path: "Boost/Boost_AlphaReward/Boost_Standard_SF.upk",
      },
    });

    expect(cachePath).toBe("C:/repo/AppData/cache/ItemsFiles/Boost/Boost_AlphaReward/Boost_Standard_SF.upk");
  });

  it("reuses a cached file without downloading again", async () => {
    const destination = "C:/repo/AppData/cache/ItemsFiles/Boost/Boost_AlphaReward/Boost_Standard_SF.upk";
    mocked.invoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === "path_exists") {
        return args?.path === destination;
      }
      if (command === "download_remote_file") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await ensureRemoteFileCached({
      paths: createPaths(),
      manifest,
      remoteFile: {
        filename: "Boost_Standard_SF.upk",
        remote_path: "Boost/Boost_AlphaReward/Boost_Standard_SF.upk",
      },
    });

    expect(result).toEqual({
      ok: true,
      cachePath: destination,
      wasDownloaded: false,
    });
    expect(mocked.invoke).not.toHaveBeenCalledWith("download_remote_file", expect.anything());
  });

  it("downloads missing files and then returns cached path", async () => {
    const destination = "C:/repo/AppData/cache/ItemsFiles/Boost/Boost_AlphaReward/Boost_Standard_SF.upk";
    let exists = false;
    mocked.invoke.mockImplementation(async (command: string, args?: { path?: string; url?: string; destinationPath?: string }) => {
      if (command === "path_exists") {
        return args?.path === destination ? exists : false;
      }
      if (command === "download_remote_file") {
        exists = true;
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await ensureRemoteFileCached({
      paths: createPaths(),
      manifest,
      remoteFile: {
        filename: "Boost_Standard_SF.upk",
        remote_path: "Boost/Boost_AlphaReward/Boost_Standard_SF.upk",
      },
    });

    expect(result).toEqual({
      ok: true,
      cachePath: destination,
      wasDownloaded: true,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("download_remote_file", {
      url: "https://api.rlpeak.com/v1/files/Boost/Boost_AlphaReward/Boost_Standard_SF.upk",
      destinationPath: destination,
    });
  });

  it("returns user-friendly error for invalid or unsupported remote paths", async () => {
    const result = await ensureRemoteFileCached({
      paths: createPaths(),
      manifest,
      remoteFile: {
        filename: "Boost_Standard_SF.upk",
        remote_path: "../Boost_Standard_SF.upk",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toBe("Download failed. Please check your connection and try again.");
  });

  it("maps disallowed remote URL failures to server unavailable message", async () => {
    const result = await ensureRemoteFileCached({
      paths: createPaths(),
      manifest: {
        ...manifest,
        base_files_url: "https://example.com/v1/files",
      },
      remoteFile: {
        filename: "Boost_Standard_SF.upk",
        remote_path: "Boost/Boost_AlphaReward/Boost_Standard_SF.upk",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toBe("RLPeak servers are unavailable. Please try again later.");
  });
});
