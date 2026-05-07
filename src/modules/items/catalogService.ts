import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getLocalAppDataPaths, type LocalAppDataPaths } from "./pathService";
import {
  clearSharedRemoteManifest,
  fetchRemoteJson,
  getProductionManifestUrl,
  getSharedRemoteManifest,
  type RemoteCatalogFileReference,
  type RemoteManifest,
} from "./remoteApiService";
import type {
  BoostCatalog,
  BoostCatalogItem,
  SkinCarCatalogEntry,
  SkinCatalog,
  SkinCatalogItem,
  WheelCatalog,
  WheelCatalogItem,
} from "./types";

const SKIN_CATALOG_RELATIVE_PATH = "AppData/catalogs/output_skins_catalog.json";
const WHEEL_CATALOG_RELATIVE_PATH = "AppData/catalogs/output_wheels_catalog.json";
const BOOST_CATALOG_RELATIVE_PATH = "AppData/catalogs/output_boosts_catalog.json";
const SKIN_CATALOG_FILE_NAME = "output_skins_catalog.json";
const WHEEL_CATALOG_FILE_NAME = "output_wheels_catalog.json";
const BOOST_CATALOG_FILE_NAME = "output_boosts_catalog.json";

type CatalogKind = "Skin" | "Wheel" | "Boost";
type CatalogLoadErrorCode = "MissingCatalogFile" | "InvalidCatalogJson" | "InvalidCatalogData";

export interface CatalogLoadError {
  catalog: CatalogKind;
  code: CatalogLoadErrorCode;
  message: string;
  attemptedSources: string[];
  details?: string;
}

export type CatalogLoadResult<T> = { ok: true; data: T; source: string } | { ok: false; error: CatalogLoadError };

export interface CatalogLoadSnapshot {
  skin: CatalogLoadResult<SkinCatalog>;
  wheel: CatalogLoadResult<WheelCatalog>;
  boost: CatalogLoadResult<BoostCatalog>;
}

export async function loadSkinCatalog(): Promise<CatalogLoadResult<SkinCatalog>> {
  const snapshot = await loadCatalogSnapshot();
  return snapshot.skin;
}

export async function loadWheelCatalog(): Promise<CatalogLoadResult<WheelCatalog>> {
  const snapshot = await loadCatalogSnapshot();
  return snapshot.wheel;
}

export async function loadBoostCatalog(): Promise<CatalogLoadResult<BoostCatalog>> {
  const snapshot = await loadCatalogSnapshot();
  return snapshot.boost;
}

export async function loadCatalogSnapshot(): Promise<CatalogLoadSnapshot> {
  const paths = await getLocalAppDataPaths();
  const remote = await tryLoadRemoteCatalogPayloads();
  const [skin, wheel, boost] = await Promise.all([
    loadCatalog<SkinCatalog>({
      catalog: "Skin",
      relativePath: SKIN_CATALOG_RELATIVE_PATH,
      absolutePath: paths.skinCatalogPath,
      cacheFileName: SKIN_CATALOG_FILE_NAME,
      validate: validateSkinCatalog,
      remotePayload: remote.skinPayload,
      remoteSource: remote.skinSource,
      remoteFailure: remote.manifestFailure ?? remote.skinFailure,
      paths,
    }),
    loadCatalog<WheelCatalog>({
      catalog: "Wheel",
      relativePath: WHEEL_CATALOG_RELATIVE_PATH,
      absolutePath: paths.wheelCatalogPath,
      cacheFileName: WHEEL_CATALOG_FILE_NAME,
      validate: validateWheelCatalog,
      remotePayload: remote.wheelPayload,
      remoteSource: remote.wheelSource,
      remoteFailure: remote.manifestFailure ?? remote.wheelFailure,
      paths,
    }),
    loadCatalog<BoostCatalog>({
      catalog: "Boost",
      relativePath: BOOST_CATALOG_RELATIVE_PATH,
      absolutePath: paths.boostCatalogPath,
      cacheFileName: BOOST_CATALOG_FILE_NAME,
      validate: validateBoostCatalog,
      remotePayload: remote.boostPayload,
      remoteSource: remote.boostSource,
      remoteFailure: remote.manifestFailure ?? remote.boostFailure,
      paths,
    }),
  ]);
  return { skin, wheel, boost };
}

export interface SharedCatalogSnapshot {
  appDataRoot: string;
  snapshot: CatalogLoadSnapshot;
}

