import { invoke, isTauri } from "@tauri-apps/api/core";

export interface RocketLeagueProcessStatus {
  available: boolean;
  isRunning: boolean;
  message?: string;
}

export type RocketLeagueProcessStatusLabel = "Running" | "Not running" | "Status unavailable";

export function normalizeProcessStatusError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown process status error";
}

export function getRocketLeagueProcessStatusLabel(status: RocketLeagueProcessStatus): RocketLeagueProcessStatusLabel {
  if (!status.available) {
    return "Status unavailable";
  }

  return status.isRunning ? "Running" : "Not running";
}

export async function readRocketLeagueProcessStatus(): Promise<RocketLeagueProcessStatus> {
  if (!isTauri()) {
    return {
      available: false,
      isRunning: false,
      message: "Status unavailable",
    };
  }

  try {
    const isRunning = await invoke<boolean>("is_rocket_league_running");
    return {
      available: true,
      isRunning,
    };
  } catch (error) {
    console.error(`Rocket League process status check failed: ${normalizeProcessStatusError(error)}`);
    return {
      available: false,
      isRunning: false,
      message: "Status unavailable",
    };
  }
}
