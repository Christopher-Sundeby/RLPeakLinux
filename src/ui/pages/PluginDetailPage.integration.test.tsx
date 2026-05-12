// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PluginsState } from "../../modules/items/types";
import {
  PluginDetailPage,
  WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE,
  WORKSHOP_FIRST_TIME_SETUP_STILL_RUNNING_MESSAGE,
  WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE,
  WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE,
  WORKSHOP_LOAD_TUTORIAL_MODAL_NO_RESTART_MESSAGE,
  WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE,
} from "./PluginDetailPage";

const mocked = vi.hoisted(() => ({
  navigate: vi.fn(),
  loadPluginManifest: vi.fn(),
  loadPluginDetail: vi.fn(),
  readPluginsState: vi.fn(),
  getWinLossOverlayRuntimeState: vi.fn(),
  listenWinLossOverlayRuntimeState: vi.fn(),
  getLocalAppDataPaths: vi.fn(),
  ensureRocketLeaguePathForActions: vi.fn(),
  loadAppState: vi.fn(),
  loadWorkshopMap: vi.fn(),
  getWorkshopMapsCatalog: vi.fn(),
  getWorkshopActiveMapStatus: vi.fn(),
  getWorkshopLoadPreflight: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocked.navigate,
  useParams: () => ({ pluginId: "workshop_map_loader" }),
}));

vi.mock("../../modules/plugins/pluginCatalogService", () => ({
  loadPluginManifest: mocked.loadPluginManifest,
  loadPluginDetail: mocked.loadPluginDetail,
}));

vi.mock("../../modules/plugins/pluginInstallService", () => ({
  installPlugin: vi.fn(async () => ({ ok: true, message: "Installed." })),
  readPluginsState: mocked.readPluginsState,
  setPluginEnabled: vi.fn(async () => ({ ok: true, message: "Saved." })),
  uninstallPlugin: vi.fn(async () => ({ ok: true, message: "Uninstalled." })),
}));

vi.mock("../../modules/plugins/pluginRuntimeLifecycleService", () => ({
  WIN_LOSS_OVERLAY_PLUGIN_ID: "win_loss_overlay",
  WIN_LOSS_OVERLAY_RUNTIME_ID: "builtin.win_loss_overlay.v1",
  WORKSHOP_MAP_LOADER_PLUGIN_ID: "workshop_map_loader",
  WORKSHOP_MAP_LOADER_RUNTIME_ID: "builtin.workshop_map_loader.v1",
  forceStopPluginRuntimeLifecycle: vi.fn(async () => ({ ok: true, message: "Stopped." })),
  getRuntimeIdForPlugin: vi.fn(() => "builtin.workshop_map_loader.v1"),
  hidePluginRuntimeLifecycle: vi.fn(async () => ({ ok: true, message: "Hidden." })),
  runtimeRequiresRocketLeaguePath: vi.fn(() => false),
  showPluginRuntimeLifecycle: vi.fn(async () => ({ ok: true, message: "Shown." })),
  startPluginRuntimeLifecycle: vi.fn(async () => ({ ok: true, message: "Started." })),
  stopPluginRuntimeLifecycle: vi.fn(async () => ({ ok: true, message: "Stopped." })),
}));

vi.mock("../../modules/plugins/winLossOverlayThemeSettingsService", () => {
  const defaults = {
    theme_id: "rocketstats_circle",
    x: 40,
    y: 40,
    scale: 1,
    opacity: 0.92,
    show_status: false,
  };
  return {
    applyWinLossOverlayWindowLayout: vi.fn(async () => ({ ok: true, message: "ok" })),
    broadcastWinLossOverlayThemeSettings: vi.fn(async () => undefined),
    getDefaultWinLossOverlayThemeSettings: vi.fn(() => defaults),
    readWinLossOverlayThemeSettingsFromPluginEntry: vi.fn(() => defaults),
    readWinLossOverlayThemeSettingsFromPluginsState: vi.fn(() => defaults),
    resolveWinLossOverlayWindowLayout: vi.fn(() => ({ x: 40, y: 40, width: 400, height: 300 })),
    resetWinLossOverlayThemeSettings: vi.fn(async () => defaults),
    saveWinLossOverlayThemeSettings: vi.fn(async () => defaults),
    sanitizeWinLossOverlayThemeSettings: vi.fn((value) => value),
  };
});