let sharedCatalogSnapshot: SharedCatalogSnapshot | null = null;
let sharedCatalogLoadPromise: Promise<SharedCatalogSnapshot> | null = null;
let sharedCatalogLoadRoot: string | null = null;

async function buildSharedCatalogSnapshot(paths: LocalAppDataPaths): Promise<SharedCatalogSnapshot> {
  const snapshot = await loadCatalogSnapshot();
  return {
    appDataRoot: paths.appDataRoot,
    snapshot,
  };
}

export async function getSharedCatalogSnapshot(options?: {
  forceReload?: boolean;
}): Promise<SharedCatalogSnapshot> {
  const forceReload = options?.forceReload === true;
  if (forceReload) {
    clearSharedRemoteManifest();
  }
  const paths = await getLocalAppDataPaths();

  if (
    !forceReload
    && sharedCatalogSnapshot
    && sharedCatalogSnapshot.appDataRoot === paths.appDataRoot
  ) {
    return sharedCatalogSnapshot;
  }

  if (
    !forceReload
    && sharedCatalogLoadPromise
    && sharedCatalogLoadRoot === paths.appDataRoot
  ) {
    return sharedCatalogLoadPromise;
  }

  const loadPromise = buildSharedCatalogSnapshot(paths)
    .then((result) => {
      sharedCatalogSnapshot = result;
      return result;
    })
    .finally(() => {
      sharedCatalogLoadPromise = null;
      sharedCatalogLoadRoot = null;
    });

  sharedCatalogLoadRoot = paths.appDataRoot;
  sharedCatalogLoadPromise = loadPromise;
  return loadPromise;
}

export function clearSharedCatalogSnapshot(): void {
  sharedCatalogSnapshot = null;
  sharedCatalogLoadPromise = null;
  sharedCatalogLoadRoot = null;
  clearSharedRemoteManifest();
}

interface LoadCatalogOptions<T> {
  catalog: CatalogKind;
  relativePath: string;
  absolutePath: string;
  cacheFileName: string;
  validate: (value: unknown) => T;
  remotePayload?: unknown;
  remoteSource?: string;
  remoteFailure?: string;
  paths: LocalAppDataPaths;
}

interface ParsedCatalogPayload {
  payload: unknown;
  source: string;
}

async function loadCatalog<T>(options: LoadCatalogOptions<T>): Promise<CatalogLoadResult<T>> {
  const localCandidates = buildLocalCandidates(options.absolutePath, options.relativePath);

  if (options.remotePayload !== undefined) {
    const validatedRemote = validateCatalogPayload(
      options.catalog,
      options.validate,
      options.remotePayload,
      options.remoteSource ?? getProductionManifestUrl(),
      localCandidates,
    );
    if (validatedRemote.ok) {
      void persistCatalogCache(options.paths, options.cacheFileName, options.remotePayload);
      return validatedRemote;
    }
  }

  const localPayload = await readCatalogPayloadFromLocal(localCandidates, options.catalog);
  if (localPayload.ok) {
    return validateCatalogPayload(
      options.catalog,
      options.validate,
      localPayload.value.payload,
      localPayload.value.source,
      localCandidates,
    );
  }

  const baseMessage = options.remoteFailure
    ? "RLPeak servers are unavailable. Please try again later."
    : `${options.catalog} catalog file not found`;
  const details = options.remoteFailure
    ? `Remote fetch failed and local cache is unavailable. ${options.remoteFailure}`
    : localPayload.error.details;

  return {
    ok: false,
    error: {
      catalog: options.catalog,
      code: "MissingCatalogFile",
      message: baseMessage,
      attemptedSources: localCandidates,
      details,
    },
  };
}

function validateCatalogPayload<T>(
  catalog: CatalogKind,
  validate: (value: unknown) => T,
  payload: unknown,
  source: string,
  attemptedSources: string[],
): CatalogLoadResult<T> {
  try {
    const validated = validate(payload);
    return {
      ok: true,
      data: validated,
      source,
    };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        catalog,
        code: "InvalidCatalogData",
        message: `${catalog} catalog has invalid required fields`,
        attemptedSources,
        details,
      },
    };
  }
}

type ReadCatalogPayloadResult =
  | { ok: true; value: ParsedCatalogPayload }
  | { ok: false; error: CatalogLoadError };

