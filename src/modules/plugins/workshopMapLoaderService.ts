import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getLocalAppDataPaths } from "../items/pathService";
import { trackEvent } from "../metrics/metricsService";

export const WORKSHOP_MAP_LOADER_PLUGIN_ID = "workshop_map_loader";
export const WORKSHOP_MAP_LOADER_RUNTIME_ID = "builtin.workshop_map_loader.v1";

export interface WorkshopMapCatalogItem {
  id: number;
  name: string;
  memberDisplayName: string;
  metadataPath: string;
  bannerPath: string;
  finalFilePath: string;
  shortDescription: string;
}

export interface WorkshopMapCatalogResult {
  ok: boolean;
  maps: WorkshopMapCatalogItem[];
  source: "remote" | "cache";
  message: string;
  details?: string;
}

export interface WorkshopActiveMapState {
  mapId: number;
  name: string;
  author: string;
  bannerPath: string;
  metadataPath: string;
  finalFilePath: string;
  shortDescription: string;
  activatedAt: string;
}

export interface WorkshopActiveMapStatusResult {
  ok: boolean;
  activeMap: WorkshopActiveMapState | null;
  legacyBackupDetected: boolean;
  legacyBackupNotice: string | null;
  message: string;
  details?: string;
}

export interface WorkshopMapAssetsCacheResult {
  ok: boolean;
  mapId: number;
  shortDescription: string;
  metadataCached: boolean;
  bannerCached: boolean;
  message: string;
  details?: string;
}

export interface WorkshopMapLoadResult {
  ok: boolean;
  activeMap: WorkshopActiveMapState;
  message: string;
  restartRequired: boolean;
  wasExistingModReplaced: boolean;
  rocketLeagueWasRunning: boolean;
  details?: string;
}

export interface WorkshopLoadPreflightResult {
  ok: boolean;
  rocketLeagueRunning: boolean;
  modFileExists: boolean;
  firstTimeSetupRequired: boolean;
  message: string;
  details?: string;
}

export interface WorkshopMapRestoreResult {
  ok: boolean;
  restored: boolean;
  message: string;
  details?: string;
}

interface WorkshopMapCatalogItemPayload {
  id?: unknown;
  name?: unknown;
  member_display_name?: unknown;
  metadata_path?: unknown;
  banner_path?: unknown;
  final_file_path?: unknown;
  short_description?: unknown;
}

interface WorkshopMapCatalogPayload {
  source?: unknown;
  maps?: unknown;
}

interface WorkshopActiveMapPayload {
  map_id?: unknown;
  name?: unknown;
  author?: unknown;
  banner_path?: unknown;
  metadata_path?: unknown;
  final_file_path?: unknown;
  short_description?: unknown;
  activated_at?: unknown;
}

function safeTrackWorkshopMetricsEvent(event: "workshop_map_loaded" | "workshop_map_restored"): void {
  try {
    void trackEvent(event, {
      pluginId: WORKSHOP_MAP_LOADER_PLUGIN_ID,
    });
  } catch {
    // Metrics failures must never block workshop actions.
  }
}

function toDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const raw = String(error).trim();
  return raw.length > 0 ? raw : "Unknown error";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeShortDescription(value: string, author: string): string {
  const normalized = value.trim();
  if (normalized.length > 0) {
    return normalized;
  }

  if (author.length > 0) {
    return `Workshop map by ${author}`;
  }

  return "Workshop map";
}

function parseWorkshopMapCatalogItem(payload: WorkshopMapCatalogItemPayload): WorkshopMapCatalogItem | null {
  const id = readNumber(payload.id, -1);
  const name = readString(payload.name);
  const memberDisplayName = readString(payload.member_display_name, "Unknown author");
  const metadataPath = readString(payload.metadata_path);
  const bannerPath = readString(payload.banner_path);
  const finalFilePath = readString(payload.final_file_path);
  const shortDescription = normalizeShortDescription(
    readString(payload.short_description),
    memberDisplayName,
  );

  if (id < 0 || name.length === 0 || metadataPath.length === 0 || bannerPath.length === 0 || finalFilePath.length === 0) {
    return null;
  }

  return {
    id,
    name,
    memberDisplayName,
    metadataPath,
    bannerPath,
    finalFilePath,
    shortDescription,
  };
}

function parseWorkshopCatalogPayload(payload: unknown): WorkshopMapCatalogResult {
  const record = asRecord(payload) as WorkshopMapCatalogPayload;
  const mapsRaw = Array.isArray(record.maps) ? record.maps : [];
  const maps: WorkshopMapCatalogItem[] = mapsRaw
    .map((entry) => parseWorkshopMapCatalogItem(asRecord(entry) as WorkshopMapCatalogItemPayload))
    .filter((entry): entry is WorkshopMapCatalogItem => entry !== null);

  const source = record.source === "cache" ? "cache" : "remote";

  return {
    ok: true,
    maps,
    source,
    message: source === "cache"
      ? "Using cached workshop maps catalog."
      : "Workshop maps catalog loaded.",
  };
}

