import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultWinLossOverlayState } from "../../modules/plugins/winLossOverlayRuntimeService";
import type { WinLossOverlayThemeSettings } from "../../modules/plugins/winLossOverlayThemeSettingsService";
import {
  canOpenTutorialLightbox,
  createTutorialLightboxImage,
  buildWorkshopMapAssetUrl,
  ImageLightbox,
  isWorkshopMapActive,
  LIGHTBOX_BACKDROP_Z_INDEX,
  LIGHTBOX_CONTENT_Z_INDEX,
  overlayOpacityPercentToValue,
  overlayOpacityToPercent,
  ROCKETSTATS_BORDERLESS_IMAGE_PATH,
  ROCKETSTATS_BORDERLESS_TUTORIAL_COPY,
  ROCKETSTATS_BORDERLESS_TUTORIAL_MODAL_TITLE,
  ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY,
  RocketStatsBorderlessTutorialModal,
  PluginDetailControlsRegion,
  PluginDetailPresentationRegion,
  PluginDetailTwoColumnLayout,
  PluginLongDescriptionSection,
  resolveLightboxPortalRoot,
  resolvePluginActionTimeoutMs,
  waitForWorkshopLoadProgressModalPaint,
  shouldCloseTutorialLightboxFromBackdropClick,
  shouldCloseTutorialLightboxOnEscape,
  shouldCloseRocketStatsTutorialFromBackdropClick,
  shouldCloseRocketStatsTutorialOnEscape,
  shouldCloseWorkshopLoadTutorialFromBackdropClick,
  shouldCloseWorkshopLoadTutorialOnEscape,
  shouldAutoOpenRocketStatsBorderlessTutorial,
  hasSeenRocketStatsBorderlessTutorial,
  shouldOpenWorkshopPostLoadTutorial,
  shouldShowPluginDetailOverlaySettings,
  shouldShowPluginDetailRuntimeControls,
  WORKSHOP_LOAD_PROGRESS_CACHE_NOTE,
  WORKSHOP_LOAD_PROGRESS_MODAL_MESSAGE,
  WORKSHOP_LOAD_PROGRESS_MODAL_TITLE,
  WORKSHOP_LOAD_TUTORIAL_LONG_RUNNING_MESSAGE,
  WORKSHOP_LOAD_TUTORIAL_MODAL_MESSAGE,
  WORKSHOP_LOAD_TUTORIAL_MODAL_NO_RESTART_MESSAGE,
  WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE,
  WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE,
  WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE,
  WORKSHOP_TUTORIAL_CONDITIONAL_GUIDANCE,
  resolveWorkshopLoadSuccessMessage,
  resolveWorkshopLoadTutorialModalMessage,
  WORKSHOP_FIRST_TIME_SETUP_MODAL_MESSAGE,
  WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE,
  WORKSHOP_FIRST_TIME_SETUP_STILL_RUNNING_MESSAGE,
  WORKSHOP_RESTORE_SUCCESS_MESSAGE,
  WORKSHOP_RESTORE_SUCCESS_CLOSED_MESSAGE,
  WORKSHOP_TUTORIAL_RESTART_IMAGE_PATH,
  WORKSHOP_TUTORIAL_FREEPLAY_IMAGE_PATH,
  WORKSHOP_TUTORIAL_UTOPIA_RETRO_IMAGE_PATH,
  WorkshopFirstTimeSetupModal,
  WorkshopLoadTutorialModal,
  WorkshopMapLoadProgressModal,
  WorkshopTutorialSection,
  WorkshopMapCatalogSection,
  WorkshopTutorialImage,
  WinLossOverlaySettingsSection,
} from "./PluginDetailPage";

vi.mock("react-router-dom", () => ({
  useNavigate: () => () => undefined,
  useParams: () => ({ pluginId: "win_loss_overlay" }),
}));

const BASE_SETTINGS: WinLossOverlayThemeSettings = {
  theme_id: "rocketstats_circle",
  x: 40,
  y: 40,
  scale: 1,
  opacity: 0.92,
  show_status: false,
};

