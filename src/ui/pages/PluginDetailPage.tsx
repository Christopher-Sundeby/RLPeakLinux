import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { getLocalAppDataPaths } from "../../modules/items/pathService";
import { ensureRocketLeaguePathForActions } from "../../modules/items/rocketLeaguePathService";
import { loadAppState, saveAppState } from "../../modules/items/stateService";
import type { PluginStateEntry, PluginsState } from "../../modules/items/types";
import {
  loadPluginDetail,
  loadPluginManifest,
} from "../../modules/plugins/pluginCatalogService";
import {
  installPlugin,
  readPluginsState,
  setPluginEnabled,
  uninstallPlugin,
} from "../../modules/plugins/pluginInstallService";
import {
  forceStopPluginRuntimeLifecycle,
  getRuntimeIdForPlugin,
  hidePluginRuntimeLifecycle,
  runtimeRequiresRocketLeaguePath,
  showPluginRuntimeLifecycle,
  startPluginRuntimeLifecycle,
  stopPluginRuntimeLifecycle,
} from "../../modules/plugins/pluginRuntimeLifecycleService";
import type { PluginManifestEntry } from "../../modules/plugins/types";
import type { PluginDetailFile } from "../../modules/plugins/types";
import {
  applyWinLossOverlayWindowLayout,
  broadcastWinLossOverlayThemeSettings,
  getDefaultWinLossOverlayThemeSettings,
  readWinLossOverlayThemeSettingsFromPluginsState,
  resolveWinLossOverlayWindowLayout,
  resetWinLossOverlayThemeSettings,
  saveWinLossOverlayThemeSettings,
  sanitizeWinLossOverlayThemeSettings,
  type WinLossOverlayThemeSettings,
} from "../../modules/plugins/winLossOverlayThemeSettingsService";
import { ensureRocketStatsAzonixFontLoaded } from "../../modules/plugins/rocketStatsFontService";
import {
  listWinLossOverlayThemes,
  type WinLossOverlayThemeSummary,
} from "../../modules/plugins/winLossOverlayThemeRegistry";
import {
  cacheWorkshopMapAssets,
  filterWorkshopMapsByQuery,
  getWorkshopActiveMapStatus,
  getWorkshopLoadPreflight,
  getWorkshopMapsCatalog,
  loadWorkshopMap,
  openWorkshopCacheFolder,
  openWorkshopRuntimeLogsFolder,
  refreshWorkshopMapsCatalog,
  restoreWorkshopOriginalMap,
  WORKSHOP_MAP_LOADER_PLUGIN_ID,
  type WorkshopActiveMapState,
  type WorkshopMapCatalogItem,
} from "../../modules/plugins/workshopMapLoaderService";
import {
  createDefaultWinLossOverlayState,
  getWinLossOverlayRuntimeState,
  listenWinLossOverlayRuntimeState,
  openWinLossOverlayRuntimeLogsFolder,
  resetWinLossOverlaySession,
  type RuntimeActionResult,
  type WinLossOverlayRuntimeState,
} from "../../modules/plugins/winLossOverlayRuntimeService";
import { WinLossOverlayThemePanel } from "../components/WinLossOverlayThemePanel";
import {
  isAnyPluginActionBusyForPlugin,
  isPluginActionBusy,
  runPluginActionWithBusyState,
  shouldShowDisableControl,
  type PluginActionBusyMap,
  type PluginActionName,
} from "./pluginsPageSelectors";
import {
  getPluginBannerUrl,
  getPluginIconUrl,
  pluginSupportsEnableDisable,
  readPluginRuntimeStatus,
  resolvePluginPresentation,
  sanitizeExternalLinkUrl,
  WIN_LOSS_RUNTIME_ID,
} from "./pluginUiShared";
import { buildPluginAssetUrl } from "../../modules/plugins/pluginSecurity";
import { openPluginExternalLink } from "./pluginExternalLinkService";

interface RuntimeActionResultWithState extends RuntimeActionResult {
  state?: WinLossOverlayRuntimeState;
}

const DEFAULT_WIN_LOSS_SETTINGS = getDefaultWinLossOverlayThemeSettings();
const DEFAULT_PLUGIN_BANNER_URL = "/overlay-themes/rocketstats-circle/background.png";
const OVERLAY_SCALE_MIN_PERCENT = 50;
const OVERLAY_SCALE_MAX_PERCENT = 150;
const OVERLAY_SCALE_STEP_PERCENT = 5;
export const OVERLAY_OPACITY_MIN_PERCENT = 30;
export const OVERLAY_OPACITY_MAX_PERCENT = 100;
const OVERLAY_OPACITY_STEP_PERCENT = 5;
const OVERLAY_X_MIN = 0;
const OVERLAY_X_MAX = 3840;
const OVERLAY_Y_MIN = 0;
const OVERLAY_Y_MAX = 2160;
const OVERLAY_POSITION_STEP = 10;
const WORKSHOP_MAP_CARD_LIMIT = 120;
export const WORKSHOP_TUTORIAL_RESTART_IMAGE_PATH = "/plugin-assets/workshop_map_loader/tutorial_restart.png";
export const WORKSHOP_TUTORIAL_FREEPLAY_IMAGE_PATH = "/plugin-assets/workshop_map_loader/tutorial_freeplay.png";
export const WORKSHOP_TUTORIAL_UTOPIA_RETRO_IMAGE_PATH = "/plugin-assets/workshop_map_loader/tutorial_utopia_retro.png";
export const ROCKETSTATS_BORDERLESS_IMAGE_PATH = "/plugin-assets/rocketstats/display_mode_rl.png";
export const ROCKETSTATS_BORDERLESS_TUTORIAL_MODAL_TITLE = "Overlay setup guide";
export const ROCKETSTATS_BORDERLESS_TUTORIAL_COPY = "For the RocketStats overlay to appear correctly over Rocket League, set Rocket League Display Mode to Borderless.";
export const ROCKETSTATS_BORDERLESS_TUTORIAL_GUIDANCE_BUTTON_LABEL = "Overlay setup guide";
export const ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY = "borderless_display_seen";
export const ROCKETSTATS_BORDERLESS_TUTORIAL_WARNING_MESSAGE = "Could not save overlay tutorial preference right now.";
export const WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE = "First-time setup complete. Start Rocket League, then go to Free Play and select Utopia Retro to play this workshop map.";
export const WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE = "Map switched successfully. No game restart needed. Leave the current map, then open Free Play and select Utopia Retro again.";
export const WORKSHOP_RESTORE_SUCCESS_MESSAGE = "Workshop map removed. Restart Rocket League to return to the normal Utopia Retro map.";
export const WORKSHOP_RESTORE_SUCCESS_CLOSED_MESSAGE = "Workshop map removed. Utopia Retro will be restored next time Rocket League starts.";
export const LIGHTBOX_BACKDROP_Z_INDEX = 10000;
export const LIGHTBOX_CONTENT_Z_INDEX = 10001;
export const WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE = "Workshop map loaded";
export const WORKSHOP_LOAD_TUTORIAL_MODAL_MESSAGE = "First-time setup complete. Start Rocket League, then go to Free Play and select Utopia Retro. Your loaded workshop map will open in place of Utopia Retro.";
export const WORKSHOP_LOAD_TUTORIAL_MODAL_NO_RESTART_MESSAGE = "No game restart needed. Just reload Utopia Retro from Free Play.";
export const WORKSHOP_TUTORIAL_CONDITIONAL_GUIDANCE = "First setup: close Rocket League once. After that, you can switch maps without restarting; just reload Utopia Retro from Free Play.";
export const WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE = "First-time workshop setup";
export const WORKSHOP_FIRST_TIME_SETUP_MODAL_MESSAGE = "Rocket League must be closed for the first workshop map setup. This creates the initial mods/Labs_Utopia_P.upk file. This is only required once. After setup, you can switch workshop maps without restarting Rocket League.";
export const WORKSHOP_FIRST_TIME_SETUP_STILL_RUNNING_MESSAGE = "Rocket League is still running. Please close it, then retry.";
export const WORKSHOP_LOAD_TUTORIAL_LONG_RUNNING_MESSAGE = "Downloading and loading map... This can take a while for large maps.";
export const WORKSHOP_LOAD_PROGRESS_MODAL_TITLE = "Downloading workshop map";
export const WORKSHOP_LOAD_PROGRESS_MODAL_MESSAGE = "This can take a while for large maps. Please keep RLPeak open.";
export const WORKSHOP_LOAD_PROGRESS_CACHE_NOTE = "Downloaded maps are cached, so loading the same map again may be faster.";

const LINK_TOKEN_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const STRONG_TOKEN_REGEX = /\*\*([^*]+)\*\*/g;
const ROCKETSTATS_PLUGIN_TUTORIALS_EMPTY: Record<string, boolean | undefined> = {};

// eslint-disable-next-line react-refresh/only-export-components
export function overlayOpacityToPercent(opacity: number): number {
  if (!Number.isFinite(opacity)) {
    return OVERLAY_OPACITY_MAX_PERCENT;
  }

  const percent = Math.round(opacity * 100);
  return Math.max(OVERLAY_OPACITY_MIN_PERCENT, Math.min(OVERLAY_OPACITY_MAX_PERCENT, percent));
}

// eslint-disable-next-line react-refresh/only-export-components
export function overlayOpacityPercentToValue(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 1;
  }

  const clampedPercent = Math.max(OVERLAY_OPACITY_MIN_PERCENT, Math.min(OVERLAY_OPACITY_MAX_PERCENT, percent));
  return Number.parseFloat((clampedPercent / 100).toFixed(2));
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldShowPluginDetailRuntimeControls(isInstalled: boolean): boolean {
  return isInstalled;
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldShowPluginDetailOverlaySettings(
  isInstalled: boolean,
  isWinLossRuntime: boolean,
): boolean {
  return isInstalled && isWinLossRuntime;
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolvePluginActionTimeoutMs(actionName: PluginActionName): number | null | undefined {
  if (actionName === "loadWorkshopMap") {
    return null;
  }
  return undefined;
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldOpenWorkshopPostLoadTutorial(loadSucceeded: boolean): boolean {
  return loadSucceeded;
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolveWorkshopLoadSuccessMessage(restartRequired: boolean): string {
  return restartRequired
    ? WORKSHOP_LOAD_SUCCESS_RESTART_MESSAGE
    : WORKSHOP_LOAD_SUCCESS_NO_RESTART_MESSAGE;
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolveWorkshopLoadTutorialModalMessage(restartRequired: boolean): string {
  return restartRequired
    ? WORKSHOP_LOAD_TUTORIAL_MODAL_MESSAGE
    : WORKSHOP_LOAD_TUTORIAL_MODAL_NO_RESTART_MESSAGE;
}

// eslint-disable-next-line react-refresh/only-export-components
export async function waitForWorkshopLoadProgressModalPaint(): Promise<void> {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildWorkshopMapAssetUrl(relativePath: string): string | null {
  const normalized = relativePath.trim();
  if (normalized.length === 0) {
    return null;
  }

  try {
    return buildPluginAssetUrl(`Plugins/${WORKSHOP_MAP_LOADER_PLUGIN_ID}/${normalized}`);
  } catch {
    return null;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function isWorkshopMapActive(
  mapItem: WorkshopMapCatalogItem,
  activeMap: WorkshopActiveMapState | null,
): boolean {
  return mapItem.id === activeMap?.mapId;
}

function readPluginTutorialFlags(entry: PluginStateEntry | undefined): Record<string, boolean | undefined> {
  return entry?.tutorials ?? ROCKETSTATS_PLUGIN_TUTORIALS_EMPTY;
}

// eslint-disable-next-line react-refresh/only-export-components
export function hasSeenRocketStatsBorderlessTutorial(
  entry: PluginStateEntry | undefined,
): boolean {
  return readPluginTutorialFlags(entry)[ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY] === true;
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldAutoOpenRocketStatsBorderlessTutorial(params: {
  isInstalled: boolean;
  isWinLossRuntime: boolean;
  hasSeenTutorial: boolean;
}): boolean {
  return params.isInstalled && params.isWinLossRuntime && !params.hasSeenTutorial;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, "").trim());
}

function convertHtmlToMarkdown(value: string): string {
  let next = value;
  next = next.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  next = next.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  next = next.replace(/<br\s*\/?>/gi, "\n");
  next = next.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_match, content: string) => `\n### ${stripHtmlTags(content)}\n\n`);
  next = next.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_match, content: string) => `**${stripHtmlTags(content)}**`);
  next = next.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, url: string, label: string) => {
    const safeUrl = sanitizeExternalLinkUrl(url);
    if (!safeUrl) {
      return stripHtmlTags(label);
    }
    return `[${stripHtmlTags(label)}](${safeUrl})`;
  });
  next = next.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content: string) => `- ${stripHtmlTags(content)}\n`);
  next = next.replace(/<\/ul>/gi, "\n");
  next = next.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, content: string) => `${stripHtmlTags(content)}\n\n`);
  next = next.replace(/<[^>]+>/g, " ");
  next = decodeHtmlEntities(next);
  return next
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveLongDescriptionMarkdown(rawValue: string): string {
  if (rawValue.includes("<") && rawValue.includes(">")) {
    return convertHtmlToMarkdown(rawValue);
  }
  return rawValue.trim();
}

