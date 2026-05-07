import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { mapRestoreFailure as mapRestoreFailureError } from "./fileOperationErrorMapper";
import { getLocalAppDataPaths } from "./pathService";
import { getCookedPcConsolePath } from "./rocketLeaguePathService";
import { loadAppState, saveAppState } from "./stateService";
import type { AppState } from "./types";

export interface ResetSelectedCarInput {
  rocketLeaguePath: string;
  carKey: string;
}

export interface ResetWheelsInput {
  rocketLeaguePath: string;
}

export interface ResetBoostInput {
  rocketLeaguePath: string;
}

export interface ResetAllInput {
  rocketLeaguePath: string;
}

type RestoreOperationErrorCode =
  | "DesktopRuntimeRequired"
  | "InvalidInput"
  | "GameFileNotFound"
  | "RestoreFailed";

export type ResetSelectedCarErrorCode = RestoreOperationErrorCode;
export type ResetWheelsErrorCode = RestoreOperationErrorCode;
export type ResetBoostErrorCode = RestoreOperationErrorCode;
export type ResetAllErrorCode = RestoreOperationErrorCode;

interface RestoreOperationSuccessResult {
  ok: true;
  message: "Restored successfully";
}

interface RestoreOperationErrorResult {
  ok: false;
  code: RestoreOperationErrorCode;
  message: string;
  details?: string;
}

export type ResetSelectedCarResult = RestoreOperationSuccessResult | RestoreOperationErrorResult;
export type ResetWheelsResult = RestoreOperationSuccessResult | RestoreOperationErrorResult;
export type ResetBoostResult = RestoreOperationSuccessResult | RestoreOperationErrorResult;
export type ResetAllResult = RestoreOperationSuccessResult | RestoreOperationErrorResult;

