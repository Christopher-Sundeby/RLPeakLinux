import { describe, expect, it } from "vitest";
import type { PluginDetailFile, PluginManifestEntry } from "../../modules/plugins/types";
import { createDefaultWinLossOverlayState } from "../../modules/plugins/winLossOverlayRuntimeService";
import {
  formatMmrFailureReasonLabel,
  getPluginBannerUrl,
  getPluginIconUrl,
  getPluginScreenshotUrls,
  readPluginRuntimeStatus,
  resolvePluginPresentation,
  resolveMmrFailureReasonLabel,
  sanitizeExternalLinkUrl,
  pluginSupportsEnableDisable,
  WORKSHOP_RUNTIME_ID,
  WIN_LOSS_RUNTIME_ID,
} from "./pluginUiShared";

const manifestEntry: PluginManifestEntry = {
  id: "win_loss_overlay",
  name: "Win/Loss Overlay",
  version: "1.0.0",
  summary: "Summary",
  type: "overlay",
  runtime: WIN_LOSS_RUNTIME_ID,
  status: "active",
  manifest_path: "plugins/win_loss_overlay/plugin.json",
};

const pluginDetail: PluginDetailFile = {
  schema: "rlpeak_plugin.v1",
  id: "win_loss_overlay",
  name: "RocketStats",
  version: "1.0.0",
  type: "overlay",
  runtime: WIN_LOSS_RUNTIME_ID,
  description: "Description",
  title: "RocketStats",
  short_description: "RocketStats short description.",
  permissions: ["overlay_window"],
  default_config: {},
  screenshots: [
    {
      remote_path: "Plugins/win_loss_overlay/screenshots/circle.png",
      caption: "Circle",
    },
  ],
  external_links: [
    {
      label: "Original RocketStats source",
      url: "https://github.com/Lyliya/RocketStats",
    },
  ],
  files: [
    {
      filename: "icon.png",
      remote_path: "Plugins/win_loss_overlay/icon.png",
    },
    {
      filename: "banner.png",
      remote_path: "Plugins/win_loss_overlay/banner.png",
    },
  ],
};

describe("pluginUiShared", () => {
  it("resolves runtime pills for running and error states", () => {
    const running = readPluginRuntimeStatus({
      manifestEntry,
      runtimeState: {
        ...createDefaultWinLossOverlayState(),
        status: "Connected",
      },
    });
    expect(running.label).toBe("Connected");
    expect(running.className).toContain("is-running");

    const error = readPluginRuntimeStatus({
      manifestEntry,
      runtimeState: {
        ...createDefaultWinLossOverlayState(),
        status: "Error",
      },
    });
    expect(error.label).toBe("Error");
    expect(error.className).toContain("is-error");
  });

  it("renders workshop runtime pill as ready when plugin is enabled", () => {
    const workshopManifest: PluginManifestEntry = {
      ...manifestEntry,
      id: "workshop_map_loader",
      runtime: WORKSHOP_RUNTIME_ID,
    };
    const ready = readPluginRuntimeStatus({
      manifestEntry: workshopManifest,
      runtimeState: undefined,
      isInstalled: true,
    });
    expect(ready.label).toBe("Ready");
    expect(ready.className).toContain("is-running");
  });

  it("determines enable/disable support from plugin type/runtime capability shape", () => {
    const workshopManifest: PluginManifestEntry = {
      ...manifestEntry,
      id: "workshop_map_loader",
      type: "tools",
      runtime: WORKSHOP_RUNTIME_ID,
    };
    expect(pluginSupportsEnableDisable({
      manifestEntry: workshopManifest,
      detail: null,
    })).toBe(false);

    expect(pluginSupportsEnableDisable({
      manifestEntry,
      detail: pluginDetail,
    })).toBe(true);
  });

  it("resolves icon and banner urls from detail files", () => {
    expect(getPluginIconUrl(pluginDetail)).toBe("https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/icon.png");
    expect(getPluginBannerUrl(pluginDetail)).toBe("https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/banner.png");
  });

  it("resolves screenshot urls from detail fields", () => {
    expect(getPluginScreenshotUrls(pluginDetail)).toEqual([
      "https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/screenshots/circle.png",
    ]);
  });

  it("returns null icon/banner urls for invalid remote paths", () => {
    const invalidDetail: PluginDetailFile = {
      ...pluginDetail,
      files: [
        {
          filename: "icon.png",
          remote_path: "https://malicious.example/icon.png",
        },
      ],
    };

    expect(getPluginIconUrl(invalidDetail)).toBeNull();
    expect(getPluginBannerUrl(invalidDetail)).toBeNull();
  });

  it("returns RocketStats fallback presentation when remote fields are missing", () => {
    const fallbackPresentation = resolvePluginPresentation({
      manifestEntry,
      detail: null,
    });

    expect(fallbackPresentation.title).toBe("RocketStats");
    expect(fallbackPresentation.shortDescription).toContain("re-integrated into RLPeak");
    expect(fallbackPresentation.longDescriptionMarkdown).toContain("### Features");
    expect(fallbackPresentation.externalLinks[0]?.url).toBe("https://github.com/Lyliya/RocketStats");
  });

  it("sanitizes plugin external links", () => {
    expect(sanitizeExternalLinkUrl("https://github.com/Lyliya/RocketStats")).toBe(
      "https://github.com/Lyliya/RocketStats",
    );
    expect(sanitizeExternalLinkUrl("javascript:alert(1)")).toBeNull();
  });

  it("formats MMR failure reasons for plugin detail display", () => {
    expect(formatMmrFailureReasonLabel(null)).toBe("None");
    expect(formatMmrFailureReasonLabel("tracker_blocked")).toBe("Tracker blocked");
    expect(formatMmrFailureReasonLabel("profile_private_or_missing")).toBe("Profile private or missing");
  });

  it("shows failure reason label only when MMR status is failed", () => {
    expect(resolveMmrFailureReasonLabel({
      status: "loading",
      reason: "tracker_blocked",
    })).toBe("None");
    expect(resolveMmrFailureReasonLabel({
      status: "failed",
      reason: "tracker_blocked",
    })).toBe("Tracker blocked");
  });
});