describe("WinLossOverlaySettingsSection", () => {
  it("renders Circle, JSTKISS, NativeTheme, and Minimalist options in theme selector", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlaySettingsSection
        runtimeState={createDefaultWinLossOverlayState()}
        settingsDraft={BASE_SETTINGS}
        availableThemes={[
          { id: "rocketstats_circle", name: "RocketStats Circle" },
          { id: "rocketstats_jstkiss", name: "RocketStats JSTKISS" },
          { id: "rocketstats_native", name: "RocketStats NativeTheme" },
          { id: "minimalist", name: "Minimalist" },
        ]}
        isSaveSettingsBusy={false}
        isResetSettingsBusy={false}
        onThemeChange={() => undefined}
        onScalePercentChange={() => undefined}
        onOpacityChange={() => undefined}
        onXChange={() => undefined}
        onYChange={() => undefined}
        onSave={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(markup).toContain(">RocketStats Circle<");
    expect(markup).toContain(">RocketStats JSTKISS<");
    expect(markup).toContain(">RocketStats NativeTheme<");
    expect(markup).toContain(">Minimalist<");
  });

  it("renders user-facing overlay settings fields and actions", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlaySettingsSection
        runtimeState={createDefaultWinLossOverlayState()}
        settingsDraft={BASE_SETTINGS}
        availableThemes={[{ id: "rocketstats_circle", name: "RocketStats Circle" }]}
        isSaveSettingsBusy={false}
        isResetSettingsBusy={false}
        onThemeChange={() => undefined}
        onScalePercentChange={() => undefined}
        onOpacityChange={() => undefined}
        onXChange={() => undefined}
        onYChange={() => undefined}
        onSave={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(markup).toContain(">Theme<");
    expect(markup).toContain(">Scale<");
    expect(markup).toContain(">Opacity<");
    expect(markup).toContain(">X position<");
    expect(markup).toContain(">Y position<");
    expect(markup).toContain(">Theme preview<");
    expect(markup).toContain(">Save overlay settings<");
    expect(markup).toContain(">Reset overlay settings<");
  });

  it("does not render MMR debug fields in normal overlay settings UI", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlaySettingsSection
        runtimeState={createDefaultWinLossOverlayState()}
        settingsDraft={BASE_SETTINGS}
        availableThemes={[{ id: "rocketstats_circle", name: "RocketStats Circle" }]}
        isSaveSettingsBusy={false}
        isResetSettingsBusy={false}
        onThemeChange={() => undefined}
        onScalePercentChange={() => undefined}
        onOpacityChange={() => undefined}
        onXChange={() => undefined}
        onYChange={() => undefined}
        onSave={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(markup).not.toContain("MMR status");
    expect(markup).not.toContain("MMR delta");
    expect(markup).not.toContain("MMR failure reason");
    expect(markup).not.toContain("MMR HTTP client");
    expect(markup).not.toContain("Tracker MMR status");
    expect(markup).not.toContain("Tracker MMR delta");
    expect(markup).not.toContain("Tracker MMR failure reason");
    expect(markup).not.toContain("Tracker MMR HTTP client");
  });

  it("shows 100 percent scale for scale=1", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlaySettingsSection
        runtimeState={createDefaultWinLossOverlayState()}
        settingsDraft={BASE_SETTINGS}
        availableThemes={[{ id: "rocketstats_circle", name: "RocketStats Circle" }]}
        isSaveSettingsBusy={false}
        isResetSettingsBusy={false}
        onThemeChange={() => undefined}
        onScalePercentChange={() => undefined}
        onOpacityChange={() => undefined}
        onXChange={() => undefined}
        onYChange={() => undefined}
        onSave={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(markup).toContain('id="plugin-detail-scale"');
    expect(markup).toContain('value="100"');
    expect(markup).toContain(">100%<");
  });

  it("renders X and Y sliders and keeps slider/input values synchronized from draft state", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlaySettingsSection
        runtimeState={createDefaultWinLossOverlayState()}
        settingsDraft={{
          ...BASE_SETTINGS,
          x: 1230,
          y: 770,
        }}
        availableThemes={[{ id: "rocketstats_circle", name: "RocketStats Circle" }]}
        isSaveSettingsBusy={false}
        isResetSettingsBusy={false}
        onThemeChange={() => undefined}
        onScalePercentChange={() => undefined}
        onOpacityChange={() => undefined}
        onXChange={() => undefined}
        onYChange={() => undefined}
        onSave={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(markup).toContain('id="plugin-detail-x-slider"');
    expect(markup).toContain('id="plugin-detail-y-slider"');
    expect(markup).toContain('id="plugin-detail-x"');
    expect(markup).toContain('id="plugin-detail-y"');
    expect(markup).toContain('id="plugin-detail-x-slider" class="plugins-overlay-input plugins-overlay-range" type="range" min="0" max="3840" step="10" value="1230"');
    expect(markup).toContain('id="plugin-detail-x" class="plugins-overlay-input" type="number" min="0" max="3840" step="1" value="1230"');
    expect(markup).toContain('id="plugin-detail-y-slider" class="plugins-overlay-input plugins-overlay-range" type="range" min="0" max="2160" step="10" value="770"');
    expect(markup).toContain('id="plugin-detail-y" class="plugins-overlay-input" type="number" min="0" max="2160" step="1" value="770"');
  });

  it("renders opacity slider and synchronized opacity value", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlaySettingsSection
        runtimeState={createDefaultWinLossOverlayState()}
        settingsDraft={BASE_SETTINGS}
        availableThemes={[{ id: "rocketstats_circle", name: "RocketStats Circle" }]}
        isSaveSettingsBusy={false}
        isResetSettingsBusy={false}
        onThemeChange={() => undefined}
        onScalePercentChange={() => undefined}
        onOpacityChange={() => undefined}
        onXChange={() => undefined}
        onYChange={() => undefined}
        onSave={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(markup).toContain('id="plugin-detail-opacity-slider"');
    expect(markup).toContain('min="30" max="100" step="5" value="92"');
    expect(markup).toContain(">92%<");
    expect(markup).toContain('id="plugin-detail-opacity" class="plugins-overlay-input" type="number" min="0.3" max="1" step="0.01" value="0.92"');
  });

  it("maps opacity percent to numeric opacity and back", () => {
    expect(overlayOpacityPercentToValue(30)).toBe(0.3);
    expect(overlayOpacityPercentToValue(100)).toBe(1);
    expect(overlayOpacityPercentToValue(92)).toBe(0.92);
    expect(overlayOpacityToPercent(0.3)).toBe(30);
    expect(overlayOpacityToPercent(0.92)).toBe(92);
    expect(overlayOpacityToPercent(1)).toBe(100);
  });
});

