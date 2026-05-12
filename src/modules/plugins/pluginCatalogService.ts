import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { fetchRemoteJson } from "../items/remoteApiService";
import { getLocalAppDataPaths } from "../items/pathService";
import {
  buildPluginDetailUrl,
  PLUGIN_MANIFEST_URL,
} from "./pluginSecurity";
import type {
  PluginAssetFileEntry,
  PluginCreditEntry,
  PluginDetailFile,
  PluginDetailLoadResult,
  PluginExternalLinkEntry,
  PluginManifestEntry,
  PluginManifestFile,
  PluginManifestLoadResult,
  PluginScreenshotEntry,
} from "./types";

const PLUGIN_MANIFEST_CACHE_STORAGE_KEY = "rlpeak_plugins_manifest_cache";
const BUILTIN_WORKSHOP_PLUGIN_ID = "workshop_map_loader";
const BUILTIN_WORKSHOP_RUNTIME_ID = "builtin.workshop_map_loader.v1";

const BUILTIN_WORKSHOP_MANIFEST_ENTRY: PluginManifestEntry = {
  id: BUILTIN_WORKSHOP_PLUGIN_ID,
  name: "Workshop Map Loader",
  version: "1.0.0",
  summary: "Browse and load Rocket League workshop maps directly from RLPeak.",
  type: "tools",
  runtime: BUILTIN_WORKSHOP_RUNTIME_ID,
  status: "active",
  manifest_path: "plugins/workshop_map_loader/plugin.json",
  title: "Workshop Map Loader",
  short_description: "Load custom Rocket League workshop maps through the mods path while keeping the original map file untouched.",
  icon_remote_path: "Plugins/workshop_map_loader/icon.png",
  banner_remote_path: "Plugins/workshop_map_loader/banner.png",
  tags: ["Workshop", "Maps"],
  categories: ["Built-in runtime"],
};

const BUILTIN_WORKSHOP_DETAIL: PluginDetailFile = {
  schema: "rlpeak_plugin.v1",
  id: BUILTIN_WORKSHOP_PLUGIN_ID,
  name: "Workshop Map Loader",
  version: "1.0.0",
  type: "tools",
  runtime: BUILTIN_WORKSHOP_RUNTIME_ID,
  description: "Load Rocket League workshop maps through CookedPCConsole/mods without modifying the original Labs_Utopia_P.upk.",
  permissions: [
    "rocket_league_mod_file_write",
    "rocket_league_process_check",
    "remote_catalog_download",
    "local_runtime_state",
  ],
  default_config: {
    enabled: false,
  },
  files: [],
  title: "Workshop Map Loader",
  short_description: "Browse and load Rocket League workshop maps directly from RLPeak.",
  long_description_markdown: [
    "**Workshop Map Loader** adds a built-in workshop map browser to RLPeak.",
    "",
    "### Features",
    "- Browse workshop maps catalog",
    "- Search by map name and author",
    "- Load map by writing TAGame/CookedPCConsole/mods/Labs_Utopia_P.upk",
    "- Keep TAGame/CookedPCConsole/Labs_Utopia_P.upk untouched",
    "- Remove loaded map to restore normal Utopia Retro behavior",
    "- No injection, no memory editing, no process hooks",
  ].join("\n"),
  icon_remote_path: "Plugins/workshop_map_loader/icon.png",
  banner_remote_path: "Plugins/workshop_map_loader/banner.png",
  screenshot_remote_paths: ["Plugins/workshop_map_loader/screenshots/catalog.png"],
  tags: ["Workshop", "Maps"],
  categories: ["Built-in runtime"],
};

