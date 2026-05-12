import {
  RLPEAK_MINIMALIST_FONT_FAMILY,
  ROCKETSTATS_AZONIX_FONT_FAMILY,
  ROCKETSTATS_MADE_TOMMY_FONT_FAMILY,
  ROCKETSTATS_NATIVE_FONT_FAMILY,
} from "./rocketStatsFontService";

const ROCKETSTATS_CIRCLE_BACKGROUND_URL = "/overlay-themes/rocketstats-circle/background.png";
const ROCKETSTATS_CIRCLE_BASE_WIDTH = 400;
const ROCKETSTATS_CIRCLE_BASE_HEIGHT = 300;
const ROCKETSTATS_CIRCLE_BACKGROUND_SCALE = 1.5;
const ROCKETSTATS_JSTKISS_BACKGROUND_URL = "/overlay-themes/rocketstats-JSTKISS/background.png";
const ROCKETSTATS_JSTKISS_BASE_WIDTH = 400;
const ROCKETSTATS_JSTKISS_BASE_HEIGHT = 300;
const ROCKETSTATS_NATIVE_BACKGROUND_URL = "/overlay-themes/rocketstats-NativeTheme/background.png";
const ROCKETSTATS_NATIVE_BASE_WIDTH = 264;
const ROCKETSTATS_NATIVE_BASE_HEIGHT = 275;
const MINIMALIST_BACKGROUND_URL = "/overlay-themes/minimalist/background.png";
const MINIMALIST_BASE_WIDTH = 146;
const MINIMALIST_BASE_HEIGHT = 177;

export type WinLossOverlayThemeTextElementId = "mmr" | "streak" | "wins" | "losses" | "status";

export type WinLossOverlayThemeElement =
  | WinLossOverlayThemeTextElement
  | WinLossOverlayThemeImageElement;

export interface WinLossOverlayThemeTextElement {
  type: "text";
  id: WinLossOverlayThemeTextElementId;
  x: number | string;
  y: number | string;
  fontSize?: number;
  scale?: number;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  fontWeight?: number;
  letterSpacing?: number;
  color?: string;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  visible?: boolean;
}

export interface WinLossOverlayThemeImageElement {
  type: "image";
  id: string;
  src: string;
  x: number | string;
  y: number | string;
  scale?: number;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  opacity?: number;
  width?: number;
  height?: number;
  visible?: boolean;
}

export interface WinLossOverlayThemePalette {
  panelBackground: string;
  panelBorder: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  wins: string;
  losses: string;
  streakPositive: string;
  streakNegative: string;
  mmrPositive: string;
  mmrNegative: string;
  mmrNeutral: string;
  status: string;
}

export interface WinLossOverlayThemeConfig {
  id: string;
  name: string;
  configVersion: string;
  baseWidth: number;
  baseHeight: number;
  baseFontSize: number;
  baseScale: number;
  fontFamily: string;
  shadowColor: string;
  shadowOffset: number;
  palette: WinLossOverlayThemePalette;
  elements: WinLossOverlayThemeElement[];
}

export interface WinLossOverlayThemeSummary {
  id: string;
  name: string;
}

export interface WinLossOverlayThemeOverride {
  palette?: Partial<WinLossOverlayThemePalette>;
}

export const DEFAULT_WIN_LOSS_OVERLAY_THEME_ID = "rocketstats_circle";