vi.mock("../../modules/plugins/rocketStatsFontService", () => ({
  ROCKETSTATS_AZONIX_FONT_FAMILY: "RocketStats Azonix",
  ROCKETSTATS_MADE_TOMMY_FONT_FAMILY: "RocketStats MADE Tommy",
  ROCKETSTATS_NATIVE_FONT_FAMILY: "RocketStats NativeTheme",
  RLPEAK_MINIMALIST_FONT_FAMILY: "RLPeak Minimalist Minecraft",
  ROCKETSTATS_MADE_TOMMY_FONT_URL: "/overlay-themes/rocketstats-JSTKISS/fonts/MADETommy.otf",
  ROCKETSTATS_NATIVE_FONT_URL: "/overlay-themes/rocketstats-NativeTheme/fonts/font.otf",
  RLPEAK_MINIMALIST_FONT_URL: "/overlay-themes/minimalist/fonts/Minecraft.otf",
  ensureRocketStatsAzonixFontLoaded: vi.fn(async () => undefined),
}));

vi.mock("../../modules/plugins/winLossOverlayThemeRegistry", () => ({
  listWinLossOverlayThemes: vi.fn(() => [{ id: "rocketstats_circle", name: "RocketStats Circle" }]),
}));

vi.mock("../../modules/plugins/winLossOverlayRuntimeService", () => ({
  createDefaultWinLossOverlayState: vi.fn(() => ({
    wins: 0,
    losses: 0,
    streak: "0",
    status: "Stopped",
    message: "",
    mode: "idle",
    port: 49123,
    restart_required: false,
    last_match_guid: null,
    mmr_delta: null,
    mmr_status: "loading",
    mmr_source: "tracker.gg",
    mmr_total_start: null,
    mmr_total_current: null,
    mmr_player_platform: null,
    mmr_failure_reason: null,
    mmr_http_client: null,
    mmr_by_playlist: {},
  })),
  getWinLossOverlayRuntimeState: mocked.getWinLossOverlayRuntimeState,
  listenWinLossOverlayRuntimeState: mocked.listenWinLossOverlayRuntimeState,
  openWinLossOverlayRuntimeLogsFolder: vi.fn(async () => ({ ok: true, message: "Opened." })),
  resetWinLossOverlaySession: vi.fn(async () => ({ ok: true, message: "Reset." })),
}));

vi.mock("../../modules/plugins/workshopMapLoaderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../modules/plugins/workshopMapLoaderService")>();
  return {
    ...actual,
    getWorkshopMapsCatalog: mocked.getWorkshopMapsCatalog,
    getWorkshopActiveMapStatus: mocked.getWorkshopActiveMapStatus,
    getWorkshopLoadPreflight: mocked.getWorkshopLoadPreflight,
    loadWorkshopMap: mocked.loadWorkshopMap,
    refreshWorkshopMapsCatalog: vi.fn(async () => ({ ok: true, maps: [], source: "remote", message: "ok" })),
    cacheWorkshopMapAssets: vi.fn(async () => ({ ok: true, mapId: 1, shortDescription: "desc", metadataCached: true, bannerCached: true, message: "ok" })),
    openWorkshopCacheFolder: vi.fn(async () => ({ ok: true, message: "Opened." })),
    openWorkshopRuntimeLogsFolder: vi.fn(async () => ({ ok: true, message: "Opened." })),
    restoreWorkshopOriginalMap: vi.fn(async () => ({ ok: true, restored: true, message: "Restored." })),
  };
});

vi.mock("../../modules/items/pathService", () => ({
  getLocalAppDataPaths: mocked.getLocalAppDataPaths,
}));

vi.mock("../../modules/items/rocketLeaguePathService", () => ({
  ensureRocketLeaguePathForActions: mocked.ensureRocketLeaguePathForActions,
}));

