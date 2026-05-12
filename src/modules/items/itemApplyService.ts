import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { ensureBackup } from "./backupService";
import { mapApplyCopyFailure, mapBackupFailureForApply } from "./fileOperationErrorMapper";
import { getLocalAppDataPaths } from "./pathService";
import {
  ensureRemoteFileCached,
  ensureRemoteThumbnailCached,
  isRemoteFileCached,
  resolveRemoteCacheFilePath,
} from "./remoteFileCacheService";
import {
  getSharedRemoteManifest,
  type RemoteCatalogFileReference,
} from "./remoteApiService";
import { getCookedPcConsolePath } from "./rocketLeaguePathService";
import { loadAppState, saveAppState } from "./stateService";
import { mapItemApplyFailureToMetricsCode, trackEvent } from "../metrics/metricsService";
import type { AppState, BoostCatalogItem, SkinCatalogItem, WheelCatalogItem } from "./types";

export interface ApplySkinInput {
  rocketLeaguePath: string;
  carKey: string;
  skin: SkinCatalogItem;
  thumbnailFile?: string;
  thumbnailPath?: string;
  remoteThumbnail?: RemoteCatalogFileReference;
  onStatusChange?: ApplyStatusChangeHandler;
}

export interface ApplyWheelInput {
  rocketLeaguePath: string;
  wheel: WheelCatalogItem;
  thumbnailFile?: string;
  thumbnailPath?: string;
  remoteThumbnail?: RemoteCatalogFileReference;
  onStatusChange?: ApplyStatusChangeHandler;
}

export interface ApplyBoostInput {
  rocketLeaguePath: string;
  boost: BoostCatalogItem;
  thumbnailFile?: string;
  thumbnailPath?: string;
  remoteThumbnail?: RemoteCatalogFileReference;
  onStatusChange?: ApplyStatusChangeHandler;
}

export type ApplyStatusStep = "downloading" | "applying";
export type ApplyStatusChangeHandler = (step: ApplyStatusStep) => void;

type ApplyOperationErrorCode =
  | "DesktopRuntimeRequired"
  | "InvalidInput"
  | "MissingItemFile"
  | "GameFileNotFound"
  | "BackupFailed"
  | "ApplyFailed";

export type ApplySkinErrorCode = ApplyOperationErrorCode;
export type ApplyWheelErrorCode = ApplyOperationErrorCode;
export type ApplyBoostErrorCode = ApplyOperationErrorCode;

interface ApplySuccessResult {
  ok: true;
  message: "Applied successfully";
  warnings?: string[];
}

interface ApplyErrorResult {
  ok: false;
  code: ApplyOperationErrorCode;
  message: string;
  details?: string;
}

export type ApplySkinResult = ApplySuccessResult | ApplyErrorResult;
export type ApplyWheelResult = ApplySuccessResult | ApplyErrorResult;
export type ApplyBoostResult = ApplySuccessResult | ApplyErrorResult;

interface ThumbnailApplyInput {
  sourcePath?: string;
  destinationPath?: string;
  backupPath?: string;
  destinationFileName?: string;
}

interface ThumbnailApplyResult {
  applied: boolean;
  thumbnailFile?: string;
  warning?: string;
}

async function joinPath(...parts: string[]): Promise<string> {
  if (isTauri()) {
    return join(...parts);
  }

  return parts.join("/").replace(/\\/g, "/");
}

async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

