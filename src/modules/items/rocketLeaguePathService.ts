import { invoke, isTauri } from "@tauri-apps/api/core";
import { join, homeDir } from "@tauri-apps/api/path";

export interface RocketLeaguePathValidationResult {
  rocketLeaguePath: string;
  cookedPcConsolePath: string;
  isValid: boolean;
  message: string;
}

export interface RocketLeaguePathResolutionResult {
  rocketLeaguePath: string;
  source: "saved" | "detected" | "empty";
}

export interface RocketLeagueActionPathGuardResult {
  ok: boolean;
  rocketLeaguePath: string;
  message: string;
}

export const COMMON_ROCKET_LEAGUE_PATH_CANDIDATES = [
  "C:\\Program Files\\Epic Games\\rocketleague",
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\rocketleague",
  "C:\\Program Files\\Steam\\steamapps\\common\\rocketleague",
  "~/.local/share/Steam/steamapps/common/rocketleague",
  "~/.steam/steam/steamapps/common/rocketleague",
  "~/Games/Heroic/rocketleague",
] as const;

export const ROCKET_LEAGUE_PATH_SETUP_MESSAGE = "Choose your Rocket League folder to start applying items.";
export const ROCKET_LEAGUE_PATH_ACTION_REQUIRED_MESSAGE =
  "Choose your Rocket League folder in Settings before applying items.";

