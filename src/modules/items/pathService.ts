import { invoke, isTauri } from "@tauri-apps/api/core";
import { join, resolve, resolveResource, resourceDir } from "@tauri-apps/api/path";

type LocalAppDataPathMode =
  | "tauri-repo-root-appdata"
  | "tauri-cwd-appdata"
  | "tauri-executable-appdata"
  | "tauri-bundled-resource-appdata"
  | "tauri-unverified-fallback"
  | "relative-fallback";

export interface LocalAppDataPaths {
  pathMode: LocalAppDataPathMode;
  appDataRoot: string;
  catalogsDir: string;
  skinCatalogPath: string;
  wheelCatalogPath: string;
  boostCatalogPath: string;
  itemsRoot: string;
  itemsSkinDir: string;
  itemsWheelDir: string;
  itemsBoostDir: string;
  cacheRoot: string;
  cachePluginsRoot: string;
  cacheItemsRoot: string;
  cacheItemsSkinDir: string;
  cacheItemsWheelDir: string;
  cacheItemsBoostDir: string;
  backupsRoot: string;
  backupsOriginalsDir: string;
  backupsSkinDir: string;
  backupsWheelDir: string;
  backupsBoostDir: string;
  stateDir: string;
  stateFilePath: string;
}

export interface AppDataStructureStatus {
  appDataRoot: string;
  pathMode: LocalAppDataPathMode;
  appDataRootExists: boolean;
  catalogsExists: boolean;
  itemsFilesExists: boolean;
  backupsExists: boolean;
  stateExists: boolean;
  isValid: boolean;
  messages: string[];
}

const APP_DATA_ROOT_NAME = "AppData";
const REQUIRED_APP_DATA_SUBDIRECTORIES = ["catalogs", "Backups", "state"] as const;

function normalizePathForComparison(pathValue: string): string {
  return pathValue.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isDisallowedSrcTauriAppData(pathValue: string): boolean {
  const normalized = normalizePathForComparison(pathValue);
  return normalized.endsWith("/src-tauri/appdata") || normalized.includes("/src-tauri/appdata/");
}

function deriveRepoRootAppDataPath(pathValue: string): string | undefined {
  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+$/, "");
  const match = normalized.match(/^(.*)\/src-tauri\/appdata$/i);
  if (!match || !match[1]) {
    return undefined;
  }

  return `${match[1]}/AppData`;
}

function joinRelative(...parts: string[]): string {
  return parts.join("/").replace(/\\/g, "/");
}

async function joinPath(...parts: string[]): Promise<string> {
  if (isTauri()) {
    return join(...parts);
  }

  return joinRelative(...parts);
}

async function resolveAbsolutePath(pathValue: string): Promise<string> {
  if (!isTauri()) {
    return pathValue;
  }

  try {
    return await resolve(pathValue);
  } catch {
    return pathValue;
  }
}

async function resolveLocalAppDataRoot(): Promise<{
  appDataRoot: string;
  pathMode: LocalAppDataPathMode;
}> {
  if (!isTauri()) {
    return { appDataRoot: APP_DATA_ROOT_NAME, pathMode: "relative-fallback" };
  }

  const candidates: Array<{ root: string; mode: LocalAppDataPathMode }> = [];
  const pushCandidate = (root: string | undefined, mode: LocalAppDataPathMode) => {
    if (!root) {
      return;
    }
    const normalized = root.trim();
    if (!normalized) {
      return;
    }
    if (candidates.some((candidate) => candidate.root === normalized)) {
      return;
    }
    candidates.push({ root: normalized, mode });
  };

  let cwdResolvedAppData: string | undefined;
  try {
    cwdResolvedAppData = await resolve(APP_DATA_ROOT_NAME);
    const repoRootDerivedAppData = deriveRepoRootAppDataPath(cwdResolvedAppData);
    if (repoRootDerivedAppData) {
      pushCandidate(repoRootDerivedAppData, "tauri-repo-root-appdata");
    }
    pushCandidate(cwdResolvedAppData, "tauri-cwd-appdata");
  } catch {
    // ignore candidate resolution failure
  }

  try {
    const executableBaseDir = await resourceDir();
    const executableAppDataDir = await joinPath(executableBaseDir, APP_DATA_ROOT_NAME);
    pushCandidate(executableAppDataDir, "tauri-executable-appdata");
  } catch {
    // ignore candidate resolution failure
  }

  try {
    pushCandidate(await resolveResource(APP_DATA_ROOT_NAME), "tauri-bundled-resource-appdata");
  } catch {
    // resolveResource can fail when resources are not configured
  }

  pushCandidate(APP_DATA_ROOT_NAME, "tauri-unverified-fallback");

  for (const candidate of candidates) {
    const absoluteRoot = await resolveAbsolutePath(candidate.root);
    if (isDisallowedSrcTauriAppData(absoluteRoot)) {
      continue;
    }

    if (await isAppDataRootUsable(absoluteRoot)) {
      return {
        appDataRoot: absoluteRoot,
        pathMode: candidate.mode,
      };
    }
  }

  for (const candidate of candidates) {
    const absoluteRoot = await resolveAbsolutePath(candidate.root);
    if (isDisallowedSrcTauriAppData(absoluteRoot)) {
      continue;
    }

    return {
      appDataRoot: absoluteRoot,
      pathMode: candidate.mode,
    };
  }

  const fallbackCandidate = candidates[0] ?? { root: APP_DATA_ROOT_NAME, mode: "tauri-unverified-fallback" };
  const fallbackRoot = await resolveAbsolutePath(fallbackCandidate.root);
  return {
    appDataRoot: fallbackRoot,
    pathMode: fallbackCandidate.mode,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("path_exists", { path });
  } catch {
    return false;
  }
}