function splitRelativePath(pathValue: string): string[] {
  return pathValue
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

interface ResolvedSourcePathResult {
  ok: true;
  sourcePath: string;
  downloaded: boolean;
  usedRemote: boolean;
}

interface ResolvedSourcePathErrorResult {
  ok: false;
  message: string;
  details?: string;
}

type ResolvedSourcePathOperationResult = ResolvedSourcePathResult | ResolvedSourcePathErrorResult;

async function resolveRequiredSourcePath(input: {
  localSourcePath: string;
  remoteFiles?: RemoteCatalogFileReference[];
  paths: Awaited<ReturnType<typeof getLocalAppDataPaths>>;
  onStatusChange?: ApplyStatusChangeHandler;
}): Promise<ResolvedSourcePathOperationResult> {
  const remoteFiles = input.remoteFiles ?? [];
  if (remoteFiles.length === 0) {
    return {
      ok: true,
      sourcePath: input.localSourcePath,
      downloaded: false,
      usedRemote: false,
    };
  }

  const uniqueRemoteFiles = Array.from(
    new Map(
      remoteFiles
        .filter((entry) => entry.filename.trim() && entry.remote_path.trim())
        .map((entry) => [entry.remote_path.trim(), entry]),
    ).values(),
  );

  if (uniqueRemoteFiles.length === 0) {
    return {
      ok: true,
      sourcePath: input.localSourcePath,
      downloaded: false,
      usedRemote: false,
    };
  }

  const firstRemote = uniqueRemoteFiles[0];
  if (!firstRemote) {
    return {
      ok: true,
      sourcePath: input.localSourcePath,
      downloaded: false,
      usedRemote: false,
    };
  }

  const alreadyCached = await isRemoteFileCached({
    paths: input.paths,
    remoteFile: firstRemote,
  });
  if (alreadyCached) {
    const cachedPath = await resolveRemoteCacheFilePath({
      paths: input.paths,
      remoteFile: firstRemote,
    });
    if (cachedPath) {
      return {
        ok: true,
        sourcePath: cachedPath,
        downloaded: false,
        usedRemote: true,
      };
    }
  }

  if (!alreadyCached) {
    input.onStatusChange?.("downloading");
  }

  let manifest;
  try {
    manifest = await getSharedRemoteManifest();
  } catch {
    return {
      ok: false,
      message: "RLPeak servers are unavailable. Please try again later.",
    };
  }

  const cached = await ensureRemoteFileCached({
    paths: input.paths,
    manifest,
    remoteFile: firstRemote,
  });
  if (!cached.ok) {
    return {
      ok: false,
      message: cached.message,
      details: cached.details,
    };
  }

  return {
    ok: true,
    sourcePath: cached.cachePath,
    downloaded: cached.wasDownloaded,
    usedRemote: true,
  };
}

async function resolveOptionalThumbnailSourcePath(input: {
  localSourcePath?: string;
  remoteThumbnail?: RemoteCatalogFileReference;
  paths: Awaited<ReturnType<typeof getLocalAppDataPaths>>;
  onStatusChange?: ApplyStatusChangeHandler;
}): Promise<{ sourcePath?: string; warning?: string; downloaded?: boolean }> {
  if (!input.remoteThumbnail) {
    return {
      sourcePath: input.localSourcePath,
    };
  }

  const cachedPath = await resolveRemoteCacheFilePath({
    paths: input.paths,
    remoteFile: input.remoteThumbnail,
  });
  if (!cachedPath) {
    return {
      warning: "Thumbnail skipped: Download failed. Please check your connection and try again.",
    };
  }

  const alreadyCached = await pathExists(cachedPath);
  if (alreadyCached) {
    return {
      sourcePath: cachedPath,
      downloaded: false,
    };
  }

  if (!alreadyCached) {
    input.onStatusChange?.("downloading");
  }

  let manifest;
  try {
    manifest = await getSharedRemoteManifest();
  } catch {
    return {
      warning: "Thumbnail skipped: RLPeak servers are unavailable. Please try again later.",
    };
  }

  const cached = await ensureRemoteThumbnailCached({
    paths: input.paths,
    manifest,
    remoteThumbnail: input.remoteThumbnail,
  });
  if (!cached) {
    return {
      sourcePath: input.localSourcePath,
    };
  }
  if (!cached.ok) {
    return {
      warning: `Thumbnail skipped: ${cached.message}`,
    };
  }

  return {
    sourcePath: cached.cachePath,
    downloaded: cached.wasDownloaded,
  };
}

async function applyOptionalThumbnail(input: ThumbnailApplyInput): Promise<ThumbnailApplyResult> {
  const sourcePath = normalizeOptional(input.sourcePath);
  const destinationPath = normalizeOptional(input.destinationPath);
  const backupPath = normalizeOptional(input.backupPath);
  const thumbnailFile = normalizeOptional(input.destinationFileName);

  if (!sourcePath || !destinationPath || !backupPath || !thumbnailFile) {
    return { applied: false };
  }

  const sourceExists = await pathExists(sourcePath);
  if (!sourceExists) {
    return {
      applied: false,
      warning: "Thumbnail skipped: Missing item file",
    };
  }

  const destinationExists = await pathExists(destinationPath);
  if (!destinationExists) {
    return {
      applied: false,
      warning: "Thumbnail skipped: Game file not found",
    };
  }

  const backupResult = await ensureBackup({
    sourcePath: destinationPath,
    backupPath,
  });
  if (!backupResult.ok) {
    const mappedBackupError = mapBackupFailureForApply(backupResult.details);
    return {
      applied: false,
      warning: `Thumbnail skipped: ${mappedBackupError.message}`,
    };
  }

  try {
    await invoke("copy_file", { sourcePath, destinationPath });
    return {
      applied: true,
      thumbnailFile,
    };
  } catch (error: unknown) {
    const mappedCopyError = mapApplyCopyFailure(error);
    return {
      applied: false,
      warning: `Thumbnail skipped: ${mappedCopyError.message}`,
    };
  }
}

async function persistAppliedSkinState(input: ApplySkinInput, thumbnailFile?: string): Promise<void> {
  const current = await loadAppState();
  const timestamp = new Date().toISOString();
  const normalizedCarKey = input.carKey.trim() || input.skin.car_folder;

  const skinState: {
    skin_folder: string;
    display_name: string;
    base_file: string;
    applied_at: string;
    thumbnail_file?: string;
  } = {
    skin_folder: input.skin.skin_folder,
    display_name: input.skin.ingame_decal_name,
    base_file: input.skin.output_upk_file,
    applied_at: timestamp,
  };
  if (thumbnailFile) {
    skinState.thumbnail_file = thumbnailFile;
  }

  const nextState: AppState = {
    ...current,
    activeItems: {
      ...current.activeItems,
      Skin: {
        ...current.activeItems?.Skin,
        [normalizedCarKey]: skinState,
      },
    },
    lastAction: {
      type: "apply",
      itemType: "Skin",
      displayName: input.skin.ingame_decal_name,
      timestamp,
    },
  };

  await saveAppState(nextState);
}

async function persistAppliedWheelState(input: ApplyWheelInput, thumbnailFile?: string): Promise<void> {
  const current = await loadAppState();
  const timestamp = new Date().toISOString();

  const wheelState: {
    wheel_folder: string;
    display_name: string;
    base_file: string;
    applied_at: string;
    thumbnail_file?: string;
  } = {
    wheel_folder: input.wheel.wheel_folder,
    display_name: input.wheel.ingame_wheel_name,
    base_file: input.wheel.output_upk_file,
    applied_at: timestamp,
  };
  if (thumbnailFile) {
    wheelState.thumbnail_file = thumbnailFile;
  }

  const nextState: AppState = {
    ...current,
    activeItems: {
      ...current.activeItems,
      Wheel: {
        ...(current.activeItems?.Wheel ?? {}),
        current: wheelState,
      },
    },
    lastAction: {
      type: "apply",
      itemType: "Wheel",
      displayName: input.wheel.ingame_wheel_name,
      timestamp,
    },
  };

  await saveAppState(nextState);
}

async function persistAppliedBoostState(input: ApplyBoostInput, thumbnailFile?: string): Promise<void> {
  const current = await loadAppState();
  const timestamp = new Date().toISOString();

  const boostState: {
    boost_folder: string;
    display_name: string;
    base_files: string[];
    applied_at: string;
    thumbnail_file?: string;
  } = {
    boost_folder: input.boost.boost_folder,
    display_name: input.boost.ingame_boost_name,
    base_files: Array.from(new Set(input.boost.output_files)),
    applied_at: timestamp,
  };
  if (thumbnailFile) {
    boostState.thumbnail_file = thumbnailFile;
  }

  const nextState: AppState = {
    ...current,
    activeItems: {
      ...current.activeItems,
      Boost: {
        ...(current.activeItems?.Boost ?? {}),
        current: boostState,
      },
    },
    lastAction: {
      type: "apply",
      itemType: "Boost",
      displayName: input.boost.ingame_boost_name,
      timestamp,
    },
  };

  await saveAppState(nextState);
}

async function applySkinInternal(input: ApplySkinInput): Promise<ApplySkinResult> {
  const rocketLeaguePath = input.rocketLeaguePath.trim();
  const normalizedCarKey = input.carKey.trim() || input.skin.car_folder;

  if (!rocketLeaguePath || !normalizedCarKey) {
    return {
      ok: false,
      code: "InvalidInput",
      message: "Apply failed",
      details: "Rocket League path and car key are required.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      code: "DesktopRuntimeRequired",
      message: "Apply failed",
      details: "Apply actions are available in desktop runtime.",
    };
  }

  try {
    const paths = await getLocalAppDataPaths();
    const cookedPcConsolePath = await getCookedPcConsolePath(rocketLeaguePath);
    const localSourcePath = await joinPath(
      paths.itemsSkinDir,
      input.skin.car_folder,
      input.skin.skin_folder,
      input.skin.output_upk_file,
    );
    const sourceResolution = await resolveRequiredSourcePath({
      localSourcePath,
      remoteFiles: input.skin.remote_files,
      paths,
      onStatusChange: input.onStatusChange,
    });
    if (!sourceResolution.ok) {
      return {
        ok: false,
        code: "ApplyFailed",
        message: sourceResolution.message,
        details: sourceResolution.details,
      };
    }

    const sourcePath = sourceResolution.sourcePath;
    const destinationPath = await joinPath(cookedPcConsolePath, input.skin.output_upk_file);
    const backupPath = await joinPath(paths.backupsSkinDir, normalizedCarKey, input.skin.output_upk_file);

    const sourceExists = await pathExists(sourcePath);
    if (!sourceExists) {
      return {
        ok: false,
        code: "MissingItemFile",
        message: "Missing item file",
        details: `Source missing: ${sourcePath}`,
      };
    }

    const destinationExists = await pathExists(destinationPath);
    if (!destinationExists) {
      return {
        ok: false,
        code: "GameFileNotFound",
        message: "Game file not found",
        details: `Destination missing: ${destinationPath}`,
      };
    }

    input.onStatusChange?.("applying");

    const backupResult = await ensureBackup({
      sourcePath: destinationPath,
      backupPath,
    });
    if (!backupResult.ok) {
      const mappedBackupError = mapBackupFailureForApply(backupResult.details);
      return {
        ok: false,
        code: mappedBackupError.code,
        message: mappedBackupError.message,
        details: mappedBackupError.details,
      };
    }

    try {
      await invoke("copy_file", { sourcePath, destinationPath });
    } catch (error: unknown) {
      const mappedCopyError = mapApplyCopyFailure(error);
      return {
        ok: false,
        code: mappedCopyError.code,
        message: mappedCopyError.message,
        details: mappedCopyError.details,
      };
    }

    const warnings: string[] = [];
    const thumbnailPath = normalizeOptional(input.thumbnailPath);
    const thumbnailFile = normalizeOptional(input.thumbnailFile);
    const localThumbnailSourcePath = thumbnailPath
      ? await joinPath(paths.itemsSkinDir, ...splitRelativePath(thumbnailPath))
      : undefined;
    const thumbnailSourceResolution = await resolveOptionalThumbnailSourcePath({
      localSourcePath: localThumbnailSourcePath,
      remoteThumbnail: input.remoteThumbnail,
      paths,
      onStatusChange: input.onStatusChange,
    });
    if (thumbnailSourceResolution.warning) {
      warnings.push(thumbnailSourceResolution.warning);
    }
    const thumbnailSourcePath = thumbnailSourceResolution.sourcePath;
    const thumbnailDestinationPath = thumbnailFile
      ? await joinPath(cookedPcConsolePath, thumbnailFile)
      : undefined;
    const thumbnailBackupPath = thumbnailFile
      ? await joinPath(paths.backupsSkinDir, normalizedCarKey, thumbnailFile)
      : undefined;

    const thumbnailResult = await applyOptionalThumbnail({
      sourcePath: thumbnailSourcePath,
      destinationPath: thumbnailDestinationPath,
      backupPath: thumbnailBackupPath,
      destinationFileName: thumbnailFile,
    });
    if (thumbnailResult.warning) {
      warnings.push(thumbnailResult.warning);
    }

    try {
      await persistAppliedSkinState(
        input,
        thumbnailResult.applied ? thumbnailResult.thumbnailFile : undefined,
      );
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: "ApplyFailed",
        message: "Apply failed",
        details: `State save failed: ${details}`,
      };
    }

    return warnings.length > 0
      ? {
          ok: true,
          message: "Applied successfully",
          warnings,
        }
      : {
          ok: true,
          message: "Applied successfully",
        };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: "ApplyFailed",
      message: "Apply failed",
      details,
    };
  }
}

