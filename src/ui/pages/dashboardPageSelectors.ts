import type { AppState } from "../../modules/items/types";
import type { RocketLeagueProcessStatus, RocketLeagueProcessStatusLabel } from "../../modules/items/rocketLeagueProcessService";
import { getRocketLeagueProcessStatusLabel } from "../../modules/items/rocketLeagueProcessService";

export interface ActiveDecalSummaryEntry {
  carKey: string;
  displayName: string;
}

export interface ActiveSingleSummaryEntry {
  displayName: string;
}

export interface ActiveLoadoutSummary {
  activeDecals: ActiveDecalSummaryEntry[];
  activeWheel: ActiveSingleSummaryEntry | null;
  activeBoost: ActiveSingleSummaryEntry | null;
}

export function readActiveDecals(state: AppState): ActiveDecalSummaryEntry[] {
  const skinEntries = state.activeItems?.Skin;
  if (!skinEntries || typeof skinEntries !== "object") {
    return [];
  }

  const summary: ActiveDecalSummaryEntry[] = [];
  for (const [carKey, entry] of Object.entries(skinEntries)) {
    const normalizedCarKey = carKey.trim();
    const skinFolder = typeof entry?.skin_folder === "string" ? entry.skin_folder.trim() : "";
    const displayName = typeof entry?.display_name === "string" ? entry.display_name.trim() : "";
    if (!normalizedCarKey || !skinFolder) {
      continue;
    }

    summary.push({
      carKey: normalizedCarKey,
      displayName: displayName || skinFolder,
    });
  }

  summary.sort((a, b) => a.carKey.localeCompare(b.carKey, undefined, { sensitivity: "base" }));
  return summary;
}

export function readActiveWheel(state: AppState): ActiveSingleSummaryEntry | null {
  const activeWheel = state.activeItems?.Wheel?.current;
  const wheelFolder = typeof activeWheel?.wheel_folder === "string" ? activeWheel.wheel_folder.trim() : "";
  if (!wheelFolder) {
    return null;
  }

  const displayName = typeof activeWheel?.display_name === "string" ? activeWheel.display_name.trim() : "";
  return {
    displayName: displayName || wheelFolder,
  };
}

export function readActiveBoost(state: AppState): ActiveSingleSummaryEntry | null {
  const activeBoost = state.activeItems?.Boost?.current;
  const boostFolder = typeof activeBoost?.boost_folder === "string" ? activeBoost.boost_folder.trim() : "";
  if (!boostFolder) {
    return null;
  }

  const displayName = typeof activeBoost?.display_name === "string" ? activeBoost.display_name.trim() : "";
  return {
    displayName: displayName || boostFolder,
  };
}

export function readActiveLoadoutSummary(state: AppState): ActiveLoadoutSummary {
  return {
    activeDecals: readActiveDecals(state),
    activeWheel: readActiveWheel(state),
    activeBoost: readActiveBoost(state),
  };
}

export function getUserFacingRocketLeagueStatus(status: RocketLeagueProcessStatus): RocketLeagueProcessStatusLabel {
  return getRocketLeagueProcessStatusLabel(status);
}