function buildLocalCandidates(resolvedPath: string, fallbackRelativePath: string): string[] {
  const sources = new Set<string>();

  sources.add(resolvedPath);

  const normalizedFallback = fallbackRelativePath.replace(/\\/g, "/");
  sources.add(normalizedFallback);
  sources.add(normalizedFallback.replace(/^\.?\//, ""));

  return Array.from(sources);
}

async function readCatalogPayloadFromLocal(candidates: string[], catalog: CatalogKind): Promise<ReadCatalogPayloadResult> {
  let invalidJsonSource = "";
  let invalidJsonError = "";

  for (const source of candidates) {
    const normalizedSource = source.trim();
    if (!normalizedSource) {
      continue;
    }

    try {
      const payload = await readUnknownJsonFromPath(normalizedSource);
      return {
        ok: true,
        value: {
          payload,
          source: normalizedSource,
        },
      };
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      if (details.includes("JSON_PARSE_FAILED")) {
        invalidJsonSource = normalizedSource;
        invalidJsonError = details;
        break;
      }
    }
  }

  if (invalidJsonSource) {
    return {
      ok: false,
      error: {
        catalog,
        code: "InvalidCatalogJson",
        message: `${catalog} catalog file is not valid JSON`,
        attemptedSources: candidates,
        details: `Source: ${invalidJsonSource}. ${invalidJsonError}`,
      },
    };
  }

  return {
    ok: false,
    error: {
      catalog,
      code: "MissingCatalogFile",
      message: `${catalog} catalog file not found`,
      attemptedSources: candidates,
      details: "Local catalog cache not found.",
    },
  };
}

async function readUnknownJsonFromPath(pathValue: string): Promise<unknown> {
  if (isTauri()) {
    const content = await invoke<string>("read_text_file", { path: pathValue });
    try {
      return JSON.parse(content) as unknown;
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      const parseError = new Error(`JSON_PARSE_FAILED: ${details}`);
      (parseError as Error & { cause?: unknown }).cause = error;
      throw parseError;
    }
  }

  const candidates = [pathValue, `/${pathValue.replace(/^\/+/, "")}`];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) {
        continue;
      }
      return (await response.json()) as unknown;
    } catch {
      continue;
    }
  }

  throw new Error(`FILE_NOT_FOUND: ${pathValue}`);
}

async function persistCatalogCache(paths: LocalAppDataPaths, fileName: string, payload: unknown): Promise<void> {
  if (!isTauri()) {
    return;
  }

  try {
    const path = await join(paths.catalogsDir, fileName);
    const contents = JSON.stringify(payload);
    await invoke("write_text_file", {
      path,
      contents,
    });
  } catch {
    // Catalog write cache failures are non-fatal. Runtime can still continue using the fetched payload.
  }
}

interface RemoteCatalogPayloadSnapshot {
  manifest?: RemoteManifest;
  manifestFailure?: string;
  skinPayload?: unknown;
  skinSource?: string;
  skinFailure?: string;
  wheelPayload?: unknown;
  wheelSource?: string;
  wheelFailure?: string;
  boostPayload?: unknown;
  boostSource?: string;
  boostFailure?: string;
}

async function tryLoadRemoteCatalogPayloads(): Promise<RemoteCatalogPayloadSnapshot> {
  let manifest: RemoteManifest;
  try {
    manifest = await getSharedRemoteManifest();
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    return {
      manifestFailure: details,
    };
  }

  const result: RemoteCatalogPayloadSnapshot = {
    manifest,
  };

  await Promise.all(
    ([
      ["skin", manifest.catalogs.skins],
      ["wheel", manifest.catalogs.wheels],
      ["boost", manifest.catalogs.boosts],
    ] as const).map(async ([kind, sourceUrl]) => {
      try {
        const payload = await fetchRemoteJson(sourceUrl);
        if (kind === "skin") {
          result.skinPayload = payload;
          result.skinSource = sourceUrl;
          return;
        }
        if (kind === "wheel") {
          result.wheelPayload = payload;
          result.wheelSource = sourceUrl;
          return;
        }
        result.boostPayload = payload;
        result.boostSource = sourceUrl;
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : String(error);
        if (kind === "skin") {
          result.skinFailure = details;
          return;
        }
        if (kind === "wheel") {
          result.wheelFailure = details;
          return;
        }
        result.boostFailure = details;
      }
    }),
  );

  return result;
}

