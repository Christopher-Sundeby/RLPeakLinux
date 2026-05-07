import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

import {
  getRocketLeagueProcessStatusLabel,
  normalizeProcessStatusError,
  readRocketLeagueProcessStatus,
} from "./rocketLeagueProcessService";

describe("rocketLeagueProcessService", () => {
  beforeEach(() => {
    mocked.isTauri.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns running=true when backend reports Rocket League process running", async () => {
    mocked.invoke.mockResolvedValue(true);

    const result = await readRocketLeagueProcessStatus();
    expect(result).toEqual({
      available: true,
      isRunning: true,
    });
    expect(mocked.invoke).toHaveBeenCalledWith("is_rocket_league_running");
  });

  it("returns running=false when backend reports Rocket League process not running", async () => {
    mocked.invoke.mockResolvedValue(false);

    const result = await readRocketLeagueProcessStatus();
    expect(result).toEqual({
      available: true,
      isRunning: false,
    });
  });

  it("returns unavailable status outside desktop runtime", async () => {
    mocked.isTauri.mockReturnValue(false);

    const result = await readRocketLeagueProcessStatus();
    expect(result).toEqual({
      available: false,
      isRunning: false,
      message: "Status unavailable",
    });
  });

  it("maps backend errors to user-facing status unavailable", async () => {
    mocked.invoke.mockRejectedValue(new Error("PROCESS_CHECK_FAILED: tasklist exited"));

    const result = await readRocketLeagueProcessStatus();
    expect(result).toEqual({
      available: false,
      isRunning: false,
      message: "Status unavailable",
    });
  });

  it("normalizes unknown error values", () => {
    expect(normalizeProcessStatusError("raw_error")).toBe("raw_error");
  });

  it("maps process status objects to user-facing labels", () => {
    expect(getRocketLeagueProcessStatusLabel({ available: true, isRunning: true })).toBe("Running");
    expect(getRocketLeagueProcessStatusLabel({ available: true, isRunning: false })).toBe("Not running");
    expect(getRocketLeagueProcessStatusLabel({ available: false, isRunning: false })).toBe("Status unavailable");
  });
});