export const SAFE_WIN_LOSS_OVERLAY_THEME: WinLossOverlayThemeConfig = {
  id: "safe_fallback",
  name: "RLPeak Safe Overlay",
  configVersion: "1",
  baseWidth: 320,
  baseHeight: 140,
  baseFontSize: 16,
  baseScale: 1,
  fontFamily: "\"Segoe UI\", system-ui, sans-serif",
  shadowColor: "rgba(0, 0, 0, 0.9)",
  shadowOffset: 1,
  palette: {
    panelBackground: "rgba(24, 24, 24, 0.92)",
    panelBorder: "rgba(48, 105, 176, 0.58)",
    textPrimary: "#FFFFFF",
    textSecondary: "#7AA0C4",
    accent: "#3069B0",
    wins: "#35B978",
    losses: "#D9534F",
    streakPositive: "#35B978",
    streakNegative: "#D9534F",
    mmrPositive: "#35B978",
    mmrNegative: "#D9534F",
    mmrNeutral: "#7AA0C4",
    status: "#7AA0C4",
  },
  elements: [
    {
      type: "text",
      id: "wins",
      x: 42,
      y: 44,
      fontSize: 27,
      align: "left",
      verticalAlign: "middle",
      fontWeight: 700,
      color: "#35B978",
    },
    {
      type: "text",
      id: "losses",
      x: 120,
      y: 44,
      fontSize: 27,
      align: "left",
      verticalAlign: "middle",
      fontWeight: 700,
      color: "#D9534F",
    },
    {
      type: "text",
      id: "streak",
      x: 222,
      y: 44,
      fontSize: 27,
      align: "left",
      verticalAlign: "middle",
      fontWeight: 700,
      positiveColor: "#35B978",
      negativeColor: "#D9534F",
      neutralColor: "#7AA0C4",
    },
    {
      type: "text",
      id: "status",
      x: 14,
      y: 114,
      fontSize: 12,
      align: "left",
      verticalAlign: "middle",
      color: "#7AA0C4",
    },
  ],
};

const ROCKETSTATS_CIRCLE_THEME: WinLossOverlayThemeConfig = {
  id: "rocketstats_circle",
  name: "RocketStats Circle",
  configVersion: "3",
  baseWidth: ROCKETSTATS_CIRCLE_BASE_WIDTH,
  baseHeight: ROCKETSTATS_CIRCLE_BASE_HEIGHT,
  baseFontSize: 42,
  baseScale: 1.25,
  fontFamily: `"${ROCKETSTATS_AZONIX_FONT_FAMILY}", "Bahnschrift SemiCondensed", "Arial Narrow", "Segoe UI", sans-serif`,
  shadowColor: "rgba(0, 0, 0, 0.92)",
  shadowOffset: 1,
  palette: {
    panelBackground: "rgba(20, 20, 20, 0.9)",
    panelBorder: "rgba(46, 46, 46, 0.85)",
    textPrimary: "#FFFFFF",
    textSecondary: "#7AA0C4",
    accent: "#3069B0",
    wins: "#35B978",
    losses: "#D9534F",
    streakPositive: "#35B978",
    streakNegative: "#D9534F",
    mmrPositive: "#35B978",
    mmrNegative: "#D9534F",
    mmrNeutral: "#7AA0C4",
    status: "#7AA0C4",
  },
  elements: [
    {
      type: "image",
      id: "panel_bg",
      src: ROCKETSTATS_CIRCLE_BACKGROUND_URL,
      x: 0,
      y: 0,
      scale: ROCKETSTATS_CIRCLE_BACKGROUND_SCALE,
      align: "left",
      verticalAlign: "top",
      opacity: 1,
    },
    {
      type: "text",
      id: "mmr",
      x: 254,
      y: 75,
      scale: 0.32,
      align: "right",
      verticalAlign: "middle",
      color: "#FFFFFF",
      positiveColor: "#35B978",
      negativeColor: "#D9534F",
      neutralColor: "#FFFFFF",
    },
    {
      type: "text",
      id: "streak",
      x: 243,
      y: 111,
      scale: 0.35,
      align: "right",
      verticalAlign: "middle",
      positiveColor: "#35B978",
      negativeColor: "#D9534F",
      neutralColor: "#35B978",
      color: "#35B978",
    },
    {
      type: "text",
      id: "wins",
      x: 243,
      y: 141,
      scale: 0.28,
      align: "right",
      verticalAlign: "middle",
      color: "#00FF00",
    },
    {
      type: "text",
      id: "losses",
      x: 243,
      y: 167,
      scale: 0.28,
      align: "right",
      verticalAlign: "middle",
      color: "#FF0000",
    },
    {
      type: "text",
      id: "status",
      x: 12,
      y: 292,
      scale: 0.22,
      align: "left",
      verticalAlign: "middle",
      fontWeight: 600,
      color: "#7AA0C4",
    },
  ],
};