async function isAppDataRootUsable(root: string): Promise<boolean> {
  if (!(await pathExists(root))) {
    return false;
  }

  const checks = await Promise.all(
    REQUIRED_APP_DATA_SUBDIRECTORIES.map(async (entry) => {
      const path = await joinPath(root, entry);
      return pathExists(path);
    }),
  );

  return checks.every(Boolean);
}

export async function getLocalAppDataPaths(): Promise<LocalAppDataPaths> {
  const { appDataRoot, pathMode } = await resolveLocalAppDataRoot();

  const catalogsDir = await joinPath(appDataRoot, "catalogs");
  const itemsRoot = await joinPath(appDataRoot, "ItemsFiles");
  const backupsRoot = await joinPath(appDataRoot, "Backups");
  const stateDir = await joinPath(appDataRoot, "state");
  const cacheRoot = await joinPath(appDataRoot, "cache");
  const cachePluginsRoot = await joinPath(cacheRoot, "Plugins");
  const cacheItemsRoot = await joinPath(cacheRoot, "ItemsFiles");

  return {
    pathMode,
    appDataRoot,
    catalogsDir,
    skinCatalogPath: await joinPath(catalogsDir, "output_skins_catalog.json"),
    wheelCatalogPath: await joinPath(catalogsDir, "output_wheels_catalog.json"),
    boostCatalogPath: await joinPath(catalogsDir, "output_boosts_catalog.json"),
    itemsRoot,
    itemsSkinDir: await joinPath(itemsRoot, "Skin"),
    itemsWheelDir: await joinPath(itemsRoot, "Wheel"),
    itemsBoostDir: await joinPath(itemsRoot, "Boost"),
    cacheRoot,
    cachePluginsRoot,
    cacheItemsRoot,
    cacheItemsSkinDir: await joinPath(cacheItemsRoot, "Skin"),
    cacheItemsWheelDir: await joinPath(cacheItemsRoot, "Wheel"),
    cacheItemsBoostDir: await joinPath(cacheItemsRoot, "Boost"),
    backupsRoot,
    backupsOriginalsDir: await joinPath(backupsRoot, "originals"),
    backupsSkinDir: await joinPath(backupsRoot, "originals", "Skin"),
    backupsWheelDir: await joinPath(backupsRoot, "originals", "Wheel"),
    backupsBoostDir: await joinPath(backupsRoot, "originals", "Boost"),
    stateDir,
    stateFilePath: await joinPath(stateDir, "app_state.json"),
  };
}

export async function getAppDataStructureStatus(): Promise<AppDataStructureStatus> {
  const paths = await getLocalAppDataPaths();

  const [
    appDataRootExists,
    catalogsExists,
    itemsFilesExists,
    backupsExists,
    stateExists,
  ] = await Promise.all([
    pathExists(paths.appDataRoot),
    pathExists(paths.catalogsDir),
    pathExists(paths.itemsRoot),
    pathExists(paths.backupsRoot),
    pathExists(paths.stateDir),
  ]);

  const messages: string[] = [];

  if (!appDataRootExists) {
    messages.push(`AppData folder not found: ${paths.appDataRoot}`);
  }
  if (!catalogsExists) {
    messages.push(`Missing catalogs folder: ${paths.catalogsDir}`);
  }
  if (!backupsExists) {
    messages.push(`Missing Backups folder: ${paths.backupsRoot}`);
  }
  if (!stateExists) {
    messages.push(`Missing state folder: ${paths.stateDir}`);
  }

  return {
    appDataRoot: paths.appDataRoot,
    pathMode: paths.pathMode,
    appDataRootExists,
    catalogsExists,
    itemsFilesExists,
    backupsExists,
    stateExists,
    isValid: messages.length === 0,
    messages,
  };
}
