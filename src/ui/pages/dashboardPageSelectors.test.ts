import { describe, expect, it } from "vitest";
import type { AppState } from "../../modules/items/types";
import {
  getUserFacingRocketLeagueStatus,
  readActiveLoadoutSummary,
} from "./dashboardPageSelectors";

describe("dashboardPageSelectors", () => {
  it("maps unavailable process status to user-facing Status unavailable label", () => {
    expect(
      getUserFacingRocketLeagueStatus({
        available: false,
        isRunning: false,
        message: "PROCESS_CHECK_FAILED: invalid utf-8 sequence",
      }),
    ).toBe("Status unavailable");
  });

  it("reads multiple active decals across cars", () => {
    const appState: AppState = {
      activeItems: {
        Skin: {
          OCTANE: {
            skin_folder: "skin_octane_v1",
            display_name: "Ninjas In Pyjamas (2026)",
          },
          FENNEC: {
            skin_folder: "skin_fennec_v1",
            display_name: "Team Vitality",
          },
        },
      },
    };

    const summary = readActiveLoadoutSummary(appState);
    expect(summary.activeDecals).toEqual([
      { carKey: "FENNEC", displayName: "Team Vitality" },
      { carKey: "OCTANE", displayName: "Ninjas In Pyjamas (2026)" },
    ]);
  });

  it("reads active wheel and active boost summaries", () => {
    const appState: AppState = {
      activeItems: {
        Wheel: {
          current: {
            wheel_folder: "Wheel_Alpha",
            display_name: "Apex",
          },
        },
        Boost: {
          current: {
            boost_folder: "Boost_AlphaReward",
            display_name: "(Alpha Reward) Gold Rush",
          },
        },
      },
    };

    const summary = readActiveLoadoutSummary(appState);
    expect(summary.activeWheel).toEqual({ displayName: "Apex" });
    expect(summary.activeBoost).toEqual({ displayName: "(Alpha Reward) Gold Rush" });
  });
});
