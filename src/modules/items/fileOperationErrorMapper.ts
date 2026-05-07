export type UserFacingFileMessage =
  | "Admin permission required"
  | "File locked, try again"
  | "Missing item file"
  | "Game file not found"
  | "Backup failed"
  | "Apply failed"
  | "Restore failed";

export interface ApplyCopyFailureMapping {
  code: "MissingItemFile" | "GameFileNotFound" | "ApplyFailed";
  message: UserFacingFileMessage;
  details: string;
}

export interface BackupFailureForApplyMapping {
  code: "GameFileNotFound" | "ApplyFailed" | "BackupFailed";
  message: UserFacingFileMessage;
  details: string;
}

export interface RestoreFailureMapping {
  code: "GameFileNotFound" | "RestoreFailed";
  message: UserFacingFileMessage;
  details: string;
}

function toDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalize(details: string): string {
  return details.toLowerCase();
}

function hasPermissionError(details: string): boolean {
  const normalized = normalize(details);
  return normalized.includes("eacces") || normalized.includes("eperm");
}

function hasLockError(details: string): boolean {
  const normalized = normalize(details);
  return (
    normalized.includes("ebusy") ||
    normalized.includes("locked") ||
    normalized.includes("in use") ||
    normalized.includes("used by another process")
  );
}

function hasSourceMissing(details: string): boolean {
  return details.includes("SOURCE_MISSING");
}

function hasDestinationMissing(details: string): boolean {
  return details.includes("DESTINATION_MISSING");
}

export function mapApplyCopyFailure(error: unknown): ApplyCopyFailureMapping {
  const details = toDetails(error);

  if (hasSourceMissing(details)) {
    return {
      code: "MissingItemFile",
      message: "Missing item file",
      details,
    };
  }

  if (hasDestinationMissing(details)) {
    return {
      code: "GameFileNotFound",
      message: "Game file not found",
      details,
    };
  }

  if (hasPermissionError(details)) {
    return {
      code: "ApplyFailed",
      message: "Admin permission required",
      details,
    };
  }

  if (hasLockError(details)) {
    return {
      code: "ApplyFailed",
      message: "File locked, try again",
      details,
    };
  }

  return {
    code: "ApplyFailed",
    message: "Apply failed",
    details,
  };
}

export function mapBackupFailureForApply(error: unknown): BackupFailureForApplyMapping {
  const details = toDetails(error);

  if (hasSourceMissing(details) || hasDestinationMissing(details)) {
    return {
      code: "GameFileNotFound",
      message: "Game file not found",
      details,
    };
  }

  if (hasPermissionError(details)) {
    return {
      code: "ApplyFailed",
      message: "Admin permission required",
      details,
    };
  }

  if (hasLockError(details)) {
    return {
      code: "ApplyFailed",
      message: "File locked, try again",
      details,
    };
  }

  return {
    code: "BackupFailed",
    message: "Backup failed",
    details,
  };
}

export function mapRestoreFailure(error: unknown): RestoreFailureMapping {
  const details = toDetails(error);

  if (hasDestinationMissing(details)) {
    return {
      code: "GameFileNotFound",
      message: "Game file not found",
      details,
    };
  }

  if (hasPermissionError(details)) {
    return {
      code: "RestoreFailed",
      message: "Admin permission required",
      details,
    };
  }

  if (hasLockError(details)) {
    return {
      code: "RestoreFailed",
      message: "File locked, try again",
      details,
    };
  }

  return {
    code: "RestoreFailed",
    message: "Restore failed",
    details,
  };
}
