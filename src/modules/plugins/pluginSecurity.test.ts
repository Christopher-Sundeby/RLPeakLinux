import { describe, expect, it } from "vitest";
import {
  buildPluginAssetUrl,
  buildPluginDetailUrl,
  getPluginAssetFileExtension,
  isPluginAssetExtensionAllowed,
  resolvePluginAssetRelativeSegments,
} from "./pluginSecurity";

describe("pluginSecurity", () => {
  it("extracts asset file extensions", () => {
    expect(getPluginAssetFileExtension("icon.png")).toBe(".png");
    expect(getPluginAssetFileExtension("overlay_theme.json")).toBe(".json");
    expect(getPluginAssetFileExtension("no_extension")).toBe("");
  });

  it("allows only approved plugin asset extensions", () => {
    expect(isPluginAssetExtensionAllowed("icon.png")).toBe(true);
    expect(isPluginAssetExtensionAllowed("banner.jpg")).toBe(true);
    expect(isPluginAssetExtensionAllowed("preview.jpeg")).toBe(true);
    expect(isPluginAssetExtensionAllowed("theme.svg")).toBe(true);
    expect(isPluginAssetExtensionAllowed("badge.webp")).toBe(true);
    expect(isPluginAssetExtensionAllowed("overlay_theme.json")).toBe(true);
    expect(isPluginAssetExtensionAllowed("run.exe")).toBe(false);
    expect(isPluginAssetExtensionAllowed("script.js")).toBe(false);
    expect(isPluginAssetExtensionAllowed("unknown.txt")).toBe(false);
  });

  it("builds plugin detail URL only under allowed API host", () => {
    const url = buildPluginDetailUrl("plugins/win_loss_overlay/plugin.json");
    expect(url).toBe("https://api.rlpeak.com/v1/plugins/win_loss_overlay/plugin.json");
    expect(() => buildPluginDetailUrl("https://example.com/plugin.json")).toThrow();
  });

  it("builds plugin asset URL from /v1/files base", () => {
    const url = buildPluginAssetUrl("Plugins/win_loss_overlay/icon.png");
    expect(url).toBe("https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/icon.png");
  });

  it("resolves plugin-relative cache segments from scoped remote path", () => {
    const segments = resolvePluginAssetRelativeSegments(
      "win_loss_overlay",
      "overlay_theme.json",
      "Plugins/win_loss_overlay/overlay_theme.json",
    );
    expect(segments).toEqual(["overlay_theme.json"]);
  });

  it("rejects non-scoped or blocked asset entries", () => {
    expect(() => resolvePluginAssetRelativeSegments(
      "win_loss_overlay",
      "icon.png",
      "Plugins/another_plugin/icon.png",
    )).toThrow();

    expect(() => resolvePluginAssetRelativeSegments(
      "win_loss_overlay",
      "script.js",
      "Plugins/win_loss_overlay/script.js",
    )).toThrow();
  });
});