function parseWorkshopActiveMap(payload: unknown): WorkshopActiveMapState | null {
  const record = asRecord(payload) as WorkshopActiveMapPayload;
  const mapId = readNumber(record.map_id, -1);
  if (mapId < 0) {
    return null;
  }

  const name = readString(record.name);
  const author = readString(record.author, "Unknown author");
  const bannerPath = readString(record.banner_path);
  const metadataPath = readString(record.metadata_path);
  const finalFilePath = readString(record.final_file_path);
  const shortDescription = normalizeShortDescription(
    readString(record.short_description),
    author,
  );
  const activatedAt = readString(record.activated_at);

  if (name.length === 0 || finalFilePath.length === 0) {
    return null;
  }

  return {
    mapId,
    name,
    author,
    bannerPath,
    metadataPath,
    finalFilePath,
    shortDescription,
    activatedAt,
  };
}

function parseWorkshopError(error: unknown, fallbackMessage: string): { message: string; details: string } {
  const details = toDetails(error);

  if (details.includes("WORKSHOP_ROCKET_LEAGUE_PATH_MISSING") || details.includes("WORKSHOP_ROCKET_LEAGUE_PATH_INVALID")) {
    return {
      message: "Choose your Rocket League folder in Settings before using Workshop Map Loader.",
      details,
    };
  }

  if (details.includes("WORKSHOP_TARGET_FILE_MISSING")) {
    return {
      message: "Labs_Utopia_P.upk was not found in your Rocket League install.",
      details,
    };
  }

  if (details.includes("WORKSHOP_PERMISSION_DENIED")) {
    return {
      message: "RLPeak could not write the workshop map. Try running RLPeak as administrator or check folder permissions.",
      details,
    };
  }

  if (details.includes("WORKSHOP_FILE_IN_USE")) {
    return {
      message: "RLPeak could not replace the map because it is currently in use. Leave the current Free Play map or close Rocket League, then try again.",
      details,
    };
  }

  if (details.includes("WORKSHOP_MAP_NOT_FOUND")) {
    return {
      message: "Selected workshop map was not found in the current catalog.",
      details,
    };
  }

  if (details.includes("WORKSHOP_CATALOG_UNAVAILABLE")) {
    return {
      message: "Workshop maps catalog is unavailable. Please try Refresh maps.",
      details,
    };
  }

  return {
    message: fallbackMessage,
    details,
  };
}

export function filterWorkshopMapsByQuery(maps: WorkshopMapCatalogItem[], query: string): WorkshopMapCatalogItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return maps;
  }

  return maps.filter((mapItem) => (
    mapItem.name.toLowerCase().includes(normalizedQuery)
    || mapItem.memberDisplayName.toLowerCase().includes(normalizedQuery)
  ));
}

