import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import {
  buildRemoteFileUrl,
  type RemoteCatalogFileReference,
  type RemoteManifest,
  RemoteApiError,
} from "./remoteApiService";
import type { LocalAppDataPaths } from "./pathService";

interface EnsureRemoteCachedFileInput {
  paths: LocalAppDataPaths;
  manifest: RemoteManifest;
  remoteFile: RemoteCatalogFileReference;
}

interface ResolveRemoteCachePathInput {
  paths: LocalAppDataPaths;
  remoteFile: RemoteCatalogFileReference;
}

interface EnsureRemoteCachedThumbnailInput {
  paths: LocalAppDataPaths;
  manifest: RemoteManifest;
  remoteThumbnail?: RemoteCatalogFileReference;
}

interface EnsureRemoteCachedFileResult {
  ok: true;
  cachePath: string;
  wasDownloaded: boolean;
}

interface EnsureRemoteCachedFileErrorResult {
  ok: false;
  message: string;
  details?: string;
}

export type EnsureRemoteCachedFileOperationResult = EnsureRemoteCachedFileResult | EnsureRemoteCachedFileErrorResult;

function toDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown error";
}

function normalizeRemotePath(remotePath: string): string[] {
  return remotePath
    .replace(/\\/g, "/")
    .split("/")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isRemotePathSafe(segments: string[]): boolean {
  if (segments.length === 0) {
    return false;
  }

  return segments.every((segment) => {
    if (segment === "." || segment === "..") {
      return false;
    }
    if (segment.includes(":")) {
      return false;
    }

    return true;
  });
}

async function joinPath(...parts: string[]): Promise<string> {
  if (!isTauri()) {
    return parts.join("/").replace(/\\/g, "/");
  }

  return join(...parts);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("path_exists", { path });
  } catch {
    return false;
  }
}

export async function resolveRemoteCacheFilePath(
  input: ResolveRemoteCachePathInput,
): Promise<string | null> {
  const remotePath = input.remoteFile.remote_path.trim();
  const filename = input.remoteFile.filename.trim();
  if (!remotePath || !filename) {
    return null;
  }

  const segments = normalizeRemotePath(remotePath);
  if (!isRemotePathSafe(segments)) {
    return null;
  }

  const lastSegment = segments[segments.length - 1];
  if (!lastSegment || lastSegment !== filename) {
    return null;
  }

  return joinPath(input.paths.cacheItemsRoot, ...segments);
}

export async function isRemoteFileCached(
  input: ResolveRemoteCachePathInput,
): Promise<boolean> {
  const cachePath = await resolveRemoteCacheFilePath(input);
  if (!cachePath) {
    return false;
  }

  return pathExists(cachePath);
}

export async function ensureRemoteFileCached(input: EnsureRemoteCachedFileInput): Promise<EnsureRemoteCachedFileOperationResult> {
  const remotePath = input.remoteFile.remote_path.trim();
  const filename = input.remoteFile.filename.trim();
  if (!remotePath || !filename) {
    return {
      ok: false,
      message: "Download failed. Please check your connection and try again.",
      details: "Remote file entry is missing filename or remote_path.",
    };
  }

  const destinationPath = await resolveRemoteCacheFilePath({
    paths: input.paths,
    remoteFile: input.remoteFile,
  });
  if (!destinationPath) {
    return {
      ok: false,
      message: "Download failed. Please check your connection and try again.",
      details: `Invalid remote cache path for ${filename}`,
    };
  }
  if (await pathExists(destinationPath)) {
    return {
      ok: true,
      cachePath: destinationPath,
      wasDownloaded: false,
    };
  }

  let downloadUrl: string;
  try {
    downloadUrl = buildRemoteFileUrl(input.manifest.base_files_url, remotePath);
  } catch (error: unknown) {
    const details = toDetails(error);
    const userMessage = error instanceof RemoteApiError && error.code === "InvalidRemoteUrl"
      ? "RLPeak servers are unavailable. Please try again later."
      : "Download failed. Please check your connection and try again.";

    return {
      ok: false,
      message: userMessage,
      details,
    };
  }

  try {
    await invoke("download_remote_file", {
      url: downloadUrl,
      destinationPath,
    });
  } catch (error: unknown) {
    const details = toDetails(error);
    const userMessage = details.includes("REMOTE_URL_NOT_ALLOWED")
      ? "RLPeak servers are unavailable. Please try again later."
      : "Download failed. Please check your connection and try again.";

    return {
      ok: false,
      message: userMessage,
      details,
    };
  }

  if (!(await pathExists(destinationPath))) {
    return {
      ok: false,
      message: "Download failed. Please check your connection and try again.",
      details: `Downloaded file not found in cache: ${destinationPath}`,
    };
  }

  return {
    ok: true,
    cachePath: destinationPath,
    wasDownloaded: true,
  };
}

export async function ensureRemoteThumbnailCached(
  input: EnsureRemoteCachedThumbnailInput,
): Promise<EnsureRemoteCachedFileOperationResult | null> {
  const remoteThumbnail = input.remoteThumbnail;
  if (!remoteThumbnail) {
    return null;
  }

  return ensureRemoteFileCached({
    paths: input.paths,
    manifest: input.manifest,
    remoteFile: remoteThumbnail,
  });
}