describe("PluginDetailPage helpers", () => {
  it("shows runtime controls only when installed", () => {
    expect(shouldShowPluginDetailRuntimeControls(true)).toBe(true);
    expect(shouldShowPluginDetailRuntimeControls(false)).toBe(false);
  });

  it("shows overlay settings only when installed and runtime supports it", () => {
    expect(shouldShowPluginDetailOverlaySettings(false, true)).toBe(false);
    expect(shouldShowPluginDetailOverlaySettings(true, false)).toBe(false);
    expect(shouldShowPluginDetailOverlaySettings(true, true)).toBe(true);
  });

  it("renders markdown safely without injecting script tags", () => {
    const markup = renderToStaticMarkup(
      <PluginLongDescriptionSection
        markdown={"### Features\n\n- Safe link [RocketStats](https://github.com/Lyliya/RocketStats)\n\n<script>alert(1)</script>"}
        onOpenExternalLink={() => undefined}
      />,
    );

    expect(markup).toContain("Features");
    expect(markup).toContain("plugin-detail-inline-link");
    expect(markup).not.toContain("<script>");
  });

  it("uses no timeout for workshop map load action while keeping default timeout for other actions", () => {
    expect(resolvePluginActionTimeoutMs("loadWorkshopMap")).toBeNull();
    expect(resolvePluginActionTimeoutMs("enable")).toBeUndefined();
  });

  it("opens post-load tutorial only after successful workshop load", () => {
    expect(shouldOpenWorkshopPostLoadTutorial(true)).toBe(true);
    expect(shouldOpenWorkshopPostLoadTutorial(false)).toBe(false);
  });

  it("auto-opens RocketStats borderless tutorial only for installed RocketStats when not seen", () => {
    expect(shouldAutoOpenRocketStatsBorderlessTutorial({
      isInstalled: true,
      isWinLossRuntime: true,
      hasSeenTutorial: false,
    })).toBe(true);
    expect(shouldAutoOpenRocketStatsBorderlessTutorial({
      isInstalled: false,
      isWinLossRuntime: true,
      hasSeenTutorial: false,
    })).toBe(false);
    expect(shouldAutoOpenRocketStatsBorderlessTutorial({
      isInstalled: true,
      isWinLossRuntime: false,
      hasSeenTutorial: false,
    })).toBe(false);
    expect(shouldAutoOpenRocketStatsBorderlessTutorial({
      isInstalled: true,
      isWinLossRuntime: true,
      hasSeenTutorial: true,
    })).toBe(false);
  });

  it("reads RocketStats borderless tutorial seen flag from plugin state", () => {
    expect(hasSeenRocketStatsBorderlessTutorial(undefined)).toBe(false);
    expect(hasSeenRocketStatsBorderlessTutorial({
      tutorials: {
        [ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY]: false,
      },
    })).toBe(false);
    expect(hasSeenRocketStatsBorderlessTutorial({
      tutorials: {
        [ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY]: true,
      },
    })).toBe(true);
  });

});

