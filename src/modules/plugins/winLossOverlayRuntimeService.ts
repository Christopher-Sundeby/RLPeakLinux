import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";

export const WIN_LOSS_OVERLAY_RUNTIME_EVENT = "plugins://win-loss-overlay/state";

export type WinLossOverlayStatus =
  | "Stopped"
  | "Waiting for Rocket League"
  | "Restart Rocket League"
  | "Connected"
  | "In Match"
  | "Error";

export type WinLossOverlayMmrStatus =
  | "loading"
  | "ready"
  | "syncing"
  | "synced"
  | "failed"
  | "disabled";

export type WinLossOverlayMmrFailureReason =
  | "player_not_detected"
  | "tracker_blocked"
  | "rate_limited"
  | "tracker_unavailable"
  | "profile_private_or_missing"
  | "non_json_response"
  | "parse_failed"
  | "no_ranked_stats"
  | "network_error"
  | "unknown";

export interface WinLossOverlayMmrPlaylistState {
  name: string;
  tier_name: string;
  start: number;
  current: number;
  delta: number;
  matches_delta: number;
}

export interface WinLossOverlayRuntimeState {
  status: WinLossOverlayStatus;
  message: string;
  wins: number;
  losses: number;
  streak: string;
  mode: string;
  port: number;
  restart_required: boolean;
  connected: boolean;
  in_match: boolean;
  last_match_guid: string | null;
  mmr_delta: number | null;
  mmr_status: WinLossOverlayMmrStatus;
  mmr_source: "tracker.gg";
  mmr_total_start: number | null;
  mmr_total_current: number | null;
  mmr_by_playlist: Record<string, WinLossOverlayMmrPlaylistState>;
  mmr_player_platform: "steam" | "epic" | null;
  mmr_failure_reason: WinLossOverlayMmrFailureReason | null;
  mmr_http_client: "reqwest" | "wreq" | "unknown";
}

export interface RuntimeActionResult {
  ok: boolean;
  message: string;
  details?: string;
  state?: WinLossOverlayRuntimeState;
}

export interface WinLossOverlayWindowLayout {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export function createDefaultWinLossOverlayState(): WinLossOverlayRuntimeState {
  return {
    status: "Stopped",
    message: "Overlay runtime is stopped.",
    wins: 0,
    losses: 0,
    streak: "",
    mode: "idle",
    port: 49123,
    restart_required: false,
    connected: false,
    in_match: false,
    last_match_guid: null,
    mmr_delta: null,
    mmr_status: "loading",
    mmr_source: "tracker.gg",
    mmr_total_start: null,
    mmr_total_current: null,
    mmr_by_playlist: {},
    mmr_player_platform: null,
    mmr_failure_reason: null,
    mmr_http_client: "unknown",
  };
}

function parseMmrStatus(value: unknown): WinLossOverlayMmrStatus {
  if (
    value === "loading"
    || value === "ready"
    || value === "syncing"
    || value === "synced"
    || value === "failed"
    || value === "disabled"
  ) {
    return value;
  }
  return "loading";
}

function parseFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function parseMmrByPlaylist(value: unknown): Record<string, WinLossOverlayMmrPlaylistState> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const parsed: Record<string, WinLossOverlayMmrPlaylistState> = {};
  const valueRecord = value as Record<string, unknown>;
  for (const [playlistKey, playlistValue] of Object.entries(valueRecord)) {
    if (typeof playlistValue !== "object" || playlistValue === null || Array.isArray(playlistValue)) {
      continue;
    }
    const playlistRecord = playlistValue as Record<string, unknown>;
    const name = typeof playlistRecord.name === "string"
      ? playlistRecord.name
      : `Playlist ${playlistKey}`;
    const tierName = typeof playlistRecord.tier_name === "string"
      ? playlistRecord.tier_name
      : "Unknown";
    const start = parseFiniteNumberOrNull(playlistRecord.start);
    const current = parseFiniteNumberOrNull(playlistRecord.current);
    const delta = parseFiniteNumberOrNull(playlistRecord.delta);
    const matchesDelta = parseFiniteNumberOrNull(playlistRecord.matches_delta);
    if (start === null || current === null || delta === null || matchesDelta === null) {
      continue;
    }

    parsed[playlistKey] = {
      name,
      tier_name: tierName,
      start,
      current,
      delta,
      matches_delta: matchesDelta,
    };
  }

