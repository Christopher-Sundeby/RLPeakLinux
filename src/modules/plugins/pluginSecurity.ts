import { buildRemoteFileUrl } from "../items/remoteApiService";

export const PLUGIN_MANIFEST_URL = "https://api.rlpeak.com/v1/plugins/manifest.json";
export const PLUGIN_DETAIL_BASE_URL = "https://api.rlpeak.com/v1/";
export const PLUGIN_FILES_BASE_URL = "https://api.rlpeak.com/v1/files";
export const ALLOWED_PLUGIN_REMOTE_HOST = "api.rlpeak.com";

const BLOCKED_PLUGIN_ASSET_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".py",
  ".bat",
  ".cmd",
  ".ps1",
  ".js",
  ".mjs",
  ".ts",
  ".sh",
  ".wasm",
]);

const ALLOWED_PLUGIN_ASSET_EXTENSIONS = new Set([
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".webp",
]);

function normalizeRemotePathSegments(remotePath: string): string[] {
  return remotePath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function hasUnsafePathSegments(segments: string[]): boolean {
  return segments.some((segment) => segment === "." || segment === ".." || segment.includes(":"));
}

export function getPluginAssetFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) {
    return "";
  }

  return filename.slice(lastDot).toLowerCase();
}

export function isPluginAssetExtensionAllowed(filename: string): boolean {
  const extension = getPluginAssetFileExtension(filename);
  if (BLOCKED_PLUGIN_ASSET_EXTENSIONS.has(extension)) {
    return false;
  }

  return ALLOWED_PLUGIN_ASSET_EXTENSIONS.has(extension);
}

export function buildPluginDetailUrl(manifestPath: string): string {
  const normalizedPath = manifestPath.trim();
  if (!normalizedPath) {
    throw new Error("Plugin manifest path is empty.");
  }

  const url = new URL(normalizedPath, PLUGIN_DETAIL_BASE_URL);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== ALLOWED_PLUGIN_REMOTE_HOST) {
    throw new Error(`Plugin manifest URL is not allowed: ${url.toString()}`);
  }

  return url.toString();
}

export function resolvePluginAssetRelativeSegments(
  pluginId: string,
  filename: string,
  remotePath: string,
): string[] {
  const normalizedPluginId = pluginId.trim();
  const normalizedFilename = filename.trim();
  const segments = normalizeRemotePathSegments(remotePath);
  if (!normalizedPluginId || !normalizedFilename || segments.length === 0) {
    throw new Error("Plugin asset entry is invalid.");
  }
  if (hasUnsafePathSegments(segments)) {
    throw new Error(`Plugin asset remote path is invalid: ${remotePath}`);
  }

  const pluginPrefix = ["Plugins", normalizedPluginId].map((segment) => segment.toLowerCase());
  if (segments.length < pluginPrefix.length) {
    throw new Error(`Plugin asset remote path is not scoped to plugin: ${remotePath}`);
  }

  for (let index = 0; index < pluginPrefix.length; index += 1) {
    if (segments[index].toLowerCase() !== pluginPrefix[index]) {
      throw new Error(`Plugin asset remote path is not scoped to plugin: ${remotePath}`);
    }
  }

  const trailingSegments = segments.slice(pluginPrefix.length);
  if (trailingSegments.length === 0) {
    throw new Error(`Plugin asset remote path does not include a file name: ${remotePath}`);
  }
  const trailingFileName = trailingSegments[trailingSegments.length - 1];
  if (trailingFileName !== normalizedFilename) {
    throw new Error(`Plugin asset filename mismatch: ${filename}`);
  }
  if (!isPluginAssetExtensionAllowed(normalizedFilename)) {
    throw new Error(`Plugin asset extension is not allowed: ${normalizedFilename}`);
  }

  return trailingSegments;
}

export function buildPluginAssetUrl(remotePath: string): string {
  return buildRemoteFileUrl(PLUGIN_FILES_BASE_URL, remotePath);
}
