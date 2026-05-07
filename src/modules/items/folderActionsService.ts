import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCookedPcConsolePath } from "./rocketLeaguePathService";
import { getLocalAppDataPaths } from "./pathService";

export interface FolderActionResult {
  ok: boolean;
  message: string;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown error";
}

function mapOpenFolderError(path: string, error: unknown): FolderActionResult {
  const details = toErrorMessage(error);
  if (details.includes("FOLDER_MISSING:")) {
    return {
      ok: false,
      message: `Folder not found: ${path}`,
    };
  }

  if (details.includes("NOT_DIRECTORY:")) {
    return {
      ok: false,
      message: `Not a folder: ${path}`,
    };
  }

  return {
    ok: false,
    message: `Open folder failed: ${path} - ${details}`,
  };
}

async function openExistingFolder(path: string): Promise<FolderActionResult> {
  try {
    await invoke("open_folder", { path });
    return {
      ok: true,
      message: `Folder opened: ${path}`,
    };
  } catch (error: unknown) {
    const mapped = mapOpenFolderError(path, error);
    console.error(`Open folder failed for ${path}: ${toErrorMessage(error)}`);
    return mapped;
  }
}

export async function openBackupsFolder(): Promise<FolderActionResult> {
  if (!isTauri()) {
    return {
      ok: false,
      message: "Open folder actions are available in desktop runtime",
    };
  }

  try {
    const paths = await getLocalAppDataPaths();
    return openExistingFolder(paths.backupsRoot);
  } catch (error: unknown) {
    const details = toErrorMessage(error);
    console.error(`Open folder failed for backups root lookup: ${details}`);
    return {
      ok: false,
      message: `Open folder failed: AppData/Backups - ${details}`,
    };
  }
}

export async function openCookedPcConsoleFolder(rocketLeaguePath: string): Promise<FolderActionResult> {
  const cleanedPath = rocketLeaguePath.trim();
  if (!cleanedPath) {
    return {
      ok: false,
      message: "Rocket League path is required",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      message: "Open folder actions are available in desktop runtime",
    };
  }

  try {
    const cookedPath = await getCookedPcConsolePath(cleanedPath);
    return openExistingFolder(cookedPath);
  } catch (error: unknown) {
    const details = toErrorMessage(error);
    console.error(`Open folder failed for CookedPCConsole lookup: ${details}`);
    return {
      ok: false,
      message: `Open folder failed: CookedPCConsole - ${details}`,
    };
  }
}
