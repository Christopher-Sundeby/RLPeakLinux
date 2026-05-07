import { invoke, isTauri } from "@tauri-apps/api/core";
import { mapBackupFailureForApply } from "./fileOperationErrorMapper";

export interface EnsureBackupInput {
  sourcePath: string;
  backupPath: string;
}

export type EnsureBackupErrorCode =
  | "DesktopRuntimeRequired"
  | "InvalidPaths"
  | "MissingSourceFile"
  | "BackupTargetInvalid"
  | "BackupFailed";

interface EnsureBackupSuccessResult {
  ok: true;
  created: boolean;
  message: string;
}

interface EnsureBackupErrorResult {
  ok: false;
  code: EnsureBackupErrorCode;
  message: string;
  details?: string;
}

export type EnsureBackupResult = EnsureBackupSuccessResult | EnsureBackupErrorResult;

interface NativeEnsureBackupResult {
  created: boolean;
}

export async function ensureBackup(input: EnsureBackupInput): Promise<EnsureBackupResult> {
  const sourcePath = input.sourcePath.trim();
  const backupPath = input.backupPath.trim();

  if (!sourcePath || !backupPath) {
    return {
      ok: false,
      code: "InvalidPaths",
      message: "Backup failed",
      details: "Source and backup paths are required.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      code: "DesktopRuntimeRequired",
      message: "Backup failed",
      details: "Backup operations are available in desktop runtime.",
    };
  }

  try {
    const result = await invoke<NativeEnsureBackupResult>("ensure_backup", {
      sourcePath,
      backupPath,
    });

    if (result.created) {
      return {
        ok: true,
        created: true,
        message: "Backup created",
      };
    }

    return {
      ok: true,
      created: false,
      message: "Backup already exists",
    };
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);

    if (details.includes("SOURCE_MISSING")) {
      return {
        ok: false,
        code: "MissingSourceFile",
        message: "Game file not found",
        details,
      };
    }

    if (details.includes("BACKUP_TARGET_INVALID")) {
      return {
        ok: false,
        code: "BackupTargetInvalid",
        message: "Backup failed",
        details,
      };
    }

    const mapped = mapBackupFailureForApply(details);

    return {
      ok: false,
      code: "BackupFailed",
      message: mapped.message,
      details,
    };
  }
}