interface RestoreBackupFilesInput {
  backupDirectoryPath: string;
  cookedPcConsolePath: string;
  emptyBackupDetails: string;
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

function getFileName(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? "";
}

function toRestoreOperationErrorResult(error: unknown): RestoreOperationErrorResult {
  const mapped = mapRestoreFailureError(error);
  return {
    ok: false,
    code: mapped.code,
    message: mapped.message,
    details: mapped.details,
  };
}

async function restoreBackupFilesToCookedPcConsole(
  input: RestoreBackupFilesInput,
): Promise<RestoreOperationErrorResult | null> {
  const backupDirExists = await pathExists(input.backupDirectoryPath);
  if (!backupDirExists) {
    return {
      ok: false,
      code: "RestoreFailed",
      message: "Restore failed",
      details: `Backup directory missing: ${input.backupDirectoryPath}`,
    };
  }

  const backupFiles = await invoke<string[]>("list_files_in_directory", {
    path: input.backupDirectoryPath,
  });
  if (backupFiles.length === 0) {
    return {
      ok: false,
      code: "RestoreFailed",
      message: "Restore failed",
      details: input.emptyBackupDetails,
    };
  }

  return restoreBackupFileListToCookedPcConsole(input.cookedPcConsolePath, backupFiles);
}

async function restoreBackupFileListToCookedPcConsole(
  cookedPcConsolePath: string,
  backupFiles: string[],
): Promise<RestoreOperationErrorResult | null> {
  for (const backupFilePath of backupFiles) {
    const fileName = getFileName(backupFilePath);
    if (!fileName) {
      return {
        ok: false,
        code: "RestoreFailed",
        message: "Restore failed",
        details: `Invalid backup file path: ${backupFilePath}`,
      };
    }

    const destinationPath = await joinPath(cookedPcConsolePath, fileName);
    const destinationExists = await pathExists(destinationPath);
    if (!destinationExists) {
      return {
        ok: false,
        code: "GameFileNotFound",
        message: "Game file not found",
        details: `Destination missing: ${destinationPath}`,
      };
    }

    try {
      await invoke("copy_file", {
        sourcePath: backupFilePath,
        destinationPath,
      });
    } catch (error: unknown) {
      return toRestoreOperationErrorResult(error);
    }
  }

  return null;
}

async function clearActiveSkinForCar(carKey: string): Promise<void> {
  const current = await loadAppState();
  const nextSkin = { ...(current.activeItems?.Skin ?? {}) };
  delete nextSkin[carKey];

  const hasSkinEntries = Object.keys(nextSkin).length > 0;
  const nextActiveItems = {
    ...current.activeItems,
    Skin: hasSkinEntries ? nextSkin : undefined,
  };

  const hasAnyActiveItems = Boolean(nextActiveItems.Skin || nextActiveItems.Wheel || nextActiveItems.Boost);
  const timestamp = new Date().toISOString();

  const nextState: AppState = {
    ...current,
    activeItems: hasAnyActiveItems ? nextActiveItems : undefined,
    lastAction: {
      type: "restore",
      itemType: "Skin",
      displayName: carKey,
      timestamp,
    },
  };

  await saveAppState(nextState);
}

async function clearActiveWheels(): Promise<void> {
  const current = await loadAppState();
  const nextActiveItems = {
    ...current.activeItems,
    Wheel: undefined,
  };
  const hasAnyActiveItems = Boolean(nextActiveItems.Skin || nextActiveItems.Wheel || nextActiveItems.Boost);
  const timestamp = new Date().toISOString();

  const nextState: AppState = {
    ...current,
    activeItems: hasAnyActiveItems ? nextActiveItems : undefined,
    lastAction: {
      type: "restore",
      itemType: "Wheel",
      displayName: "Wheels",
      timestamp,
    },
  };

  await saveAppState(nextState);
}

async function clearActiveBoost(): Promise<void> {
  const current = await loadAppState();
  const nextActiveItems = {
    ...current.activeItems,
    Boost: undefined,
  };
  const hasAnyActiveItems = Boolean(nextActiveItems.Skin || nextActiveItems.Wheel || nextActiveItems.Boost);
  const timestamp = new Date().toISOString();

  const nextState: AppState = {
    ...current,
    activeItems: hasAnyActiveItems ? nextActiveItems : undefined,
    lastAction: {
      type: "restore",
      itemType: "Boost",
      displayName: "Boost",
      timestamp,
    },
  };

  await saveAppState(nextState);
}

async function clearAllActiveItems(): Promise<void> {
  const current = await loadAppState();
  const timestamp = new Date().toISOString();

  const nextState: AppState = {
    ...current,
    activeItems: undefined,
    lastAction: {
      type: "restore",
      itemType: "All",
      displayName: "All",
      timestamp,
    },
  };

  await saveAppState(nextState);
}

export async function resetSelectedCar(input: ResetSelectedCarInput): Promise<ResetSelectedCarResult> {
  const rocketLeaguePath = input.rocketLeaguePath.trim();
  const carKey = input.carKey.trim();

  if (!rocketLeaguePath || !carKey) {
    return {
      ok: false,
      code: "InvalidInput",
      message: "Restore failed",
      details: "Rocket League path and car key are required.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      code: "DesktopRuntimeRequired",
      message: "Restore failed",
      details: "Restore actions are available in desktop runtime.",
    };
  }

  try {
    const paths = await getLocalAppDataPaths();
    const cookedPcConsolePath = await getCookedPcConsolePath(rocketLeaguePath);
    const backupCarDir = await joinPath(paths.backupsSkinDir, carKey);

    const restoreError = await restoreBackupFilesToCookedPcConsole({
      backupDirectoryPath: backupCarDir,
      cookedPcConsolePath,
      emptyBackupDetails: `No backup files found for ${carKey}`,
    });
    if (restoreError) {
      return restoreError;
    }

    await clearActiveSkinForCar(carKey);
    return {
      ok: true,
      message: "Restored successfully",
    };
  } catch (error: unknown) {
    return toRestoreOperationErrorResult(error);
  }
}

export async function resetWheels(input: ResetWheelsInput): Promise<ResetWheelsResult> {
  const rocketLeaguePath = input.rocketLeaguePath.trim();

  if (!rocketLeaguePath) {
    return {
      ok: false,
      code: "InvalidInput",
      message: "Restore failed",
      details: "Rocket League path is required.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      code: "DesktopRuntimeRequired",
      message: "Restore failed",
      details: "Restore actions are available in desktop runtime.",
    };
  }

  try {
    const paths = await getLocalAppDataPaths();
    const cookedPcConsolePath = await getCookedPcConsolePath(rocketLeaguePath);

    const restoreError = await restoreBackupFilesToCookedPcConsole({
      backupDirectoryPath: paths.backupsWheelDir,
      cookedPcConsolePath,
      emptyBackupDetails: "No wheel backup files found",
    });
    if (restoreError) {
      return restoreError;
    }

    await clearActiveWheels();
    return {
      ok: true,
      message: "Restored successfully",
    };
  } catch (error: unknown) {
    return toRestoreOperationErrorResult(error);
  }
}

export async function resetBoost(input: ResetBoostInput): Promise<ResetBoostResult> {
  const rocketLeaguePath = input.rocketLeaguePath.trim();

  if (!rocketLeaguePath) {
    return {
      ok: false,
      code: "InvalidInput",
      message: "Restore failed",
      details: "Rocket League path is required.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      code: "DesktopRuntimeRequired",
      message: "Restore failed",
      details: "Restore actions are available in desktop runtime.",
    };
  }

  try {
    const paths = await getLocalAppDataPaths();
    const cookedPcConsolePath = await getCookedPcConsolePath(rocketLeaguePath);

    const restoreError = await restoreBackupFilesToCookedPcConsole({
      backupDirectoryPath: paths.backupsBoostDir,
      cookedPcConsolePath,
      emptyBackupDetails: "No boost backup files found",
    });
    if (restoreError) {
      return restoreError;
    }

    await clearActiveBoost();
    return {
      ok: true,
      message: "Restored successfully",
    };
  } catch (error: unknown) {
    return toRestoreOperationErrorResult(error);
  }
}

export async function resetAll(input: ResetAllInput): Promise<ResetAllResult> {
  const rocketLeaguePath = input.rocketLeaguePath.trim();

  if (!rocketLeaguePath) {
    return {
      ok: false,
      code: "InvalidInput",
      message: "Restore failed",
      details: "Rocket League path is required.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      code: "DesktopRuntimeRequired",
      message: "Restore failed",
      details: "Restore actions are available in desktop runtime.",
    };
  }

  try {
    const paths = await getLocalAppDataPaths();
    const cookedPcConsolePath = await getCookedPcConsolePath(rocketLeaguePath);

    const backupFiles = await invoke<string[]>("list_files_recursive", {
      path: paths.backupsOriginalsDir,
    });
    if (backupFiles.length === 0) {
      return {
        ok: false,
        code: "RestoreFailed",
        message: "Restore failed",
        details: "No backup files found",
      };
    }

    const restoreError = await restoreBackupFileListToCookedPcConsole(
      cookedPcConsolePath,
      backupFiles,
    );
    if (restoreError) {
      return restoreError;
    }

    await clearAllActiveItems();
    return {
      ok: true,
      message: "Restored successfully",
    };
  } catch (error: unknown) {
    return toRestoreOperationErrorResult(error);
  }
}
