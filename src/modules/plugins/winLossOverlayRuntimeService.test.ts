import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultWinLossOverlayState,
  forceStopWinLossOverlayRuntime,
  hideWinLossOverlayWindow,
  listenWinLossOverlayRuntimeState,
  openWinLossOverlayRuntimeLogsFolder,
  parseRuntimeState,
  resetWinLossOverlaySession,
  showWinLossOverlayWindow,
  updateWinLossOverlayWindowLayout,
  startWinLossOverlayRuntime,
  stopWinLossOverlayRuntime,
  type WinLossOverlayRuntimeState,
} from "./winLossOverlayRuntimeService";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  join: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocked.listen,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

describe("winLossOverlayRuntimeService", () => {
  beforeEach(() => {
    mocked.invoke.mockReset();
    mocked.listen.mockReset();
    mocked.join.mockReset();
    mocked.join.mockImplementation(async (...parts: string[]) => parts.join("/"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses runtime payload to expected state shape", () => {
    const parsed = parseRuntimeState({
      status: "Connected",
      message: "Connected to Rocket League.",
      wins: 4,
      losses: 2,
      streak: "2W",
      mode: "tcp-json",
      port: 49123,
      restart_required: false,
      connected: true,
      in_match: true,
      last_match_guid: "abc",
      mmr_delta: 14,
      mmr_status: "synced",
      mmr_total_start: 1700,
      mmr_total_current: 1714,
      mmr_by_playlist: {
        "13": {
          name: "Ranked Standard 3v3",
          start: 700,
          current: 714,
          delta: 14,
          matches_delta: 1,
        },
      },
      mmr_player_platform: "epic",
      mmr_failure_reason: "tracker_unavailable",
      mmr_http_client: "reqwest",
    });

    expect(parsed.status).toBe("Connected");
    expect(parsed.wins).toBe(4);
    expect(parsed.losses).toBe(2);
    expect(parsed.streak).toBe("2W");
    expect(parsed.mode).toBe("tcp-json");
    expect(parsed.last_match_guid).toBe("abc");
    expect(parsed.mmr_status).toBe("synced");
    expect(parsed.mmr_delta).toBe(14);
    expect(parsed.mmr_total_start).toBe(1700);
    expect(parsed.mmr_total_current).toBe(1714);
    expect(parsed.mmr_player_platform).toBe("epic");
    expect(parsed.mmr_by_playlist["13"]?.delta).toBe(14);
    expect(parsed.mmr_http_client).toBe("reqwest");
    expect(parsed.mmr_failure_reason).toBe("tracker_unavailable");
  });

  it("maps invalid payload fields to safe defaults", () => {
    const parsed = parseRuntimeState({
      status: "Unknown status",
      wins: "3",
      losses: null,
      restart_required: "yes",
    });

    const defaults = createDefaultWinLossOverlayState();
    expect(parsed.status).toBe(defaults.status);
    expect(parsed.wins).toBe(defaults.wins);
    expect(parsed.losses).toBe(defaults.losses);
    expect(parsed.restart_required).toBe(false);
    expect(parsed.mmr_status).toBe("loading");
    expect(parsed.mmr_failure_reason).toBeNull();
    expect(parsed.mmr_http_client).toBe("unknown");
  });

  it("accepts restart-required status payloads", () => {
    const parsed = parseRuntimeState({
      status: "Restart Rocket League",
      message: "Restart Rocket League once to enable the overlay.",
    });

    expect(parsed.status).toBe("Restart Rocket League");
    expect(parsed.message).toContain("Restart Rocket League");
  });

  it("returns restart message when backend reports restart_required", async () => {
    mocked.invoke.mockResolvedValue({
      ...createDefaultWinLossOverlayState(),
      status: "Waiting for Rocket League",
      message: "Restart Rocket League once to enable the overlay.",
      restart_required: true,
    } satisfies WinLossOverlayRuntimeState);

    const result = await startWinLossOverlayRuntime(
      "C:/Program Files/Epic Games/rocketleague",
      "C:/repo/AppData",
    );

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Restart Rocket League once to enable the overlay.");
    expect(result.state?.restart_required).toBe(true);
  });

  it("maps missing path backend error to friendly setup message", async () => {
    mocked.invoke.mockRejectedValue(new Error("Choose your Rocket League folder in Settings before enabling this plugin."));

    const result = await startWinLossOverlayRuntime("", "C:/repo/AppData");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Choose your Rocket League folder in Settings before enabling this plugin.");
  });

  it("maps DefaultStatsAPI.ini permission failures to friendly admin guidance", async () => {
    mocked.invoke.mockRejectedValue(new Error("RLPeak could not update DefaultStatsAPI.ini. Try running RLPeak as administrator or check folder permissions."));

    const result = await startWinLossOverlayRuntime(
      "C:/Program Files/Epic Games/rocketleague",
      "C:/repo/AppData",
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe("RLPeak could not update DefaultStatsAPI.ini. Try running RLPeak as administrator or check folder permissions.");
  });

  it("returns success states for stop and reset actions", async () => {
    mocked.invoke
      .mockResolvedValueOnce({
        ...createDefaultWinLossOverlayState(),
        status: "Stopped",
        message: "Overlay runtime is stopped.",
        wins: 1,
        losses: 1,
        streak: "1L",
        last_match_guid: "m2",
      } satisfies WinLossOverlayRuntimeState)
      .mockResolvedValueOnce({
        ...createDefaultWinLossOverlayState(),
        status: "Connected",
        message: "Session reset.",
        mode: "tcp-json",
        connected: true,
      } satisfies WinLossOverlayRuntimeState);

    const stopResult = await stopWinLossOverlayRuntime();
    const resetResult = await resetWinLossOverlaySession();

    expect(stopResult.ok).toBe(true);
    expect(stopResult.state?.status).toBe("Stopped");
    expect(resetResult.ok).toBe(true);
    expect(resetResult.state?.wins).toBe(0);
    expect(resetResult.state?.losses).toBe(0);
  });

  it("allows stop command to be called repeatedly without failure", async () => {
    mocked.invoke
      .mockResolvedValue({
        ...createDefaultWinLossOverlayState(),
        status: "Stopped",
        message: "Overlay runtime is stopped.",
      } satisfies WinLossOverlayRuntimeState);

    const first = await stopWinLossOverlayRuntime();
    const second = await stopWinLossOverlayRuntime();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(mocked.invoke).toHaveBeenCalledTimes(2);
  });

  it("supports force stop command for recovery", async () => {
    mocked.invoke.mockResolvedValue({
      ...createDefaultWinLossOverlayState(),
      status: "Stopped",
      message: "Overlay runtime was force-stopped.",
    } satisfies WinLossOverlayRuntimeState);

    const result = await forceStopWinLossOverlayRuntime();
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Overlay runtime force-stopped.");
    expect(mocked.invoke).toHaveBeenCalledWith("force_stop_win_loss_overlay_runtime");
  });

  it("can hide overlay window while runtime is not connected yet", async () => {
    mocked.invoke.mockResolvedValue(undefined);

    const result = await hideWinLossOverlayWindow();
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Overlay window hidden.");
  });

  it("listens for runtime state updates and maps payloads", async () => {
    let callback: ((event: { payload: unknown }) => void) | undefined;
    mocked.listen.mockImplementation(async (_eventName: string, handler: unknown) => {
      callback = handler as (event: { payload: unknown }) => void;
      return () => {};
    });

    const received: WinLossOverlayRuntimeState[] = [];
    const unlisten = await listenWinLossOverlayRuntimeState((state) => {
      received.push(state);
    });

    if (callback !== undefined) {
      callback({
        payload: {
          status: "In Match",
          message: "Match counted: win.",
          wins: 1,
          losses: 0,
          streak: "1W",
          mode: "websocket",
          port: 49123,
          restart_required: false,
          connected: true,
          in_match: true,
          last_match_guid: "m1",
        },
      });
    }

    expect(received).toHaveLength(1);
    expect(received[0]?.status).toBe("In Match");
    expect(received[0]?.wins).toBe(1);

    unlisten();
  });

  it("passes overlay layout options to backend show command", async () => {
    mocked.invoke.mockResolvedValue(undefined);

    const result = await showWinLossOverlayWindow({
      x: 64,
      y: 72,
      width: 400,
      height: 180,
    });

    expect(result.ok).toBe(true);
    expect(mocked.invoke).toHaveBeenCalledWith("show_win_loss_overlay_window", {
      x: 64,
      y: 72,
      width: 400,
      height: 180,
    });
  });

  it("passes layout update options to backend update command", async () => {
    mocked.invoke.mockResolvedValue(undefined);

    const result = await updateWinLossOverlayWindowLayout({
      x: 92,
      y: 76,
      width: 420,
      height: 190,
    });

    expect(result.ok).toBe(true);
    expect(mocked.invoke).toHaveBeenCalledWith("update_win_loss_overlay_window_layout", {
      x: 92,
      y: 76,
      width: 420,
      height: 190,
    });
  });

  it("opens runtime logs folder when logs directory exists", async () => {
    mocked.invoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined);

    const result = await openWinLossOverlayRuntimeLogsFolder("C:/repo/AppData");

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Runtime logs folder opened.");
    expect(mocked.invoke).toHaveBeenNthCalledWith(1, "path_exists", {
      path: "C:/repo/AppData/plugins/runtime/win_loss_overlay/logs",
    });
    expect(mocked.invoke).toHaveBeenNthCalledWith(2, "open_folder", {
      path: "C:/repo/AppData/plugins/runtime/win_loss_overlay/logs",
    });
  });

  it("returns friendly message when runtime logs folder is missing", async () => {
    mocked.invoke.mockResolvedValueOnce(false);

    const result = await openWinLossOverlayRuntimeLogsFolder("C:/repo/AppData");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Runtime logs folder is not available yet. Enable the overlay once first.");
  });
});