describe("PluginDetail layout", () => {
  it("uses workshop post-load success guidance messages for restart-required and no-restart paths", () => {
    expect(WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE).toContain("First-time setup complete");
    expect(WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE).toContain("Start Rocket League");
    expect(WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE).toContain("Free Play");
    expect(WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE).toContain("Utopia Retro");
    expect(WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE).toContain("Map switched successfully");
    expect(WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE).toContain("No game restart needed");
    expect(WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE).toContain("Leave the current map");
    expect(WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE).toContain("Utopia Retro again");

    expect(resolveWorkshopLoadSuccessMessage(true)).toBe(WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE);
    expect(resolveWorkshopLoadSuccessMessage(false)).toBe(WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE);

    expect(WORKSHOP_RESTORE_SUCCESS_MESSAGE).toContain("Workshop map removed");
    expect(WORKSHOP_RESTORE_SUCCESS_MESSAGE).toContain("Restart Rocket League");
    expect(WORKSHOP_RESTORE_SUCCESS_CLOSED_MESSAGE).toContain("next time Rocket League starts");
  });

  it("renders workshop tutorial block in left column content with conditional guidance text", () => {
    const markup = renderToStaticMarkup(
      <WorkshopTutorialSection />,
    );

    expect(markup).toContain(">Tutorial<");
    expect(markup).toContain(WORKSHOP_TUTORIAL_CONDITIONAL_GUIDANCE);
    expect(markup).toContain("Use Remove loaded map to bring back the normal Utopia Retro map");
    expect(markup).toContain("Click to enlarge");
    expect(markup).toContain(`src="${WORKSHOP_TUTORIAL_FREEPLAY_IMAGE_PATH}"`);
    expect(markup).toContain(`src="${WORKSHOP_TUTORIAL_UTOPIA_RETRO_IMAGE_PATH}"`);
  });

  it("renders tutorial image placeholder safely when image path is missing", () => {
    const markup = renderToStaticMarkup(
      <WorkshopTutorialImage
        imagePath=""
        alt="missing tutorial slot"
        caption="Missing asset test"
        lightboxCaption="Missing slot"
        onOpenLightbox={() => undefined}
      />,
    );

    expect(markup).toContain("Tutorial screenshot slot");
    expect(markup).toContain("Missing asset test");
    expect(markup).not.toContain("<img");
  });

  it("renders post-load workshop tutorial modal with 3 horizontal steps and expected image paths", () => {
    const markup = renderToStaticMarkup(
      <WorkshopLoadTutorialModal
        isOpen
        restartRequired
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain(WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE);
    expect(markup).toContain(WORKSHOP_LOAD_TUTORIAL_MODAL_MESSAGE);
    expect(markup).toContain('class="workshop-load-tutorial-steps"');
    expect(markup).toContain("Step 1");
    expect(markup).toContain("Step 2");
    expect(markup).toContain("Step 3");
    expect(markup).toContain('src="/plugin-assets/workshop_map_loader/tutorial_restart.png"');
    expect(markup).toContain('src="/plugin-assets/workshop_map_loader/tutorial_freeplay.png"');
    expect(markup).toContain('src="/plugin-assets/workshop_map_loader/tutorial_utopia_retro.png"');
    expect(markup).toContain("Click to enlarge");
    expect(markup).toContain(">Got it<");
  });

  it("renders no-restart tutorial modal copy and removes restart step wording when restart is not required", () => {
    const markup = renderToStaticMarkup(
      <WorkshopLoadTutorialModal
        isOpen
        restartRequired={false}
        onClose={() => undefined}
      />,
    );

    expect(resolveWorkshopLoadTutorialModalMessage(true)).toBe(WORKSHOP_LOAD_TUTORIAL_MODAL_MESSAGE);
    expect(resolveWorkshopLoadTutorialModalMessage(false)).toBe(WORKSHOP_LOAD_TUTORIAL_MODAL_NO_RESTART_MESSAGE);
    expect(markup).toContain(WORKSHOP_LOAD_TUTORIAL_MODAL_NO_RESTART_MESSAGE);
    expect(markup).toContain(">Leave current map<");
    expect(markup).toContain("No game restart needed");
    expect(markup).not.toContain(">Restart Rocket League<");
  });

  it("renders RocketStats borderless tutorial modal with expected copy, steps, and image path", () => {
    const markup = renderToStaticMarkup(
      <RocketStatsBorderlessTutorialModal
        isOpen
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain(ROCKETSTATS_BORDERLESS_TUTORIAL_MODAL_TITLE);
    expect(markup).toContain(ROCKETSTATS_BORDERLESS_TUTORIAL_COPY);
    expect(markup).toContain("Open Rocket League Settings");
    expect(markup).toContain("Go to Video");
    expect(markup).toContain("Display Mode to Borderless");
    expect(markup).toContain("Click to enlarge");
    expect(markup).toContain(`src="${ROCKETSTATS_BORDERLESS_IMAGE_PATH}"`);
    expect(markup).toContain(">Got it<");
  });

  it("renders safe placeholder for RocketStats borderless tutorial when image is missing", () => {
    const markup = renderToStaticMarkup(
      <RocketStatsBorderlessTutorialModal
        isOpen
        imagePath=""
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain("Tutorial screenshot slot");
    expect(markup).not.toContain("<img");
  });

  it("renders workshop load progress modal with map name, spinner, and step list", () => {
    const markup = renderToStaticMarkup(
      <WorkshopMapLoadProgressModal
        isOpen
        mapName="Fractals Corridor"
      />,
    );

    expect(markup).toContain(WORKSHOP_LOAD_PROGRESS_MODAL_TITLE);
    expect(markup).toContain("Fractals Corridor");
    expect(markup).toContain(WORKSHOP_LOAD_PROGRESS_MODAL_MESSAGE);
    expect(markup).toContain(WORKSHOP_LOAD_TUTORIAL_LONG_RUNNING_MESSAGE);
    expect(markup).toContain("workshop-load-progress-spinner");
    expect(markup).toContain("Checking Rocket League path");
    expect(markup).toContain("Preparing cache");
    expect(markup).toContain("Downloading map");
    expect(markup).toContain("Installing into Rocket League mods folder");
    expect(markup).toContain("Finalizing");
    expect(markup).toContain(WORKSHOP_LOAD_PROGRESS_CACHE_NOTE);
    expect(markup).toContain("Please wait...");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('data-testid="workshop-load-progress-modal"');
  });

  it("does not render workshop load progress modal when closed", () => {
    const markup = renderToStaticMarkup(
      <WorkshopMapLoadProgressModal
        isOpen={false}
        mapName="Fractals Corridor"
      />,
    );

    expect(markup).toBe("");
  });

  it("renders workshop load progress modal as non-dismissible during active load", () => {
    const markup = renderToStaticMarkup(
      <WorkshopMapLoadProgressModal
        isOpen
        mapName="Fractals Corridor"
      />,
    );

    expect(markup).not.toContain("Close workshop");
    expect(markup).not.toContain(">Got it<");
    expect(markup).not.toContain("plugin-image-lightbox-close");
  });

  it("renders workshop load progress modal with high z-index overlay class", () => {
    const markup = renderToStaticMarkup(
      <WorkshopMapLoadProgressModal
        isOpen
        mapName="Fractals Corridor"
      />,
    );

    expect(markup).toContain('class="workshop-load-progress-backdrop"');
    expect(markup).toContain('class="workshop-load-progress-modal"');
  });

  it("renders first-time workshop setup modal with explicit retry and cancel actions", () => {
    const markup = renderToStaticMarkup(
      <WorkshopFirstTimeSetupModal
        isOpen
        onRetry={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(markup).toContain(WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE);
    expect(markup).toContain(WORKSHOP_FIRST_TIME_SETUP_MODAL_MESSAGE);
    expect(markup).toContain("I closed Rocket League, retry");
    expect(markup).toContain(">Cancel<");
    expect(markup).toContain('data-testid="workshop-first-time-setup-modal"');
  });

  it("renders first-time setup modal running warning when retry check still finds Rocket League running", () => {
    const markup = renderToStaticMarkup(
      <WorkshopFirstTimeSetupModal
        isOpen
        warningMessage={WORKSHOP_FIRST_TIME_SETUP_STILL_RUNNING_MESSAGE}
        onRetry={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(markup).toContain(WORKSHOP_FIRST_TIME_SETUP_STILL_RUNNING_MESSAGE);
    expect(markup).toContain('role="status"');
  });

  it("waits for UI paint before workshop backend load call when requestAnimationFrame is available", async () => {
    const originalWindow = globalThis.window;
    const originalSetTimeout = globalThis.setTimeout;
    let rafCalled = false;
    let timeoutCalled = false;

    const fakeWindow = {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        rafCalled = true;
        callback(0);
        return 1;
      },
    } as unknown as Window & typeof globalThis;

    const fakeSetTimeout = ((handler: TimerHandler) => {
      timeoutCalled = true;
      if (typeof handler === "function") {
        handler();
      }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    Object.defineProperty(globalThis, "window", {
      value: fakeWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "setTimeout", {
      value: fakeSetTimeout,
      configurable: true,
      writable: true,
    });

    try {
      await waitForWorkshopLoadProgressModalPaint();
      expect(rafCalled).toBe(true);
      expect(timeoutCalled).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, "setTimeout", {
        value: originalSetTimeout,
        configurable: true,
        writable: true,
      });
    }
  });

  it("falls back to timeout-based paint wait when requestAnimationFrame is unavailable", async () => {
    const originalWindow = globalThis.window;
    const originalSetTimeout = globalThis.setTimeout;
    let timeoutCalled = false;

    const fakeSetTimeout = ((handler: TimerHandler) => {
      timeoutCalled = true;
      if (typeof handler === "function") {
        handler();
      }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "setTimeout", {
      value: fakeSetTimeout,
      configurable: true,
      writable: true,
    });

    try {
      await waitForWorkshopLoadProgressModalPaint();
      expect(timeoutCalled).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, "setTimeout", {
        value: originalSetTimeout,
        configurable: true,
        writable: true,
      });
    }
  });

  it("renders safe tutorial placeholder when a post-load tutorial image is missing", () => {
    const markup = renderToStaticMarkup(
      <WorkshopLoadTutorialModal
        isOpen
        onClose={() => undefined}
        restartImagePath=""
      />,
    );

    expect(markup).toContain("Tutorial screenshot slot");
  });

  it("maps post-load tutorial close behavior for Escape and backdrop interactions", () => {
    expect(shouldCloseWorkshopLoadTutorialOnEscape("Escape")).toBe(true);
    expect(shouldCloseWorkshopLoadTutorialOnEscape("Enter")).toBe(false);
    expect(shouldCloseWorkshopLoadTutorialFromBackdropClick(true)).toBe(true);
    expect(shouldCloseWorkshopLoadTutorialFromBackdropClick(false)).toBe(false);
  });

  it("allows lightbox open only for successfully loaded tutorial images", () => {
    expect(canOpenTutorialLightbox("/plugin-assets/workshop_map_loader/tutorial_freeplay.png", false)).toBe(true);
    expect(canOpenTutorialLightbox("", false)).toBe(false);
    expect(canOpenTutorialLightbox("/plugin-assets/workshop_map_loader/tutorial_freeplay.png", true)).toBe(false);

    const selectedImage = createTutorialLightboxImage({
      imagePath: "/plugin-assets/workshop_map_loader/tutorial_freeplay.png",
      alt: "Free Play tutorial",
      caption: "Free Play menu",
      hasImageError: false,
    });
    expect(selectedImage).toEqual({
      imagePath: "/plugin-assets/workshop_map_loader/tutorial_freeplay.png",
      alt: "Free Play tutorial",
      caption: "Free Play menu",
    });

    const missingImageSelection = createTutorialLightboxImage({
      imagePath: "",
      alt: "Missing tutorial",
      caption: "Missing",
      hasImageError: false,
    });
    expect(missingImageSelection).toBeNull();
  });

  it("renders tutorial image lightbox modal with image source and caption", () => {
    const markup = renderToStaticMarkup(
      <ImageLightbox
        image={{
          imagePath: "/plugin-assets/workshop_map_loader/tutorial_freeplay.png",
          alt: "Free Play tutorial",
          caption: "Free Play menu",
        }}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('src="/plugin-assets/workshop_map_loader/tutorial_freeplay.png"');
    expect(markup).toContain(">Free Play menu<");
    expect(markup).toContain('aria-label="Close tutorial image"');
  });

  it("renders lightbox with high z-index layering above workshop map content", () => {
    const markup = renderToStaticMarkup(
      <ImageLightbox
        image={{
          imagePath: "/plugin-assets/workshop_map_loader/tutorial_freeplay.png",
          alt: "Free Play tutorial",
          caption: "Free Play menu",
        }}
        onClose={() => undefined}
      />,
    );

    expect(LIGHTBOX_BACKDROP_Z_INDEX).toBeGreaterThan(9999);
    expect(LIGHTBOX_CONTENT_Z_INDEX).toBeGreaterThan(LIGHTBOX_BACKDROP_Z_INDEX);
    expect(markup).toContain(`z-index:${LIGHTBOX_BACKDROP_Z_INDEX}`);
    expect(markup).toContain(`z-index:${LIGHTBOX_CONTENT_Z_INDEX}`);
  });

  it("maps lightbox close behavior for backdrop and Escape interactions", () => {
    expect(shouldCloseTutorialLightboxOnEscape("Escape")).toBe(true);
    expect(shouldCloseTutorialLightboxOnEscape("Enter")).toBe(false);
    expect(shouldCloseTutorialLightboxFromBackdropClick(true)).toBe(true);
    expect(shouldCloseTutorialLightboxFromBackdropClick(false)).toBe(false);
  });

  it("maps RocketStats borderless tutorial close behavior for Escape and backdrop interactions", () => {
    expect(shouldCloseRocketStatsTutorialOnEscape("Escape")).toBe(true);
    expect(shouldCloseRocketStatsTutorialOnEscape("Enter")).toBe(false);
    expect(shouldCloseRocketStatsTutorialFromBackdropClick(true)).toBe(true);
    expect(shouldCloseRocketStatsTutorialFromBackdropClick(false)).toBe(false);
  });

  it("resolves lightbox portal root to app-level document body when available", () => {
    const fakeBody = {} as HTMLElement;
    const fakeDoc = { body: fakeBody };

    expect(resolveLightboxPortalRoot(fakeDoc)).toBe(fakeBody);
    expect(resolveLightboxPortalRoot(undefined)).toBeNull();
    expect(resolveLightboxPortalRoot(null)).toBeNull();
  });

  it("renders tutorial block above description in controls region", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailControlsRegion
        isInstalled
        isWinLossRuntime={false}
        actionCard={<article>Actions panel marker</article>}
        runtimeControlsCard={<article>Runtime controls marker</article>}
        overlaySettingsCard={<article>Overlay settings marker</article>}
        tutorialCard={<article>Tutorial marker</article>}
        descriptionCard={<article>Description marker</article>}
      />,
    );

    const tutorialIndex = markup.indexOf("Tutorial marker");
    const descriptionIndex = markup.indexOf("Description marker");
    expect(tutorialIndex).toBeGreaterThan(-1);
    expect(descriptionIndex).toBeGreaterThan(-1);
    expect(tutorialIndex).toBeLessThan(descriptionIndex);
  });

  it("renders explicit controls/settings and presentation regions in two-column wrapper", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailTwoColumnLayout
        controls={(
          <PluginDetailControlsRegion
            isInstalled
            isWinLossRuntime
            actionCard={<article>Actions panel marker</article>}
            runtimeControlsCard={<article>Runtime controls marker</article>}
            overlaySettingsCard={<article>Overlay settings marker</article>}
            descriptionCard={<article>Description marker</article>}
          />
        )}
        presentation={(
          <PluginDetailPresentationRegion>
            <article>Presentation marker</article>
          </PluginDetailPresentationRegion>
        )}
      />,
    );

    expect(markup).toContain('class="plugin-detail-layout"');
    expect(markup).toContain('class="plugin-detail-controls-region"');
    expect(markup).toContain('class="plugin-detail-presentation-region"');
    expect(markup).toContain("Actions panel marker");
    expect(markup).toContain("Runtime controls marker");
    expect(markup).toContain("Overlay settings marker");
    expect(markup).toContain("Description marker");
    expect(markup).toContain("Presentation marker");
  });

  it("supports rendering RocketStats overlay settings in the right presentation region", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailTwoColumnLayout
        controls={(
          <PluginDetailControlsRegion
            isInstalled
            isWinLossRuntime
            actionCard={<article>Actions panel marker</article>}
            runtimeControlsCard={<article>Runtime controls marker</article>}
            overlaySettingsCard={<article>Overlay settings marker</article>}
            showOverlaySettingsInControls={false}
            descriptionCard={<article>Description marker</article>}
          />
        )}
        presentation={(
          <PluginDetailPresentationRegion>
            <article>Presentation marker</article>
            <article>Overlay settings marker</article>
          </PluginDetailPresentationRegion>
        )}
      />,
    );

    const controlsRegionStart = markup.indexOf('class="plugin-detail-controls-region"');
    const controlsRegionEnd = markup.indexOf("</aside>", controlsRegionStart);
    const controlsRegionMarkup = markup.slice(controlsRegionStart, controlsRegionEnd);
    expect(controlsRegionMarkup).toContain("Runtime controls marker");
    expect(controlsRegionMarkup).toContain("Description marker");
    expect(controlsRegionMarkup).not.toContain("Overlay settings marker");

    const presentationRegionStart = markup.indexOf('class="plugin-detail-presentation-region"');
    const presentationRegionMarkup = markup.slice(presentationRegionStart);
    expect(presentationRegionMarkup).toContain("Presentation marker");
    expect(presentationRegionMarkup).toContain("Overlay settings marker");
  });

  it("hides runtime/settings controls when plugin is not installed and shows install CTA guidance", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailControlsRegion
        isInstalled={false}
        isWinLossRuntime
        actionCard={<article>Actions panel marker</article>}
        runtimeControlsCard={<article>Runtime controls marker</article>}
        overlaySettingsCard={<article>Overlay settings marker</article>}
        descriptionCard={<article>Description marker</article>}
      />,
    );

    expect(markup).toContain("Actions panel marker");
    expect(markup).toContain("Install to configure");
    expect(markup).not.toContain("Runtime controls marker");
    expect(markup).not.toContain("Overlay settings marker");
    expect(markup).toContain("Description marker");
  });

  it("shows runtime/settings controls when plugin is installed", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailControlsRegion
        isInstalled
        isWinLossRuntime
        actionCard={<article>Actions panel marker</article>}
        runtimeControlsCard={<article>Runtime controls marker</article>}
        overlaySettingsCard={<article>Overlay settings marker</article>}
        descriptionCard={<article>Description marker</article>}
      />,
    );

    expect(markup).toContain("Actions panel marker");
    expect(markup).not.toContain("Install to configure");
    expect(markup).toContain("Runtime controls marker");
    expect(markup).toContain("Overlay settings marker");
    expect(markup).toContain("Description marker");
  });

  it("keeps presentation region visible for uninstalled state", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailPresentationRegion>
        <article>Presentation visible when uninstalled</article>
      </PluginDetailPresentationRegion>,
    );

    expect(markup).toContain('class="plugin-detail-presentation-region"');
    expect(markup).toContain("Presentation visible when uninstalled");
  });

  it("renders workshop map cards with banner, author, description and load action", () => {
    const markup = renderToStaticMarkup(
      <WorkshopMapCatalogSection
        maps={[
          {
            id: 7,
            name: "Fractals Corridor",
            memberDisplayName: "fractalrl",
            metadataPath: "maps_files/7/metadata.json",
            bannerPath: "maps_files/7/banner.jpg",
            finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
            shortDescription: "1.5x SCALED UP version of Labs corridor",
          },
        ]}
        searchQuery="fractals"
        totalMapCount={1}
        activeMap={{
          mapId: 7,
          name: "Fractals Corridor",
          author: "fractalrl",
          bannerPath: "maps_files/7/banner.jpg",
          metadataPath: "maps_files/7/metadata.json",
          finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
          shortDescription: "1.5x SCALED UP version of Labs corridor",
          activatedAt: "2026-05-11T10:00:00Z",
        }}
        loadingMapId={null}
        isLoadBusy={false}
        onSearchQueryChange={() => undefined}
        onLoadMap={() => undefined}
      />,
    );

    expect(markup).toContain("workshop-map-card");
    expect(markup).toContain('id="workshop-map-search"');
    expect(markup).toContain("Showing 1 of 1 maps");
    expect(markup).toContain("Fractals Corridor");
    expect(markup).toContain("fractalrl");
    expect(markup).toContain("Labs corridor");
    expect(markup).toContain("Active");
    expect(markup).toContain(">Load<");
  });

  it("shows selected-map loading label and disabled load controls while loading", () => {
    const markup = renderToStaticMarkup(
      <WorkshopMapCatalogSection
        maps={[
          {
            id: 7,
            name: "Fractals Corridor",
            memberDisplayName: "fractalrl",
            metadataPath: "maps_files/7/metadata.json",
            bannerPath: "maps_files/7/banner.jpg",
            finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
            shortDescription: "Map one",
          },
          {
            id: 9,
            name: "Rings",
            memberDisplayName: "OtherAuthor",
            metadataPath: "maps_files/9/metadata.json",
            bannerPath: "maps_files/9/banner.jpg",
            finalFilePath: "maps_files/9/Labs_Utopia_P.upk",
            shortDescription: "Map two",
          },
        ]}
        searchQuery=""
        totalMapCount={2}
        activeMap={null}
        loadingMapId={7}
        isLoadBusy
        onSearchQueryChange={() => undefined}
        onLoadMap={() => undefined}
      />,
    );

    expect(markup).toContain("Downloading and loading...");
    expect(markup).not.toContain(WORKSHOP_LOAD_TUTORIAL_LONG_RUNNING_MESSAGE);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
  });

  it("exports workshop tutorial image path constants including restart step", () => {
    expect(WORKSHOP_TUTORIAL_RESTART_IMAGE_PATH).toBe("/plugin-assets/workshop_map_loader/tutorial_restart.png");
    expect(WORKSHOP_TUTORIAL_FREEPLAY_IMAGE_PATH).toBe("/plugin-assets/workshop_map_loader/tutorial_freeplay.png");
    expect(WORKSHOP_TUTORIAL_UTOPIA_RETRO_IMAGE_PATH).toBe("/plugin-assets/workshop_map_loader/tutorial_utopia_retro.png");
  });

  it("renders workshop search in map catalog section, not in left controls region", () => {
    const controlsMarkup = renderToStaticMarkup(
      <PluginDetailControlsRegion
        isInstalled
        isWinLossRuntime={false}
        actionCard={<article>Actions panel marker</article>}
        runtimeControlsCard={<article>Runtime controls marker</article>}
        overlaySettingsCard={<article>Overlay settings marker</article>}
        descriptionCard={<article>Description marker</article>}
      />,
    );

    const catalogMarkup = renderToStaticMarkup(
      <WorkshopMapCatalogSection
        maps={[]}
        searchQuery=""
        totalMapCount={0}
        activeMap={null}
        loadingMapId={null}
        isLoadBusy={false}
        onSearchQueryChange={() => undefined}
        onLoadMap={() => undefined}
      />,
    );

    expect(controlsMarkup).not.toContain('id="workshop-map-search"');
    expect(catalogMarkup).toContain('id="workshop-map-search"');
  });

  it("does not render a Screenshots block in plugin detail component sections", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailTwoColumnLayout
        controls={(
          <PluginDetailControlsRegion
            isInstalled
            isWinLossRuntime={false}
            actionCard={<article>Actions panel marker</article>}
            runtimeControlsCard={<article>Runtime controls marker</article>}
            overlaySettingsCard={<article>Overlay settings marker</article>}
            descriptionCard={<article>Description marker</article>}
          />
        )}
        presentation={(
          <PluginDetailPresentationRegion>
            <WorkshopMapCatalogSection
              maps={[]}
              searchQuery=""
              totalMapCount={0}
              activeMap={null}
              loadingMapId={null}
              isLoadBusy={false}
              onSearchQueryChange={() => undefined}
              onLoadMap={() => undefined}
            />
          </PluginDetailPresentationRegion>
        )}
      />,
    );

    expect(markup).not.toContain(">Screenshots<");
  });

  it("keeps Workshop map catalog/search in the right presentation region", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailTwoColumnLayout
        controls={(
          <PluginDetailControlsRegion
            isInstalled
            isWinLossRuntime={false}
            actionCard={<article>Workshop actions marker</article>}
            runtimeControlsCard={<article>Workshop controls marker</article>}
            overlaySettingsCard={<article>Overlay settings marker</article>}
            descriptionCard={<article>Workshop description marker</article>}
          />
        )}
        presentation={(
          <PluginDetailPresentationRegion>
            <WorkshopMapCatalogSection
              maps={[]}
              searchQuery=""
              totalMapCount={0}
              activeMap={null}
              loadingMapId={null}
              isLoadBusy={false}
              onSearchQueryChange={() => undefined}
              onLoadMap={() => undefined}
            />
          </PluginDetailPresentationRegion>
        )}
      />,
    );

    const controlsRegionStart = markup.indexOf('class="plugin-detail-controls-region"');
    const controlsRegionEnd = markup.indexOf("</aside>", controlsRegionStart);
    const controlsRegionMarkup = markup.slice(controlsRegionStart, controlsRegionEnd);
    expect(controlsRegionMarkup).not.toContain('id="workshop-map-search"');

    const presentationRegionStart = markup.indexOf('class="plugin-detail-presentation-region"');
    const presentationRegionMarkup = markup.slice(presentationRegionStart);
    expect(presentationRegionMarkup).toContain('id="workshop-map-search"');
  });

  it("does not render Workshop tutorial block in non-Workshop controls content by default", () => {
    const markup = renderToStaticMarkup(
      <PluginDetailControlsRegion
        isInstalled
        isWinLossRuntime={false}
        actionCard={<article>Actions panel marker</article>}
        runtimeControlsCard={<article>Runtime controls marker</article>}
        overlaySettingsCard={<article>Overlay settings marker</article>}
        descriptionCard={<article>Description marker</article>}
      />,
    );

    expect(markup).not.toContain(">Tutorial<");
  });

  it("builds safe workshop asset URLs and active map matching", () => {
    expect(buildWorkshopMapAssetUrl("maps_files/7/banner.jpg")).toBe(
      "https://api.rlpeak.com/v1/files/Plugins/workshop_map_loader/maps_files/7/banner.jpg",
    );

    const isActive = isWorkshopMapActive(
      {
        id: 7,
        name: "Fractals Corridor",
        memberDisplayName: "fractalrl",
        metadataPath: "maps_files/7/metadata.json",
        bannerPath: "maps_files/7/banner.jpg",
        finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
        shortDescription: "Map",
      },
      {
        mapId: 7,
        name: "Fractals Corridor",
        author: "fractalrl",
        bannerPath: "maps_files/7/banner.jpg",
        metadataPath: "maps_files/7/metadata.json",
        finalFilePath: "maps_files/7/Labs_Utopia_P.upk",
        shortDescription: "Map",
        activatedAt: "123",
      },
    );
    expect(isActive).toBe(true);
  });
});
