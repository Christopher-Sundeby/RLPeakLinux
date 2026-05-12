// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AppState, PluginsState } from "../../modules/items/types";
import {
  PluginDetailPage,
  ROCKETSTATS_BORDERLESS_IMAGE_PATH,
  ROCKETSTATS_BORDERLESS_TUTORIAL_COPY,
  ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY,
  ROCKETSTATS_BORDERLESS_TUTORIAL_GUIDANCE_BUTTON_LABEL,
} from "./PluginDetailPage";

const mocked = vi.hoisted(() => ({
  pluginId: "win_loss_overlay",
  navigate: vi.fn(),
  loadPluginManifest: vi.fn(),
  loadPluginDetail: vi.fn(),
  readPluginsState: vi.fn(),
  getWinLossOverlayRuntimeState: vi.fn(),
  listenWinLossOverlayRuntimeState: vi.fn(),
  loadAppState: vi.fn(),
  saveAppState: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocked.navigate,
  useParams: () => ({ pluginId: mocked.pluginId }),
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
  getRuntimeIdForPlugin: vi.fn(() => "builtin.win_loss_overlay.v1"),
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

vi.mock("../../modules/plugins/winLossOverlayThemeRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../modules/plugins/winLossOverlayThemeRegistry")>();
  return {
    ...actual,
    listWinLossOverlayThemes: vi.fn(() => [{ id: "rocketstats_circle", name: "RocketStats Circle" }]),
  };
});

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
    getWorkshopMapsCatalog: vi.fn(async () => ({ ok: true, maps: [], source: "remote", message: "ok" })),
    getWorkshopActiveMapStatus: vi.fn(async () => ({ ok: true, activeMap: null, legacyBackupNotice: null, message: "ok" })),
    getWorkshopLoadPreflight: vi.fn(async () => ({ ok: true, rocketLeagueRunning: false, modFileExists: true, firstTimeSetupRequired: false, message: "ok" })),
    loadWorkshopMap: vi.fn(async () => ({ ok: true, activeMap: null, message: "ok", restartRequired: false, wasExistingModReplaced: true, rocketLeagueWasRunning: false })),
    refreshWorkshopMapsCatalog: vi.fn(async () => ({ ok: true, maps: [], source: "remote", message: "ok" })),
    cacheWorkshopMapAssets: vi.fn(async () => ({ ok: true, mapId: 1, shortDescription: "desc", metadataCached: true, bannerCached: true, message: "ok" })),
    openWorkshopCacheFolder: vi.fn(async () => ({ ok: true, message: "Opened." })),
    openWorkshopRuntimeLogsFolder: vi.fn(async () => ({ ok: true, message: "Opened." })),
    restoreWorkshopOriginalMap: vi.fn(async () => ({ ok: true, restored: true, message: "Restored." })),
  };
});

vi.mock("../../modules/items/pathService", () => ({
  getLocalAppDataPaths: vi.fn(async () => ({
    appDataRoot: "C:/repo/AppData",
  })),
}));

vi.mock("../../modules/items/rocketLeaguePathService", () => ({
  ensureRocketLeaguePathForActions: vi.fn(async () => ({
    ok: true,
    rocketLeaguePath: "C:/Games/rocketleague",
    message: "",
  })),
}));

vi.mock("../../modules/items/stateService", () => ({
  loadAppState: mocked.loadAppState,
  saveAppState: mocked.saveAppState,
}));

const ROCKETSTATS_MANIFEST_ENTRY = {
  id: "win_loss_overlay",
  name: "RocketStats",
  version: "1.1.0",
  summary: "Session MMR, wins, losses and streak overlay.",
  type: "overlay",
  runtime: "builtin.win_loss_overlay.v1",
  status: "stable",
  manifest_path: "/v1/plugins/win_loss_overlay/plugin.json",
};

function createPluginState(params: {
  installed: boolean;
  tutorialSeen?: boolean;
}): PluginsState {
  return {
    win_loss_overlay: {
      installed: params.installed,
      enabled: params.installed,
      name: "RocketStats",
      summary: "Session MMR, wins, losses and streak overlay.",
      version: "1.1.0",
      type: "overlay",
      runtime: "builtin.win_loss_overlay.v1",
      tutorials: params.tutorialSeen === undefined
        ? undefined
        : {
          [ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY]: params.tutorialSeen,
        },
    },
  };
}

function setupRocketStatsPageMocks(params: {
  pluginId?: string;
  installed?: boolean;
  tutorialSeen?: boolean;
} = {}) {
  mocked.pluginId = params.pluginId ?? "win_loss_overlay";
  mocked.loadPluginManifest.mockResolvedValue({
    ok: true,
    manifest: {
      schema: "rlpeak_plugins_manifest.v1",
      version: "1.1.0",
      plugins: [
        ROCKETSTATS_MANIFEST_ENTRY,
      ],
    },
    message: "ok",
  });
  mocked.loadPluginDetail.mockResolvedValue({
    ok: false,
    detail: null,
    message: "missing detail",
  });
  mocked.readPluginsState.mockResolvedValue(createPluginState({
    installed: params.installed ?? true,
    tutorialSeen: params.tutorialSeen,
  }));
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
  mocked.loadAppState.mockResolvedValue({
    rocketLeaguePath: "C:/Games/rocketleague",
    plugins: createPluginState({
      installed: params.installed ?? true,
      tutorialSeen: params.tutorialSeen,
    }),
  } as AppState);
  mocked.saveAppState.mockResolvedValue(undefined);
}