function validateSkinCatalog(value: unknown): SkinCatalog {
  const root = asRecord(value, "Skin catalog");
  const carsRecord = asRecord(root.cars, "Skin catalog cars");
  const cars: Record<string, SkinCarCatalogEntry> = {};

  for (const [carKey, carValue] of Object.entries(carsRecord)) {
    const carContext = `Skin catalog cars.${carKey}`;
    const carRecord = asRecord(carValue, carContext);

    const car = readRequiredString(carRecord, "car", carContext);
    const skinCount = readRequiredNumber(carRecord, "skin_count", carContext);
    const baseFiles = readRequiredStringArray(carRecord, "base_files", carContext);

    const skinsValue = readRequiredArray(carRecord, "skins", carContext);
    const skins: SkinCatalogItem[] = [];
    for (let index = 0; index < skinsValue.length; index += 1) {
      skins.push(validateSkinCatalogItem(skinsValue[index], `${carContext}.skins[${index}]`));
    }

    const carEntry: SkinCarCatalogEntry = {
      car,
      skin_count: skinCount,
      base_files: baseFiles,
      skins,
    };

    const universalSourceSkinCount = readOptionalNumber(carRecord, "universal_source_skin_count", carContext);
    if (universalSourceSkinCount !== undefined) {
      carEntry.universal_source_skin_count = universalSourceSkinCount;
    }

    const baseThumbnail = readOptionalString(carRecord, "base_thumbnail", carContext);
    if (baseThumbnail !== undefined) {
      carEntry.base_thumbnail = baseThumbnail;
    }

  const baseThumbnailPath = readOptionalString(carRecord, "base_thumbnail_path", carContext);
  if (baseThumbnailPath !== undefined) {
    carEntry.base_thumbnail_path = baseThumbnailPath;
  }

  const remoteThumbnail = readOptionalRemoteFileReference(carRecord, "remote_thumbnail", carContext);
  if (remoteThumbnail) {
    carEntry.remote_thumbnail = remoteThumbnail;
  }

  cars[carKey] = carEntry;
  }

  const catalog: SkinCatalog = { cars };

  const schema = readOptionalString(root, "schema", "Skin catalog");
  if (schema !== undefined) {
    catalog.schema = schema;
  }

  const totalCars = readOptionalNumber(root, "total_cars", "Skin catalog");
  if (totalCars !== undefined) {
    catalog.total_cars = totalCars;
  }

  const totalSkins = readOptionalNumber(root, "total_skins", "Skin catalog");
  if (totalSkins !== undefined) {
    catalog.total_skins = totalSkins;
  }

  const totalUniversalSourceSkins = readOptionalNumber(root, "total_universal_source_skins", "Skin catalog");
  if (totalUniversalSourceSkins !== undefined) {
    catalog.total_universal_source_skins = totalUniversalSourceSkins;
  }

  return catalog;
}

function validateSkinCatalogItem(value: unknown, context: string): SkinCatalogItem {
  const itemRecord = asRecord(value, context);

  const item: SkinCatalogItem = {
    car_folder: readRequiredString(itemRecord, "car_folder", context),
    skin_folder: readRequiredString(itemRecord, "skin_folder", context),
    ingame_decal_name: readRequiredString(itemRecord, "ingame_decal_name", context),
    item_type: readRequiredString(itemRecord, "item_type", context),
    output_upk_file: readRequiredString(itemRecord, "output_upk_file", context),
  };

  const ingameBody = readOptionalString(itemRecord, "ingame_body", context);
  if (ingameBody !== undefined) {
    item.ingame_body = ingameBody;
  }

  const skinOriginale = readOptionalString(itemRecord, "skin_originale", context);
  if (skinOriginale !== undefined) {
    item.skin_originale = skinOriginale;
  }

  const sourceScope = readOptionalString(itemRecord, "source_scope", context);
  if (sourceScope !== undefined) {
    item.source_scope = sourceScope;
  }

  const isUniversalSource = readOptionalBoolean(itemRecord, "is_universal_source", context);
  if (isUniversalSource !== undefined) {
    item.is_universal_source = isUniversalSource;
  }

  const isUniversalIngame = readOptionalBoolean(itemRecord, "is_universal_ingame", context);
  if (isUniversalIngame !== undefined) {
    item.is_universal_ingame = isUniversalIngame;
  }

  const remoteFiles = readOptionalRemoteFileReferenceArray(itemRecord, "remote_files", context);
  if (remoteFiles.length > 0) {
    item.remote_files = remoteFiles;
  }

  return item;
}