const ROCKETSTATS_JSTKISS_THEME: WinLossOverlayThemeConfig = {
  id: "rocketstats_jstkiss",
  name: "RocketStats JSTKISS",
  configVersion: "1",
  baseWidth: ROCKETSTATS_JSTKISS_BASE_WIDTH,
  baseHeight: ROCKETSTATS_JSTKISS_BASE_HEIGHT,
  baseFontSize: 16,
  baseScale: 1,
  fontFamily: `"${ROCKETSTATS_MADE_TOMMY_FONT_FAMILY}", "MADE Tommy", Arial, sans-serif`,
  shadowColor: "transparent",
  shadowOffset: 0,
  palette: {
    panelBackground: "rgba(20, 20, 20, 0.9)",
    panelBorder: "rgba(46, 46, 46, 0.85)",
    textPrimary: "#FFFFFF",
    textSecondary: "#FFFFFF",
    accent: "#3069B0",
    wins: "rgb(255, 255, 255)",
    losses: "rgb(255, 255, 255)",
    streakPositive: "rgb(255, 255, 255)",
    streakNegative: "rgb(255, 255, 255)",
    mmrPositive: "rgb(255, 255, 255)",
    mmrNegative: "rgb(255, 255, 255)",
    mmrNeutral: "rgb(255, 255, 255)",
    status: "rgb(255, 255, 255)",
  },
  elements: [
    {
      type: "image",
      id: "panel_bg",
      src: ROCKETSTATS_JSTKISS_BACKGROUND_URL,
      x: 0,
      y: 0,
      scale: 1,
      align: "left",
      verticalAlign: "top",
      opacity: 1,
    },
    {
      type: "text",
      id: "wins",
      x: 110,
      y: 35,
      fontSize: 34,
      align: "left",
      verticalAlign: "top",
      color: "rgb(255, 255, 255)",
    },
    {
      type: "text",
      id: "losses",
      x: 120,
      y: 130,
      fontSize: 30,
      align: "left",
      verticalAlign: "top",
      color: "rgb(255, 255, 255)",
    },
    {
      type: "text",
      id: "streak",
      x: 150,
      y: 220,
      fontSize: 37,
      align: "left",
      verticalAlign: "top",
      color: "rgb(255, 255, 255)",
      positiveColor: "rgb(255, 255, 255)",
      negativeColor: "rgb(255, 255, 255)",
      neutralColor: "rgb(255, 255, 255)",
    },
  ],
};

