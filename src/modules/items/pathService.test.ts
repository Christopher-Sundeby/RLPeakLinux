import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  join: vi.fn(),
  resolve: vi.fn(),
  resourceDir: vi.fn(),
  resolveResource: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
  resolve: mocked.resolve,
  resourceDir: mocked.resourceDir,
  resolveResource: mocked.resolveResource,
}));

import { getAppDataStructureStatus, getLocalAppDataPaths } from "./pathService";

function setExistingPaths(existingPaths: string[]): void {
  const existing = new Set(existingPaths);
  mocked.invoke.mockImplementation(async (command: string, args?: { path?: string }) => {
    if (command === "path_exists") {
      return existing.has(args?.path ?? "");
    }

    throw new Error(`Unexpected command: ${command}`);
  });
}

function setResolveBehavior(cwdResolvedAppData: string): void {
  mocked.resolve.mockImplementation(async (pathValue: string) => {
    if (pathValue === "AppData") {
      return cwdResolvedAppData;
    }

    return pathValue;
  });
}

describe("pathService.getLocalAppDataPaths", () => {
  beforeEach(() => {
    mocked.join.mockImplementation(async (...parts: string[]) => parts.join("/"));
    setResolveBehavior("C:/repo/AppData");
    mocked.resourceDir.mockResolvedValue("C:/Program Files/RLHub");
    mocked.resolveResource.mockRejectedValue(new Error("resource not configured"));
    mocked.isTauri.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns relative fallback paths when not running in Tauri", async () => {
    mocked.isTauri.mockReturnValue(false);

    const paths = await getLocalAppDataPaths();

    expect(paths.pathMode).toBe("relative-fallback");
    expect(paths.appDataRoot).toBe("AppData");
    expect(paths.skinCatalogPath).toBe("AppData/catalogs/output_skins_catalog.json");
    expect(paths.wheelCatalogPath).toBe("AppData/catalogs/output_wheels_catalog.json");
    expect(paths.boostCatalogPath).toBe("AppData/catalogs/output_boosts_catalog.json");
    expect(paths.itemsSkinDir).toBe("AppData/ItemsFiles/Skin");
    expect(paths.itemsWheelDir).toBe("AppData/ItemsFiles/Wheel");
    expect(paths.itemsBoostDir).toBe("AppData/ItemsFiles/Boost");
    expect(paths.backupsBoostDir).toBe("AppData/Backups/originals/Boost");
  });

  it("prefers cwd AppData when that root is usable", async () => {
    setResolveBehavior("C:/repo/AppData");
    setExistingPaths([
      "C:/repo/AppData",
      "C:/repo/AppData/catalogs",
      "C:/repo/AppData/ItemsFiles",
      "C:/repo/AppData/Backups",
      "C:/repo/AppData/state",
    ]);

    const paths = await getLocalAppDataPaths();

    expect(paths.pathMode).toBe("tauri-cwd-appdata");
    expect(paths.appDataRoot).toBe("C:/repo/AppData");
    expect(paths.backupsOriginalsDir).toBe("C:/repo/AppData/Backups/originals");
    expect(paths.stateFilePath).toBe("C:/repo/AppData/state/app_state.json");
  });

  it("prefers repo-root AppData over src-tauri/AppData in dev-style resolution", async () => {
    setResolveBehavior("C:/workspace/RLPeak/src-tauri/AppData");
    setExistingPaths([
      "C:/workspace/RLPeak/AppData",
      "C:/workspace/RLPeak/AppData/catalogs",
      "C:/workspace/RLPeak/AppData/ItemsFiles",
      "C:/workspace/RLPeak/AppData/Backups",
      "C:/workspace/RLPeak/AppData/state",
      "C:/workspace/RLPeak/src-tauri/AppData",
      "C:/workspace/RLPeak/src-tauri/AppData/catalogs",
      "C:/workspace/RLPeak/src-tauri/AppData/ItemsFiles",
      "C:/workspace/RLPeak/src-tauri/AppData/Backups",
      "C:/workspace/RLPeak/src-tauri/AppData/state",
    ]);

    const paths = await getLocalAppDataPaths();

    expect(paths.pathMode).toBe("tauri-repo-root-appdata");
    expect(paths.appDataRoot).toBe("C:/workspace/RLPeak/AppData");
    expect(paths.stateFilePath).toBe("C:/workspace/RLPeak/AppData/state/app_state.json");
  });

  it("never resolves mutable state inside src-tauri/AppData", async () => {
    setResolveBehavior("C:/workspace/RLPeak/src-tauri/AppData");
    setExistingPaths([
      "C:/workspace/RLPeak/src-tauri/AppData",
      "C:/workspace/RLPeak/src-tauri/AppData/catalogs",
      "C:/workspace/RLPeak/src-tauri/AppData/ItemsFiles",
      "C:/workspace/RLPeak/src-tauri/AppData/Backups",
      "C:/workspace/RLPeak/src-tauri/AppData/state",
    ]);

    const paths = await getLocalAppDataPaths();

    expect(paths.appDataRoot.toLowerCase()).not.toContain("/src-tauri/appdata");
    expect(paths.stateFilePath.toLowerCase()).not.toContain("/src-tauri/appdata/state");
    expect(paths.pathMode).toBe("tauri-repo-root-appdata");
  });

  it("falls back to executable-adjacent AppData when cwd AppData is not usable", async () => {
    setResolveBehavior("C:/repo/AppData");
    setExistingPaths([
      "C:/Program Files/RLHub/AppData",
      "C:/Program Files/RLHub/AppData/catalogs",
      "C:/Program Files/RLHub/AppData/ItemsFiles",
      "C:/Program Files/RLHub/AppData/Backups",
      "C:/Program Files/RLHub/AppData/state",
    ]);

    const paths = await getLocalAppDataPaths();

    expect(paths.pathMode).toBe("tauri-executable-appdata");
    expect(paths.appDataRoot).toBe("C:/Program Files/RLHub/AppData");
    expect(paths.catalogsDir).toBe("C:/Program Files/RLHub/AppData/catalogs");
  });

  it("uses bundled resource AppData when cwd and executable candidates are unavailable", async () => {
    setResolveBehavior("C:/repo/AppData");
    mocked.resolveResource.mockResolvedValue("C:/bundle/AppData");
    setExistingPaths([
      "C:/bundle/AppData",
      "C:/bundle/AppData/catalogs",
      "C:/bundle/AppData/ItemsFiles",
      "C:/bundle/AppData/Backups",
      "C:/bundle/AppData/state",
    ]);

    const paths = await getLocalAppDataPaths();

    expect(paths.pathMode).toBe("tauri-bundled-resource-appdata");
    expect(paths.appDataRoot).toBe("C:/bundle/AppData");
    expect(paths.itemsRoot).toBe("C:/bundle/AppData/ItemsFiles");
  });

  it("reports a clear invalid AppData structure when root and folders are missing", async () => {
    setResolveBehavior("C:/repo/AppData");
    setExistingPaths([]);

    const status = await getAppDataStructureStatus();

    expect(status.isValid).toBe(false);
    expect(status.appDataRootExists).toBe(false);
    expect(status.catalogsExists).toBe(false);
    expect(status.itemsFilesExists).toBe(false);
    expect(status.backupsExists).toBe(false);
    expect(status.stateExists).toBe(false);
    expect(status.messages).toContain("AppData folder not found: C:/repo/AppData");
    expect(status.messages).toContain("Missing catalogs folder: C:/repo/AppData/catalogs");
    expect(status.messages).toContain("Missing Backups folder: C:/repo/AppData/Backups");
    expect(status.messages).toContain("Missing state folder: C:/repo/AppData/state");
  });

  it("reports valid AppData structure when all required folders exist", async () => {
    setResolveBehavior("C:/repo/AppData");
    setExistingPaths([
      "C:/repo/AppData",
      "C:/repo/AppData/catalogs",
      "C:/repo/AppData/ItemsFiles",
      "C:/repo/AppData/Backups",
      "C:/repo/AppData/state",
    ]);

    const status = await getAppDataStructureStatus();

    expect(status.isValid).toBe(true);
    expect(status.messages).toEqual([]);
    expect(status.pathMode).toBe("tauri-cwd-appdata");
    expect(status.appDataRoot).toBe("C:/repo/AppData");
  });
});