  return parsed;
}

function parseMmrFailureReason(value: unknown): WinLossOverlayMmrFailureReason | null {
  if (
    value === "player_not_detected"
    || value === "tracker_blocked"
    || value === "rate_limited"
    || value === "tracker_unavailable"
    || value === "profile_private_or_missing"
    || value === "non_json_response"
    || value === "parse_failed"
    || value === "no_ranked_stats"
    || value === "network_error"
    || value === "unknown"
  ) {
    return value;
  }
  return null;
}

function parseMmrHttpClient(value: unknown): "reqwest" | "wreq" | "unknown" {
  if (value === "reqwest" || value === "wreq") {
    return value;
  }
  return "unknown";
}

function parseRuntimeState(payload: unknown): WinLossOverlayRuntimeState {
  const record = typeof payload === "object" && payload !== null
    ? payload as Record<string, unknown>
    : {};
  const fallback = createDefaultWinLossOverlayState();

  const status = typeof record.status === "string" ? record.status : fallback.status;
  const validStatus: WinLossOverlayStatus = (
    status === "Stopped"
    || status === "Waiting for Rocket League"
    || status === "Restart Rocket League"
    || status === "Connected"
    || status === "In Match"
    || status === "Error"
  )
    ? status
    : fallback.status;

  return {
    status: validStatus,
    message: typeof record.message === "string" ? record.message : fallback.message,
    wins: typeof record.wins === "number" ? record.wins : fallback.wins,
    losses: typeof record.losses === "number" ? record.losses : fallback.losses,
    streak: typeof record.streak === "string" ? record.streak : fallback.streak,
    mode: typeof record.mode === "string" ? record.mode : fallback.mode,
    port: typeof record.port === "number" ? record.port : fallback.port,
    restart_required: record.restart_required === true,
    connected: record.connected === true,
    in_match: record.in_match === true,
    last_match_guid: typeof record.last_match_guid === "string" ? record.last_match_guid : null,
    mmr_delta: parseFiniteNumberOrNull(record.mmr_delta),
    mmr_status: parseMmrStatus(record.mmr_status),
    mmr_source: "tracker.gg",
    mmr_total_start: parseFiniteNumberOrNull(record.mmr_total_start),
    mmr_total_current: parseFiniteNumberOrNull(record.mmr_total_current),
    mmr_by_playlist: parseMmrByPlaylist(record.mmr_by_playlist),
    mmr_player_platform: record.mmr_player_platform === "steam" || record.mmr_player_platform === "epic"
      ? record.mmr_player_platform
      : null,
    mmr_failure_reason: parseMmrFailureReason(record.mmr_failure_reason),
    mmr_http_client: parseMmrHttpClient(record.mmr_http_client),
  };
}

function toErrorDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown error";
}

function mapRuntimeActionError(error: unknown, fallbackMessage: string): RuntimeActionResult {
  const details = toErrorDetails(error);
  if (details.includes("RLPeak could not update DefaultStatsAPI.ini.")) {
    return {
      ok: false,
      message: "RLPeak could not update DefaultStatsAPI.ini. Try running RLPeak as administrator or check folder permissions.",
      details,
    };
  }

  if (details.includes("Choose your Rocket League folder")) {
    return {
      ok: false,
      message: "Choose your Rocket League folder in Settings before enabling this plugin.",
      details,
    };
  }

  if (details.includes("DefaultStatsAPI.ini")) {
    return {
      ok: false,
      message: "Could not configure Rocket League stats. Please check your game folder in Settings.",
      details,
    };
  }

  return {
    ok: false,
    message: fallbackMessage,
    details,
  };
}

export async function getWinLossOverlayRuntimeState(): Promise<WinLossOverlayRuntimeState> {
  try {
    const payload = await invoke<unknown>("get_win_loss_overlay_runtime_state");
    return parseRuntimeState(payload);
  } catch {
    return createDefaultWinLossOverlayState();
  }
}

