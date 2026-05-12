import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_WIN_LOSS_OVERLAY_THEME_ID } from "../../modules/plugins/winLossOverlayThemeRegistry";
import { WinLossOverlayPage } from "./WinLossOverlayPage";
import {
  applyRocketStatsStreakTransition,
  createOverlayFallbackState,
  formatRocketStatsSignedValue,
  formatOverlayStreak,
  getRocketStatsStreakDisplay,
  getRocketStatsStreakColor,
  normalizeRocketStatsStreak,
  parseOverlayThemeOverride,
  resolveOverlayTextValue,
  resolveOverlayThemeConfig,
  resolveStreakTone,
  shouldRenderTextElement,
} from "./winLossOverlayPageSelectors";

describe("WinLossOverlayPage", () => {
  it("renders default fallback W/L/streak/status without backend event", () => {
    const markup = renderToStaticMarkup(<WinLossOverlayPage />);
    expect(markup).toContain("overlay-window-root");
    expect(markup).toContain(">0<");
    expect(markup).not.toContain("Waiting for Rocket League");
    expect(markup).toContain("overlay-theme-panel-live");
  });

  it("creates overlay fallback state with waiting status", () => {
    const state = createOverlayFallbackState();
    expect(state.status).toBe("Waiting for Rocket League");
    expect(state.wins).toBe(0);
    expect(state.losses).toBe(0);
    expect(state.streak).toBe("0");
  });

  it("formats empty streak as 0", () => {
    expect(formatOverlayStreak("")).toBe("0");
    expect(formatOverlayStreak("  ")).toBe("0");
    expect(formatOverlayStreak("2W")).toBe("2W");
  });

  it("formats RocketStats signed values with plus/zero/minus behavior", () => {
    expect(formatRocketStatsSignedValue(2)).toBe("+2");
    expect(formatRocketStatsSignedValue(0)).toBe("0");
    expect(formatRocketStatsSignedValue(-2)).toBe("-2");
    expect(formatRocketStatsSignedValue(-0)).toBe("0");
  });

  it("formats RocketStats streak display using signed rules", () => {
    expect(getRocketStatsStreakDisplay("2W")).toBe("+2");
    expect(getRocketStatsStreakDisplay("1L")).toBe("-1");
    expect(getRocketStatsStreakDisplay("0")).toBe("0");
  });

  it("normalizes RocketStats streak strings to signed numeric values", () => {
    expect(normalizeRocketStatsStreak("2W")).toBe(2);
    expect(normalizeRocketStatsStreak("1L")).toBe(-1);
    expect(normalizeRocketStatsStreak("+3")).toBe(3);
    expect(normalizeRocketStatsStreak("-4")).toBe(-4);
    expect(normalizeRocketStatsStreak("0")).toBe(0);
  });

  it("maps RocketStats streak colors from signed values", () => {
    expect(getRocketStatsStreakColor(2)).toBe("rgb(30, 224, 24)");
    expect(getRocketStatsStreakColor(0)).toBe("rgb(30, 224, 24)");
    expect(getRocketStatsStreakColor(-1)).toBe("rgb(224, 24, 24)");
  });

  it("applies RocketStats streak transition rules for wins", () => {
    expect(applyRocketStatsStreakTransition(0, true)).toBe(1);
    expect(applyRocketStatsStreakTransition(1, true)).toBe(2);
    expect(applyRocketStatsStreakTransition(-2, true)).toBe(1);
  });

  it("applies RocketStats streak transition rules for losses", () => {
    expect(applyRocketStatsStreakTransition(0, false)).toBe(-1);
    expect(applyRocketStatsStreakTransition(-1, false)).toBe(-2);
    expect(applyRocketStatsStreakTransition(3, false)).toBe(-1);
  });

  it("resolves streak tone correctly", () => {
    expect(resolveStreakTone("3W")).toBe("positive");
    expect(resolveStreakTone("2L")).toBe("negative");
    expect(resolveStreakTone("0")).toBe("neutral");
  });

  it("falls back to default theme when theme id is unknown", () => {
    const fallbackTheme = resolveOverlayThemeConfig("unknown_theme", undefined);
    expect(fallbackTheme.id).toBe(DEFAULT_WIN_LOSS_OVERLAY_THEME_ID);
  });

  it("parses legacy overlay theme payload into palette override", () => {
    const override = parseOverlayThemeOverride({
      background: "rgba(17, 17, 17, 0.86)",
      border: "rgba(48, 105, 176, 0.65)",
      text: "#FFFFFF",
      muted: "#7AA0C4",
      accent: "#3069B0",
    });
    const merged = resolveOverlayThemeConfig(DEFAULT_WIN_LOSS_OVERLAY_THEME_ID, override);
    expect(merged.palette.panelBackground).toBe("rgba(17, 17, 17, 0.86)");
    expect(merged.palette.panelBorder).toBe("rgba(48, 105, 176, 0.65)");
    expect(merged.palette.textPrimary).toBe("#FFFFFF");
    expect(merged.palette.textSecondary).toBe("#7AA0C4");
  });

  it("maps runtime wins/losses/streak values to themed text fields", () => {
    const settings = {
      theme_id: "rocketstats_circle",
      x: 40,
      y: 40,
      scale: 0.56,
      opacity: 0.92,
      show_status: true,
    };
    const state = {
      ...createOverlayFallbackState(),
      wins: 4,
      losses: 1,
      streak: "3W",
      status: "In Match" as const,
      mmr_status: "ready" as const,
    };

    expect(resolveOverlayTextValue({
      type: "text",
      id: "wins",
      x: 0,
      y: 0,
      fontSize: 12,
    }, state, settings)).toBe("4");
    expect(resolveOverlayTextValue({
      type: "text",
      id: "losses",
      x: 0,
      y: 0,
      fontSize: 12,
    }, state, settings)).toBe("1");
    expect(resolveOverlayTextValue({
      type: "text",
      id: "streak",
      x: 0,
      y: 0,
      fontSize: 12,
    }, state, settings)).toBe("3W");
    expect(resolveOverlayTextValue({
      type: "text",
      id: "mmr",
      x: 0,
      y: 0,
      fontSize: 12,
    }, state, settings)).toBe("0");
  });

  it("always renders MMR element and toggles status visibility based on settings", () => {
    const hiddenStatusSettings = {
      theme_id: "rocketstats_circle",
      x: 40,
      y: 40,
      scale: 0.56,
      opacity: 0.92,
      show_status: false,
    };
    const visibleStatusSettings = {
      ...hiddenStatusSettings,
      show_status: true,
    };

    expect(shouldRenderTextElement({
      type: "text",
      id: "mmr",
      x: 0,
      y: 0,
      fontSize: 12,
    }, hiddenStatusSettings)).toBe(true);
    expect(shouldRenderTextElement({
      type: "text",
      id: "status",
      x: 0,
      y: 0,
      fontSize: 12,
    }, hiddenStatusSettings)).toBe(false);

    expect(shouldRenderTextElement({
      type: "text",
      id: "mmr",
      x: 0,
      y: 0,
      fontSize: 12,
    }, visibleStatusSettings)).toBe(true);
    expect(shouldRenderTextElement({
      type: "text",
      id: "status",
      x: 0,
      y: 0,
      fontSize: 12,
    }, visibleStatusSettings)).toBe(true);
  });
});