function validateWheelCatalog(value: unknown): WheelCatalog {
  const root = asRecord(value, "Wheel catalog");
  const wheelsValue = readRequiredArray(root, "wheels", "Wheel catalog");
  const wheels: WheelCatalogItem[] = [];

  for (let index = 0; index < wheelsValue.length; index += 1) {
    wheels.push(validateWheelCatalogItem(wheelsValue[index], `Wheel catalog wheels[${index}]`));
  }

  const catalog: WheelCatalog = {
    wheels,
    total_wheels: typeof root.total_wheels === "number" && Number.isFinite(root.total_wheels)
      ? root.total_wheels
      : wheels.length,
    base_files: readWheelBaseFiles(root.base_files, wheels),
    base_thumbnail: normalizeOptionalStringValue(root.base_thumbnail) ?? "",
    base_thumbnail_path: normalizeOptionalStringValue(root.base_thumbnail_path) ?? "",
  };

  const schema = normalizeOptionalStringValue(root.schema);
  if (schema !== undefined) {
    catalog.schema = schema;
  }

  const remoteThumbnail = readOptionalRemoteFileReference(root, "remote_thumbnail", "Wheel catalog");
  if (remoteThumbnail) {
    catalog.remote_thumbnail = remoteThumbnail;
  }

  return catalog;
}

function validateWheelCatalogItem(value: unknown, context: string): WheelCatalogItem {
  const itemRecord = asRecord(value, context);

  const item: WheelCatalogItem = {
    wheel_folder: readRequiredString(itemRecord, "wheel_folder", context),
    ingame_wheel_name: readRequiredString(itemRecord, "ingame_wheel_name", context),
    item_type: normalizeWheelItemType(itemRecord.item_type),
    output_upk_file: readRequiredString(itemRecord, "output_upk_file", context),
  };

  const wheelOriginale = normalizeOptionalStringValue(itemRecord.wheel_originale);
  if (wheelOriginale !== undefined) {
    item.wheel_originale = wheelOriginale;
  }

  const remoteFiles = readOptionalRemoteFileReferenceArray(itemRecord, "remote_files", context);
  if (remoteFiles.length > 0) {
    item.remote_files = remoteFiles;
  }

  return item;
}

function validateBoostCatalog(value: unknown): BoostCatalog {
  const root = asRecord(value, "Boost catalog");
  const boostsValue = readRequiredArray(root, "boosts", "Boost catalog");
  const boosts: BoostCatalogItem[] = [];

  for (let index = 0; index < boostsValue.length; index += 1) {
    boosts.push(validateBoostCatalogItem(boostsValue[index], `Boost catalog boosts[${index}]`));
  }

  const catalog: BoostCatalog = {
    boosts,
    total_boosts: typeof root.total_boosts === "number" && Number.isFinite(root.total_boosts)
      ? root.total_boosts
      : boosts.length,
    base_files: readBoostBaseFiles(root.base_files, boosts),
    base_thumbnail: normalizeOptionalStringValue(root.base_thumbnail) ?? "",
    base_thumbnail_path: normalizeOptionalStringValue(root.base_thumbnail_path) ?? "",
  };

  const schema = normalizeOptionalStringValue(root.schema);
  if (schema !== undefined) {
    catalog.schema = schema;
  }

  const remoteThumbnail = readOptionalRemoteFileReference(root, "remote_thumbnail", "Boost catalog");
  if (remoteThumbnail) {
    catalog.remote_thumbnail = remoteThumbnail;
  }

  return catalog;
}