export async function startWinLossOverlayRuntime(
  rocketLeaguePath: string,
  appDataRoot: string,
): Promise<RuntimeActionResult> {
  try {
    const payload = await invoke<unknown>("start_win_loss_overlay_runtime", {
      rocketLeaguePath,
      appDataRoot,
    });
    const state = parseRuntimeState(payload);
    return {
      ok: true,
      message: state.restart_required
        ? "Restart Rocket League once to enable the overlay."
        : "Overlay runtime started.",
      state,
    };
  } catch (error: unknown) {
    return mapRuntimeActionError(error, "Could not start Win/Loss Overlay runtime.");
  }
}

export async function stopWinLossOverlayRuntime(): Promise<RuntimeActionResult> {
  try {
    const payload = await invoke<unknown>("stop_win_loss_overlay_runtime");
    const state = parseRuntimeState(payload);
    return {
      ok: true,
      message: "Overlay runtime stopped.",
      state,
    };
  } catch (error: unknown) {
    return mapRuntimeActionError(error, "Could not stop Win/Loss Overlay runtime.");
  }
}

export async function forceStopWinLossOverlayRuntime(): Promise<RuntimeActionResult> {
  try {
    const payload = await invoke<unknown>("force_stop_win_loss_overlay_runtime");
    const state = parseRuntimeState(payload);
    return {
      ok: true,
      message: "Overlay runtime force-stopped.",
      state,
    };
  } catch (error: unknown) {
    return mapRuntimeActionError(error, "Could not force-stop Win/Loss Overlay runtime.");
  }
}

export async function resetWinLossOverlaySession(): Promise<RuntimeActionResult> {
  try {
    const payload = await invoke<unknown>("reset_win_loss_overlay_session");
    const state = parseRuntimeState(payload);
    return {
      ok: true,
      message: "Session reset.",
      state,
    };
  } catch (error: unknown) {
    return mapRuntimeActionError(error, "Could not reset Win/Loss Overlay session.");
  }
}

export async function showWinLossOverlayWindow(layout?: WinLossOverlayWindowLayout): Promise<RuntimeActionResult> {
  try {
    await invoke("show_win_loss_overlay_window", {
      x: layout?.x,
      y: layout?.y,
      width: layout?.width,
      height: layout?.height,
    });
    return {
      ok: true,
      message: "Overlay window shown.",
    };
  } catch (error: unknown) {
    return mapRuntimeActionError(error, "Could not show overlay window.");
  }
}

export async function hideWinLossOverlayWindow(): Promise<RuntimeActionResult> {
  try {
    await invoke("hide_win_loss_overlay_window");
    return {
      ok: true,
      message: "Overlay window hidden.",
    };
  } catch (error: unknown) {
    return mapRuntimeActionError(error, "Could not hide overlay window.");
  }
}

export async function updateWinLossOverlayWindowLayout(
  layout: WinLossOverlayWindowLayout,
): Promise<RuntimeActionResult> {
  try {
    await invoke("update_win_loss_overlay_window_layout", {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    });
    return {
      ok: true,
      message: "Overlay window layout updated.",
    };
  } catch (error: unknown) {
    return mapRuntimeActionError(error, "Could not update overlay window layout.");
  }
}

export async function openWinLossOverlayRuntimeLogsFolder(appDataRoot: string): Promise<RuntimeActionResult> {
  try {
    const logsFolderPath = await join(appDataRoot, "plugins", "runtime", "win_loss_overlay", "logs");
    const exists = await invoke<boolean>("path_exists", {
      path: logsFolderPath,
    });
    if (!exists) {
      return {
        ok: false,
        message: "Runtime logs folder is not available yet. Enable the overlay once first.",
        details: logsFolderPath,
      };
    }

    await invoke("open_folder", {
      path: logsFolderPath,
    });
    return {
      ok: true,
      message: "Runtime logs folder opened.",
      details: logsFolderPath,
    };
  } catch (error: unknown) {
    return mapRuntimeActionError(error, "Could not open runtime logs folder.");
  }
}

export async function listenWinLossOverlayRuntimeState(
  onState: (state: WinLossOverlayRuntimeState) => void,
): Promise<() => void> {
  const unlisten = await listen<unknown>(WIN_LOSS_OVERLAY_RUNTIME_EVENT, (event) => {
    onState(parseRuntimeState(event.payload));
  });

  return () => {
    unlisten();
  };
}

export { parseRuntimeState };
