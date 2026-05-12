import { emitTo } from "@tauri-apps/api/event";
import type { AppState, PluginStateEntry, PluginsState } from "../items/types";
import { loadAppState, saveAppState } from "../items/stateService";
import {
  DEFAULT_WIN_LOSS_OVERLAY_THEME_ID,
  getWinLossOverlayTheme,
} from "./winLossOverlayThemeRegistry";
import {
  updateWinLossOverlayWindowLayout,
  type RuntimeActionResult,
  type WinLossOverlayWindowLayout,
} from "./winLossOverlayRuntimeService";

export const WIN_LOSS_OVERLAY_SETTINGS_EVENT = "plugins://win-loss-overlay/settings";
export const WIN_LOSS_OVERLAY_WINDOW_LABEL = "overlay-win-loss";
export const WIN_LOSS_OVERLAY_PLUGIN_ID = "win_loss_overlay";
export const WIN_LOSS_OVERLAY_RUNTIME_ID = "builtin.win_loss_overlay.v1";

export interface WinLossOverlayThemeSettings {
  theme_id: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  show_status: boolean;
}

const DEFAULT_SETTINGS: WinLossOverlayThemeSettings = {
  theme_id: DEFAULT_WIN_LOSS_OVERLAY_THEME_ID,
  x: 40,
  y: 40,
  scale: 1,
  opacity: 0.92,
  show_status: false,
};

const SCALE_RANGE = { min: 0.5, max: 1.5 };
const OPACITY_RANGE = { min: 0.3, max: 1 };
const POSITION_RANGE = { min: 0, max: 5000 };
const WINDOW_SIZE_RANGE = { minWidth: 60, maxWidth: 2000, minHeight: 60, maxHeight: 1200 };
const ROCKETSTATS_CIRCLE_THEME_ID = "rocketstats_circle";
const ROCKETSTATS_CIRCLE_FIXED_WIDTH = 400;
const ROCKETSTATS_CIRCLE_FIXED_HEIGHT = 300;
const WIN_LOSS_OVERLAY_RUNTIME_ID_NORMALIZED = WIN_LOSS_OVERLAY_RUNTIME_ID.toLowerCase();

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readFiniteNumber(
  value: unknown,
  fallback: number,
  range?: { min: number; max: number },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  if (!range) {
    return value;
  }

  return clamp(value, range.min, range.max);
}

function readThemeIdForPersistence(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  return value.trim();
}

function readThemeIdForRuntime(value: unknown, fallback: string): string {
  return getWinLossOverlayTheme(readThemeIdForPersistence(value, fallback)).id;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "boolean") {
    return fallback;
  }

  return value;
}

function sanitizeSettings(value: unknown): WinLossOverlayThemeSettings {
  if (!isObjectRecord(value)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    theme_id: readThemeIdForRuntime(value.theme_id, DEFAULT_SETTINGS.theme_id),
    x: readFiniteNumber(value.x, DEFAULT_SETTINGS.x, POSITION_RANGE),
    y: readFiniteNumber(value.y, DEFAULT_SETTINGS.y, POSITION_RANGE),
    scale: readFiniteNumber(value.scale, DEFAULT_SETTINGS.scale, SCALE_RANGE),
    opacity: readFiniteNumber(value.opacity, DEFAULT_SETTINGS.opacity, OPACITY_RANGE),
    show_status: readBoolean(value.show_status, DEFAULT_SETTINGS.show_status),
  };
}

interface WinLossOverlayThemePersistedSettings {
  theme_id: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  show_status: boolean;
}

function sanitizePersistedSettings(value: unknown): WinLossOverlayThemePersistedSettings {
  if (!isObjectRecord(value)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    theme_id: readThemeIdForPersistence(value.theme_id, DEFAULT_SETTINGS.theme_id),
    x: readFiniteNumber(value.x, DEFAULT_SETTINGS.x, POSITION_RANGE),
    y: readFiniteNumber(value.y, DEFAULT_SETTINGS.y, POSITION_RANGE),
    scale: readFiniteNumber(value.scale, DEFAULT_SETTINGS.scale, SCALE_RANGE),
    opacity: readFiniteNumber(value.opacity, DEFAULT_SETTINGS.opacity, OPACITY_RANGE),
    show_status: readBoolean(value.show_status, DEFAULT_SETTINGS.show_status),
  };
}

function isWinLossOverlayRuntimeId(runtimeId: unknown): boolean {
  return typeof runtimeId === "string"
    && runtimeId.trim().toLowerCase() === WIN_LOSS_OVERLAY_RUNTIME_ID_NORMALIZED;
}

function normalizePluginId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveWinLossOverlayPluginStateKey(
  plugins: PluginsState | undefined,
  preferredPluginId?: string | null,
): string {
  const preferred = normalizePluginId(preferredPluginId);
  if (plugins) {
    if (preferred) {
      const preferredEntry = plugins[preferred];
      if (preferredEntry) {
        if (preferred === WIN_LOSS_OVERLAY_PLUGIN_ID || isWinLossOverlayRuntimeId(preferredEntry.runtime)) {
          return preferred;
        }
      }
    }

    if (plugins[WIN_LOSS_OVERLAY_PLUGIN_ID]) {
      return WIN_LOSS_OVERLAY_PLUGIN_ID;
    }

    for (const [pluginId, pluginEntry] of Object.entries(plugins)) {
      if (isWinLossOverlayRuntimeId(pluginEntry?.runtime)) {
        return pluginId;
      }
    }

    if (preferred && plugins[preferred]) {
      return preferred;
    }
  }

  return preferred ?? WIN_LOSS_OVERLAY_PLUGIN_ID;
}