function validateBoostCatalogItem(value: unknown, context: string): BoostCatalogItem {
  const itemRecord = asRecord(value, context);
  const boostFolder = readRequiredString(itemRecord, "boost_folder", context);
  const ingameBoostName = readRequiredString(itemRecord, "ingame_boost_name", context);

  const outputFiles = normalizeStringArray(itemRecord.output_files);
  const outputVisualUpkFile = normalizeOptionalStringValue(itemRecord.output_visual_upk_file);
  const outputAudioBnkFile = normalizeOptionalStringValue(itemRecord.output_audio_bnk_file);

  const finalOutputFiles = outputFiles.length > 0
    ? outputFiles
    : [outputVisualUpkFile, outputAudioBnkFile].filter((entry): entry is string => Boolean(entry));

  if (finalOutputFiles.length === 0) {
    throw new Error(`${context} must define output_files or output_visual_upk_file/output_audio_bnk_file`);
  }

  const item: BoostCatalogItem = {
    boost_folder: boostFolder,
    ingame_boost_name: ingameBoostName,
    output_files: Array.from(new Set(finalOutputFiles)),
    item_type: "Boost",
  };

  const boostOriginale = normalizeOptionalStringValue(itemRecord.boost_originale);
  if (boostOriginale !== undefined) {
    item.boost_originale = boostOriginale;
  }

  const productPath = normalizeOptionalStringValue(itemRecord.product_path);
  if (productPath !== undefined) {
    item.product_path = productPath;
  }

  const hasThumbnail = typeof itemRecord.has_thumbnail === "boolean" ? itemRecord.has_thumbnail : undefined;
  if (hasThumbnail !== undefined) {
    item.has_thumbnail = hasThumbnail;
  }

  if (outputVisualUpkFile !== undefined) {
    item.output_visual_upk_file = outputVisualUpkFile;
  }
  if (outputAudioBnkFile !== undefined) {
    item.output_audio_bnk_file = outputAudioBnkFile;
  }

  const remoteFiles = readOptionalRemoteFileReferenceArray(itemRecord, "remote_files", context);
  if (remoteFiles.length > 0) {
    item.remote_files = remoteFiles;
  }

  return item;
}

function normalizeOptionalStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeWheelItemType(value: unknown): "Wheel" | "Wheels" {
  const normalized = normalizeOptionalStringValue(value);
  if (normalized === "Wheel" || normalized === "Wheels") {
    return normalized;
  }

  return "Wheels";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readOptionalRemoteFileReference(
  source: Record<string, unknown>,
  key: string,
  context: string,
): RemoteCatalogFileReference | undefined {
  const value = source[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = asRecord(value, `${context}.${key}`);
  const filename = readRequiredString(record, "filename", `${context}.${key}`);
  const remotePath = readRequiredString(record, "remote_path", `${context}.${key}`);
  return {
    filename: filename.trim(),
    remote_path: remotePath.trim(),
  };
}

function readOptionalRemoteFileReferenceArray(
  source: Record<string, unknown>,
  key: string,
  context: string,
): RemoteCatalogFileReference[] {
  const value = source[key];
  if (value === undefined || value === null) {
    return [];
  }

  const list = readRequiredArray(source, key, context);
  const remoteFiles: RemoteCatalogFileReference[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = asRecord(list[index], `${context}.${key}[${index}]`);
    const filename = readRequiredString(item, "filename", `${context}.${key}[${index}]`);
    const remotePath = readRequiredString(item, "remote_path", `${context}.${key}[${index}]`);
    remoteFiles.push({
      filename: filename.trim(),
      remote_path: remotePath.trim(),
    });
  }

  return remoteFiles;
}

function readWheelBaseFiles(rootValue: unknown, wheels: WheelCatalogItem[]): string[] {
  const fromRoot = normalizeStringArray(rootValue);
  if (fromRoot.length > 0) {
    return Array.from(new Set(fromRoot));
  }

  return Array.from(new Set(wheels.map((entry) => entry.output_upk_file)));
}

function readBoostBaseFiles(rootValue: unknown, boosts: BoostCatalogItem[]): string[] {
  const fromRoot = normalizeStringArray(rootValue);
  if (fromRoot.length > 0) {
    return Array.from(new Set(fromRoot));
  }

  return Array.from(new Set(boosts.flatMap((entry) => entry.output_files)));
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(source: Record<string, unknown>, key: string, context: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }

  return value;
}

function readRequiredNumber(source: Record<string, unknown>, key: string, context: string): number {
  const value = source[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${context}.${key} must be a number`);
  }

  return value;
}

function readOptionalString(source: Record<string, unknown>, key: string, context: string): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${context}.${key} must be a string when provided`);
  }

  return value;
}

function readOptionalNumber(source: Record<string, unknown>, key: string, context: string): number | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${context}.${key} must be a number when provided`);
  }

  return value;
}

function readOptionalBoolean(source: Record<string, unknown>, key: string, context: string): boolean | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${context}.${key} must be a boolean when provided`);
  }

  return value;
}

function readRequiredArray(source: Record<string, unknown>, key: string, context: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new Error(`${context}.${key} must be an array`);
  }

  return value;
}

function readRequiredStringArray(source: Record<string, unknown>, key: string, context: string): string[] {
  const value = readRequiredArray(source, key, context);
  if (value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`${context}.${key} must be an array of non-empty strings`);
  }

  return value as string[];
}