const ROCKETSTATS_NATIVE_THEME: WinLossOverlayThemeConfig = {
  id: "rocketstats_native",
  name: "RocketStats NativeTheme",
  configVersion: "1",
  baseWidth: ROCKETSTATS_NATIVE_BASE_WIDTH,
  baseHeight: ROCKETSTATS_NATIVE_BASE_HEIGHT,
  baseFontSize: 16,
  baseScale: 1,
  fontFamily: `"${ROCKETSTATS_NATIVE_FONT_FAMILY}", Arial, sans-serif`,
  shadowColor: "rgba(0, 0, 0, 0.55)",
  shadowOffset: 1,
  palette: {
    panelBackground: "rgba(20, 20, 20, 0.9)",
    panelBorder: "rgba(46, 46, 46, 0.85)",
    textPrimary: "#FFFFFF",
    textSecondary: "#FFFFFF",
    accent: "#3069B0",
    wins: "rgb(255, 255, 255)",
    losses: "rgb(255, 255, 255)",
    streakPositive: "rgb(2, 66, 90)",
    streakNegative: "rgb(2, 66, 90)",
    mmrPositive: "rgb(90, 64, 5)",
    mmrNegative: "rgb(90, 64, 5)",
    mmrNeutral: "rgb(90, 64, 5)",
    status: "#7AA0C4",
  },
  elements: [
    {
      type: "image",
      id: "panel_bg",
      src: ROCKETSTATS_NATIVE_BACKGROUND_URL,
      x: 0,
      y: 0,
      scale: 1,
      align: "left",
      verticalAlign: "top",
      opacity: 1,
    },
    {
      type: "text",
      id: "mmr",
      x: 180,
      y: 18,
      fontSize: 34,
      align: "left",
      verticalAlign: "top",
      color: "rgb(90, 64, 5)",
      positiveColor: "rgb(90, 64, 5)",
      negativeColor: "rgb(90, 64, 5)",
      neutralColor: "rgb(90, 64, 5)",
    },
    {
      type: "text",
      id: "streak",
      x: 160,
      y: 90,
      fontSize: 30,
      align: "left",
      verticalAlign: "top",
      color: "rgb(2, 66, 90)",
      positiveColor: "rgb(2, 66, 90)",
      negativeColor: "rgb(2, 66, 90)",
      neutralColor: "rgb(2, 66, 90)",
    },
    {
      type: "text",
      id: "wins",
      x: 180,
      y: 155,
      fontSize: 30,
      align: "left",
      verticalAlign: "top",
      color: "rgb(255, 255, 255)",
    },
    {
      type: "text",
      id: "losses",
      x: 180,
      y: 225,
      fontSize: 30,
      align: "left",
      verticalAlign: "top",
      color: "rgb(255, 255, 255)",
    },
  ],
};

const MINIMALIST_THEME: WinLossOverlayThemeConfig = {
  id: "minimalist",
  name: "Minimalist",
  configVersion: "1",
  baseWidth: MINIMALIST_BASE_WIDTH,
  baseHeight: MINIMALIST_BASE_HEIGHT,
  baseFontSize: 16,
  baseScale: 1,
  fontFamily: `"${RLPEAK_MINIMALIST_FONT_FAMILY}", monospace, sans-serif`,
  shadowColor: "rgba(0, 0, 0, 0.55)",
  shadowOffset: 1,
  palette: {
    panelBackground: "rgba(20, 20, 20, 0.9)",
    panelBorder: "rgba(46, 46, 46, 0.85)",
    textPrimary: "#FFFFFF",
    textSecondary: "#FFFFFF",
    accent: "#3069B0",
    wins: "rgb(1, 204, 1)",
    losses: "rgb(118, 1, 1)",
    streakPositive: "rgb(1, 113, 167)",
    streakNegative: "rgb(1, 113, 167)",
    mmrPositive: "rgb(200, 200, 1)",
    mmrNegative: "rgb(200, 200, 1)",
    mmrNeutral: "rgb(200, 200, 1)",
    status: "#7AA0C4",
  },
  elements: [
    {
      type: "image",
      id: "panel_bg",
      src: MINIMALIST_BACKGROUND_URL,
      x: 0,
      y: 0,
      scale: 1,
      align: "left",
      verticalAlign: "top",
      opacity: 1,
    },
    {
      type: "text",
      id: "mmr",
      x: 75,
      y: 9,
      fontSize: 18,
      align: "left",
      verticalAlign: "top",
      color: "rgb(200, 200, 1)",
      positiveColor: "rgb(200, 200, 1)",
      negativeColor: "rgb(200, 200, 1)",
      neutralColor: "rgb(200, 200, 1)",
    },
    {
      type: "text",
      id: "streak",
      x: 100,
      y: 35,
      fontSize: 18,
      align: "left",
      verticalAlign: "top",
      color: "rgb(1, 113, 167)",
      positiveColor: "rgb(1, 113, 167)",
      negativeColor: "rgb(1, 113, 167)",
      neutralColor: "rgb(1, 113, 167)",
    },
    {
      type: "text",
      id: "wins",
      x: 75,
      y: 61,
      fontSize: 18,
      align: "left",
      verticalAlign: "top",
      color: "rgb(1, 204, 1)",
    },
    {
      type: "text",
      id: "losses",
      x: 100,
      y: 85,
      fontSize: 18,
      align: "left",
      verticalAlign: "top",
      color: "rgb(118, 1, 1)",
    },
  ],
};