describe("PluginDetailPage RocketStats borderless tutorial flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupRocketStatsPageMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("auto-opens tutorial when RocketStats is installed and borderless guide has not been seen", async () => {
    render(
      <React.StrictMode>
        <PluginDetailPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("rocketstats-borderless-tutorial-modal")).toBeTruthy();
    });
    const modal = screen.getByTestId("rocketstats-borderless-tutorial-modal");
    expect(within(modal).getByText(ROCKETSTATS_BORDERLESS_TUTORIAL_COPY)).toBeTruthy();
    expect(within(modal).getByRole("img", { name: "Rocket League Display Mode set to Borderless" })).toBeTruthy();
  });

  it("does not auto-open tutorial when RocketStats is not installed", async () => {
    setupRocketStatsPageMocks({
      installed: false,
      tutorialSeen: false,
    });

    render(
      <React.StrictMode>
        <PluginDetailPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText("Plugin Manage")).toBeTruthy();
    });
    expect(screen.queryByTestId("rocketstats-borderless-tutorial-modal")).toBeNull();
  });

  it("persists tutorial dismissed flag and avoids auto-open on revisit after dismissal", async () => {
    const firstRender = render(
      <React.StrictMode>
        <PluginDetailPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("rocketstats-borderless-tutorial-modal")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Got it" })[0]);

    await waitFor(() => {
      expect(screen.queryByTestId("rocketstats-borderless-tutorial-modal")).toBeNull();
    });
    expect(mocked.saveAppState).toHaveBeenCalledTimes(1);
    const savedState = mocked.saveAppState.mock.calls[0][0] as AppState;
    expect(savedState.plugins?.win_loss_overlay?.tutorials?.[ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY]).toBe(true);
    firstRender.unmount();

    mocked.readPluginsState.mockResolvedValue(createPluginState({
      installed: true,
      tutorialSeen: true,
    }));
    mocked.loadAppState.mockResolvedValue({
      plugins: createPluginState({
        installed: true,
        tutorialSeen: true,
      }),
    } as AppState);

    render(
      <React.StrictMode>
        <PluginDetailPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText("Plugin Manage")).toBeTruthy();
    });
    expect(screen.queryByTestId("rocketstats-borderless-tutorial-modal")).toBeNull();
  });

  it("reopens tutorial from guide button even after it was dismissed", async () => {
    setupRocketStatsPageMocks({
      installed: true,
      tutorialSeen: true,
    });

    render(
      <React.StrictMode>
        <PluginDetailPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText("Runtime controls")).toBeTruthy();
    });
    expect(screen.queryByTestId("rocketstats-borderless-tutorial-modal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: ROCKETSTATS_BORDERLESS_TUTORIAL_GUIDANCE_BUTTON_LABEL }));

    await waitFor(() => {
      expect(screen.getByTestId("rocketstats-borderless-tutorial-modal")).toBeTruthy();
    });
  });

  it("opens image lightbox from borderless tutorial image click", async () => {
    render(
      <React.StrictMode>
        <PluginDetailPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("rocketstats-borderless-tutorial-modal")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open tutorial image: Display Mode: Borderless" }));

    await waitFor(() => {
      const lightboxImages = screen.getAllByRole("img", { name: "Rocket League Display Mode set to Borderless" });
      expect(lightboxImages.some((node) => node.getAttribute("src") === ROCKETSTATS_BORDERLESS_IMAGE_PATH)).toBe(true);
      expect(screen.getAllByText("Display Mode: Borderless").length).toBeGreaterThan(0);
    });
  });

  it("keeps Workshop detail flow unaffected and does not auto-open RocketStats tutorial", async () => {
    setupRocketStatsPageMocks({
      pluginId: "workshop_map_loader",
      installed: true,
      tutorialSeen: false,
    });
    mocked.loadPluginManifest.mockResolvedValue({
      ok: true,
      manifest: {
        schema: "rlpeak_plugins_manifest.v1",
        version: "1.1.0",
        plugins: [
          {
            id: "workshop_map_loader",
            name: "Workshop Map Loader",
            version: "1.1.0",
            summary: "Workshop maps.",
            type: "tools",
            runtime: "builtin.workshop_map_loader.v1",
            status: "stable",
            manifest_path: "/v1/plugins/workshop_map_loader/plugin.json",
          },
        ],
      },
      message: "ok",
    });
    mocked.readPluginsState.mockResolvedValue({
      workshop_map_loader: {
        installed: true,
        enabled: false,
        name: "Workshop Map Loader",
        summary: "Workshop maps.",
        version: "1.1.0",
        type: "tools",
        runtime: "builtin.workshop_map_loader.v1",
      },
    });

    render(
      <React.StrictMode>
        <PluginDetailPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText("Workshop maps")).toBeTruthy();
    });
    expect(screen.queryByTestId("rocketstats-borderless-tutorial-modal")).toBeNull();
  });
});