async function joinPath(...parts: string[]): Promise<string> {
  if (!isTauri()) {
    return parts.join("/").replace(/\\/g, "/");
  }

  return join(...parts);
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readRequiredString(source: Record<string, unknown>, key: string, context: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalStringArray(source: Record<string, unknown>, key: string): string[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return items.length > 0 ? items : undefined;
}

function readRequiredStringArray(source: Record<string, unknown>, key: string, context: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new Error(`${context}.${key} must be an array.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error(`${context}.${key}[${index}] must be a non-empty string.`);
    }
    return entry.trim();
  });
}

function readRequiredArray(source: Record<string, unknown>, key: string, context: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new Error(`${context}.${key} must be an array.`);
  }
  return value;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readOptionalObjectArray(source: Record<string, unknown>, key: string): Record<string, unknown>[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const records = value
    .map((entry) => readOptionalRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== undefined);
  return records.length > 0 ? records : undefined;
}

function readOptionalExternalLinkEntries(
  source: Record<string, unknown>,
  key: string,
): PluginExternalLinkEntry[] | undefined {
  const entries = readOptionalObjectArray(source, key);
  if (!entries) {
    return undefined;
  }

  const links = entries
    .map((entry) => {
      const label = readOptionalString(entry, "label");
      const url = readOptionalString(entry, "url");
      if (!label || !url) {
        return null;
      }

      return {
        label,
        url,
      };
    })
    .filter((entry): entry is PluginExternalLinkEntry => entry !== null);

  return links.length > 0 ? links : undefined;
}

function readOptionalCreditEntries(
  source: Record<string, unknown>,
  key: string,
): PluginCreditEntry[] | undefined {
  const entries = readOptionalObjectArray(source, key);
  if (!entries) {
    return undefined;
  }

  const credits: PluginCreditEntry[] = [];
  for (const entry of entries) {
    const name = readOptionalString(entry, "name");
    if (!name) {
      continue;
    }

    const next: PluginCreditEntry = { name };
    const role = readOptionalString(entry, "role");
    const url = readOptionalString(entry, "url");
    const license = readOptionalString(entry, "license");
    if (role) {
      next.role = role;
    }
    if (url) {
      next.url = url;
    }
    if (license) {
      next.license = license;
    }
    credits.push(next);
  }

  return credits.length > 0 ? credits : undefined;
}

function readOptionalScreenshotEntries(
  source: Record<string, unknown>,
  key: string,
): PluginScreenshotEntry[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const screenshots: PluginScreenshotEntry[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        screenshots.push({ remote_path: trimmed });
      }
      continue;
    }

    const record = readOptionalRecord(entry);
    if (!record) {
      continue;
    }

    const remotePath = readOptionalString(record, "remote_path");
    if (!remotePath) {
      continue;
    }

    screenshots.push({
      remote_path: remotePath,
      caption: readOptionalString(record, "caption"),
    });
  }

  return screenshots.length > 0 ? screenshots : undefined;
}

function parsePluginManifestEntry(value: unknown, context: string): PluginManifestEntry {
  const record = asRecord(value, context);
  return {
    id: readRequiredString(record, "id", context),
    name: readRequiredString(record, "name", context),
    version: readRequiredString(record, "version", context),
    summary: readRequiredString(record, "summary", context),
    type: readRequiredString(record, "type", context),
    runtime: readRequiredString(record, "runtime", context),
    status: readRequiredString(record, "status", context),
    manifest_path: readRequiredString(record, "manifest_path", context),
    title: readOptionalString(record, "title"),
    short_description: readOptionalString(record, "short_description"),
    icon_remote_path: readOptionalString(record, "icon_remote_path"),
    banner_remote_path: readOptionalString(record, "banner_remote_path"),
    tags: readOptionalStringArray(record, "tags"),
    categories: readOptionalStringArray(record, "categories"),
  };
}

export function parsePluginManifest(payload: unknown): PluginManifestFile {
  const root = asRecord(payload, "Plugin manifest");
  const pluginsValue = readRequiredArray(root, "plugins", "Plugin manifest");
  const plugins: PluginManifestEntry[] = [];
  for (let index = 0; index < pluginsValue.length; index += 1) {
    plugins.push(parsePluginManifestEntry(pluginsValue[index], `Plugin manifest.plugins[${index}]`));
  }

  return {
    schema: readRequiredString(root, "schema", "Plugin manifest"),
    version: readRequiredString(root, "version", "Plugin manifest"),
    plugins,
  };
}

function parsePluginAssetFileEntry(value: unknown, context: string): PluginAssetFileEntry {
  const record = asRecord(value, context);
  const entry: PluginAssetFileEntry = {
    filename: readRequiredString(record, "filename", context),
    remote_path: readRequiredString(record, "remote_path", context),
  };

  const sha256 = record.sha256;
  if (typeof sha256 === "string" && sha256.trim().length > 0) {
    entry.sha256 = sha256.trim();
  }

  return entry;
}

export function parsePluginDetail(payload: unknown): PluginDetailFile {
  const root = asRecord(payload, "Plugin detail");
  const filesValue = readRequiredArray(root, "files", "Plugin detail");
  const files: PluginAssetFileEntry[] = [];
  for (let index = 0; index < filesValue.length; index += 1) {
    files.push(parsePluginAssetFileEntry(filesValue[index], `Plugin detail.files[${index}]`));
  }

  const iconRemotePath = readOptionalString(root, "icon_remote_path");
  const bannerRemotePath = readOptionalString(root, "banner_remote_path");
  const screenshotRemotePaths = readOptionalStringArray(root, "screenshot_remote_paths");
  const screenshots = readOptionalScreenshotEntries(root, "screenshots");

  return {
    schema: readRequiredString(root, "schema", "Plugin detail"),
    id: readRequiredString(root, "id", "Plugin detail"),
    name: readRequiredString(root, "name", "Plugin detail"),
    version: readRequiredString(root, "version", "Plugin detail"),
    type: readRequiredString(root, "type", "Plugin detail"),
    runtime: readRequiredString(root, "runtime", "Plugin detail"),
    description: readRequiredString(root, "description", "Plugin detail"),
    permissions: readRequiredStringArray(root, "permissions", "Plugin detail"),
    default_config: asRecord(root.default_config, "Plugin detail.default_config"),
    files,
    title: readOptionalString(root, "title"),
    short_description: readOptionalString(root, "short_description"),
    long_description_html: readOptionalString(root, "long_description_html"),
    long_description_markdown: readOptionalString(root, "long_description_markdown"),
    icon_remote_path: iconRemotePath,
    banner_remote_path: bannerRemotePath,
    screenshot_remote_paths: screenshotRemotePaths,
    screenshots,
    tags: readOptionalStringArray(root, "tags"),
    categories: readOptionalStringArray(root, "categories"),
    credits: readOptionalCreditEntries(root, "credits"),
    attribution: readOptionalString(root, "attribution"),
    external_links: readOptionalExternalLinkEntries(root, "external_links"),
  };
}

function toDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown error";
}

function mergeBuiltInManifestEntries(manifest: PluginManifestFile): PluginManifestFile {
  const byId = new Map<string, PluginManifestEntry>();
  for (const entry of manifest.plugins) {
    byId.set(entry.id, entry);
  }

  if (!byId.has(BUILTIN_WORKSHOP_PLUGIN_ID)) {
    byId.set(BUILTIN_WORKSHOP_PLUGIN_ID, BUILTIN_WORKSHOP_MANIFEST_ENTRY);
  }

  return {
    ...manifest,
    plugins: Array.from(byId.values()),
  };
}

function getBuiltInFallbackPluginDetail(pluginId: string): PluginDetailFile | undefined {
  if (pluginId === BUILTIN_WORKSHOP_PLUGIN_ID) {
    return BUILTIN_WORKSHOP_DETAIL;
  }

  return undefined;
}

async function readCachedJson(path: string, storageKey: string): Promise<unknown | null> {
  if (isTauri()) {
    try {
      const content = await invoke<string>("read_text_file", { path });
      return JSON.parse(content) as unknown;
    } catch {
      return null;
    }
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function writeCachedJson(path: string, storageKey: string, payload: unknown): Promise<void> {
  if (isTauri()) {
    await invoke("write_text_file", {
      path,
      contents: JSON.stringify(payload, null, 2),
    });
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(payload));
}

async function getPluginManifestCachePath(): Promise<string> {
  const paths = await getLocalAppDataPaths();
  return joinPath(paths.cachePluginsRoot, "manifest.json");
}

async function getPluginDetailCachePath(pluginId: string): Promise<string> {
  const paths = await getLocalAppDataPaths();
  return joinPath(paths.cachePluginsRoot, pluginId, "plugin.json");
}

let sharedPluginManifest: PluginManifestFile | null = null;
let sharedPluginManifestPromise: Promise<PluginManifestLoadResult> | null = null;

export function clearSharedPluginManifest(): void {
  sharedPluginManifest = null;
  sharedPluginManifestPromise = null;
}

export async function loadPluginManifest(options?: { forceReload?: boolean }): Promise<PluginManifestLoadResult> {
  const forceReload = options?.forceReload === true;
  if (forceReload) {
    clearSharedPluginManifest();
  }

  if (!forceReload && sharedPluginManifest) {
    return {
      ok: true,
      manifest: sharedPluginManifest,
      source: "remote",
    };
  }

  if (!forceReload && sharedPluginManifestPromise) {
    return sharedPluginManifestPromise;
  }

  const loadPromise = (async (): Promise<PluginManifestLoadResult> => {
    const cachePath = await getPluginManifestCachePath();

    try {
      const payload = await fetchRemoteJson(PLUGIN_MANIFEST_URL);
      const manifest = mergeBuiltInManifestEntries(parsePluginManifest(payload));
      sharedPluginManifest = manifest;
      await writeCachedJson(cachePath, PLUGIN_MANIFEST_CACHE_STORAGE_KEY, payload);
      return {
        ok: true,
        manifest,
        source: "remote",
      };
    } catch (remoteError: unknown) {
      const cachedPayload = await readCachedJson(cachePath, PLUGIN_MANIFEST_CACHE_STORAGE_KEY);
      if (cachedPayload !== null) {
        try {
          const manifest = mergeBuiltInManifestEntries(parsePluginManifest(cachedPayload));
          sharedPluginManifest = manifest;
          return {
            ok: true,
            manifest,
            source: "cache",
          };
        } catch (cacheParseError: unknown) {
          return {
            ok: false,
            message: "RLPeak plugin catalog is unavailable. Please try again later.",
            details: `Remote: ${toDetails(remoteError)} | Cache: ${toDetails(cacheParseError)}`,
          };
        }
      }

      return {
        ok: false,
        message: "RLPeak plugin catalog is unavailable. Please try again later.",
        details: toDetails(remoteError),
      };
    }
  })().finally(() => {
    sharedPluginManifestPromise = null;
  });

  sharedPluginManifestPromise = loadPromise;
  return loadPromise;
}

function getPluginDetailCacheStorageKey(pluginId: string): string {
  return `rlpeak_plugin_detail_cache:${pluginId}`;
}

export async function loadPluginDetail(
  pluginId: string,
  manifestPath: string,
  options?: { allowCacheFallback?: boolean },
): Promise<PluginDetailLoadResult> {
  const allowCacheFallback = options?.allowCacheFallback !== false;
  const detailUrl = buildPluginDetailUrl(manifestPath);
  const cachePath = await getPluginDetailCachePath(pluginId);
  const cacheKey = getPluginDetailCacheStorageKey(pluginId);

  try {
    const payload = await fetchRemoteJson(detailUrl);
    const detail = parsePluginDetail(payload);
    if (detail.id !== pluginId) {
      return {
        ok: false,
        message: "Plugin detail is invalid.",
        details: `Plugin detail id mismatch. Expected ${pluginId}, received ${detail.id}.`,
      };
    }
    await writeCachedJson(cachePath, cacheKey, payload);
    return {
      ok: true,
      detail,
      source: "remote",
    };
  } catch (remoteError: unknown) {
    if (!allowCacheFallback) {
      const fallbackDetail = getBuiltInFallbackPluginDetail(pluginId);
      if (fallbackDetail) {
        return {
          ok: true,
          detail: fallbackDetail,
          source: "cache",
        };
      }

      return {
        ok: false,
        message: "Plugin detail is unavailable. Please try again later.",
        details: toDetails(remoteError),
      };
    }

    const cachedPayload = await readCachedJson(cachePath, cacheKey);
    if (cachedPayload === null) {
      const fallbackDetail = getBuiltInFallbackPluginDetail(pluginId);
      if (fallbackDetail) {
        return {
          ok: true,
          detail: fallbackDetail,
          source: "cache",
        };
      }

      return {
        ok: false,
        message: "Plugin detail is unavailable. Please try again later.",
        details: toDetails(remoteError),
      };
    }

    try {
      const detail = parsePluginDetail(cachedPayload);
      if (detail.id !== pluginId) {
        return {
          ok: false,
          message: "Plugin detail is invalid.",
          details: `Plugin detail id mismatch. Expected ${pluginId}, received ${detail.id}.`,
        };
      }
      return {
        ok: true,
        detail,
        source: "cache",
      };
    } catch (cacheParseError: unknown) {
      const fallbackDetail = getBuiltInFallbackPluginDetail(pluginId);
      if (fallbackDetail) {
        return {
          ok: true,
          detail: fallbackDetail,
          source: "cache",
        };
      }

      return {
        ok: false,
        message: "Plugin detail is unavailable. Please try again later.",
        details: `Remote: ${toDetails(remoteError)} | Cache: ${toDetails(cacheParseError)}`,
      };
    }
  }
}