const BUILT_IN_THEMES: WinLossOverlayThemeConfig[] = [
  ROCKETSTATS_CIRCLE_THEME,
  ROCKETSTATS_JSTKISS_THEME,
  ROCKETSTATS_NATIVE_THEME,
  MINIMALIST_THEME,
  SAFE_WIN_LOSS_OVERLAY_THEME,
];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed) || /^rgba?\(/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function mergeThemePalette(
  basePalette: WinLossOverlayThemePalette,
  override?: Partial<WinLossOverlayThemePalette>,
): WinLossOverlayThemePalette {
  if (!override) {
    return basePalette;
  }

  return {
    ...basePalette,
    ...override,
  };
}

export function listWinLossOverlayThemes(): WinLossOverlayThemeSummary[] {
  return BUILT_IN_THEMES
    .filter((theme) => theme.id !== SAFE_WIN_LOSS_OVERLAY_THEME.id)
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
    }));
}

export function getWinLossOverlayTheme(themeId?: string | null): WinLossOverlayThemeConfig {
  if (typeof themeId !== "string" || themeId.trim().length === 0) {
    return ROCKETSTATS_CIRCLE_THEME;
  }

  const normalizedThemeId = themeId.trim().toLowerCase();
  const match = BUILT_IN_THEMES.find((theme) => theme.id.toLowerCase() === normalizedThemeId);
  if (!match) {
    return ROCKETSTATS_CIRCLE_THEME;
  }

  return match;
}

export function buildWinLossOverlayTheme(
  themeId?: string | null,
  override?: WinLossOverlayThemeOverride,
): WinLossOverlayThemeConfig {
  const baseTheme = getWinLossOverlayTheme(themeId);
  if (!override?.palette) {
    return baseTheme;
  }

  return {
    ...baseTheme,
    palette: mergeThemePalette(baseTheme.palette, override.palette),
  };
}

export function parseWinLossOverlayThemeOverride(payload: unknown): WinLossOverlayThemeOverride {
  if (!isObjectRecord(payload)) {
    return {};
  }

  const overlayRecord = isObjectRecord(payload.overlay) ? payload.overlay : {};
  const palette: Partial<WinLossOverlayThemePalette> = {};

  const panelBackground = readColor(payload.background) ?? readColor(payload.panel_background) ?? readColor(overlayRecord.background);
  if (panelBackground) {
    palette.panelBackground = panelBackground;
  }

  const panelBorder = readColor(payload.border) ?? readColor(overlayRecord.border);
  if (panelBorder) {
    palette.panelBorder = panelBorder;
  }

  const accent = readColor(payload.accent) ?? readColor(payload.primary) ?? readColor(overlayRecord.accent);
  if (accent) {
    palette.accent = accent;
  }

  const textPrimary = readColor(payload.text_primary) ?? readColor(payload.text) ?? readColor(overlayRecord.text_primary);
  if (textPrimary) {
    palette.textPrimary = textPrimary;
  }

  const textSecondary = readColor(payload.text_secondary) ?? readColor(payload.muted) ?? readColor(overlayRecord.text_secondary);
  if (textSecondary) {
    palette.textSecondary = textSecondary;
    palette.status = textSecondary;
    palette.mmrNeutral = textSecondary;
  }

  if (Object.keys(palette).length === 0) {
    return {};
  }

  return { palette };
}