async function applyWheelInternal(input: ApplyWheelInput): Promise<ApplyWheelResult> {
  const rocketLeaguePath = input.rocketLeaguePath.trim();
  const wheelFolder = input.wheel.wheel_folder.trim();
  const outputUpkFile = input.wheel.output_upk_file.trim();

  if (!rocketLeaguePath || !wheelFolder || !outputUpkFile) {
    return {
      ok: false,
      code: "InvalidInput",
      message: "Apply failed",
      details: "Rocket League path, wheel folder, and output file are required.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      code: "DesktopRuntimeRequired",
      message: "Apply failed",
      details: "Apply actions are available in desktop runtime.",
    };
  }

  try {
    const paths = await getLocalAppDataPaths();
    const cookedPcConsolePath = await getCookedPcConsolePath(rocketLeaguePath);
    const localSourcePath = await joinPath(paths.itemsWheelDir, wheelFolder, outputUpkFile);
    const sourceResolution = await resolveRequiredSourcePath({
      localSourcePath,
      remoteFiles: input.wheel.remote_files,
      paths,
      onStatusChange: input.onStatusChange,
    });
    if (!sourceResolution.ok) {
      return {
        ok: false,
        code: "ApplyFailed",
        message: sourceResolution.message,
        details: sourceResolution.details,
      };
    }

    const sourcePath = sourceResolution.sourcePath;
    const destinationPath = await joinPath(cookedPcConsolePath, outputUpkFile);
    const backupPath = await joinPath(paths.backupsWheelDir, outputUpkFile);

    const sourceExists = await pathExists(sourcePath);
    if (!sourceExists) {
      return {
        ok: false,
        code: "MissingItemFile",
        message: "Missing item file",
        details: `Source missing: ${sourcePath}`,
      };
    }

    const destinationExists = await pathExists(destinationPath);
    if (!destinationExists) {
      return {
        ok: false,
        code: "GameFileNotFound",
        message: "Game file not found",
        details: `Destination missing: ${destinationPath}`,
      };
    }

    input.onStatusChange?.("applying");

    const backupResult = await ensureBackup({
      sourcePath: destinationPath,
      backupPath,
    });
    if (!backupResult.ok) {
      const mappedBackupError = mapBackupFailureForApply(backupResult.details);
      return {
        ok: false,
        code: mappedBackupError.code,
        message: mappedBackupError.message,
        details: mappedBackupError.details,
      };
    }

    try {
      await invoke("copy_file", { sourcePath, destinationPath });
    } catch (error: unknown) {
      const mappedCopyError = mapApplyCopyFailure(error);
      return {
        ok: false,
        code: mappedCopyError.code,
        message: mappedCopyError.message,
        details: mappedCopyError.details,
      };
    }

    const warnings: string[] = [];
    const thumbnailPath = normalizeOptional(input.thumbnailPath);
    const thumbnailFile = normalizeOptional(input.thumbnailFile);
    const localThumbnailSourcePath = thumbnailPath
      ? await joinPath(paths.itemsWheelDir, ...splitRelativePath(thumbnailPath))
      : undefined;
    const thumbnailSourceResolution = await resolveOptionalThumbnailSourcePath({
      localSourcePath: localThumbnailSourcePath,
      remoteThumbnail: input.remoteThumbnail,
      paths,
      onStatusChange: input.onStatusChange,
    });
    if (thumbnailSourceResolution.warning) {
      warnings.push(thumbnailSourceResolution.warning);
    }
    const thumbnailSourcePath = thumbnailSourceResolution.sourcePath;
    const thumbnailDestinationPath = thumbnailFile
      ? await joinPath(cookedPcConsolePath, thumbnailFile)
      : undefined;
    const thumbnailBackupPath = thumbnailFile
      ? await joinPath(paths.backupsWheelDir, thumbnailFile)
      : undefined;

    const thumbnailResult = await applyOptionalThumbnail({
      sourcePath: thumbnailSourcePath,
      destinationPath: thumbnailDestinationPath,
      backupPath: thumbnailBackupPath,
      destinationFileName: thumbnailFile,
    });
    if (thumbnailResult.warning) {
      warnings.push(thumbnailResult.warning);
    }

    try {
      await persistAppliedWheelState(
        input,
        thumbnailResult.applied ? thumbnailResult.thumbnailFile : undefined,
      );
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: "ApplyFailed",
        message: "Apply failed",
        details: `State save failed: ${details}`,
      };
    }

    return warnings.length > 0
      ? {
          ok: true,
          message: "Applied successfully",
          warnings,
        }
      : {
          ok: true,
          message: "Applied successfully",
        };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: "ApplyFailed",
      message: "Apply failed",
      details,
    };
  }
}