export function sanitizeWinLossOverlayThemeSettings(value: unknown): WinLossOverlayThemeSettings {
  return sanitizeSettings(value);
}

export function getDefaultWinLossOverlayThemeSettings(): WinLossOverlayThemeSettings {
  return { ...DEFAULT_SETTINGS };
}

export function readWinLossOverlayThemeSettingsFromPluginEntry(
  pluginEntry: PluginStateEntry | undefined,
): WinLossOverlayThemeSettings {
  return sanitizeSettings(pluginEntry?.overlay_settings);
}

export function readWinLossOverlayThemeSettingsFromPluginsState(
  plugins: PluginsState | undefined,
  preferredPluginId?: string | null,
): WinLossOverlayThemeSettings {
  const pluginStateKey = resolveWinLossOverlayPluginStateKey(plugins, preferredPluginId);
  return readWinLossOverlayThemeSettingsFromPluginEntry(plugins?.[pluginStateKey]);
}

export function readWinLossOverlayThemeSettingsFromState(state: AppState): WinLossOverlayThemeSettings {
  return readWinLossOverlayThemeSettingsFromPluginsState(state.plugins, WIN_LOSS_OVERLAY_PLUGIN_ID);
}

export function resolveWinLossOverlayWindowLayout(settings: WinLossOverlayThemeSettings): Required<WinLossOverlayWindowLayout> {
  const theme = getWinLossOverlayTheme(settings.theme_id);
  const isRocketStatsCircle = theme.id === ROCKETSTATS_CIRCLE_THEME_ID;
  const width = isRocketStatsCircle
    ? clamp(Math.round(ROCKETSTATS_CIRCLE_FIXED_WIDTH * settings.scale), WINDOW_SIZE_RANGE.minWidth, WINDOW_SIZE_RANGE.maxWidth)
    : clamp(Math.round(theme.baseWidth * settings.scale * theme.baseScale), WINDOW_SIZE_RANGE.minWidth, WINDOW_SIZE_RANGE.maxWidth);
  const height = isRocketStatsCircle
    ? clamp(Math.round(ROCKETSTATS_CIRCLE_FIXED_HEIGHT * settings.scale), WINDOW_SIZE_RANGE.minHeight, WINDOW_SIZE_RANGE.maxHeight)
    : clamp(Math.round(theme.baseHeight * settings.scale * theme.baseScale), WINDOW_SIZE_RANGE.minHeight, WINDOW_SIZE_RANGE.maxHeight);

  return {
    x: clamp(Math.round(settings.x), POSITION_RANGE.min, POSITION_RANGE.max),
    y: clamp(Math.round(settings.y), POSITION_RANGE.min, POSITION_RANGE.max),
    width,
    height,
  };
}

export async function loadWinLossOverlayThemeSettings(): Promise<WinLossOverlayThemeSettings> {
  const state = await loadAppState();
  return readWinLossOverlayThemeSettingsFromState(state);
}

export async function saveWinLossOverlayThemeSettings(
  nextSettingsPatch: Partial<WinLossOverlayThemeSettings>,
): Promise<WinLossOverlayThemeSettings> {
  const state = await loadAppState();
  const currentPlugins = state.plugins ?? {};
  const pluginStateKey = resolveWinLossOverlayPluginStateKey(currentPlugins, WIN_LOSS_OVERLAY_PLUGIN_ID);
  const currentPlugin = currentPlugins[pluginStateKey] ?? {};
  const currentSettings = sanitizePersistedSettings(currentPlugin.overlay_settings);
  const mergedPersistedSettings = sanitizePersistedSettings({
    ...currentSettings,
    ...nextSettingsPatch,
  });
  const mergedRuntimeSettings = sanitizeSettings(mergedPersistedSettings);
  const nextPlugin: PluginStateEntry = {
    ...currentPlugin,
    overlay_settings: mergedPersistedSettings as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  await saveAppState({
    ...state,
    plugins: {
      ...currentPlugins,
      [pluginStateKey]: nextPlugin,
    },
  });

  return mergedRuntimeSettings;
}

export async function resetWinLossOverlayThemeSettings(): Promise<WinLossOverlayThemeSettings> {
  return saveWinLossOverlayThemeSettings(getDefaultWinLossOverlayThemeSettings());
}

export async function broadcastWinLossOverlayThemeSettings(
  settings: WinLossOverlayThemeSettings,
): Promise<void> {
  try {
    await emitTo(WIN_LOSS_OVERLAY_WINDOW_LABEL, WIN_LOSS_OVERLAY_SETTINGS_EVENT, settings);
  } catch {
    // Overlay window may not be open yet. Ignore safely.
  }
}

export async function applyWinLossOverlayWindowLayout(
  settings: WinLossOverlayThemeSettings,
): Promise<RuntimeActionResult> {
  const layout = resolveWinLossOverlayWindowLayout(settings);
  return updateWinLossOverlayWindowLayout(layout);
}
