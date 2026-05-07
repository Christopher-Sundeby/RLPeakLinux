const PRODUCTION_MANIFEST_URL = "https://api.rlpeak.com/v1/manifest.json";
const ALLOWED_REMOTE_PROTOCOL = "https:";
const ALLOWED_REMOTE_HOST = "api.rlpeak.com";

export type RemoteApiErrorCode =
  | "InvalidRemoteUrl"
  | "RequestFailed"
  | "InvalidRemoteJson"
  | "InvalidManifest";

export class RemoteApiError extends Error {
  public readonly code: RemoteApiErrorCode;

  constructor(code: RemoteApiErrorCode, message: string) {
    super(message);
    this.name = "RemoteApiError";
    this.code = code;
  }
}

export interface RemoteCatalogFileReference {
  filename: string;
  remote_path: string;
}

export interface RemoteManifest {
  schema: string;
  api_version: string;
  catalog_version?: string;
  app_min_version?: string;
  base_files_url: string;
  catalogs: {
    skins: string;
    wheels: string;
    boosts: string;
  };
  source: string;
}

interface ParsedRemoteUrlOptions {
  requireFileBasePathPrefix?: boolean;
}

function readRequiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new RemoteApiError("InvalidManifest", `${context}.${key} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeRemotePath(remotePath: string): string {
  const normalized = remotePath.replace(/\\/g, "/").trim();
  const segments = normalized
    .split("/")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (segments.length === 0) {
    throw new RemoteApiError("InvalidRemoteUrl", "remote_path is empty");
  }

  for (const segment of segments) {
    if (segment === "." || segment === ".." || segment.includes(":")) {
      throw new RemoteApiError("InvalidRemoteUrl", `remote_path contains an invalid segment: ${segment}`);
    }
  }

  return segments.join("/");
}

function parseAllowedRemoteUrl(urlValue: string, options?: ParsedRemoteUrlOptions): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlValue);
  } catch {
    throw new RemoteApiError("InvalidRemoteUrl", `Invalid remote URL: ${urlValue}`);
  }

  if (parsed.protocol !== ALLOWED_REMOTE_PROTOCOL || parsed.hostname.toLowerCase() !== ALLOWED_REMOTE_HOST) {
    throw new RemoteApiError("InvalidRemoteUrl", `Remote URL is not allowed: ${urlValue}`);
  }

  if (options?.requireFileBasePathPrefix === true && !parsed.pathname.startsWith("/v1/files")) {
    throw new RemoteApiError("InvalidRemoteUrl", `Remote files base path is invalid: ${urlValue}`);
  }

  return parsed;
}

export function getProductionManifestUrl(): string {
  return PRODUCTION_MANIFEST_URL;
}

export function buildRemoteFileUrl(baseFilesUrl: string, remotePath: string): string {
  const parsedBaseUrl = parseAllowedRemoteUrl(baseFilesUrl, {
    requireFileBasePathPrefix: true,
  });
  const normalizedPath = normalizeRemotePath(remotePath);
  const encodedPath = normalizedPath
    .split("/")
    .map((entry) => encodeURIComponent(entry))
    .join("/");

  const basePath = parsedBaseUrl.pathname.endsWith("/") ? parsedBaseUrl.pathname : `${parsedBaseUrl.pathname}/`;
  const fullPath = `${basePath}${encodedPath}`.replace(/\/{2,}/g, "/");

  const url = new URL(parsedBaseUrl.origin);
  url.pathname = fullPath;
  return url.toString();
}

export async function fetchRemoteJson(urlValue: string): Promise<unknown> {
  const parsedUrl = parseAllowedRemoteUrl(urlValue);

  let response: Response;
  try {
    response = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new RemoteApiError("RequestFailed", `Remote request failed: ${parsedUrl.toString()}`);
  }

  if (!response.ok) {
    throw new RemoteApiError("RequestFailed", `Remote request failed with status ${response.status}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new RemoteApiError("InvalidRemoteJson", `Remote JSON is invalid: ${parsedUrl.toString()}`);
  }
}

export async function fetchProductionManifest(): Promise<RemoteManifest> {
  const payload = await fetchRemoteJson(PRODUCTION_MANIFEST_URL);
  return parseRemoteManifest(payload, PRODUCTION_MANIFEST_URL);
}

let sharedManifest: RemoteManifest | null = null;
let sharedManifestPromise: Promise<RemoteManifest> | null = null;

export async function getSharedRemoteManifest(options?: { forceReload?: boolean }): Promise<RemoteManifest> {
  if (!options?.forceReload && sharedManifest) {
    return sharedManifest;
  }

  if (!options?.forceReload && sharedManifestPromise) {
    return sharedManifestPromise;
  }

  const manifestPromise = fetchProductionManifest()
    .then((manifest) => {
      sharedManifest = manifest;
      return manifest;
    })
    .finally(() => {
      sharedManifestPromise = null;
    });

  sharedManifestPromise = manifestPromise;
  return manifestPromise;
}

export function clearSharedRemoteManifest(): void {
  sharedManifest = null;
  sharedManifestPromise = null;
}

export function parseRemoteManifest(payload: unknown, source: string): RemoteManifest {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new RemoteApiError("InvalidManifest", "Manifest payload must be an object");
  }

  const record = payload as Record<string, unknown>;
  const catalogsValue = record.catalogs;
  if (typeof catalogsValue !== "object" || catalogsValue === null || Array.isArray(catalogsValue)) {
    throw new RemoteApiError("InvalidManifest", "Manifest catalogs must be an object");
  }

  const catalogsRecord = catalogsValue as Record<string, unknown>;
  const baseFilesUrl = readRequiredString(record, "base_files_url", "Manifest");
  parseAllowedRemoteUrl(baseFilesUrl, { requireFileBasePathPrefix: true });

  const manifest: RemoteManifest = {
    schema: readRequiredString(record, "schema", "Manifest"),
    api_version: readRequiredString(record, "api_version", "Manifest"),
    base_files_url: baseFilesUrl,
    catalogs: {
      skins: readRequiredString(catalogsRecord, "skins", "Manifest catalogs"),
      wheels: readRequiredString(catalogsRecord, "wheels", "Manifest catalogs"),
      boosts: readRequiredString(catalogsRecord, "boosts", "Manifest catalogs"),
    },
    source,
  };

  for (const catalogUrl of Object.values(manifest.catalogs)) {
    parseAllowedRemoteUrl(catalogUrl);
  }

  const catalogVersion = record.catalog_version;
  if (typeof catalogVersion === "string" && catalogVersion.trim()) {
    manifest.catalog_version = catalogVersion.trim();
  }

  const appMinVersion = record.app_min_version;
  if (typeof appMinVersion === "string" && appMinVersion.trim()) {
    manifest.app_min_version = appMinVersion.trim();
  }

  return manifest;
}