async function applyBoostInternal(input: ApplyBoostInput): Promise<ApplyBoostResult> {
  const rocketLeaguePath = input.rocketLeaguePath.trim();
  const boostFolder = input.boost.boost_folder.trim();
  const outputFiles = Array.from(new Set(input.boost.output_files.map((entry) => entry.trim()).filter(Boolean)));

  if (!rocketLeaguePath || !boostFolder || outputFiles.length === 0) {
    return {
      ok: false,
      code: "InvalidInput",
      message: "Apply failed",
      details: "Rocket League path, boost folder, and output files are required.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      code: "DesktopRuntimeRequired",
      message: "Apply failed",
      details: "Apply actions are available in desktop runtime.",
    };
  }

  try {
    const paths = await getLocalAppDataPaths();
    const cookedPcConsolePath = await getCookedPcConsolePath(rocketLeaguePath);
    const resolvedOutputFiles: Array<{ outputFile: string; sourcePath: string }> = [];

    for (const outputFile of outputFiles) {
      const localSourcePath = await joinPath(paths.itemsBoostDir, boostFolder, outputFile);
      const remoteMatch = (input.boost.remote_files ?? []).find(
        (entry) => entry.filename.trim() === outputFile,
      );
      const sourceResolution = await resolveRequiredSourcePath({
        localSourcePath,
        remoteFiles: remoteMatch ? [remoteMatch] : undefined,
        paths,
        onStatusChange: input.onStatusChange,
      });
      if (!sourceResolution.ok) {
        return {
          ok: false,
          code: "ApplyFailed",
          message: sourceResolution.message,
          details: sourceResolution.details,
        };
      }

      resolvedOutputFiles.push({
        outputFile,
        sourcePath: sourceResolution.sourcePath,
      });
    }

    input.onStatusChange?.("applying");

    for (const resolvedFile of resolvedOutputFiles) {
      const sourcePath = resolvedFile.sourcePath;
      const destinationPath = await joinPath(cookedPcConsolePath, resolvedFile.outputFile);
      const backupPath = await joinPath(paths.backupsBoostDir, resolvedFile.outputFile);

      const sourceExists = await pathExists(sourcePath);
      if (!sourceExists) {
        return {
          ok: false,
          code: "MissingItemFile",
          message: "Missing item file",
          details: `Source missing: ${sourcePath}`,
        };
      }

      const destinationExists = await pathExists(destinationPath);
      if (!destinationExists) {
        return {
          ok: false,
          code: "GameFileNotFound",
          message: "Game file not found",
          details: `Destination missing: ${destinationPath}`,
        };
      }

      const backupResult = await ensureBackup({
        sourcePath: destinationPath,
        backupPath,
      });
      if (!backupResult.ok) {
        const mappedBackupError = mapBackupFailureForApply(backupResult.details);
        return {
          ok: false,
          code: mappedBackupError.code,
          message: mappedBackupError.message,
          details: mappedBackupError.details,
        };
      }

      try {
        await invoke("copy_file", { sourcePath, destinationPath });
      } catch (error: unknown) {
        const mappedCopyError = mapApplyCopyFailure(error);
        return {
          ok: false,
          code: mappedCopyError.code,
          message: mappedCopyError.message,
          details: mappedCopyError.details,
        };
      }
    }

    const warnings: string[] = [];
    const thumbnailPath = normalizeOptional(input.thumbnailPath);
    const thumbnailFile = normalizeOptional(input.thumbnailFile);
    const localThumbnailSourcePath = thumbnailPath
      ? await joinPath(paths.itemsBoostDir, ...splitRelativePath(thumbnailPath))
      : undefined;
    const thumbnailSourceResolution = await resolveOptionalThumbnailSourcePath({
      localSourcePath: localThumbnailSourcePath,
      remoteThumbnail: input.remoteThumbnail,
      paths,
      onStatusChange: input.onStatusChange,
    });
    if (thumbnailSourceResolution.warning) {
      warnings.push(thumbnailSourceResolution.warning);
    }
    const thumbnailSourcePath = thumbnailSourceResolution.sourcePath;
    const thumbnailDestinationPath = thumbnailFile
      ? await joinPath(cookedPcConsolePath, thumbnailFile)
      : undefined;
    const thumbnailBackupPath = thumbnailFile
      ? await joinPath(paths.backupsBoostDir, thumbnailFile)
      : undefined;

    const thumbnailResult = await applyOptionalThumbnail({
      sourcePath: thumbnailSourcePath,
      destinationPath: thumbnailDestinationPath,
      backupPath: thumbnailBackupPath,
      destinationFileName: thumbnailFile,
    });
    if (thumbnailResult.warning) {
      warnings.push(thumbnailResult.warning);
    }

    try {
      await persistAppliedBoostState(
        input,
        thumbnailResult.applied ? thumbnailResult.thumbnailFile : undefined,
      );
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: "ApplyFailed",
        message: "Apply failed",
        details: `State save failed: ${details}`,
      };
    }

    return warnings.length > 0
      ? {
          ok: true,
          message: "Applied successfully",
          warnings,
        }
      : {
          ok: true,
          message: "Applied successfully",
        };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: "ApplyFailed",
      message: "Apply failed",
      details,
    };
  }
}

function trackItemApplyMetrics(result: ApplySuccessResult | ApplyErrorResult): void {
  if (result.ok) {
    try {
      void trackEvent("item_apply_success");
    } catch {
      // Metrics failures must never block apply actions.
    }
    return;
  }

  const errorCode = mapItemApplyFailureToMetricsCode({
    code: result.code,
    message: result.message,
    details: result.details,
  });

  try {
    void trackEvent("item_apply_failed", {
      errorCode,
    });
  } catch {
    // Metrics failures must never block apply actions.
  }
}

export async function applySkin(input: ApplySkinInput): Promise<ApplySkinResult> {
  const result = await applySkinInternal(input);
  trackItemApplyMetrics(result);
  return result;
}

export async function applyWheel(input: ApplyWheelInput): Promise<ApplyWheelResult> {
  const result = await applyWheelInternal(input);
  trackItemApplyMetrics(result);
  return result;
}

export async function applyBoost(input: ApplyBoostInput): Promise<ApplyBoostResult> {
  const result = await applyBoostInternal(input);
  trackItemApplyMetrics(result);
  return result;
}