vi.mock("../../modules/items/stateService", () => ({
  loadAppState: mocked.loadAppState,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPluginDetailPageInStrictMode() {
  return render(
    <React.StrictMode>
      <PluginDetailPage />
    </React.StrictMode>,
  );
}

const WORKSHOP_MANIFEST_ENTRY = {
  id: "workshop_map_loader",
  name: "Workshop Map Loader",
  version: "1.0.0",
  summary: "Load workshop maps into Rocket League.",
  type: "tools",
  runtime: "builtin.workshop_map_loader.v1",
  status: "stable",
  manifest_path: "/v1/plugins/workshop_map_loader/plugin.json",
};

const INSTALLED_WORKSHOP_STATE: PluginsState = {
  workshop_map_loader: {
    installed: true,
    enabled: false,
    name: "Workshop Map Loader",
    summary: "Load workshop maps into Rocket League.",
    version: "1.0.0",
    type: "tools",
    runtime: "builtin.workshop_map_loader.v1",
  },
};

const WORKSHOP_MAP_ITEM = {
  id: 7,
  name: "Fractals Corridor",
  memberDisplayName: "fractalrl",
  metadataPath: "maps_files/7/metadata.json",
  bannerPath: "maps_files/7/banner.jpg",
  finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
  shortDescription: "Map description",
};

function setupWorkshopPageMocks() {
  mocked.loadPluginManifest.mockResolvedValue({
    ok: true,
    manifest: {
      schema: "rlpeak_plugins_manifest.v1",
      version: "1.0.0",
      plugins: [WORKSHOP_MANIFEST_ENTRY],
    },
    message: "ok",
  });
  mocked.loadPluginDetail.mockResolvedValue({
    ok: false,
    detail: null,
    message: "missing detail",
  });
  mocked.readPluginsState.mockResolvedValue(INSTALLED_WORKSHOP_STATE);
  mocked.getWinLossOverlayRuntimeState.mockResolvedValue({
    wins: 0,
    losses: 0,
    streak: "0",
    status: "Stopped",
    message: "",
    mode: "idle",
    port: 49123,
    restart_required: false,
    last_match_guid: null,
    mmr_delta: null,
    mmr_status: "loading",
    mmr_source: "tracker.gg",
    mmr_total_start: null,
    mmr_total_current: null,
    mmr_player_platform: null,
    mmr_failure_reason: null,
    mmr_http_client: null,
    mmr_by_playlist: {},
  });
  mocked.listenWinLossOverlayRuntimeState.mockResolvedValue(() => undefined);
  mocked.getLocalAppDataPaths.mockResolvedValue({
    appDataRoot: "C:/repo/AppData",
  });
  mocked.ensureRocketLeaguePathForActions.mockResolvedValue({
    ok: true,
    rocketLeaguePath: "C:/Games/rocketleague",
    message: "",
  });
  mocked.loadAppState.mockResolvedValue({
    rocketLeaguePath: "C:/Games/rocketleague",
  });
  mocked.getWorkshopMapsCatalog.mockResolvedValue({
    ok: true,
    maps: [WORKSHOP_MAP_ITEM],
    source: "remote",
    message: "ok",
  });
  mocked.getWorkshopActiveMapStatus.mockResolvedValue({
    ok: true,
    activeMap: null,
    legacyBackupDetected: false,
    legacyBackupNotice: null,
    message: "ok",
  });
  mocked.getWorkshopLoadPreflight.mockResolvedValue({
    ok: true,
    rocketLeagueRunning: false,
    modFileExists: true,
    firstTimeSetupRequired: false,
    message: "ok",
  });
}

describe("PluginDetailPage workshop load integration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkshopPageMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows progress modal immediately on real Load click, keeps it while pending, then opens tutorial on success", async () => {
    const deferred = createDeferred<{
      ok: true;
      activeMap: {
        mapId: number;
        name: string;
        author: string;
        bannerPath: string;
        metadataPath: string;
        finalFilePath: string;
        shortDescription: string;
        activatedAt: string;
      };
      message: string;
      restartRequired: boolean;
      wasExistingModReplaced: boolean;
      rocketLeagueWasRunning: boolean;
    }>();
    mocked.loadWorkshopMap.mockReturnValueOnce(deferred.promise);

    renderPluginDetailPageInStrictMode();
    await waitFor(() => {
      expect(screen.getByText("Workshop maps")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      const modal = screen.getByTestId("workshop-load-progress-modal");
      expect(modal).toBeTruthy();
      expect(within(modal).getByText("Downloading workshop map")).toBeTruthy();
      expect(within(modal).getByText("Fractals Corridor")).toBeTruthy();
    });

    deferred.resolve({
      ok: true,
      activeMap: {
        mapId: 7,
        name: "Fractals Corridor",
        author: "fractalrl",
        bannerPath: "maps_files/7/banner.jpg",
        metadataPath: "maps_files/7/metadata.json",
        finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
        shortDescription: "Map description",
        activatedAt: "123",
      },
      message: "ok",
      restartRequired: false,
      wasExistingModReplaced: true,
      rocketLeagueWasRunning: false,
    });

    await waitFor(() => {
      expect(screen.queryByTestId("workshop-load-progress-modal")).toBeNull();
      expect(screen.getByText(WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE)).toBeTruthy();
      expect(screen.getAllByText(WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE).length).toBeGreaterThan(0);
      expect(screen.getByText(WORKSHOP_LOAD_TUTORIAL_MODAL_NO_RESTART_MESSAGE)).toBeTruthy();
      expect(screen.getAllByText("Leave current map").length).toBeGreaterThan(0);
    });
  });

  it("closes progress modal and does not open tutorial when load fails", async () => {
    const deferred = createDeferred<{
      ok: false;
      message: string;
      details?: string;
    }>();
    mocked.loadWorkshopMap.mockReturnValueOnce(deferred.promise);

    renderPluginDetailPageInStrictMode();
    await waitFor(() => {
      expect(screen.getByText("Workshop maps")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByTestId("workshop-load-progress-modal")).toBeTruthy();
    });

    deferred.resolve({
      ok: false,
      message: "Could not load workshop map.",
      details: "WORKSHOP_MAP_NOT_FOUND",
    });

    await waitFor(() => {
      expect(screen.queryByTestId("workshop-load-progress-modal")).toBeNull();
      expect(screen.queryByText(WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE)).toBeNull();
    });
  });

  it("opens first-time setup modal and blocks map load when RL is running and mods file is missing", async () => {
    mocked.getWorkshopLoadPreflight.mockResolvedValueOnce({
      ok: true,
      rocketLeagueRunning: true,
      modFileExists: false,
      firstTimeSetupRequired: true,
      message: "ok",
    });

    renderPluginDetailPageInStrictMode();
    await waitFor(() => {
      expect(screen.getByText("Workshop maps")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText(WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE)).toBeTruthy();
    });
    expect(screen.queryByTestId("workshop-load-progress-modal")).toBeNull();
    expect(mocked.loadWorkshopMap).not.toHaveBeenCalled();
  });

  it("keeps first-time setup modal open with warning when retry is clicked and RL is still running", async () => {
    mocked.getWorkshopLoadPreflight
      .mockResolvedValueOnce({
        ok: true,
        rocketLeagueRunning: true,
        modFileExists: false,
        firstTimeSetupRequired: true,
        message: "ok",
      })
      .mockResolvedValueOnce({
        ok: true,
        rocketLeagueRunning: true,
        modFileExists: false,
        firstTimeSetupRequired: true,
        message: "ok",
      });

    renderPluginDetailPageInStrictMode();
    await waitFor(() => {
      expect(screen.getByText("Workshop maps")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => {
      expect(screen.getByText(WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "I closed Rocket League, retry" }));

    await waitFor(() => {
      expect(screen.getByText(WORKSHOP_FIRST_TIME_SETUP_STILL_RUNNING_MESSAGE)).toBeTruthy();
      expect(screen.getByText(WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE)).toBeTruthy();
    });
    expect(screen.queryByTestId("workshop-load-progress-modal")).toBeNull();
    expect(mocked.loadWorkshopMap).not.toHaveBeenCalled();
  });

  it("starts actual load after first-time retry succeeds, then shows first-time success tutorial flow", async () => {
    mocked.getWorkshopLoadPreflight
      .mockResolvedValueOnce({
        ok: true,
        rocketLeagueRunning: true,
        modFileExists: false,
        firstTimeSetupRequired: true,
        message: "ok",
      })
      .mockResolvedValueOnce({
        ok: true,
        rocketLeagueRunning: false,
        modFileExists: false,
        firstTimeSetupRequired: true,
        message: "ok",
      });
    const deferred = createDeferred<{
      ok: true;
      activeMap: {
        mapId: number;
        name: string;
        author: string;
        bannerPath: string;
        metadataPath: string;
        finalFilePath: string;
        shortDescription: string;
        activatedAt: string;
      };
      message: string;
      restartRequired: boolean;
      wasExistingModReplaced: boolean;
      rocketLeagueWasRunning: boolean;
    }>();
    mocked.loadWorkshopMap.mockReturnValueOnce(deferred.promise);

    renderPluginDetailPageInStrictMode();
    await waitFor(() => {
      expect(screen.getByText("Workshop maps")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => {
      expect(screen.getByText(WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "I closed Rocket League, retry" }));

    await waitFor(() => {
      expect(screen.queryByText(WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE)).toBeNull();
      expect(screen.getByTestId("workshop-load-progress-modal")).toBeTruthy();
    });

    deferred.resolve({
      ok: true,
      activeMap: {
        mapId: 7,
        name: "Fractals Corridor",
        author: "fractalrl",
        bannerPath: "maps_files/7/banner.jpg",
        metadataPath: "maps_files/7/metadata.json",
        finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
        shortDescription: "Map description",
        activatedAt: "123",
      },
      message: "ok",
      restartRequired: true,
      wasExistingModReplaced: false,
      rocketLeagueWasRunning: false,
    });

    await waitFor(() => {
      expect(screen.queryByTestId("workshop-load-progress-modal")).toBeNull();
      expect(screen.getByText(WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE)).toBeTruthy();
      expect(screen.getAllByText(WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Start Rocket League").length).toBeGreaterThan(0);
    });
  });

  it("allows load flow while Rocket League is running when backend load succeeds", async () => {
    mocked.getWorkshopLoadPreflight.mockResolvedValueOnce({
      ok: true,
      rocketLeagueRunning: true,
      modFileExists: true,
      firstTimeSetupRequired: false,
      message: "ok",
    });
    mocked.loadWorkshopMap.mockResolvedValueOnce({
      ok: true,
      activeMap: {
        mapId: 7,
        name: "Fractals Corridor",
        author: "fractalrl",
        bannerPath: "maps_files/7/banner.jpg",
        metadataPath: "maps_files/7/metadata.json",
        finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
        shortDescription: "Map description",
        activatedAt: "123",
      },
      message: "ok",
      restartRequired: false,
      wasExistingModReplaced: true,
      rocketLeagueWasRunning: true,
    });

    renderPluginDetailPageInStrictMode();
    await waitFor(() => {
      expect(screen.getByText("Workshop maps")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.queryByTestId("workshop-load-progress-modal")).toBeNull();
      expect(screen.getByText(WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE)).toBeTruthy();
    });
    expect(mocked.loadWorkshopMap).toHaveBeenCalledTimes(1);
  });

  it("shows legacy workshop backup migration notice when backend reports it", async () => {
    mocked.getWorkshopActiveMapStatus.mockResolvedValue({
      ok: true,
      activeMap: null,
      legacyBackupDetected: true,
      legacyBackupNotice: "Legacy workshop backup detected from older RLPeak builds.",
      message: "ok",
    });

    renderPluginDetailPageInStrictMode();

    await waitFor(() => {
      expect(screen.getByText("Legacy workshop backup detected from older RLPeak builds.")).toBeTruthy();
    });
  });
});
