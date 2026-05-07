import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  loadAppState: vi.fn(),
  resolvePreferredRocketLeaguePath: vi.fn(),
}));

vi.mock("../items/stateService", () => ({
  loadAppState: mocked.loadAppState,
}));

vi.mock("../items/rocketLeaguePathService", () => ({
  resolvePreferredRocketLeaguePath: mocked.resolvePreferredRocketLeaguePath,
}));

import { checkStartupPathSetup } from "./startupPathSetupService";

describe("startupPathSetupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns needs-setup when saved path is missing and no candidate is valid", async () => {
    mocked.loadAppState.mockResolvedValue({});
    mocked.resolvePreferredRocketLeaguePath.mockResolvedValue({
      source: "empty",
      rocketLeaguePath: "",
    });

    const result = await checkStartupPathSetup();

    expect(result).toEqual({ status: "needs-setup" });
  });

  it("returns ready and shouldPersist when saved path is normalized", async () => {
    mocked.loadAppState.mockResolvedValue({
      rocketLeaguePath: "C:\\Program Files\\Epic Games\\rocketleague\\TAGame",
    });
    mocked.resolvePreferredRocketLeaguePath.mockResolvedValue({
      source: "saved",
      rocketLeaguePath: "C:\\Program Files\\Epic Games\\rocketleague",
    });

    const result = await checkStartupPathSetup();

    expect(result).toEqual({
      status: "ready",
      rocketLeaguePath: "C:\\Program Files\\Epic Games\\rocketleague",
      shouldPersist: true,
    });
  });

  it("returns ready without persistence when saved path is already normalized", async () => {
    mocked.loadAppState.mockResolvedValue({
      rocketLeaguePath: "C:\\Program Files\\Epic Games\\rocketleague",
    });
    mocked.resolvePreferredRocketLeaguePath.mockResolvedValue({
      source: "saved",
      rocketLeaguePath: "C:\\Program Files\\Epic Games\\rocketleague",
    });

    const result = await checkStartupPathSetup();

    expect(result).toEqual({
      status: "ready",
      rocketLeaguePath: "C:\\Program Files\\Epic Games\\rocketleague",
      shouldPersist: false,
    });
  });
});