function renderInlineMarkdown(text: string, onOpenExternalLink: (url: string) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  const linkMatches = Array.from(text.matchAll(LINK_TOKEN_REGEX));
  if (linkMatches.length === 0) {
    return renderStrongSegments(text);
  }

  let cursor = 0;
  linkMatches.forEach((match, index) => {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(...renderStrongSegments(text.slice(cursor, start)));
    }

    const label = match[1]?.trim() ?? "";
    const linkValue = sanitizeExternalLinkUrl(match[2]);
    if (!linkValue || label.length === 0) {
      nodes.push(...renderStrongSegments(match[0]));
    } else {
      nodes.push(
        <button
          key={`md-link-${index}-${start}`}
          type="button"
          className="plugin-detail-inline-link"
          onClick={() => {
            onOpenExternalLink(linkValue);
          }}
        >
          {label}
        </button>,
      );
    }

    cursor = start + match[0].length;
  });

  if (cursor < text.length) {
    nodes.push(...renderStrongSegments(text.slice(cursor)));
  }

  return nodes;
}

function renderStrongSegments(text: string): ReactNode[] {
  const segments: ReactNode[] = [];
  const matches = Array.from(text.matchAll(STRONG_TOKEN_REGEX));
  if (matches.length === 0) {
    return [text];
  }

  let cursor = 0;
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push(text.slice(cursor, start));
    }

    const strongText = match[1]?.trim() ?? "";
    if (strongText.length > 0) {
      segments.push(<strong key={`md-strong-${index}-${start}`}>{strongText}</strong>);
    }
    cursor = start + match[0].length;
  });

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }
  return segments;
}

interface PluginLongDescriptionSectionProps {
  markdown: string;
  onOpenExternalLink: (url: string) => void;
}

export function PluginLongDescriptionSection({
  markdown,
  onOpenExternalLink,
}: PluginLongDescriptionSectionProps) {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim());
  const blocks: ReactNode[] = [];

  let index = 0;
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }
    const paragraph = paragraphBuffer.join(" ").trim();
    paragraphBuffer = [];
    if (paragraph.length === 0) {
      return;
    }
    blocks.push(
      <p key={`paragraph-${index}-${blocks.length}`} className="plugin-detail-markdown-paragraph">
        {renderInlineMarkdown(paragraph, onOpenExternalLink)}
      </p>,
    );
  };

  const flushList = () => {
    if (listBuffer.length === 0) {
      return;
    }
    const items = [...listBuffer];
    listBuffer = [];
    blocks.push(
      <ul key={`list-${index}-${blocks.length}`} className="plugin-detail-markdown-list">
        {items.map((item, itemIndex) => (
          <li key={`item-${itemIndex}`}>
            {renderInlineMarkdown(item, onOpenExternalLink)}
          </li>
        ))}
      </ul>,
    );
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.length === 0) {
      flushParagraph();
      flushList();
      index += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`heading-${index}`} className="plugin-detail-markdown-heading">
          {line.slice(4).trim()}
        </h3>,
      );
      index += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      listBuffer.push(line.slice(2).trim());
      index += 1;
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
    index += 1;
  }

  flushParagraph();
  flushList();

  return <div className="plugin-detail-markdown">{blocks}</div>;
}

interface WinLossOverlaySettingsSectionProps {
  runtimeState: WinLossOverlayRuntimeState;
  settingsDraft: WinLossOverlayThemeSettings;
  availableThemes: WinLossOverlayThemeSummary[];
  isSaveSettingsBusy: boolean;
  isResetSettingsBusy: boolean;
  onThemeChange: (themeId: string) => void;
  onScalePercentChange: (scalePercent: number) => void;
  onOpacityChange: (opacity: number) => void;
  onXChange: (x: number) => void;
  onYChange: (y: number) => void;
  onSave: () => void;
  onReset: () => void;
}