function joinRelativePath(basePath: string, ...segments: string[]): string {
  const isWin = typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
  const sep = isWin ? "\\" : "/";
  const normalizedBase = basePath.replace(/[\\/]+$/, "");
  const joined = [normalizedBase, ...segments].join(sep);
  return isWin ? joined.replace(/\//g, "\\") : joined.replace(/\\/g, "/");
}

function isWindowsDriveRoot(path: string): boolean {
  return /^[A-Za-z]:\\$/.test(path);
}

function trimTrailingPathSeparators(path: string): string {
  let next = path;
  const isWin = typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
  while (next.length > 0 && /[\\/]/.test(next[next.length - 1] ?? "") && !(isWin && isWindowsDriveRoot(next))) {
    next = next.slice(0, -1);
  }

  if (isWin && /^[A-Za-z]:$/.test(next)) {
    return `${next}\\`;
  }

  return next;
}

function normalizeForComparison(path: string): string {
  return normalizeRocketLeaguePathInput(path).toLowerCase();
}

function isRocketLeagueExecutable(path: string): boolean {
  return /(?:^|[\\/])RocketLeague\.exe$/i.test(path);
}

function getParentPath(path: string): string | null {
  const normalizedPath = normalizeRocketLeaguePathInput(path);
  const isWin = typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
  if (!normalizedPath || (isWin && isWindowsDriveRoot(normalizedPath))) {
    return null;
  }

  const sep = isWin ? "\\" : "/";
  const lastSeparatorIndex = normalizedPath.lastIndexOf(sep);
  if (lastSeparatorIndex <= 0) {
    return null;
  }

  if (isWin && lastSeparatorIndex <= 2 && /^[A-Za-z]:/.test(normalizedPath)) {
    return `${normalizedPath.slice(0, 2)}\\`;
  }

  return trimTrailingPathSeparators(normalizedPath.slice(0, lastSeparatorIndex));
}

function buildRootCandidates(rawPath: string): string[] {
  const normalizedPath = normalizeRocketLeaguePathInput(rawPath);
  if (!normalizedPath) {
    return [];
  }

  const candidates: string[] = [];
  const seen = new Set<string>();
  let currentPath = normalizedPath;
  if (isRocketLeagueExecutable(currentPath)) {
    const parentPath = getParentPath(currentPath);
    currentPath = parentPath ?? currentPath;
  }

  for (let depth = 0; depth < 12; depth += 1) {
    const comparisonKey = normalizeForComparison(currentPath);
    if (!comparisonKey || seen.has(comparisonKey)) {
      break;
    }

    candidates.push(currentPath);
    seen.add(comparisonKey);

    const parentPath = getParentPath(currentPath);
    if (!parentPath || normalizeForComparison(parentPath) === comparisonKey) {
      break;
    }
    currentPath = parentPath;
  }

  return candidates;
}

export function normalizeRocketLeaguePathInput(rawPath: string): string {
  const trimmed = rawPath.trim();
  const withoutQuotes = trimmed.replace(/^["'](.*)["']$/, "$1").trim();
  const isWin = typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
  const normalizedSeparators = isWin 
    ? withoutQuotes.replace(/\//g, "\\") 
    : withoutQuotes.replace(/\\/g, "/");
  return trimTrailingPathSeparators(normalizedSeparators);
}

export async function getCookedPcConsolePath(rocketLeaguePath: string): Promise<string> {
  if (isTauri()) {
    return join(rocketLeaguePath, "TAGame", "CookedPCConsole");
  }

  return joinRelativePath(rocketLeaguePath, "TAGame", "CookedPCConsole");
}

async function getRocketLeagueExecutablePath(rocketLeaguePath: string): Promise<string> {
  if (isTauri()) {
    return join(rocketLeaguePath, "Binaries", "Win64", "RocketLeague.exe");
  }

  return joinRelativePath(rocketLeaguePath, "Binaries", "Win64", "RocketLeague.exe");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("path_exists", { path });
  } catch {
    return false;
  }
}

export async function isValidRocketLeagueInstallRoot(rocketLeaguePath: string): Promise<boolean> {
  const normalizedPath = normalizeRocketLeaguePathInput(rocketLeaguePath);
  if (!normalizedPath || !isTauri()) {
    return false;
  }

  const cookedPcConsolePath = await getCookedPcConsolePath(normalizedPath);
  const executablePath = await getRocketLeagueExecutablePath(normalizedPath);
  const [rootExists, cookedPcConsoleExists] = await Promise.all([
    pathExists(normalizedPath),
    pathExists(cookedPcConsolePath),
    pathExists(executablePath),
  ]);
  return rootExists && cookedPcConsoleExists;
}

export async function resolveRocketLeagueRootFromUserPath(
  rawPath: string,
): Promise<{ isValid: boolean; rocketLeaguePath: string; cookedPcConsolePath: string }> {
  const normalizedInput = normalizeRocketLeaguePathInput(rawPath);
  if (!normalizedInput || !isTauri()) {
    return {
      isValid: false,
      rocketLeaguePath: normalizedInput,
      cookedPcConsolePath: "",
    };
  }

  const rootCandidates = buildRootCandidates(normalizedInput);
  for (const candidatePath of rootCandidates) {
    if (await isValidRocketLeagueInstallRoot(candidatePath)) {
      return {
        isValid: true,
        rocketLeaguePath: candidatePath,
        cookedPcConsolePath: await getCookedPcConsolePath(candidatePath),
      };
    }
  }

  return {
    isValid: false,
    rocketLeaguePath: normalizedInput,
    cookedPcConsolePath: "",
  };
}

export async function resolvePreferredRocketLeaguePath(
  savedPath: string | undefined,
): Promise<RocketLeaguePathResolutionResult> {
  const normalizedSavedPath = typeof savedPath === "string" ? normalizeRocketLeaguePathInput(savedPath) : "";
  if (normalizedSavedPath) {
    const resolvedSavedPath = await resolveRocketLeagueRootFromUserPath(normalizedSavedPath);
    if (resolvedSavedPath.isValid) {
      return {
        rocketLeaguePath: resolvedSavedPath.rocketLeaguePath,
        source: "saved",
      };
    }
  }

  const isWin = typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
  let home = "";
  if (!isWin) {
    if (isTauri()) {
      try {
        home = await homeDir();
      } catch {
        home = "";
      }
    }
    const globalProcess = (globalThis as any).process;
    if (!home && typeof globalProcess !== "undefined" && globalProcess.env) {
      home = globalProcess.env.HOME || "";
    }
  }

  for (const candidatePath of COMMON_ROCKET_LEAGUE_PATH_CANDIDATES) {
    let evaluatedPath: string = candidatePath;
    if (candidatePath.startsWith("~/") && home) {
      evaluatedPath = `${home.replace(/\/$/, "")}/${candidatePath.slice(2)}`;
    }

    const resolvedCandidate = await resolveRocketLeagueRootFromUserPath(evaluatedPath);
    if (resolvedCandidate.isValid) {
      return {
        rocketLeaguePath: resolvedCandidate.rocketLeaguePath,
        source: "detected",
      };
    }
  }

  return {
    rocketLeaguePath: "",
    source: "empty",
  };
}

export async function validateRocketLeaguePath(rawPath: string): Promise<RocketLeaguePathValidationResult> {
  const normalizedPath = normalizeRocketLeaguePathInput(rawPath);
  if (!normalizedPath) {
    return {
      rocketLeaguePath: "",
      cookedPcConsolePath: "",
      isValid: false,
      message: ROCKET_LEAGUE_PATH_SETUP_MESSAGE,
    };
  }

  const resolved = await resolveRocketLeagueRootFromUserPath(normalizedPath);
  if (resolved.isValid) {
    return {
      rocketLeaguePath: resolved.rocketLeaguePath,
      cookedPcConsolePath: resolved.cookedPcConsolePath,
      isValid: true,
      message: "Path valid",
    };
  }

  return {
    rocketLeaguePath: normalizedPath,
    cookedPcConsolePath: resolved.cookedPcConsolePath,
    isValid: false,
    message: ROCKET_LEAGUE_PATH_SETUP_MESSAGE,
  };
}

export async function ensureRocketLeaguePathForActions(rawPath: string): Promise<RocketLeagueActionPathGuardResult> {
  const result = await validateRocketLeaguePath(rawPath);
  if (!result.isValid) {
    return {
      ok: false,
      rocketLeaguePath: "",
      message: ROCKET_LEAGUE_PATH_ACTION_REQUIRED_MESSAGE,
    };
  }
  return {
    ok: true,
    rocketLeaguePath: result.rocketLeaguePath,
    message: "",
  };
}
