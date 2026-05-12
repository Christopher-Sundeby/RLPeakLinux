import type { WinLossOverlayRuntimeState } from "../../modules/plugins/winLossOverlayRuntimeService";
import { createDefaultWinLossOverlayState } from "../../modules/plugins/winLossOverlayRuntimeService";
import {
  buildWinLossOverlayTheme,
  parseWinLossOverlayThemeOverride,
  SAFE_WIN_LOSS_OVERLAY_THEME,
  type WinLossOverlayThemeConfig,
  type WinLossOverlayThemeOverride,
  type WinLossOverlayThemeTextElement,
} from "../../modules/plugins/winLossOverlayThemeRegistry";
import type { WinLossOverlayThemeSettings } from "../../modules/plugins/winLossOverlayThemeSettingsService";

export function createOverlayFallbackState(): WinLossOverlayRuntimeState {
  return {
    ...createDefaultWinLossOverlayState(),
    status: "Waiting for Rocket League",
    message: "Waiting for Rocket League...",
    streak: "0",
  };
}

export function formatOverlayStreak(streak: string): string {
  const trimmed = streak.trim();
  return trimmed.length > 0 ? trimmed : "0";
}

export function parseRocketStatsSignedNumber(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.trunc(value);
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return 0;
  }

  const winMatch = normalized.match(/^([+-]?\d+)\s*W$/);
  if (winMatch) {
    const parsed = Number.parseInt(winMatch[1], 10);
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  }

  const lossMatch = normalized.match(/^([+-]?\d+)\s*L$/);
  if (lossMatch) {
    const parsed = Number.parseInt(lossMatch[1], 10);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return -Math.abs(parsed);
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return 0;
}

export function formatRocketStatsSignedValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const normalized = Math.trunc(value);
  if (normalized > 0) {
    return `+${normalized}`;
  }
  return `${normalized}`;
}

export function normalizeRocketStatsStreak(rawStreak: string): number {
  return parseRocketStatsSignedNumber(rawStreak);
}

export function applyRocketStatsStreakTransition(currentStreak: number, didWin: boolean): number {
  const normalizedCurrent = Number.isFinite(currentStreak) ? Math.trunc(currentStreak) : 0;
  if (didWin) {
    return Math.max(0, normalizedCurrent) + 1;
  }
  return Math.min(0, normalizedCurrent) - 1;
}

export function getRocketStatsStreakDisplay(rawStreak: string | number): string {
  const normalized = parseRocketStatsSignedNumber(rawStreak);
  return formatRocketStatsSignedValue(normalized);
}

export function getRocketStatsStreakColor(streakValue: number): string {
  return streakValue < 0 ? "rgb(224, 24, 24)" : "rgb(30, 224, 24)";
}

export function resolveRuntimeMmrDisplayValue(runtimeState: WinLossOverlayRuntimeState): string {
  const delta = runtimeState.mmr_delta;
  switch (runtimeState.mmr_status) {
    case "loading":
      return "...";
    case "syncing":
      return delta === null ? "..." : formatRocketStatsSignedValue(delta);
    case "ready":
      return "0";
    case "synced":
      return formatRocketStatsSignedValue(delta ?? 0);
    case "failed":
    case "disabled":
      return delta === null ? "N/A" : formatRocketStatsSignedValue(delta);
    default:
      return delta === null ? "..." : formatRocketStatsSignedValue(delta);
  }
}

export function resolveStreakTone(streak: string): "positive" | "negative" | "neutral" {
  const normalized = streak.trim().toUpperCase();
  if (!normalized) {
    return "neutral";
  }

  if (normalized.endsWith("L") || normalized.startsWith("-")) {
    return "negative";
  }

  if (normalized.endsWith("W") || normalized.startsWith("+")) {
    return "positive";
  }

  const asNumber = Number.parseInt(normalized, 10);
  if (Number.isFinite(asNumber)) {
    if (asNumber < 0) {
      return "negative";
    }
    if (asNumber > 0) {
      return "positive";
    }
  }

  return "neutral";
}

export function parseOverlayThemeOverride(payload: unknown): WinLossOverlayThemeOverride {
  return parseWinLossOverlayThemeOverride(payload);
}

export function resolveOverlayThemeConfig(
  themeId: string,
  override: WinLossOverlayThemeOverride | undefined,
): WinLossOverlayThemeConfig {
  const resolved = buildWinLossOverlayTheme(themeId, override);
  if (!resolved.elements || resolved.elements.length === 0) {
    return SAFE_WIN_LOSS_OVERLAY_THEME;
  }
  return resolved;
}

export function resolveOverlayTextValue(
  element: WinLossOverlayThemeTextElement,
  runtimeState: WinLossOverlayRuntimeState,
  settings: WinLossOverlayThemeSettings,
): string {
  void settings;
  switch (element.id) {
    case "wins":
      return `${runtimeState.wins}`;
    case "losses":
      return `${runtimeState.losses}`;
    case "streak":
      return formatOverlayStreak(runtimeState.streak);
    case "mmr":
      return resolveRuntimeMmrDisplayValue(runtimeState);
    case "status":
      return runtimeState.status;
    default:
      return "";
  }
}

export function resolveOverlayTextColor(
  element: WinLossOverlayThemeTextElement,
  value: string,
  theme: WinLossOverlayThemeConfig,
): string {
  if (element.id === "wins") {
    return element.color ?? theme.palette.wins;
  }
  if (element.id === "losses") {
    return element.color ?? theme.palette.losses;
  }
  if (element.id === "status") {
    return element.color ?? theme.palette.status;
  }
  if (element.id === "mmr") {
    if (value === "...") {
      return element.neutralColor ?? theme.palette.mmrNeutral;
    }
    const tone = resolveStreakTone(value);
    if (tone === "negative") {
      return element.negativeColor ?? theme.palette.mmrNegative;
    }
    if (tone === "positive") {
      return element.positiveColor ?? theme.palette.mmrPositive;
    }
    return element.neutralColor ?? theme.palette.mmrNeutral;
  }
  if (element.id === "streak") {
    const tone = resolveStreakTone(value);
    if (tone === "negative") {
      return element.negativeColor ?? theme.palette.streakNegative;
    }
    if (tone === "positive") {
      return element.positiveColor ?? theme.palette.streakPositive;
    }
    return element.neutralColor ?? theme.palette.textSecondary;
  }

  return element.color ?? theme.palette.textPrimary;
}

export function shouldRenderTextElement(
  element: WinLossOverlayThemeTextElement,
  settings: WinLossOverlayThemeSettings,
): boolean {
  if (element.visible === false) {
    return false;
  }

  if (element.id === "mmr") {
    return true;
  }

  if (element.id === "status") {
    return settings.show_status;
  }

  return true;
}