export function WinLossOverlaySettingsSection({
  runtimeState,
  settingsDraft,
  availableThemes,
  isSaveSettingsBusy,
  isResetSettingsBusy,
  onThemeChange,
  onScalePercentChange,
  onOpacityChange,
  onXChange,
  onYChange,
  onSave,
  onReset,
}: WinLossOverlaySettingsSectionProps) {
  const scalePercent = Math.round(settingsDraft.scale * 100);
  const opacityPercent = overlayOpacityToPercent(settingsDraft.opacity);

  return (
    <div className="plugins-overlay-settings plugin-detail-overlay-settings">
      <label className="plugins-overlay-field" htmlFor="plugin-detail-theme">
        <span>Theme</span>
        <select
          id="plugin-detail-theme"
          className="plugins-overlay-select"
          value={settingsDraft.theme_id}
          disabled={isSaveSettingsBusy || isResetSettingsBusy}
          onChange={(event) => {
            onThemeChange(event.target.value);
          }}
        >
          {availableThemes.map((theme) => (
            <option key={theme.id} value={theme.id}>{theme.name}</option>
          ))}
        </select>
      </label>

      <div className="plugins-overlay-grid">
        <label className="plugins-overlay-field" htmlFor="plugin-detail-scale">
          <span>Scale</span>
          <input
            id="plugin-detail-scale"
            className="plugins-overlay-input plugins-overlay-range"
            type="range"
            min={OVERLAY_SCALE_MIN_PERCENT}
            max={OVERLAY_SCALE_MAX_PERCENT}
            step={OVERLAY_SCALE_STEP_PERCENT}
            value={scalePercent}
            onChange={(event) => {
              const nextValue = Number.parseFloat(event.target.value);
              if (!Number.isFinite(nextValue)) {
                return;
              }
              onScalePercentChange(nextValue);
            }}
          />
          <span className="plugins-overlay-field-value" aria-label="Overlay scale percentage">{`${scalePercent}%`}</span>
        </label>
        <label className="plugins-overlay-field" htmlFor="plugin-detail-opacity">
          <span>Opacity</span>
          <input
            id="plugin-detail-opacity-slider"
            className="plugins-overlay-input plugins-overlay-range"
            type="range"
            min={OVERLAY_OPACITY_MIN_PERCENT}
            max={OVERLAY_OPACITY_MAX_PERCENT}
            step={OVERLAY_OPACITY_STEP_PERCENT}
            value={opacityPercent}
            onChange={(event) => {
              const nextPercent = Number.parseFloat(event.target.value);
              if (!Number.isFinite(nextPercent)) {
                return;
              }
              onOpacityChange(overlayOpacityPercentToValue(nextPercent));
            }}
          />
          <span className="plugins-overlay-field-value" aria-label="Overlay opacity percentage">{`${opacityPercent}%`}</span>
          <input
            id="plugin-detail-opacity"
            className="plugins-overlay-input"
            type="number"
            min={0.3}
            max={1}
            step={0.01}
            value={settingsDraft.opacity}
            onChange={(event) => {
              const nextValue = Number.parseFloat(event.target.value);
              if (!Number.isFinite(nextValue)) {
                return;
              }
              onOpacityChange(nextValue);
            }}
          />
        </label>
      </div>

      <div className="plugins-overlay-grid">
        <label className="plugins-overlay-field" htmlFor="plugin-detail-x-slider">
          <span>X position</span>
          <input
            id="plugin-detail-x-slider"
            className="plugins-overlay-input plugins-overlay-range"
            type="range"
            min={OVERLAY_X_MIN}
            max={OVERLAY_X_MAX}
            step={OVERLAY_POSITION_STEP}
            value={settingsDraft.x}
            onChange={(event) => {
              const nextValue = Number.parseFloat(event.target.value);
              if (!Number.isFinite(nextValue)) {
                return;
              }
              onXChange(nextValue);
            }}
          />
          <input
            id="plugin-detail-x"
            className="plugins-overlay-input"
            type="number"
            min={OVERLAY_X_MIN}
            max={OVERLAY_X_MAX}
            step={1}
            value={settingsDraft.x}
            onChange={(event) => {
              const nextValue = Number.parseFloat(event.target.value);
              if (!Number.isFinite(nextValue)) {
                return;
              }
              onXChange(nextValue);
            }}
          />
        </label>
        <label className="plugins-overlay-field" htmlFor="plugin-detail-y-slider">
          <span>Y position</span>
          <input
            id="plugin-detail-y-slider"
            className="plugins-overlay-input plugins-overlay-range"
            type="range"
            min={OVERLAY_Y_MIN}
            max={OVERLAY_Y_MAX}
            step={OVERLAY_POSITION_STEP}
            value={settingsDraft.y}
            onChange={(event) => {
              const nextValue = Number.parseFloat(event.target.value);
              if (!Number.isFinite(nextValue)) {
                return;
              }
              onYChange(nextValue);
            }}
          />
          <input
            id="plugin-detail-y"
            className="plugins-overlay-input"
            type="number"
            min={OVERLAY_Y_MIN}
            max={OVERLAY_Y_MAX}
            step={1}
            value={settingsDraft.y}
            onChange={(event) => {
              const nextValue = Number.parseFloat(event.target.value);
              if (!Number.isFinite(nextValue)) {
                return;
              }
              onYChange(nextValue);
            }}
          />
        </label>
      </div>

      <p className="plugin-detail-hint">
        MMR uses tracker.gg and may take a moment to sync after matches.
      </p>

      <div className="plugins-overlay-actions">
        <button
          type="button"
          className="settings-btn-secondary"
          disabled={isSaveSettingsBusy}
          onClick={onSave}
        >
          Save overlay settings
        </button>
        <button
          type="button"
          className="settings-btn-secondary"
          disabled={isResetSettingsBusy}
          onClick={onReset}
        >
          Reset overlay settings
        </button>
      </div>

      <div className="plugin-detail-preview-wrap">
        <p className="plugin-detail-preview-title">Theme preview</p>
        <div className="plugin-detail-preview-stage">
          <WinLossOverlayThemePanel
            runtimeState={runtimeState}
            settings={settingsDraft}
            displayMode="preview"
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}

interface WorkshopMapCatalogSectionProps {
  maps: WorkshopMapCatalogItem[];
  searchQuery: string;
  totalMapCount: number;
  activeMap: WorkshopActiveMapState | null;
  loadingMapId: number | null;
  isLoadBusy: boolean;
  onSearchQueryChange: (query: string) => void;
  onLoadMap: (mapItem: WorkshopMapCatalogItem) => void;
}

export function WorkshopMapCatalogSection({
  maps,
  searchQuery,
  totalMapCount,
  activeMap,
  loadingMapId,
  isLoadBusy,
  onSearchQueryChange,
  onLoadMap,
}: WorkshopMapCatalogSectionProps) {
  if (maps.length === 0) {
    return (
      <article className="plugin-detail-card">
        <h3 className="catalog-heading">Workshop maps</h3>
        <label className="plugins-overlay-field" htmlFor="workshop-map-search">
          <span>Search maps</span>
          <input
            id="workshop-map-search"
            className="plugins-overlay-input"
            type="text"
            value={searchQuery}
            placeholder="Search by map or author"
            onChange={(event) => {
              onSearchQueryChange(event.target.value);
            }}
          />
        </label>
        <p className="plugin-detail-hint">
          Showing 0 of {totalMapCount} maps.
        </p>
        <p className="plugin-detail-hint">
          No workshop maps matched your current search.
        </p>
      </article>
    );
  }

  return (
    <article className="plugin-detail-card">
      <h3 className="catalog-heading">Workshop maps</h3>
      <label className="plugins-overlay-field" htmlFor="workshop-map-search">
        <span>Search maps</span>
        <input
          id="workshop-map-search"
          className="plugins-overlay-input"
          type="text"
          value={searchQuery}
          placeholder="Search by map or author"
          onChange={(event) => {
            onSearchQueryChange(event.target.value);
          }}
        />
      </label>
      <p className="plugin-detail-hint">
        Showing {maps.length} of {totalMapCount} maps.
      </p>
      <div className="workshop-map-grid">
        {maps.map((mapItem) => {
          const isActive = isWorkshopMapActive(mapItem, activeMap);
          const bannerUrl = buildWorkshopMapAssetUrl(mapItem.bannerPath) ?? DEFAULT_PLUGIN_BANNER_URL;
          const isLoadingMap = loadingMapId === mapItem.id;
          return (
            <article key={mapItem.id} className="workshop-map-card">
              <div className="workshop-map-banner-wrap">
                <img
                  className="workshop-map-banner"
                  src={bannerUrl}
                  alt={`${mapItem.name} banner`}
                  loading="lazy"
                />
                {isActive ? (
                  <span className="workshop-map-active-pill">Active</span>
                ) : null}
              </div>
              <div className="workshop-map-copy">
                <h4 className="workshop-map-title">{mapItem.name}</h4>
                <p className="workshop-map-author">{mapItem.memberDisplayName}</p>
                <p className="workshop-map-description">{mapItem.shortDescription}</p>
              </div>
              <div className="plugins-card-actions">
                <button
                  type="button"
                  className="settings-btn-secondary"
                  disabled={isLoadBusy}
                  aria-busy={isLoadingMap ? "true" : undefined}
                  onClick={() => {
                    if (isLoadBusy) {
                      return;
                    }
                    onLoadMap(mapItem);
                  }}
                >
                  {isLoadingMap ? "Downloading and loading..." : "Load"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </article>
  );
}

interface WorkshopMapLoadProgressModalProps {
  isOpen: boolean;
  mapName: string;
}

export function WorkshopMapLoadProgressModal({
  isOpen,
  mapName,
}: WorkshopMapLoadProgressModalProps) {
  if (!isOpen) {
    return null;
  }

  const steps = [
    "Checking Rocket League path",
    "Preparing cache",
    "Downloading map",
    "Installing into Rocket League mods folder",
    "Finalizing",
  ] as const;

  const normalizedMapName = mapName.trim();
  const subtitle = normalizedMapName.length > 0
    ? normalizedMapName
    : "Workshop map";

  const surface = (
    <div
      className="workshop-load-progress-backdrop"
      data-testid="workshop-load-progress-modal"
      role="dialog"
      aria-modal="true"
      aria-label={WORKSHOP_LOAD_PROGRESS_MODAL_TITLE}
    >
      <div className="workshop-load-progress-modal" aria-busy="true">
        <div className="workshop-load-progress-spinner" aria-hidden="true" />
        <h3 className="catalog-heading workshop-load-progress-title">{WORKSHOP_LOAD_PROGRESS_MODAL_TITLE}</h3>
        <p className="workshop-load-progress-subtitle">{subtitle}</p>
        <p className="plugin-detail-hint workshop-load-progress-copy">{WORKSHOP_LOAD_PROGRESS_MODAL_MESSAGE}</p>
        <p className="workshop-load-progress-current">{WORKSHOP_LOAD_TUTORIAL_LONG_RUNNING_MESSAGE}</p>
        <ol className="workshop-load-progress-steps" aria-label="Workshop map loading steps">
          {steps.map((step, index) => (
            <li key={step} className="workshop-load-progress-step">
              <span className="workshop-load-progress-step-badge">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="workshop-load-progress-note">{WORKSHOP_LOAD_PROGRESS_CACHE_NOTE}</p>
        <p className="workshop-load-progress-wait">Please wait...</p>
      </div>
    </div>
  );

  const portalRoot = resolveLightboxPortalRoot(typeof document === "undefined" ? undefined : document);
  if (!portalRoot) {
    return surface;
  }

  return createPortal(surface, portalRoot);
}

interface WorkshopFirstTimeSetupModalProps {
  isOpen: boolean;
  warningMessage?: string | null;
  isRetryBusy?: boolean;
  onRetry: () => void;
  onCancel: () => void;
}

export function WorkshopFirstTimeSetupModal({
  isOpen,
  warningMessage = null,
  isRetryBusy = false,
  onRetry,
  onCancel,
}: WorkshopFirstTimeSetupModalProps) {
  if (!isOpen) {
    return null;
  }

  const surface = (
    <div
      className="workshop-first-setup-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE}
      data-testid="workshop-first-time-setup-modal"
    >
      <div className="workshop-first-setup-modal">
        <h3 className="catalog-heading workshop-first-setup-title">{WORKSHOP_FIRST_TIME_SETUP_MODAL_TITLE}</h3>
        <p className="plugin-detail-hint workshop-first-setup-copy">{WORKSHOP_FIRST_TIME_SETUP_MODAL_MESSAGE}</p>
        {warningMessage ? (
          <p className="workshop-first-setup-warning" role="status">
            {warningMessage}
          </p>
        ) : null}
        <div className="plugins-card-actions">
          <button
            type="button"
            className="settings-btn-primary"
            disabled={isRetryBusy}
            onClick={onRetry}
          >
            I closed Rocket League, retry
          </button>
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isRetryBusy}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  const portalRoot = resolveLightboxPortalRoot(typeof document === "undefined" ? undefined : document);
  if (!portalRoot) {
    return surface;
  }

  return createPortal(surface, portalRoot);
}

interface WorkshopTutorialImageProps {
  imagePath?: string;
  alt: string;
  caption: string;
  lightboxCaption: string;
  onOpenLightbox: (image: TutorialLightboxImage) => void;
  showEnlargeHint?: boolean;
}

export interface TutorialLightboxImage {
  imagePath: string;
  alt: string;
  caption: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export function canOpenTutorialLightbox(imagePath: string | undefined, hasImageError: boolean): boolean {
  const normalizedPath = typeof imagePath === "string" ? imagePath.trim() : "";
  return normalizedPath.length > 0 && !hasImageError;
}

// eslint-disable-next-line react-refresh/only-export-components
export function createTutorialLightboxImage(params: {
  imagePath?: string;
  alt: string;
  caption: string;
  hasImageError: boolean;
}): TutorialLightboxImage | null {
  if (!canOpenTutorialLightbox(params.imagePath, params.hasImageError)) {
    return null;
  }

  return {
    imagePath: params.imagePath!.trim(),
    alt: params.alt,
    caption: params.caption,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldCloseTutorialLightboxOnEscape(key: string): boolean {
  return key === "Escape";
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldCloseTutorialLightboxFromBackdropClick(isBackdropTarget: boolean): boolean {
  return isBackdropTarget;
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolveLightboxPortalRoot(doc: Pick<Document, "body"> | null | undefined): HTMLElement | null {
  if (!doc || !doc.body) {
    return null;
  }

  return doc.body as HTMLElement;
}

export function WorkshopTutorialImage({
  imagePath,
  alt,
  caption,
  lightboxCaption,
  onOpenLightbox,
  showEnlargeHint = false,
}: WorkshopTutorialImageProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const shouldShowImage = canOpenTutorialLightbox(imagePath, hasImageError);
  const normalizedPath = typeof imagePath === "string" ? imagePath.trim() : "";

  return (
    <figure className="workshop-tutorial-image-slot">
      {shouldShowImage ? (
        <button
          type="button"
          className="workshop-tutorial-image-button"
          aria-label={`Open tutorial image: ${lightboxCaption}`}
          onClick={() => {
            const lightboxImage = createTutorialLightboxImage({
              imagePath: normalizedPath,
              alt,
              caption: lightboxCaption,
              hasImageError,
            });
            if (!lightboxImage) {
              return;
            }
            onOpenLightbox(lightboxImage);
          }}
        >
          <img
            className="workshop-tutorial-image"
            src={normalizedPath}
            alt={alt}
            loading="lazy"
            onError={() => {
              setHasImageError(true);
            }}
          />
        </button>
      ) : (
        <div className="workshop-tutorial-image-placeholder" aria-hidden="true">
          Tutorial screenshot slot
        </div>
      )}
      <figcaption className="workshop-tutorial-image-caption">{caption}</figcaption>
      {showEnlargeHint && shouldShowImage ? (
        <p className="workshop-tutorial-image-hint">Click to enlarge</p>
      ) : null}
    </figure>
  );
}

interface ImageLightboxProps {
  image: TutorialLightboxImage | null;
  onClose: () => void;
}

export function ImageLightbox({
  image,
  onClose,
}: ImageLightboxProps) {
  useEffect(() => {
    if (!image || typeof document === "undefined") {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (!shouldCloseTutorialLightboxOnEscape(event.key)) {
        return;
      }
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [image, onClose]);

  if (!image) {
    return null;
  }

  const surface = (
    <div
      className="plugin-image-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={image.caption}
      style={{ zIndex: LIGHTBOX_BACKDROP_Z_INDEX }}
      onMouseDown={(event) => {
        const shouldClose = shouldCloseTutorialLightboxFromBackdropClick(event.target === event.currentTarget);
        if (!shouldClose) {
          return;
        }
        onClose();
      }}
    >
      <div
        className="plugin-image-lightbox-content"
        style={{ zIndex: LIGHTBOX_CONTENT_Z_INDEX }}
      >
        <button
          type="button"
          className="plugin-image-lightbox-close"
          aria-label="Close tutorial image"
          onClick={onClose}
        >
          X
        </button>
        <img
          className="plugin-image-lightbox-image"
          src={image.imagePath}
          alt={image.alt}
        />
        <p className="plugin-image-lightbox-caption">{image.caption}</p>
      </div>
    </div>
  );

  const portalRoot = resolveLightboxPortalRoot(typeof document === "undefined" ? undefined : document);
  if (!portalRoot) {
    return surface;
  }

  return createPortal(surface, portalRoot);
}

interface WorkshopTutorialSectionProps {
  freeplayImagePath?: string;
  utopiaRetroImagePath?: string;
}

export function WorkshopTutorialSection({
  freeplayImagePath = WORKSHOP_TUTORIAL_FREEPLAY_IMAGE_PATH,
  utopiaRetroImagePath = WORKSHOP_TUTORIAL_UTOPIA_RETRO_IMAGE_PATH,
}: WorkshopTutorialSectionProps) {
  const [lightboxImage, setLightboxImage] = useState<TutorialLightboxImage | null>(null);

  return (
    <>
      <article className="plugin-detail-card workshop-tutorial-card">
        <h3 className="catalog-heading">Tutorial</h3>
        <p className="plugin-detail-hint">
          {WORKSHOP_TUTORIAL_CONDITIONAL_GUIDANCE}
        </p>
        <p className="plugin-detail-hint">
          Use Remove loaded map to bring back the normal Utopia Retro map.
        </p>
        <div className="workshop-tutorial-images">
          <WorkshopTutorialImage
            imagePath={freeplayImagePath}
            alt="Rocket League Free Play tutorial step"
            caption="Step 1: Open Free Play"
            lightboxCaption="Free Play menu"
            showEnlargeHint
            onOpenLightbox={(selectedImage) => {
              setLightboxImage(selectedImage);
            }}
          />
          <WorkshopTutorialImage
            imagePath={utopiaRetroImagePath}
            alt="Rocket League Utopia Retro selector tutorial step"
            caption="Step 2: Select Utopia Retro"
            lightboxCaption="Select Utopia Retro"
            showEnlargeHint
            onOpenLightbox={(selectedImage) => {
              setLightboxImage(selectedImage);
            }}
          />
        </div>
      </article>
      <ImageLightbox
        image={lightboxImage}
        onClose={() => {
          setLightboxImage(null);
        }}
      />
    </>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldCloseWorkshopLoadTutorialOnEscape(key: string): boolean {
  return key === "Escape";
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldCloseWorkshopLoadTutorialFromBackdropClick(isBackdropTarget: boolean): boolean {
  return isBackdropTarget;
}

interface WorkshopLoadTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  restartRequired?: boolean;
  restartImagePath?: string;
  freeplayImagePath?: string;
  utopiaRetroImagePath?: string;
}

export function WorkshopLoadTutorialModal({
  isOpen,
  onClose,
  restartRequired = true,
  restartImagePath = WORKSHOP_TUTORIAL_RESTART_IMAGE_PATH,
  freeplayImagePath = WORKSHOP_TUTORIAL_FREEPLAY_IMAGE_PATH,
  utopiaRetroImagePath = WORKSHOP_TUTORIAL_UTOPIA_RETRO_IMAGE_PATH,
}: WorkshopLoadTutorialModalProps) {
  const [lightboxImage, setLightboxImage] = useState<TutorialLightboxImage | null>(null);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (!shouldCloseWorkshopLoadTutorialOnEscape(event.key)) {
        return;
      }
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const steps = restartRequired
    ? [
      {
        number: 1,
        title: "Start Rocket League",
        text: "Start Rocket League after first-time workshop setup completes.",
        imagePath: restartImagePath,
        imageAlt: "Start Rocket League tutorial step",
        imageCaption: "Start Rocket League",
        lightboxCaption: "Start Rocket League",
      },
      {
        number: 2,
        title: "Open Free Play",
        text: "Go to Training, then Free Play.",
        imagePath: freeplayImagePath,
        imageAlt: "Open Free Play tutorial step",
        imageCaption: "Open Free Play",
        lightboxCaption: "Free Play menu",
      },
      {
        number: 3,
        title: "Select Utopia Retro",
        text: "Choose Utopia Retro in the map selector to play the loaded workshop map.",
        imagePath: utopiaRetroImagePath,
        imageAlt: "Select Utopia Retro tutorial step",
        imageCaption: "Select Utopia Retro",
        lightboxCaption: "Select Utopia Retro",
      },
    ] as const
    : [
      {
        number: 1,
        title: "Leave current map",
        text: "Leave the current Free Play session so Rocket League reloads the map file.",
        imagePath: restartImagePath,
        imageAlt: "Leave current map tutorial step",
        imageCaption: "Leave current map",
        lightboxCaption: "Leave current map",
      },
      {
        number: 2,
        title: "Open Free Play",
        text: "Go to Training, then Free Play.",
        imagePath: freeplayImagePath,
        imageAlt: "Open Free Play tutorial step",
        imageCaption: "Open Free Play",
        lightboxCaption: "Free Play menu",
      },
      {
        number: 3,
        title: "Select Utopia Retro",
        text: "Choose Utopia Retro in the map selector to play the loaded workshop map.",
        imagePath: utopiaRetroImagePath,
        imageAlt: "Select Utopia Retro tutorial step",
        imageCaption: "Select Utopia Retro",
        lightboxCaption: "Select Utopia Retro",
      },
    ] as const;

  const surface = (
    <div
      className="workshop-load-tutorial-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE}
      onMouseDown={(event) => {
        const shouldClose = shouldCloseWorkshopLoadTutorialFromBackdropClick(event.target === event.currentTarget);
        if (!shouldClose) {
          return;
        }
        onClose();
      }}
    >
      <div className="workshop-load-tutorial-modal">
        <button
          type="button"
          className="plugin-image-lightbox-close"
          aria-label="Close workshop tutorial"
          onClick={onClose}
        >
          X
        </button>
        <h3 className="catalog-heading workshop-load-tutorial-title">{WORKSHOP_LOAD_TUTORIAL_MODAL_TITLE}</h3>
        <p className="plugin-detail-hint workshop-load-tutorial-copy">
          {resolveWorkshopLoadTutorialModalMessage(restartRequired)}
        </p>
        <div className="workshop-load-tutorial-steps">
          {steps.map((step) => (
            <article key={step.number} className="workshop-load-tutorial-step">
              <span className="workshop-load-tutorial-step-badge">{`Step ${step.number}`}</span>
              <h4 className="workshop-load-tutorial-step-title">{step.title}</h4>
              <p className="workshop-load-tutorial-step-copy">{step.text}</p>
              <WorkshopTutorialImage
                imagePath={step.imagePath}
                alt={step.imageAlt}
                caption={step.imageCaption}
                lightboxCaption={step.lightboxCaption}
                showEnlargeHint
                onOpenLightbox={(selectedImage) => {
                  setLightboxImage(selectedImage);
                }}
              />
            </article>
          ))}
        </div>
        <div className="plugins-card-actions">
          <button
            type="button"
            className="settings-btn-primary"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
      <ImageLightbox
        image={lightboxImage}
        onClose={() => {
          setLightboxImage(null);
        }}
      />
    </div>
  );

  const portalRoot = resolveLightboxPortalRoot(typeof document === "undefined" ? undefined : document);
  if (!portalRoot) {
    return surface;
  }

  return createPortal(surface, portalRoot);
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldCloseRocketStatsTutorialOnEscape(key: string): boolean {
  return key === "Escape";
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldCloseRocketStatsTutorialFromBackdropClick(isBackdropTarget: boolean): boolean {
  return isBackdropTarget;
}

interface RocketStatsBorderlessTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  imagePath?: string;
}

export function RocketStatsBorderlessTutorialModal({
  isOpen,
  onClose,
  imagePath = ROCKETSTATS_BORDERLESS_IMAGE_PATH,
}: RocketStatsBorderlessTutorialModalProps) {
  const [lightboxImage, setLightboxImage] = useState<TutorialLightboxImage | null>(null);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (!shouldCloseRocketStatsTutorialOnEscape(event.key)) {
        return;
      }
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const surface = (
    <div
      className="rocketstats-setup-tutorial-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={ROCKETSTATS_BORDERLESS_TUTORIAL_MODAL_TITLE}
      data-testid="rocketstats-borderless-tutorial-modal"
      onMouseDown={(event) => {
        const shouldClose = shouldCloseRocketStatsTutorialFromBackdropClick(event.target === event.currentTarget);
        if (!shouldClose) {
          return;
        }
        onClose();
      }}
    >
      <div className="rocketstats-setup-tutorial-modal">
        <button
          type="button"
          className="plugin-image-lightbox-close"
          aria-label="Close RocketStats overlay setup guide"
          onClick={onClose}
        >
          X
        </button>
        <h3 className="catalog-heading rocketstats-setup-tutorial-title">{ROCKETSTATS_BORDERLESS_TUTORIAL_MODAL_TITLE}</h3>
        <p className="plugin-detail-hint rocketstats-setup-tutorial-copy">
          {ROCKETSTATS_BORDERLESS_TUTORIAL_COPY}
        </p>
        <ol className="rocketstats-setup-tutorial-steps">
          <li>Open Rocket League Settings.</li>
          <li>Go to Video.</li>
          <li>Set Display Mode to Borderless.</li>
          <li>Apply the setting, then return to RLPeak and enable/show the overlay.</li>
        </ol>
        <WorkshopTutorialImage
          imagePath={imagePath}
          alt="Rocket League Display Mode set to Borderless"
          caption="Display Mode: Borderless"
          lightboxCaption="Display Mode: Borderless"
          showEnlargeHint
          onOpenLightbox={(selectedImage) => {
            setLightboxImage(selectedImage);
          }}
        />
        <div className="plugins-card-actions">
          <button
            type="button"
            className="settings-btn-primary"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
      <ImageLightbox
        image={lightboxImage}
        onClose={() => {
          setLightboxImage(null);
        }}
      />
    </div>
  );

  const portalRoot = resolveLightboxPortalRoot(typeof document === "undefined" ? undefined : document);
  if (!portalRoot) {
    return surface;
  }

  return createPortal(surface, portalRoot);
}

interface PluginDetailTwoColumnLayoutProps {
  controls: ReactNode;
  presentation: ReactNode;
}

export function PluginDetailTwoColumnLayout({
  controls,
  presentation,
}: PluginDetailTwoColumnLayoutProps) {
  return (
    <div className="plugin-detail-layout">
      {controls}
      {presentation}
    </div>
  );
}

interface PluginDetailPresentationRegionProps {
  children: ReactNode;
}

export function PluginDetailPresentationRegion({
  children,
}: PluginDetailPresentationRegionProps) {
  return (
    <section
      className="plugin-detail-presentation-region"
      aria-label="Plugin presentation content"
    >
      {children}
    </section>
  );
}

interface PluginDetailControlsRegionProps {
  isInstalled: boolean;
  isWinLossRuntime: boolean;
  actionCard: ReactNode;
  runtimeControlsCard: ReactNode;
  overlaySettingsCard: ReactNode;
  showOverlaySettingsInControls?: boolean;
  tutorialCard?: ReactNode;
  descriptionCard: ReactNode;
}

export function PluginDetailControlsRegion({
  isInstalled,
  isWinLossRuntime,
  actionCard,
  runtimeControlsCard,
  overlaySettingsCard,
  showOverlaySettingsInControls = true,
  tutorialCard,
  descriptionCard,
}: PluginDetailControlsRegionProps) {
  const showRuntimeControls = shouldShowPluginDetailRuntimeControls(isInstalled);
  const showOverlaySettings = shouldShowPluginDetailOverlaySettings(isInstalled, isWinLossRuntime) && showOverlaySettingsInControls;

  return (
    <aside
      className="plugin-detail-controls-region"
      aria-label="Plugin controls and settings"
    >
      <div className="plugin-detail-controls-stack">
        {actionCard}
        {!showRuntimeControls ? (
          <article className="plugin-detail-card plugin-detail-install-gate-card">
            <h3 className="catalog-heading">Install to configure</h3>
            <p className="plugin-detail-description">
              Install this plugin to access plugin actions and settings.
            </p>
          </article>
        ) : null}
        {showRuntimeControls ? runtimeControlsCard : null}
        {showOverlaySettings ? overlaySettingsCard : null}
        {tutorialCard}
        {descriptionCard}
      </div>
    </aside>
  );
}

export function PluginDetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const pluginId = params.pluginId?.trim() ?? "";
  const availableThemes = useMemo<WinLossOverlayThemeSummary[]>(() => listWinLossOverlayThemes(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [manifestEntry, setManifestEntry] = useState<PluginManifestEntry | null>(null);
  const [pluginDetail, setPluginDetail] = useState<PluginDetailFile | null>(null);
  const [pluginsState, setPluginsState] = useState<PluginsState>({});
  const [runtimeState, setRuntimeState] = useState<WinLossOverlayRuntimeState>(createDefaultWinLossOverlayState());
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionStatusTone, setActionStatusTone] = useState<"success" | "error">("success");
  const [externalLinkStatus, setExternalLinkStatus] = useState<string | null>(null);
  const [externalLinkStatusTone, setExternalLinkStatusTone] = useState<"success" | "error">("success");
  const [actionBusyState, setActionBusyState] = useState<PluginActionBusyMap>({});
  const [settingsDraft, setSettingsDraft] = useState<WinLossOverlayThemeSettings>(DEFAULT_WIN_LOSS_SETTINGS);
  const [workshopCatalog, setWorkshopCatalog] = useState<WorkshopMapCatalogItem[]>([]);
  const [workshopCatalogSource, setWorkshopCatalogSource] = useState<"remote" | "cache">("cache");
  const [isWorkshopCatalogLoading, setIsWorkshopCatalogLoading] = useState(false);
  const [workshopSearchQuery, setWorkshopSearchQuery] = useState("");
  const [workshopActiveMap, setWorkshopActiveMap] = useState<WorkshopActiveMapState | null>(null);
  const [workshopLegacyBackupNotice, setWorkshopLegacyBackupNotice] = useState<string | null>(null);
  const [workshopLoadingMapId, setWorkshopLoadingMapId] = useState<number | null>(null);
  const [workshopLoadingMapName, setWorkshopLoadingMapName] = useState("");
  const [isWorkshopLoadProgressOpen, setIsWorkshopLoadProgressOpen] = useState(false);
  const [isWorkshopFirstTimeSetupOpen, setIsWorkshopFirstTimeSetupOpen] = useState(false);
  const [workshopFirstTimeSetupWarning, setWorkshopFirstTimeSetupWarning] = useState<string | null>(null);
  const [workshopPendingSetupMap, setWorkshopPendingSetupMap] = useState<WorkshopMapCatalogItem | null>(null);
  const [workshopActionGuidance, setWorkshopActionGuidance] = useState<string | null>(null);
  const [isWorkshopLoadTutorialOpen, setIsWorkshopLoadTutorialOpen] = useState(false);
  const [workshopLoadRestartRequired, setWorkshopLoadRestartRequired] = useState(true);
  const [isRocketStatsBorderlessTutorialOpen, setIsRocketStatsBorderlessTutorialOpen] = useState(false);
  const [isRocketStatsBorderlessTutorialDismissedLocal, setIsRocketStatsBorderlessTutorialDismissedLocal] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Keep this ref StrictMode-safe: development double-invokes mount/cleanup.
    // Without resetting to true on mount, cleanup from the first pass can leave
    // this ref false for the real mounted instance.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshData = useCallback(async (options?: { forceReload?: boolean }) => {
    setIsLoading(true);
    setCatalogError(null);
    try {
      const [manifestResult, nextPluginsState, winLossState] = await Promise.all([
        loadPluginManifest({ forceReload: options?.forceReload === true }),
        readPluginsState(),
        getWinLossOverlayRuntimeState(),
      ]);
      setPluginsState(nextPluginsState);
      setRuntimeState(winLossState);
      setSettingsDraft(readWinLossOverlayThemeSettingsFromPluginsState(nextPluginsState, pluginId));

      if (!manifestResult.ok || !manifestResult.manifest) {
        setManifestEntry(null);
        setPluginDetail(null);
        setCatalogError(manifestResult.message ?? "Plugin detail is unavailable. Please try again later.");
        return;
      }

      const matchingManifestEntry = manifestResult.manifest.plugins.find((entry) => entry.id === pluginId) ?? null;
      setManifestEntry(matchingManifestEntry);
      if (!matchingManifestEntry) {
        setPluginDetail(null);
        setWorkshopCatalog([]);
        setWorkshopActiveMap(null);
        setWorkshopLegacyBackupNotice(null);
        setWorkshopActionGuidance(null);
        setWorkshopLoadingMapId(null);
        setWorkshopLoadingMapName("");
        setIsWorkshopLoadProgressOpen(false);
        setIsWorkshopFirstTimeSetupOpen(false);
        setWorkshopFirstTimeSetupWarning(null);
        setWorkshopPendingSetupMap(null);
        setWorkshopLoadRestartRequired(true);
        return;
      }

      const detailResult = await loadPluginDetail(
        matchingManifestEntry.id,
        matchingManifestEntry.manifest_path,
        {
          allowCacheFallback: true,
        },
      );

      if (detailResult.ok && detailResult.detail) {
        setPluginDetail(detailResult.detail);
      } else {
        setPluginDetail(null);
      }

      if (matchingManifestEntry.id === WORKSHOP_MAP_LOADER_PLUGIN_ID) {
        setIsWorkshopCatalogLoading(true);
        const appDataPaths = await getLocalAppDataPaths();
        const appState = await loadAppState();
        const rocketLeaguePath = typeof appState.rocketLeaguePath === "string"
          ? appState.rocketLeaguePath
          : "";
        const [catalogResult, activeMapResult] = await Promise.all([
          getWorkshopMapsCatalog(appDataPaths.appDataRoot),
          getWorkshopActiveMapStatus(appDataPaths.appDataRoot, rocketLeaguePath),
        ]);

        if (catalogResult.ok) {
          setWorkshopCatalog(catalogResult.maps);
          setWorkshopCatalogSource(catalogResult.source);
        } else {
          setWorkshopCatalog([]);
          setWorkshopCatalogSource("cache");
        }

        if (activeMapResult.ok) {
          setWorkshopActiveMap(activeMapResult.activeMap);
          setWorkshopLegacyBackupNotice(activeMapResult.legacyBackupNotice);
        } else {
          setWorkshopActiveMap(null);
          setWorkshopLegacyBackupNotice(null);
        }
        setIsWorkshopCatalogLoading(false);
      } else {
        setWorkshopCatalog([]);
        setWorkshopCatalogSource("cache");
        setWorkshopSearchQuery("");
        setWorkshopActiveMap(null);
        setWorkshopLegacyBackupNotice(null);
        setWorkshopActionGuidance(null);
        setWorkshopLoadingMapId(null);
        setWorkshopLoadingMapName("");
        setIsWorkshopLoadProgressOpen(false);
        setIsWorkshopFirstTimeSetupOpen(false);
        setWorkshopFirstTimeSetupWarning(null);
        setWorkshopPendingSetupMap(null);
        setWorkshopLoadRestartRequired(true);
      }
    } catch (error: unknown) {
      console.error(`Plugin detail refresh failed: ${String(error)}`);
      setCatalogError("Plugin detail is unavailable. Please try again later.");
      setManifestEntry(null);
      setPluginDetail(null);
      setWorkshopCatalog([]);
      setWorkshopActiveMap(null);
      setWorkshopLegacyBackupNotice(null);
      setWorkshopActionGuidance(null);
      setWorkshopLoadingMapId(null);
      setWorkshopLoadingMapName("");
      setIsWorkshopLoadProgressOpen(false);
      setIsWorkshopFirstTimeSetupOpen(false);
      setWorkshopFirstTimeSetupWarning(null);
      setWorkshopPendingSetupMap(null);
      setWorkshopLoadRestartRequired(true);
    } finally {
      setIsWorkshopCatalogLoading(false);
      setIsLoading(false);
    }
  }, [pluginId]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    void ensureRocketStatsAzonixFontLoaded();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    void (async () => {
      const nextUnlisten = await listenWinLossOverlayRuntimeState((state) => {
        if (!isMounted) {
          return;
        }
        setRuntimeState(state);
      });

      if (!isMounted) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    })();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const pluginStateEntry = pluginId.length > 0 ? pluginsState[pluginId] : undefined;
  const isInstalled = pluginStateEntry?.installed === true;
  const isEnabled = isInstalled && pluginStateEntry?.enabled === true;
  const isWinLossRuntime = manifestEntry?.runtime === WIN_LOSS_RUNTIME_ID;
  const isWorkshopMapLoader = manifestEntry?.id === WORKSHOP_MAP_LOADER_PLUGIN_ID;
  const supportsEnableDisable = pluginSupportsEnableDisable({
    manifestEntry,
    detail: pluginDetail,
  });
  const runtimeStatus = manifestEntry
    ? readPluginRuntimeStatus({
      manifestEntry,
      runtimeState,
      isEnabled,
      isInstalled,
    })
    : {
      label: "Stopped",
      className: "plugins-runtime-pill is-stopped",
    };
  const presentation = resolvePluginPresentation({
    manifestEntry,
    detail: pluginDetail,
  });
  const iconUrl = getPluginIconUrl(pluginDetail, manifestEntry);
  const bannerUrl = getPluginBannerUrl(pluginDetail, manifestEntry) ?? DEFAULT_PLUGIN_BANNER_URL;
  const longDescriptionMarkdown = resolveLongDescriptionMarkdown(presentation.longDescriptionMarkdown);
  const isAnyActionBusy = isAnyPluginActionBusyForPlugin(actionBusyState, pluginId);
  const hasSeenRocketStatsBorderlessTutorialFromState = hasSeenRocketStatsBorderlessTutorial(pluginStateEntry);
  const filteredWorkshopMaps = useMemo(
    () => filterWorkshopMapsByQuery(workshopCatalog, workshopSearchQuery).slice(0, WORKSHOP_MAP_CARD_LIMIT),
    [workshopCatalog, workshopSearchQuery],
  );
  const shouldShowDisable = supportsEnableDisable && shouldShowDisableControl({
    isInstalled,
    isEnabled,
    isWinLossRuntime,
    runtimeState: isWinLossRuntime ? runtimeState : undefined,
  });
  const installStateLabel = isInstalled
    ? (supportsEnableDisable ? "Installed" : "Installed / Ready")
    : "Not installed";

  useEffect(() => {
    if (!shouldAutoOpenRocketStatsBorderlessTutorial({
      isInstalled,
      isWinLossRuntime,
      hasSeenTutorial: hasSeenRocketStatsBorderlessTutorialFromState || isRocketStatsBorderlessTutorialDismissedLocal,
    })) {
      return;
    }
    setIsRocketStatsBorderlessTutorialOpen(true);
  }, [
    hasSeenRocketStatsBorderlessTutorialFromState,
    isInstalled,
    isRocketStatsBorderlessTutorialDismissedLocal,
    isWinLossRuntime,
  ]);

  useEffect(() => {
    if (isWinLossRuntime) {
      return;
    }
    setIsRocketStatsBorderlessTutorialOpen(false);
  }, [isWinLossRuntime]);

  useEffect(() => {
    setIsRocketStatsBorderlessTutorialDismissedLocal(false);
  }, [pluginId]);

  useEffect(() => {
    if (!isWorkshopMapLoader || !isInstalled || workshopCatalog.length === 0) {
      return;
    }

    const mapsNeedingMetadata = workshopCatalog
      .filter((mapItem) => mapItem.shortDescription.toLowerCase().startsWith("workshop map by"))
      .slice(0, 24);
    if (mapsNeedingMetadata.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const paths = await getLocalAppDataPaths();
      const updatePairs = await Promise.all(
        mapsNeedingMetadata.map(async (mapItem) => {
          const cacheResult = await cacheWorkshopMapAssets({
            appDataRoot: paths.appDataRoot,
            mapId: mapItem.id,
          });
          if (!cacheResult.ok) {
            return null;
          }

          return {
            id: mapItem.id,
            shortDescription: cacheResult.shortDescription,
          };
        }),
      );

      if (cancelled) {
        return;
      }

      const updates = new Map<number, string>();
      for (const pair of updatePairs) {
        if (!pair || pair.shortDescription.trim().length === 0) {
          continue;
        }
        updates.set(pair.id, pair.shortDescription.trim());
      }

      if (updates.size === 0) {
        return;
      }

      setWorkshopCatalog((current) => current.map((mapItem) => {
        const nextDescription = updates.get(mapItem.id);
        if (!nextDescription) {
          return mapItem;
        }

        return {
          ...mapItem,
          shortDescription: nextDescription,
        };
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [isInstalled, isWorkshopMapLoader, workshopCatalog]);

  const syncSettings = useCallback(async (settings: WinLossOverlayThemeSettings): Promise<void> => {
    await broadcastWinLossOverlayThemeSettings(settings);
    const layoutResult = await applyWinLossOverlayWindowLayout(settings);
    if (!layoutResult.ok && layoutResult.details) {
      console.error(layoutResult.details);
    }
  }, []);

  const updateSettingsDraft = useCallback((updater: (current: WinLossOverlayThemeSettings) => WinLossOverlayThemeSettings) => {
    setSettingsDraft((current) => {
      const next = sanitizeWinLossOverlayThemeSettings(updater(current));
      void syncSettings(next);
      return next;
    });
  }, [syncSettings]);

  const handleOpenExternalLink = useCallback((url: string) => {
    setExternalLinkStatus(null);
    setExternalLinkStatusTone("success");
    void (async () => {
      const result = await openPluginExternalLink(url);
      setExternalLinkStatus(result.message);
      setExternalLinkStatusTone(result.ok ? "success" : "error");
    })();
  }, []);

  const runPluginAction = useCallback(async (
    actionName: PluginActionName,
    action: () => Promise<RuntimeActionResultWithState>,
    options?: {
      timeoutMs?: number | null;
      timeoutMessage?: string;
      fallbackMessage?: string;
    },
  ) => {
    setActionStatus(null);
    setActionStatusTone("success");

    const result = await runPluginActionWithBusyState({
      pluginId,
      action: actionName,
      actionRunner: action,
      setBusyState: setActionBusyState,
      fallbackMessage: options?.fallbackMessage ?? "Plugin action failed.",
      timeoutMs: options?.timeoutMs ?? resolvePluginActionTimeoutMs(actionName),
      timeoutMessage: options?.timeoutMessage,
    });

    if (!isMountedRef.current) {
      return;
    }

    setActionStatus(result.message);
    setActionStatusTone(result.ok ? "success" : "error");
    if (!result.ok && result.details) {
      console.error(result.details);
    }
    if (result.state) {
      setRuntimeState(result.state);
    }

    await refreshData();
  }, [pluginId, refreshData]);

  const persistRocketStatsBorderlessTutorialSeen = useCallback(async () => {
    if (pluginId.length === 0) {
      return;
    }

    try {
      const state = await loadAppState();
      const currentPlugins = state.plugins ?? {};
      const currentPlugin = currentPlugins[pluginId] ?? {};
      const currentTutorials = currentPlugin.tutorials ?? ROCKETSTATS_PLUGIN_TUTORIALS_EMPTY;
      if (currentTutorials[ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY] === true) {
        return;
      }

      const nextTutorials: Record<string, boolean | undefined> = {
        ...currentTutorials,
        [ROCKETSTATS_BORDERLESS_TUTORIAL_FLAG_KEY]: true,
      };

      const nextPlugin: PluginStateEntry = {
        ...currentPlugin,
        tutorials: nextTutorials,
        updated_at: new Date().toISOString(),
      };

      await saveAppState({
        ...state,
        plugins: {
          ...currentPlugins,
          [pluginId]: nextPlugin,
        },
      });

      if (!isMountedRef.current) {
        return;
      }

      setPluginsState((current) => ({
        ...current,
        [pluginId]: {
          ...(current[pluginId] ?? {}),
          ...nextPlugin,
        },
      }));
    } catch (error: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      console.error(`RocketStats tutorial preference save failed: ${String(error)}`);
      setActionStatus(ROCKETSTATS_BORDERLESS_TUTORIAL_WARNING_MESSAGE);
      setActionStatusTone("error");
    }
  }, [pluginId]);

  const handleCloseRocketStatsBorderlessTutorial = useCallback(() => {
    setIsRocketStatsBorderlessTutorialOpen(false);
    setIsRocketStatsBorderlessTutorialDismissedLocal(true);
    void persistRocketStatsBorderlessTutorialSeen();
  }, [persistRocketStatsBorderlessTutorialSeen]);

  const handleEnablePlugin = useCallback(async (): Promise<RuntimeActionResultWithState> => {
    if (!manifestEntry) {
      return {
        ok: false,
        message: "Plugin detail is unavailable. Please retry.",
      };
    }

    const persistResult = await setPluginEnabled(manifestEntry.id, true);
    if (!persistResult.ok) {
      return persistResult;
    }

    const runtimeId = getRuntimeIdForPlugin(manifestEntry.id, {
      runtime: manifestEntry.runtime,
    });
    if (!runtimeId) {
      return persistResult;
    }

    const appState = await loadAppState();
    const configuredPath = typeof appState.rocketLeaguePath === "string" ? appState.rocketLeaguePath : "";
    let rocketLeaguePathForRuntime = configuredPath;
    if (runtimeRequiresRocketLeaguePath(runtimeId)) {
      const pathGuard = await ensureRocketLeaguePathForActions(configuredPath);
      if (!pathGuard.ok) {
        navigate("/settings");
        await setPluginEnabled(manifestEntry.id, false);
        return {
          ok: false,
          message: pathGuard.message,
        };
      }
      rocketLeaguePathForRuntime = pathGuard.rocketLeaguePath;
    }

    const appDataPaths = await getLocalAppDataPaths();
    const startResult = await startPluginRuntimeLifecycle({
      pluginId: manifestEntry.id,
      runtimeId,
      rocketLeaguePath: rocketLeaguePathForRuntime,
      appDataRoot: appDataPaths.appDataRoot,
      overlayLayout: isWinLossRuntime ? {
        ...resolveWinLossOverlayWindowLayout(settingsDraft),
      } : undefined,
    });
    if (!startResult.ok) {
      await setPluginEnabled(manifestEntry.id, false);
      return startResult;
    }

    if (isWinLossRuntime) {
      await syncSettings(settingsDraft);
    }

    return {
      ok: true,
      message: startResult.message,
      state: startResult.state,
    };
  }, [isWinLossRuntime, manifestEntry, navigate, settingsDraft, syncSettings]);

  const handleDisablePlugin = useCallback(async (): Promise<RuntimeActionResultWithState> => {
    if (!manifestEntry) {
      return {
        ok: false,
        message: "Plugin detail is unavailable. Please retry.",
      };
    }

    const runtimeId = getRuntimeIdForPlugin(manifestEntry.id, {
      runtime: manifestEntry.runtime,
    });
    if (runtimeId) {
      const stopResult = await stopPluginRuntimeLifecycle({
        pluginId: manifestEntry.id,
        runtimeId,
      });
      if (!stopResult.ok) {
        return stopResult;
      }
    }

    const persistResult = await setPluginEnabled(manifestEntry.id, false);
    if (!persistResult.ok) {
      return persistResult;
    }

    return {
      ok: true,
      message: runtimeId ? "Overlay runtime stopped." : "Plugin disabled.",
    };
  }, [manifestEntry]);

  const handleRefreshWorkshopMaps = useCallback(async (): Promise<RuntimeActionResultWithState> => {
    setWorkshopActionGuidance(null);
    const paths = await getLocalAppDataPaths();
    const refreshResult = await refreshWorkshopMapsCatalog(paths.appDataRoot);
    if (!refreshResult.ok) {
      return {
        ok: false,
        message: refreshResult.message,
        details: refreshResult.details,
      };
    }

    setWorkshopCatalog(refreshResult.maps);
    setWorkshopCatalogSource(refreshResult.source);
    return {
      ok: true,
      message: `Workshop maps refreshed (${refreshResult.maps.length}).`,
    };
  }, []);

  const executeWorkshopMapLoad = useCallback(async (params: {
    mapItem: WorkshopMapCatalogItem;
    appDataRoot: string;
    rocketLeaguePath: string;
    firstTimeSetupRequired: boolean;
  }): Promise<RuntimeActionResultWithState> => {
    const { mapItem, appDataRoot, rocketLeaguePath, firstTimeSetupRequired } = params;
    if (isMountedRef.current) {
      setWorkshopLoadingMapId(mapItem.id);
      setWorkshopLoadingMapName(mapItem.name);
      setIsWorkshopLoadProgressOpen(true);
    }

    await waitForWorkshopLoadProgressModalPaint();

    let loadResult: Awaited<ReturnType<typeof loadWorkshopMap>>;
    try {
      loadResult = await loadWorkshopMap({
        appDataRoot,
        rocketLeaguePath,
        mapId: mapItem.id,
      });
    } finally {
      if (isMountedRef.current) {
        setIsWorkshopLoadProgressOpen(false);
        setWorkshopLoadingMapId(null);
      }
    }

    if (!loadResult.ok) {
      return {
        ok: false,
        message: loadResult.message,
        details: loadResult.details,
      };
    }

    const restartRequired = firstTimeSetupRequired || loadResult.restartRequired;
    const successMessage = resolveWorkshopLoadSuccessMessage(restartRequired);
    setWorkshopActiveMap(loadResult.activeMap);
    setWorkshopLoadRestartRequired(restartRequired);
    setWorkshopActionGuidance(successMessage);
    setWorkshopPendingSetupMap(null);
    setWorkshopFirstTimeSetupWarning(null);
    setIsWorkshopFirstTimeSetupOpen(false);
    if (shouldOpenWorkshopPostLoadTutorial(loadResult.ok)) {
      setIsWorkshopLoadTutorialOpen(true);
    }
    return {
      ok: true,
      message: successMessage,
    };
  }, []);

  const handleLoadWorkshopMap = useCallback(async (
    mapItem: WorkshopMapCatalogItem,
    options?: { retryingFirstTimeSetup?: boolean },
  ): Promise<RuntimeActionResultWithState> => {
    setWorkshopActionGuidance(null);
    setIsWorkshopLoadTutorialOpen(false);
    setWorkshopLoadRestartRequired(true);
    setWorkshopFirstTimeSetupWarning(null);
    const appState = await loadAppState();
    const configuredPath = typeof appState.rocketLeaguePath === "string" ? appState.rocketLeaguePath : "";
    const pathGuard = await ensureRocketLeaguePathForActions(configuredPath);
    if (!pathGuard.ok) {
      navigate("/settings");
      return {
        ok: false,
        message: pathGuard.message,
      };
    }

    const paths = await getLocalAppDataPaths();
    const preflightResult = await getWorkshopLoadPreflight({
      appDataRoot: paths.appDataRoot,
      rocketLeaguePath: pathGuard.rocketLeaguePath,
    });
    if (!preflightResult.ok) {
      return {
        ok: false,
        message: preflightResult.message,
        details: preflightResult.details,
      };
    }

    if (preflightResult.firstTimeSetupRequired && preflightResult.rocketLeagueRunning) {
      setWorkshopPendingSetupMap(mapItem);
      setIsWorkshopFirstTimeSetupOpen(true);
      setIsWorkshopLoadProgressOpen(false);
      if (options?.retryingFirstTimeSetup) {
        setWorkshopFirstTimeSetupWarning(WORKSHOP_FIRST_TIME_SETUP_STILL_RUNNING_MESSAGE);
      }
      return {
        ok: true,
        message: "",
      };
    }

    setWorkshopPendingSetupMap(null);
    setWorkshopFirstTimeSetupWarning(null);
    setIsWorkshopFirstTimeSetupOpen(false);
    return executeWorkshopMapLoad({
      mapItem,
      appDataRoot: paths.appDataRoot,
      rocketLeaguePath: pathGuard.rocketLeaguePath,
      firstTimeSetupRequired: preflightResult.firstTimeSetupRequired,
    });
  }, [executeWorkshopMapLoad, navigate]);

  const requestWorkshopMapLoad = useCallback((
    mapItem: WorkshopMapCatalogItem,
    options?: { retryingFirstTimeSetup?: boolean },
  ) => {
    void runPluginAction(
      "loadWorkshopMap",
      async () => handleLoadWorkshopMap(mapItem, options),
      {
        timeoutMs: null,
        fallbackMessage: "Could not load workshop map.",
      },
    );
  }, [handleLoadWorkshopMap, runPluginAction]);

  const handleRetryWorkshopFirstTimeSetup = useCallback(() => {
    if (!workshopPendingSetupMap) {
      setIsWorkshopFirstTimeSetupOpen(false);
      setWorkshopFirstTimeSetupWarning(null);
      return;
    }
    requestWorkshopMapLoad(workshopPendingSetupMap, {
      retryingFirstTimeSetup: true,
    });
  }, [requestWorkshopMapLoad, workshopPendingSetupMap]);

  const handleRestoreWorkshopMap = useCallback(async (): Promise<RuntimeActionResultWithState> => {
    setWorkshopActionGuidance(null);
    setIsWorkshopLoadTutorialOpen(false);
    setIsWorkshopLoadProgressOpen(false);
    setIsWorkshopFirstTimeSetupOpen(false);
    setWorkshopPendingSetupMap(null);
    setWorkshopFirstTimeSetupWarning(null);
    const appState = await loadAppState();
    const configuredPath = typeof appState.rocketLeaguePath === "string" ? appState.rocketLeaguePath : "";
    const pathGuard = await ensureRocketLeaguePathForActions(configuredPath);
    if (!pathGuard.ok) {
      navigate("/settings");
      return {
        ok: false,
        message: pathGuard.message,
      };
    }

    const paths = await getLocalAppDataPaths();
    const restoreResult = await restoreWorkshopOriginalMap({
      appDataRoot: paths.appDataRoot,
      rocketLeaguePath: pathGuard.rocketLeaguePath,
    });
    if (!restoreResult.ok) {
      return {
        ok: false,
        message: restoreResult.message,
        details: restoreResult.details,
      };
    }

    setWorkshopActiveMap(null);
    setWorkshopActionGuidance(restoreResult.message);
    return {
      ok: true,
      message: restoreResult.message,
    };
  }, [navigate]);

  if (isLoading) {
    return (
      <section className="page">
        <div className="plugins-coming-soon">
          <h2 className="catalog-heading">Loading</h2>
          <p className="plugins-coming-copy">Loading plugin detail...</p>
        </div>
      </section>
    );
  }

  if (catalogError) {
    return (
      <section className="page">
        <div className="plugins-coming-soon">
          <h2 className="catalog-heading">Plugin detail unavailable</h2>
          <p className="plugins-coming-copy">{catalogError}</p>
          <div className="plugins-card-actions">
            <button
              type="button"
              className="settings-btn-secondary"
              onClick={() => {
                void refreshData({ forceReload: true });
              }}
            >
              Retry
            </button>
            <button
              type="button"
              className="settings-btn-secondary"
              onClick={() => {
                navigate("/plugins");
              }}
            >
              Back to Plugins
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!manifestEntry) {
    return (
      <section className="page">
        <div className="plugins-coming-soon">
          <h2 className="catalog-heading">Plugin not found</h2>
          <p className="plugins-coming-copy">
            The requested plugin is not in the current catalog.
          </p>
          <button
            type="button"
            className="settings-btn-secondary"
            onClick={() => {
              navigate("/plugins");
            }}
          >
            Back to Plugins
          </button>
        </div>
      </section>
    );
  }

  const isInstallBusy = isPluginActionBusy(actionBusyState, pluginId, "install");
  const isUninstallBusy = isPluginActionBusy(actionBusyState, pluginId, "uninstall");
  const isEnableBusy = isPluginActionBusy(actionBusyState, pluginId, "enable");
  const isDisableBusy = isPluginActionBusy(actionBusyState, pluginId, "disable");
  const isForceStopBusy = isPluginActionBusy(actionBusyState, pluginId, "forceStop");
  const isResetBusy = isPluginActionBusy(actionBusyState, pluginId, "resetSession");
  const isShowBusy = isPluginActionBusy(actionBusyState, pluginId, "showOverlay");
  const isHideBusy = isPluginActionBusy(actionBusyState, pluginId, "hideOverlay");
  const isOpenLogsBusy = isPluginActionBusy(actionBusyState, pluginId, "openLogs");
  const isSaveSettingsBusy = isPluginActionBusy(actionBusyState, pluginId, "saveOverlaySettings");
  const isResetSettingsBusy = isPluginActionBusy(actionBusyState, pluginId, "resetOverlaySettings");
  const isRefreshWorkshopBusy = isPluginActionBusy(actionBusyState, pluginId, "refreshWorkshopMaps");
  const isLoadWorkshopBusy = isPluginActionBusy(actionBusyState, pluginId, "loadWorkshopMap");
  const isRestoreWorkshopBusy = isPluginActionBusy(actionBusyState, pluginId, "restoreWorkshopMap");
  const isOpenWorkshopCacheBusy = isPluginActionBusy(actionBusyState, pluginId, "openWorkshopCache");
  const isOpenWorkshopLogsBusy = isPluginActionBusy(actionBusyState, pluginId, "openWorkshopLogs");

  const actionControlsCard = (
    <article className="plugin-detail-card">
      <h3 className="catalog-heading">Plugin controls</h3>
      <div className="plugins-card-actions">
        {!isInstalled ? (
          <button
            type="button"
            className="settings-btn-primary"
            disabled={isInstallBusy || isAnyActionBusy}
            onClick={() => {
              void runPluginAction("install", async () => installPlugin(manifestEntry));
            }}
          >
            Install
          </button>
        ) : null}

        {isInstalled ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isUninstallBusy || isAnyActionBusy}
            onClick={() => {
              void runPluginAction("uninstall", async () => {
                const runtimeId = getRuntimeIdForPlugin(manifestEntry.id, {
                  runtime: manifestEntry.runtime,
                });
                if (runtimeId) {
                  const stopResult = await stopPluginRuntimeLifecycle({
                    pluginId: manifestEntry.id,
                    runtimeId,
                  });
                  if (!stopResult.ok) {
                    await forceStopPluginRuntimeLifecycle({
                      pluginId: manifestEntry.id,
                      runtimeId,
                    });
                  }
                }

                return uninstallPlugin(manifestEntry.id);
              });
            }}
          >
            Uninstall
          </button>
        ) : null}

        {supportsEnableDisable && isInstalled && !isEnabled && !shouldShowDisable ? (
          <button
            type="button"
            className="settings-btn-primary"
            disabled={isEnableBusy || isAnyActionBusy}
            onClick={() => {
              void runPluginAction("enable", handleEnablePlugin);
            }}
          >
            Enable
          </button>
        ) : null}

        {supportsEnableDisable && isInstalled && shouldShowDisable ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isDisableBusy}
            onClick={() => {
              void runPluginAction("disable", handleDisablePlugin);
            }}
          >
            Disable
          </button>
        ) : null}
      </div>
      {!isInstalled ? (
        <p className="plugin-detail-hint">
          Install this plugin to unlock plugin actions and settings.
        </p>
      ) : null}
    </article>
  );

  const runtimeControlsCard = (
    <article className="plugin-detail-card">
      <h3 className="catalog-heading">{isWorkshopMapLoader ? "Plugin actions" : "Runtime controls"}</h3>
      {!isWinLossRuntime && !isWorkshopMapLoader ? (
        <p className="plugin-detail-hint">
          Runtime controls for this plugin will appear here after runtime support is added.
        </p>
      ) : null}
      <div className="plugins-card-actions">
        {isWinLossRuntime ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isShowBusy}
            onClick={() => {
              void runPluginAction("showOverlay", async () => showPluginRuntimeLifecycle({
                pluginId: manifestEntry.id,
                runtimeId: getRuntimeIdForPlugin(manifestEntry.id, {
                  runtime: manifestEntry.runtime,
                }),
                overlayLayout: resolveWinLossOverlayWindowLayout(settingsDraft),
              }));
            }}
          >
            Show overlay
          </button>
        ) : null}

        {isWinLossRuntime ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isHideBusy}
            onClick={() => {
              void runPluginAction("hideOverlay", async () => hidePluginRuntimeLifecycle({
                pluginId: manifestEntry.id,
                runtimeId: getRuntimeIdForPlugin(manifestEntry.id, {
                  runtime: manifestEntry.runtime,
                }),
              }));
            }}
          >
            Hide overlay
          </button>
        ) : null}

        {isWinLossRuntime ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isForceStopBusy}
            onClick={() => {
              void runPluginAction("forceStop", async () => forceStopPluginRuntimeLifecycle({
                pluginId: manifestEntry.id,
                runtimeId: getRuntimeIdForPlugin(manifestEntry.id, {
                  runtime: manifestEntry.runtime,
                }),
              }));
            }}
          >
            Force stop overlay
          </button>
        ) : null}

        {isWinLossRuntime ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isResetBusy}
            onClick={() => {
              void runPluginAction("resetSession", async () => resetWinLossOverlaySession());
            }}
          >
            Reset session
          </button>
        ) : null}

        {isWinLossRuntime ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isOpenLogsBusy}
            onClick={() => {
              void runPluginAction("openLogs", async () => {
                const paths = await getLocalAppDataPaths();
                return openWinLossOverlayRuntimeLogsFolder(paths.appDataRoot);
              });
            }}
          >
            Open logs folder
          </button>
        ) : null}

        {isWinLossRuntime ? (
          <button
            type="button"
            className="settings-btn-secondary"
            onClick={() => {
              setIsRocketStatsBorderlessTutorialOpen(true);
            }}
          >
            {ROCKETSTATS_BORDERLESS_TUTORIAL_GUIDANCE_BUTTON_LABEL}
          </button>
        ) : null}

        {isWorkshopMapLoader ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isRefreshWorkshopBusy}
            onClick={() => {
              void runPluginAction("refreshWorkshopMaps", handleRefreshWorkshopMaps);
            }}
          >
            Refresh maps
          </button>
        ) : null}

        {isWorkshopMapLoader ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isRestoreWorkshopBusy || isLoadWorkshopBusy}
            onClick={() => {
              void runPluginAction("restoreWorkshopMap", handleRestoreWorkshopMap);
            }}
          >
            Remove loaded map
          </button>
        ) : null}

        {isWorkshopMapLoader ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isOpenWorkshopCacheBusy}
            onClick={() => {
              void runPluginAction("openWorkshopCache", async () => {
                const paths = await getLocalAppDataPaths();
                return openWorkshopCacheFolder(paths.appDataRoot);
              });
            }}
          >
            Open cache folder
          </button>
        ) : null}

        {isWorkshopMapLoader ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isOpenWorkshopLogsBusy}
            onClick={() => {
              void runPluginAction("openWorkshopLogs", async () => {
                const paths = await getLocalAppDataPaths();
                return openWorkshopRuntimeLogsFolder(paths.appDataRoot);
              });
            }}
          >
            Open logs folder
          </button>
        ) : null}
      </div>
      {isWorkshopMapLoader ? (
        <div className="workshop-active-state">
          <p className="plugins-runtime-session-line">
            <strong>Active map:</strong>{" "}
            {workshopActiveMap ? workshopActiveMap.name : "Original map restored"}
          </p>
          <p className="plugins-runtime-session-line">
            <strong>Catalog source:</strong> {workshopCatalogSource}
          </p>
          {workshopActionGuidance ? (
            <p className="workshop-action-guidance" role="status">
              {workshopActionGuidance}
            </p>
          ) : null}
          {workshopLegacyBackupNotice ? (
            <p className="plugin-detail-hint workshop-legacy-note" role="status">
              {workshopLegacyBackupNotice}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );

  const overlaySettingsCard = (
    <article className="plugin-detail-card">
      <h3 className="catalog-heading">Overlay settings</h3>
      <WinLossOverlaySettingsSection
        runtimeState={runtimeState}
        settingsDraft={settingsDraft}
        availableThemes={availableThemes}
        isSaveSettingsBusy={isSaveSettingsBusy}
        isResetSettingsBusy={isResetSettingsBusy}
        onThemeChange={(themeId) => {
          updateSettingsDraft((current) => ({
            ...current,
            theme_id: themeId,
          }));
        }}
        onScalePercentChange={(scalePercent) => {
          updateSettingsDraft((current) => ({
            ...current,
            scale: scalePercent / 100,
          }));
        }}
        onOpacityChange={(opacity) => {
          updateSettingsDraft((current) => ({
            ...current,
            opacity,
          }));
        }}
        onXChange={(x) => {
          updateSettingsDraft((current) => ({
            ...current,
            x,
          }));
        }}
        onYChange={(y) => {
          updateSettingsDraft((current) => ({
            ...current,
            y,
          }));
        }}
        onSave={() => {
          void runPluginAction("saveOverlaySettings", async () => {
            try {
              const saved = await saveWinLossOverlayThemeSettings(settingsDraft);
              setSettingsDraft(saved);
              await syncSettings(saved);
              return {
                ok: true,
                message: "Overlay settings saved.",
              };
            } catch (error: unknown) {
              return {
                ok: false,
                message: "Could not save overlay settings.",
                details: String(error),
              };
            }
          });
        }}
        onReset={() => {
          void runPluginAction("resetOverlaySettings", async () => {
            try {
              const reset = await resetWinLossOverlayThemeSettings();
              setSettingsDraft(reset);
              await syncSettings(reset);
              return {
                ok: true,
                message: "Overlay settings reset.",
              };
            } catch (error: unknown) {
              return {
                ok: false,
                message: "Could not reset overlay settings.",
                details: String(error),
              };
            }
          });
        }}
      />
    </article>
  );

  const descriptionCard = (
    <article className="plugin-detail-card">
      <h3 className="catalog-heading">Description</h3>
      <PluginLongDescriptionSection
        markdown={longDescriptionMarkdown}
        onOpenExternalLink={handleOpenExternalLink}
      />
      {presentation.attribution ? (
        <p className="plugin-detail-attribution-note">{presentation.attribution}</p>
      ) : null}
      {presentation.credits.length > 0 ? (
        <div className="plugin-detail-credits">
          <p className="plugin-detail-section-label">Credits</p>
          <ul className="plugin-detail-markdown-list">
            {presentation.credits.map((credit) => (
              <li key={`${credit.name}-${credit.role ?? ""}`}>
                <strong>{credit.name}</strong>
                {credit.role ? ` - ${credit.role}` : ""}
                {credit.license ? ` (${credit.license})` : ""}
                {credit.url ? (
                  <Fragment>
                    {" "}
                    <button
                      type="button"
                      className="plugin-detail-inline-link"
                      onClick={() => {
                        handleOpenExternalLink(credit.url ?? "");
                      }}
                    >
                      Source
                    </button>
                  </Fragment>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {presentation.externalLinks.length > 0 ? (
        <div className="plugin-detail-links">
          <p className="plugin-detail-section-label">External links</p>
          <div className="plugins-card-actions">
            {presentation.externalLinks.map((link) => (
              <button
                key={`${link.label}:${link.url}`}
                type="button"
                className="settings-btn-secondary"
                onClick={() => {
                  handleOpenExternalLink(link.url);
                }}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );

  const tutorialCard = isWorkshopMapLoader ? (
    <WorkshopTutorialSection />
  ) : undefined;
  const showOverlaySettingsInPresentation = shouldShowPluginDetailOverlaySettings(isInstalled, isWinLossRuntime);

  return (
    <section className="page plugin-detail-page">
      <div className="plugins-page-header">
        <h1>Plugin Manage</h1>
        <button
          type="button"
          className="settings-btn-secondary"
          onClick={() => {
            navigate("/plugins");
          }}
        >
          Back to Plugins
        </button>
      </div>

      {actionStatus ? (
        <p className={`plugins-action-status ${actionStatusTone === "error" ? "is-error" : "is-success"}`}>
          {actionStatus}
        </p>
      ) : null}

      {externalLinkStatus ? (
        <p className={`plugins-action-status ${externalLinkStatusTone === "error" ? "is-error" : "is-success"}`}>
          {externalLinkStatus}
        </p>
      ) : null}

      <PluginDetailTwoColumnLayout
        controls={(
          <PluginDetailControlsRegion
            isInstalled={isInstalled}
            isWinLossRuntime={isWinLossRuntime}
            actionCard={actionControlsCard}
            runtimeControlsCard={runtimeControlsCard}
            overlaySettingsCard={overlaySettingsCard}
            showOverlaySettingsInControls={!showOverlaySettingsInPresentation}
            tutorialCard={tutorialCard}
            descriptionCard={descriptionCard}
          />
        )}
        presentation={(
          <PluginDetailPresentationRegion>
            <article className="plugin-detail-hero">
              <div className="plugin-detail-banner-wrap">
                <img className="plugin-detail-banner" src={bannerUrl} alt={`${presentation.title} preview`} />
              </div>

              <header className="plugin-detail-header">
                <div className="plugin-detail-header-main">
                  {iconUrl ? (
                    <img className="plugin-detail-icon" src={iconUrl} alt="" aria-hidden="true" />
                  ) : (
                    <span className="plugin-detail-icon plugin-detail-icon-fallback" aria-hidden="true">RP</span>
                  )}
                  <div className="plugin-detail-header-copy">
                    <h2 className="plugin-detail-title">{presentation.title}</h2>
                    <p className="plugin-detail-subtitle">{presentation.shortDescription}</p>
                  </div>
                </div>
                <span className="plugins-card-version">v{manifestEntry.version}</span>
              </header>

              <div className="plugin-detail-pill-row">
                <span className="plugin-detail-meta-pill">Status: {manifestEntry.status}</span>
                <span className={`plugin-detail-meta-pill ${isInstalled ? "is-good" : ""}`}>
                  {installStateLabel}
                </span>
                {supportsEnableDisable ? (
                  <span className={`plugin-detail-meta-pill ${isEnabled ? "is-good" : ""}`}>
                    {isEnabled ? "Enabled" : "Disabled"}
                  </span>
                ) : null}
                <span className={runtimeStatus.className}>{runtimeStatus.label}</span>
                {presentation.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="plugin-detail-tag-pill">{tag}</span>
                ))}
                {presentation.categories.slice(0, 2).map((category) => (
                  <span key={category} className="plugin-detail-tag-pill">{category}</span>
                ))}
              </div>

              <p className="plugin-detail-description">
                {presentation.description}
              </p>
            </article>

            {showOverlaySettingsInPresentation ? overlaySettingsCard : null}

            {isWorkshopMapLoader ? (
              isInstalled ? (
                isWorkshopCatalogLoading ? (
                  <article className="plugin-detail-card">
                    <h3 className="catalog-heading">Workshop maps</h3>
                    <p className="plugin-detail-hint">Loading workshop maps catalog...</p>
                  </article>
                ) : (
                  <WorkshopMapCatalogSection
                    maps={filteredWorkshopMaps}
                    searchQuery={workshopSearchQuery}
                    totalMapCount={workshopCatalog.length}
                    activeMap={workshopActiveMap}
                    loadingMapId={isLoadWorkshopBusy ? workshopLoadingMapId : null}
                    isLoadBusy={isLoadWorkshopBusy}
                    onSearchQueryChange={setWorkshopSearchQuery}
                    onLoadMap={(mapItem) => {
                      requestWorkshopMapLoad(mapItem);
                    }}
                  />
                )
              ) : (
                <article className="plugin-detail-card">
                  <h3 className="catalog-heading">Workshop maps</h3>
                  <p className="plugin-detail-hint">
                    Install this plugin to browse and load workshop maps.
                  </p>
                </article>
              )
            ) : null}
          </PluginDetailPresentationRegion>
        )}
      />
      <WorkshopFirstTimeSetupModal
        isOpen={isWorkshopFirstTimeSetupOpen}
        warningMessage={workshopFirstTimeSetupWarning}
        isRetryBusy={isLoadWorkshopBusy}
        onRetry={handleRetryWorkshopFirstTimeSetup}
        onCancel={() => {
          setIsWorkshopFirstTimeSetupOpen(false);
          setWorkshopPendingSetupMap(null);
          setWorkshopFirstTimeSetupWarning(null);
        }}
      />
      <WorkshopLoadTutorialModal
        isOpen={isWorkshopLoadTutorialOpen}
        restartRequired={workshopLoadRestartRequired}
        onClose={() => {
          setIsWorkshopLoadTutorialOpen(false);
        }}
      />
      <WorkshopMapLoadProgressModal
        isOpen={isWorkshopLoadProgressOpen}
        mapName={workshopLoadingMapName}
      />
      <RocketStatsBorderlessTutorialModal
        isOpen={isRocketStatsBorderlessTutorialOpen}
        onClose={handleCloseRocketStatsBorderlessTutorial}
      />

    </section>
  );
}
