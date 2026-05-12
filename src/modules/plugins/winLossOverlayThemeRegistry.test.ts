import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIN_LOSS_OVERLAY_THEME_ID,
  getWinLossOverlayTheme,
  listWinLossOverlayThemes,
  parseWinLossOverlayThemeOverride,
} from "./winLossOverlayThemeRegistry";

describe("winLossOverlayThemeRegistry", () => {
  it("returns circle, jstkiss, native, and minimalist themes in the registry list", () => {
    const themes = listWinLossOverlayThemes();
    expect(themes.some((theme) => theme.id === "rocketstats_circle")).toBe(true);
    expect(themes.some((theme) => theme.id === "rocketstats_jstkiss")).toBe(true);
    expect(themes.some((theme) => theme.id === "rocketstats_native")).toBe(true);
    expect(themes.some((theme) => theme.id === "minimalist")).toBe(true);
  });

  it("falls back to default theme for unknown ids", () => {
    const theme = getWinLossOverlayTheme("unknown_theme");
    expect(theme.id).toBe(DEFAULT_WIN_LOSS_OVERLAY_THEME_ID);
  });

  it("uses the converted RocketStats Circle background image asset", () => {
    const theme = getWinLossOverlayTheme("rocketstats_circle");
    const panelElement = theme.elements.find(
      (element) => element.type === "image" && element.id === "panel_bg",
    );
    expect(panelElement).toBeDefined();
    expect(panelElement?.type).toBe("image");
    if (!panelElement || panelElement.type !== "image") {
      return;
    }
    expect(panelElement.src).toBe("/overlay-themes/rocketstats-circle/background.png");
    expect(panelElement.width).toBeUndefined();
    expect(panelElement.height).toBeUndefined();
    expect(panelElement.scale).toBe(1.5);
    expect(panelElement.x).toBe(0);
    expect(panelElement.y).toBe(0);
    expect(theme.baseWidth).toBe(400);
    expect(theme.baseHeight).toBe(300);
    expect(theme.baseFontSize).toBe(42);
    expect(theme.baseScale).toBe(1.25);
    expect(theme.fontFamily).toContain("RocketStats Azonix");
  });

  it("maps Circle text elements using the official config coordinates and scales", () => {
    const theme = getWinLossOverlayTheme("rocketstats_circle");
    const byId = new Map(
      theme.elements
        .filter((element) => element.type === "text")
        .map((element) => [element.id, element]),
    );

    const mmr = byId.get("mmr");
    const streak = byId.get("streak");
    const wins = byId.get("wins");
    const losses = byId.get("losses");

    expect(mmr).toMatchObject({
      x: 254,
      y: 75,
      align: "right",
      verticalAlign: "middle",
      scale: 0.32,
    });
    expect(streak).toMatchObject({
      x: 243,
      y: 111,
      align: "right",
      verticalAlign: "middle",
      scale: 0.35,
    });
    expect(wins).toMatchObject({
      x: 243,
      y: 141,
      align: "right",
      verticalAlign: "middle",
      scale: 0.28,
    });
    expect(losses).toMatchObject({
      x: 243,
      y: 167,
      align: "right",
      verticalAlign: "middle",
      scale: 0.28,
    });
  });

  it("maps JSTKISS with fixed background/font and wins-losses-streak only", () => {
    const theme = getWinLossOverlayTheme("rocketstats_jstkiss");
    const panelElement = theme.elements.find(
      (element) => element.type === "image" && element.id === "panel_bg",
    );
    expect(panelElement).toBeDefined();
    expect(panelElement?.type).toBe("image");
    if (!panelElement || panelElement.type !== "image") {
      return;
    }

    expect(theme.name).toBe("RocketStats JSTKISS");
    expect(theme.baseWidth).toBe(400);
    expect(theme.baseHeight).toBe(300);
    expect(theme.baseScale).toBe(1);
    expect(theme.shadowOffset).toBe(0);
    expect(theme.fontFamily).toContain("RocketStats MADE Tommy");
    expect(theme.fontFamily).toContain("MADE Tommy");
    expect(theme.fontFamily).toContain("Arial");
    expect(panelElement.src).toBe("/overlay-themes/rocketstats-JSTKISS/background.png");
    expect(panelElement.scale).toBe(1);
    expect(panelElement.x).toBe(0);
    expect(panelElement.y).toBe(0);

    const textElements = theme.elements.filter((element) => element.type === "text");
    expect(textElements.map((element) => element.id)).toEqual(["wins", "losses", "streak"]);
    expect(textElements.some((element) => element.id === "mmr")).toBe(false);

    const byId = new Map(textElements.map((element) => [element.id, element]));
    expect(byId.get("wins")).toMatchObject({
      x: 110,
      y: 35,
      fontSize: 34,
      color: "rgb(255, 255, 255)",
    });
    expect(byId.get("losses")).toMatchObject({
      x: 120,
      y: 130,
      fontSize: 30,
      color: "rgb(255, 255, 255)",
    });
    expect(byId.get("streak")).toMatchObject({
      x: 150,
      y: 220,
      fontSize: 37,
      color: "rgb(255, 255, 255)",
      positiveColor: "rgb(255, 255, 255)",
      negativeColor: "rgb(255, 255, 255)",
      neutralColor: "rgb(255, 255, 255)",
    });
  });

  it("maps NativeTheme with fixed dimensions, font, and mmr-streak-wins-losses rows", () => {
    const theme = getWinLossOverlayTheme("rocketstats_native");
    const panelElement = theme.elements.find(
      (element) => element.type === "image" && element.id === "panel_bg",
    );
    expect(panelElement).toBeDefined();
    expect(panelElement?.type).toBe("image");
    if (!panelElement || panelElement.type !== "image") {
      return;
    }

    expect(theme.name).toBe("RocketStats NativeTheme");
    expect(theme.baseWidth).toBe(264);
    expect(theme.baseHeight).toBe(275);
    expect(theme.baseScale).toBe(1);
    expect(theme.fontFamily).toContain("RocketStats NativeTheme");
    expect(theme.fontFamily).toContain("Arial");
    expect(panelElement.src).toBe("/overlay-themes/rocketstats-NativeTheme/background.png");
    expect(panelElement.scale).toBe(1);
    expect(panelElement.x).toBe(0);
    expect(panelElement.y).toBe(0);

    const byId = new Map(
      theme.elements
        .filter((element) => element.type === "text")
        .map((element) => [element.id, element]),
    );

    expect(byId.get("mmr")).toMatchObject({
      x: 180,
      y: 18,
      fontSize: 34,
      color: "rgb(90, 64, 5)",
    });
    expect(byId.get("streak")).toMatchObject({
      x: 160,
      y: 90,
      fontSize: 30,
      color: "rgb(2, 66, 90)",
      positiveColor: "rgb(2, 66, 90)",
      negativeColor: "rgb(2, 66, 90)",
      neutralColor: "rgb(2, 66, 90)",
    });
    expect(byId.get("wins")).toMatchObject({
      x: 180,
      y: 155,
      fontSize: 30,
      color: "rgb(255, 255, 255)",
    });
    expect(byId.get("losses")).toMatchObject({
      x: 180,
      y: 225,
      fontSize: 30,
      color: "rgb(255, 255, 255)",
    });
  });

  it("maps Minimalist with fixed dimensions, font, and mmr-streak-wins-losses rows", () => {
    const theme = getWinLossOverlayTheme("minimalist");
    const panelElement = theme.elements.find(
      (element) => element.type === "image" && element.id === "panel_bg",
    );
    expect(panelElement).toBeDefined();
    expect(panelElement?.type).toBe("image");
    if (!panelElement || panelElement.type !== "image") {
      return;
    }

    expect(theme.name).toBe("Minimalist");
    expect(theme.baseWidth).toBe(146);
    expect(theme.baseHeight).toBe(177);
    expect(theme.baseScale).toBe(1);
    expect(theme.fontFamily).toContain("RLPeak Minimalist Minecraft");
    expect(theme.fontFamily).toContain("monospace");
    expect(theme.fontFamily).toContain("sans-serif");
    expect(panelElement.src).toBe("/overlay-themes/minimalist/background.png");
    expect(panelElement.scale).toBe(1);
    expect(panelElement.x).toBe(0);
    expect(panelElement.y).toBe(0);

    const byId = new Map(
      theme.elements
        .filter((element) => element.type === "text")
        .map((element) => [element.id, element]),
    );

    expect(byId.get("mmr")).toMatchObject({
      x: 75,
      y: 9,
      fontSize: 18,
      color: "rgb(200, 200, 1)",
    });
    expect(byId.get("streak")).toMatchObject({
      x: 100,
      y: 35,
      fontSize: 18,
      color: "rgb(1, 113, 167)",
      positiveColor: "rgb(1, 113, 167)",
      negativeColor: "rgb(1, 113, 167)",
      neutralColor: "rgb(1, 113, 167)",
    });
    expect(byId.get("wins")).toMatchObject({
      x: 75,
      y: 61,
      fontSize: 18,
      color: "rgb(1, 204, 1)",
    });
    expect(byId.get("losses")).toMatchObject({
      x: 100,
      y: 85,
      fontSize: 18,
      color: "rgb(118, 1, 1)",
    });
  });

  it("parses legacy palette payload safely", () => {
    const override = parseWinLossOverlayThemeOverride({
      background: "rgba(17, 17, 17, 0.86)",
      border: "rgba(48, 105, 176, 0.65)",
      text: "#FFFFFF",
      muted: "#7AA0C4",
      accent: "#3069B0",
    });

    expect(override.palette?.panelBackground).toBe("rgba(17, 17, 17, 0.86)");
    expect(override.palette?.panelBorder).toBe("rgba(48, 105, 176, 0.65)");
    expect(override.palette?.textPrimary).toBe("#FFFFFF");
    expect(override.palette?.textSecondary).toBe("#7AA0C4");
  });
});
