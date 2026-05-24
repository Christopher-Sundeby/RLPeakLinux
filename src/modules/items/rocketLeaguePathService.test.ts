import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock navigator for Windows environment by default in tests
Object.defineProperty(global, "navigator", {
  value: {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  },
  writable: true,
  configurable: true,
});

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  join: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

import {
  COMMON_ROCKET_LEAGUE_PATH_CANDIDATES,
  ensureRocketLeaguePathForActions,
  normalizeRocketLeaguePathInput,
  resolvePreferredRocketLeaguePath,
  resolveRocketLeagueRootFromUserPath,
  ROCKET_LEAGUE_PATH_ACTION_REQUIRED_MESSAGE,
  ROCKET_LEAGUE_PATH_SETUP_MESSAGE,
  validateRocketLeaguePath,
} from "./rocketLeaguePathService";

function normalizeForCompare(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

function withValidRoot(rootPath: string): void {
  const cookedPath = `${rootPath}\\TAGame\\CookedPCConsole`;
  mocked.invoke.mockImplementation(async (_command: string, payload: { path: string }) => {
    const candidate = normalizeForCompare(payload.path);
    return candidate === normalizeForCompare(rootPath) || candidate === normalizeForCompare(cookedPath);
  });
}

describe("rocketLeaguePathService", () => {
  beforeEach(() => {
    mocked.isTauri.mockReturnValue(true);
    mocked.join.mockImplementation(async (...segments: string[]) => segments.join("\\"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps valid root path unchanged", async () => {
    const rootPath = "C:\\Program Files\\Epic Games\\rocketleague";
    withValidRoot(rootPath);

    const result = await resolveRocketLeagueRootFromUserPath(rootPath);

    expect(result.isValid).toBe(true);
    expect(result.rocketLeaguePath).toBe(rootPath);
  });

  it("normalizes TAGame folder input to Rocket League root", async () => {
    const rootPath = "C:\\Program Files\\Epic Games\\rocketleague";
    withValidRoot(rootPath);

    const result = await resolveRocketLeagueRootFromUserPath(`${rootPath}\\TAGame`);

    expect(result.isValid).toBe(true);
    expect(result.rocketLeaguePath).toBe(rootPath);
  });

  it("normalizes TAGame\\CookedPCConsole input to Rocket League root", async () => {
    const rootPath = "C:\\Program Files\\Epic Games\\rocketleague";
    withValidRoot(rootPath);

    const result = await resolveRocketLeagueRootFromUserPath(`${rootPath}\\TAGame\\CookedPCConsole`);

    expect(result.isValid).toBe(true);
    expect(result.rocketLeaguePath).toBe(rootPath);
  });

  it("normalizes Binaries\\Win64 input to Rocket League root", async () => {
    const rootPath = "C:\\Program Files\\Epic Games\\rocketleague";
    withValidRoot(rootPath);

    const result = await resolveRocketLeagueRootFromUserPath(`${rootPath}\\Binaries\\Win64`);

    expect(result.isValid).toBe(true);
    expect(result.rocketLeaguePath).toBe(rootPath);
  });

  it("normalizes RocketLeague.exe file input to Rocket League root", async () => {
    const rootPath = "C:\\Program Files\\Epic Games\\rocketleague";
    withValidRoot(rootPath);

    const result = await resolveRocketLeagueRootFromUserPath(`${rootPath}\\Binaries\\Win64\\RocketLeague.exe`);

    expect(result.isValid).toBe(true);
    expect(result.rocketLeaguePath).toBe(rootPath);
  });

  it("normalizes quoted paths and trailing separators", () => {
    const normalized = normalizeRocketLeaguePathInput(
      "  \"C:\\Program Files\\Epic Games\\rocketleague\\TAGame\\CookedPCConsole\\\\\"  ",
    );

    expect(normalized).toBe("C:\\Program Files\\Epic Games\\rocketleague\\TAGame\\CookedPCConsole");
  });

  it("returns invalid result when input does not resolve to Rocket League root", async () => {
    mocked.invoke.mockResolvedValue(false);

    const result = await resolveRocketLeagueRootFromUserPath("C:\\Users\\Admin\\Desktop\\SomethingElse");

    expect(result.isValid).toBe(false);
    expect(result.rocketLeaguePath).toBe("C:\\Users\\Admin\\Desktop\\SomethingElse");
  });

  it("keeps saved path preference when saved path resolves validly", async () => {
    const savedPath = "C:\\Users\\Public\\RocketLeague";
    withValidRoot(savedPath);

    const result = await resolvePreferredRocketLeaguePath(`  ${savedPath}\\TAGame\\  `);

    expect(result).toEqual({
      rocketLeaguePath: savedPath,
      source: "saved",
    });
  });

  it("auto-detects Epic candidate when no saved path exists", async () => {
    const epicCandidate = COMMON_ROCKET_LEAGUE_PATH_CANDIDATES[0];
    withValidRoot(epicCandidate);

    const result = await resolvePreferredRocketLeaguePath(undefined);

    expect(result).toEqual({
      rocketLeaguePath: epicCandidate,
      source: "detected",
    });
  });

  it("falls back to Steam candidate when Epic candidate is not valid", async () => {
    const epicCandidate = COMMON_ROCKET_LEAGUE_PATH_CANDIDATES[0];
    const steamCandidate = COMMON_ROCKET_LEAGUE_PATH_CANDIDATES[1];
    const steamCookedPcConsole = `${steamCandidate}\\TAGame\\CookedPCConsole`;

    mocked.invoke.mockImplementation(async (_command: string, payload: { path: string }) => {
      const candidate = normalizeForCompare(payload.path);
      if (
        candidate === normalizeForCompare(epicCandidate)
        || candidate === normalizeForCompare(`${epicCandidate}\\TAGame\\CookedPCConsole`)
      ) {
        return false;
      }

      return candidate === normalizeForCompare(steamCandidate)
        || candidate === normalizeForCompare(steamCookedPcConsole);
    });

    const result = await resolvePreferredRocketLeaguePath("");

    expect(result).toEqual({
      rocketLeaguePath: steamCandidate,
      source: "detected",
    });
  });

  it("returns empty state when no saved path or candidates are valid", async () => {
    mocked.invoke.mockResolvedValue(false);

    const result = await resolvePreferredRocketLeaguePath(undefined);

    expect(result).toEqual({
      rocketLeaguePath: "",
      source: "empty",
    });
  });

  it("never uses personal rl2 path as a default candidate", async () => {
    const checkedPaths: string[] = [];
    mocked.invoke.mockImplementation(async (_command: string, payload: { path: string }) => {
      checkedPaths.push(payload.path);
      return false;
    });

    await resolvePreferredRocketLeaguePath(undefined);

    expect(COMMON_ROCKET_LEAGUE_PATH_CANDIDATES.some((candidate) => candidate.includes("\\rl2\\"))).toBe(false);
    expect(checkedPaths.some((path) => path.includes("\\rl2\\"))).toBe(false);
  });

  it("validateRocketLeaguePath requires TAGame\\CookedPCConsole to exist", async () => {
    const path = "C:\\Program Files\\Epic Games\\rocketleague";
    const cookedPcConsolePath = `${path}\\TAGame\\CookedPCConsole`;

    mocked.invoke.mockImplementation(async (_command: string, payload: { path: string }) => {
      if (normalizeForCompare(payload.path) === normalizeForCompare(path)) {
        return true;
      }
      if (normalizeForCompare(payload.path) === normalizeForCompare(cookedPcConsolePath)) {
        return false;
      }

      return false;
    });

    const result = await validateRocketLeaguePath(path);

    expect(result.isValid).toBe(false);
    expect(result.message).toBe(ROCKET_LEAGUE_PATH_SETUP_MESSAGE);
  });

  it("blocks item actions with a friendly setup message when path is invalid", async () => {
    mocked.invoke.mockResolvedValue(false);

    const result = await ensureRocketLeaguePathForActions("C:\\Invalid\\Path");

    expect(result.ok).toBe(false);
    expect(result.message).toBe(ROCKET_LEAGUE_PATH_ACTION_REQUIRED_MESSAGE);
  });

  it("returns normalized root path for actions when a subfolder path is provided", async () => {
    const rootPath = "C:\\Program Files\\Epic Games\\rocketleague";
    withValidRoot(rootPath);

    const result = await ensureRocketLeaguePathForActions(`${rootPath}\\TAGame\\CookedPCConsole`);

    expect(result.ok).toBe(true);
    expect(result.rocketLeaguePath).toBe(rootPath);
  });

  describe("on Linux", () => {
    let originalUserAgent: string;

    beforeEach(() => {
      originalUserAgent = global.navigator.userAgent;
      (global.navigator as any).userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
      mocked.join.mockImplementation(async (...segments: string[]) => segments.join("/"));
    });

    afterEach(() => {
      (global.navigator as any).userAgent = originalUserAgent;
    });

    it("normalizes Unix path inputs to use forward slashes", () => {
      const normalized = normalizeRocketLeaguePathInput(
        "  \"/home/user/Games/rocketleague/TAGame/CookedPCConsole/\"  ",
      );
      expect(normalized).toBe("/home/user/Games/rocketleague/TAGame/CookedPCConsole");
    });

    it("normalizes backslashes in input to forward slashes under Linux", () => {
      const normalized = normalizeRocketLeaguePathInput(
        "  \"/home/user\\Games\\rocketleague\\TAGame\"  ",
      );
      expect(normalized).toBe("/home/user/Games/rocketleague/TAGame");
    });

    it("resolves Unix parent path correctly", async () => {
      const rootPath = "/home/user/.steam/steam/steamapps/common/rocketleague";
      mocked.invoke.mockImplementation(async (_command: string, payload: { path: string }) => {
        return payload.path === rootPath || payload.path === `${rootPath}/TAGame/CookedPCConsole` || payload.path === `${rootPath}/Binaries/Win64/RocketLeague.exe`;
      });

      const result = await resolveRocketLeagueRootFromUserPath(`${rootPath}/Binaries/Win64/RocketLeague.exe`);

      expect(result.isValid).toBe(true);
      expect(result.rocketLeaguePath).toBe(rootPath);
    });
  });
});