export async function getWorkshopMapsCatalog(appDataRoot: string): Promise<WorkshopMapCatalogResult> {
  try {
    const payload = await invoke<unknown>("get_workshop_maps_catalog", { appDataRoot });
    return parseWorkshopCatalogPayload(payload);
  } catch (error: unknown) {
    const parsed = parseWorkshopError(error, "Workshop maps catalog is unavailable.");
    return {
      ok: false,
      maps: [],
      source: "cache",
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function refreshWorkshopMapsCatalog(appDataRoot: string): Promise<WorkshopMapCatalogResult> {
  try {
    const payload = await invoke<unknown>("refresh_workshop_maps_catalog", { appDataRoot });
    return parseWorkshopCatalogPayload(payload);
  } catch (error: unknown) {
    const parsed = parseWorkshopError(error, "Could not refresh workshop maps catalog.");
    return {
      ok: false,
      maps: [],
      source: "cache",
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function cacheWorkshopMapAssets(params: {
  appDataRoot: string;
  mapId: number;
}): Promise<WorkshopMapAssetsCacheResult> {
  try {
    const payload = asRecord(await invoke<unknown>("cache_workshop_map_assets", {
      appDataRoot: params.appDataRoot,
      mapId: params.mapId,
    }));

    return {
      ok: true,
      mapId: readNumber(payload.map_id, params.mapId),
      shortDescription: normalizeShortDescription(
        readString(payload.short_description),
        "",
      ),
      metadataCached: payload.metadata_cached === true,
      bannerCached: payload.banner_cached === true,
      message: "Workshop map assets cached.",
    };
  } catch (error: unknown) {
    const parsed = parseWorkshopError(error, "Could not cache workshop map assets.");
    return {
      ok: false,
      mapId: params.mapId,
      shortDescription: "Workshop map",
      metadataCached: false,
      bannerCached: false,
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function loadWorkshopMap(params: {
  appDataRoot: string;
  rocketLeaguePath: string;
  mapId: number;
}): Promise<WorkshopMapLoadResult | { ok: false; message: string; details?: string }> {
  try {
    const payload = asRecord(await invoke<unknown>("load_workshop_map", {
      appDataRoot: params.appDataRoot,
      rocketLeaguePath: params.rocketLeaguePath,
      mapId: params.mapId,
    }));
    const activeMap = parseWorkshopActiveMap(payload.active_map);
    if (!activeMap) {
      return {
        ok: false,
        message: "Workshop map loaded but active map state is unavailable.",
        details: JSON.stringify(payload),
      };
    }

    safeTrackWorkshopMetricsEvent("workshop_map_loaded");

    return {
      ok: true,
      activeMap,
      message: readString(payload.message, "Workshop map loaded."),
      restartRequired: payload.restart_required !== false,
      wasExistingModReplaced: payload.was_existing_mod_replaced === true,
      rocketLeagueWasRunning: payload.rocket_league_was_running === true,
    };
  } catch (error: unknown) {
    const parsed = parseWorkshopError(error, "Could not load workshop map.");
    return {
      ok: false,
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function getWorkshopLoadPreflight(params: {
  appDataRoot: string;
  rocketLeaguePath: string;
}): Promise<WorkshopLoadPreflightResult> {
  try {
    const payload = asRecord(await invoke<unknown>("get_workshop_load_preflight", {
      appDataRoot: params.appDataRoot,
      rocketLeaguePath: params.rocketLeaguePath,
    }));

    const modFileExists = payload.mod_file_exists === true;
    const firstTimeSetupRequired = payload.first_time_setup_required !== false;
    return {
      ok: true,
      rocketLeagueRunning: payload.rocket_league_running === true,
      modFileExists,
      firstTimeSetupRequired,
      message: "Workshop preflight ready.",
    };
  } catch (error: unknown) {
    const parsed = parseWorkshopError(error, "Could not prepare workshop map load.");
    return {
      ok: false,
      rocketLeagueRunning: false,
      modFileExists: false,
      firstTimeSetupRequired: false,
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function restoreWorkshopOriginalMap(params: {
  appDataRoot: string;
  rocketLeaguePath: string;
}): Promise<WorkshopMapRestoreResult> {
  try {
    const payload = asRecord(await invoke<unknown>("restore_workshop_original_map", {
      appDataRoot: params.appDataRoot,
      rocketLeaguePath: params.rocketLeaguePath,
    }));

    safeTrackWorkshopMetricsEvent("workshop_map_restored");

    return {
      ok: true,
      restored: payload.restored === true,
      message: readString(
        payload.message,
        "Workshop map removed. Restart Rocket League to return to the normal Utopia Retro map.",
      ),
    };
  } catch (error: unknown) {
    const details = toDetails(error);
    if (details.includes("WORKSHOP_FILE_IN_USE")) {
      return {
        ok: false,
        restored: false,
        message: "RLPeak could not remove the map because it is currently in use. Leave the current Free Play map or close Rocket League, then try again.",
        details,
      };
    }
    const parsed = parseWorkshopError(error, "Could not remove loaded workshop map.");
    return {
      ok: false,
      restored: false,
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function getWorkshopActiveMapStatus(
  appDataRoot: string,
  rocketLeaguePath?: string,
): Promise<WorkshopActiveMapStatusResult> {
  try {
    const payload = asRecord(await invoke<unknown>("get_workshop_active_map_status", {
      appDataRoot,
      rocketLeaguePath: typeof rocketLeaguePath === "string" && rocketLeaguePath.trim().length > 0
        ? rocketLeaguePath
        : null,
    }));

    return {
      ok: true,
      activeMap: parseWorkshopActiveMap(payload.active_map),
      legacyBackupDetected: payload.legacy_backup_detected === true,
      legacyBackupNotice: readString(payload.legacy_backup_notice, "") || null,
      message: "Workshop active map status loaded.",
    };
  } catch (error: unknown) {
    const parsed = parseWorkshopError(error, "Could not read workshop active map status.");
    return {
      ok: false,
      activeMap: null,
      legacyBackupDetected: false,
      legacyBackupNotice: null,
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function openWorkshopCacheFolder(appDataRoot: string): Promise<{ ok: boolean; message: string; details?: string }> {
  try {
    const cacheFolder = await join(appDataRoot, "plugins", "cache", WORKSHOP_MAP_LOADER_PLUGIN_ID);
    await invoke("open_folder", {
      path: cacheFolder,
    });
    return {
      ok: true,
      message: "Workshop cache folder opened.",
      details: cacheFolder,
    };
  } catch (error: unknown) {
    const parsed = parseWorkshopError(error, "Could not open workshop cache folder.");
    return {
      ok: false,
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function openWorkshopRuntimeLogsFolder(appDataRoot: string): Promise<{ ok: boolean; message: string; details?: string }> {
  try {
    const logsFolder = await join(appDataRoot, "plugins", "runtime", WORKSHOP_MAP_LOADER_PLUGIN_ID, "logs");
    await invoke("open_folder", {
      path: logsFolder,
    });
    return {
      ok: true,
      message: "Workshop runtime logs folder opened.",
      details: logsFolder,
    };
  } catch (error: unknown) {
    const parsed = parseWorkshopError(error, "Could not open workshop runtime logs folder.");
    return {
      ok: false,
      message: parsed.message,
      details: parsed.details,
    };
  }
}

export async function getWorkshopRuntimeRootPath(): Promise<string> {
  const paths = await getLocalAppDataPaths();
  return join(paths.appDataRoot, "plugins", "runtime", WORKSHOP_MAP_LOADER_PLUGIN_ID);
}
