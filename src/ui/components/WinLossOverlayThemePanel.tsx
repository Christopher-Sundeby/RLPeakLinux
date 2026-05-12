import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import type { WinLossOverlayRuntimeState } from "../../modules/plugins/winLossOverlayRuntimeService";
import type { WinLossOverlayThemeSettings } from "../../modules/plugins/winLossOverlayThemeSettingsService";
import type {
  WinLossOverlayThemeElement,
  WinLossOverlayThemeTextElement,
  WinLossOverlayThemeOverride,
} from "../../modules/plugins/winLossOverlayThemeRegistry";
import {
  formatOverlayStreak,
  getRocketStatsStreakDisplay,
  formatRocketStatsSignedValue,
  getRocketStatsStreakColor,
  normalizeRocketStatsStreak,
  resolveOverlayTextColor,
  resolveOverlayThemeConfig,
  shouldRenderTextElement,
} from "../pages/winLossOverlayPageSelectors";
import {
  RLPEAK_MINIMALIST_FONT_FAMILY,
  ROCKETSTATS_AZONIX_FONT_FAMILY,
  ROCKETSTATS_MADE_TOMMY_FONT_FAMILY,
  ROCKETSTATS_NATIVE_FONT_FAMILY,
} from "../../modules/plugins/rocketStatsFontService";

interface WinLossOverlayThemePanelProps {
  runtimeState: WinLossOverlayRuntimeState;
  settings: WinLossOverlayThemeSettings;
  themeOverride?: WinLossOverlayThemeOverride;
  displayMode?: "live" | "preview";
  className?: string;
  style?: CSSProperties;
}

const ROCKETSTATS_CIRCLE_THEME_ID = "rocketstats_circle";
const ROCKETSTATS_JSTKISS_THEME_ID = "rocketstats_jstkiss";
const ROCKETSTATS_NATIVE_THEME_ID = "rocketstats_native";
const MINIMALIST_THEME_ID = "minimalist";
const ROCKETSTATS_CIRCLE_WIDTH = 400;
const ROCKETSTATS_CIRCLE_HEIGHT = 300;
const ROCKETSTATS_JSTKISS_WIDTH = 400;
const ROCKETSTATS_JSTKISS_HEIGHT = 300;
const ROCKETSTATS_NATIVE_WIDTH = 264;
const ROCKETSTATS_NATIVE_HEIGHT = 275;
const MINIMALIST_WIDTH = 146;
const MINIMALIST_HEIGHT = 177;
const ROCKETSTATS_CIRCLE_MMR_LEFT = 240;
const ROCKETSTATS_CIRCLE_STREAK_LEFT = 250;
const ROCKETSTATS_CIRCLE_WINS_LEFT = 250;
const ROCKETSTATS_CIRCLE_LOSSES_LEFT = 250;

const ROCKETSTATS_CIRCLE_MMR_TOP = 78.4;
const ROCKETSTATS_CIRCLE_STREAK_TOP = 133;
const ROCKETSTATS_CIRCLE_WINS_TOP = 173.2;
const ROCKETSTATS_CIRCLE_LOSSES_TOP = 206.3;

const ROCKETSTATS_CIRCLE_MMR_SIZE = 30;
const ROCKETSTATS_CIRCLE_STREAK_SIZE = 25;
const ROCKETSTATS_CIRCLE_WINS_SIZE = 25;
const ROCKETSTATS_CIRCLE_LOSSES_SIZE = 25;
const ROCKETSTATS_CIRCLE_STATUS_TOP = 260;
const ROCKETSTATS_CIRCLE_STATUS_LEFT = 100;
const ROCKETSTATS_CIRCLE_STATUS_SIZE = 14;
const DEFAULT_CIRCLE_BACKGROUND_URL = "/overlay-themes/rocketstats-circle/background.png";
const DEFAULT_JSTKISS_BACKGROUND_URL = "/overlay-themes/rocketstats-JSTKISS/background.png";
const DEFAULT_NATIVE_BACKGROUND_URL = "/overlay-themes/rocketstats-NativeTheme/background.png";
const DEFAULT_MINIMALIST_BACKGROUND_URL = "/overlay-themes/minimalist/background.png";
const ROCKETSTATS_CIRCLE_FONT_FAMILY = `"${ROCKETSTATS_AZONIX_FONT_FAMILY}", sans-serif`;
const ROCKETSTATS_JSTKISS_FONT_FAMILY = `"${ROCKETSTATS_MADE_TOMMY_FONT_FAMILY}", "MADE Tommy", Arial, sans-serif`;
const ROCKETSTATS_NATIVE_FONT_FAMILY_STACK = `"${ROCKETSTATS_NATIVE_FONT_FAMILY}", Arial, sans-serif`;
const MINIMALIST_FONT_FAMILY_STACK = `"${RLPEAK_MINIMALIST_FONT_FAMILY}", monospace, sans-serif`;
const ROCKETSTATS_JSTKISS_WINS_LEFT = 110;
const ROCKETSTATS_JSTKISS_WINS_TOP = 35;
const ROCKETSTATS_JSTKISS_WINS_SIZE = 34;
const ROCKETSTATS_JSTKISS_LOSSES_LEFT = 120;
const ROCKETSTATS_JSTKISS_LOSSES_TOP = 130;
const ROCKETSTATS_JSTKISS_LOSSES_SIZE = 30;
const ROCKETSTATS_JSTKISS_STREAK_LEFT = 150;
const ROCKETSTATS_JSTKISS_STREAK_TOP = 220;
const ROCKETSTATS_JSTKISS_STREAK_SIZE = 37;
const ROCKETSTATS_JSTKISS_TEXT_COLOR = "rgb(255, 255, 255)";
const ROCKETSTATS_NATIVE_MMR_LEFT = 165;
const ROCKETSTATS_NATIVE_MMR_TOP = 20.4;
const ROCKETSTATS_NATIVE_MMR_SIZE = 30;
const ROCKETSTATS_NATIVE_MMR_COLOR = "rgb(90, 64, 5)";

const ROCKETSTATS_NATIVE_STREAK_LEFT = 165;
const ROCKETSTATS_NATIVE_STREAK_TOP = 88.6;
const ROCKETSTATS_NATIVE_STREAK_SIZE = 30;
const ROCKETSTATS_NATIVE_STREAK_COLOR = "rgb(2, 66, 90)";

const ROCKETSTATS_NATIVE_WINS_LEFT = 180;
const ROCKETSTATS_NATIVE_WINS_TOP = 156.4;
const ROCKETSTATS_NATIVE_WINS_SIZE = 30;
const ROCKETSTATS_NATIVE_WINS_COLOR = "rgb(255, 255, 255)";

const ROCKETSTATS_NATIVE_LOSSES_LEFT = 180;
const ROCKETSTATS_NATIVE_LOSSES_TOP = 225.9;
const ROCKETSTATS_NATIVE_LOSSES_SIZE = 30;
const ROCKETSTATS_NATIVE_LOSSES_COLOR = "rgb(255, 255, 255)";

const ROCKETSTATS_NATIVE_TEXT_SHADOW = "0 1px 3px rgb(0 0 0 / 55%)";
const MINIMALIST_MMR_LEFT = 75;
const MINIMALIST_MMR_TOP = 9;
const MINIMALIST_MMR_SIZE = 18;
const MINIMALIST_MMR_COLOR = "rgb(200, 200, 1)";
const MINIMALIST_STREAK_LEFT = 100;
const MINIMALIST_STREAK_TOP = 35;
const MINIMALIST_STREAK_SIZE = 18;
const MINIMALIST_STREAK_COLOR = "rgb(1, 113, 167)";
const MINIMALIST_WINS_LEFT = 75;
const MINIMALIST_WINS_TOP = 61;
const MINIMALIST_WINS_SIZE = 18;
const MINIMALIST_WINS_COLOR = "rgb(1, 204, 1)";
const MINIMALIST_LOSSES_LEFT = 100;
const MINIMALIST_LOSSES_TOP = 85;
const MINIMALIST_LOSSES_SIZE = 18;
const MINIMALIST_LOSSES_COLOR = "rgb(118, 1, 1)";
const MINIMALIST_TEXT_SHADOW = "0 1px 3px rgb(0 0 0 / 55%)";

function readLegacyRocketStatsMmrValue(runtimeState: WinLossOverlayRuntimeState): number | null {
  const runtimeRecord = runtimeState as unknown as Record<string, unknown>;
  const candidates: unknown[] = [
    runtimeRecord.mmr_cumul_change,
    runtimeRecord.mmrcumulchange,
    runtimeRecord.mmrCumulChange,
    runtimeRecord.mmr_change,
    runtimeRecord.mmrChange,
    runtimeRecord.mmr,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === "string") {
      const parsed = Number.parseFloat(candidate.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function resolveOverlayMmrDisplayValue(runtimeState: WinLossOverlayRuntimeState): string {
  const legacyValue = readLegacyRocketStatsMmrValue(runtimeState);
  const effectiveDelta = runtimeState.mmr_delta ?? legacyValue;

  switch (runtimeState.mmr_status) {
    case "loading":
      return "...";
    case "syncing":
      return effectiveDelta === null ? "..." : formatRocketStatsSignedValue(effectiveDelta);
    case "ready":
      return "0";
    case "synced":
      return formatRocketStatsSignedValue(effectiveDelta ?? 0);
    case "failed":
    case "disabled":
      return "N/A";
    default:
      return effectiveDelta === null ? "..." : formatRocketStatsSignedValue(effectiveDelta);
  }
}

function toAnchorTransform(
  align: WinLossOverlayThemeTextElement["align"] | "left" | "center" | "right" | undefined,
  verticalAlign: WinLossOverlayThemeTextElement["verticalAlign"] | "top" | "middle" | "bottom" | undefined,
): string {
  const xTransform = align === "center"
    ? "-50%"
    : align === "right"
      ? "-100%"
      : "0";
  const yTransform = verticalAlign === "middle"
    ? "-50%"
    : verticalAlign === "bottom"
      ? "-100%"
      : "0";
  return `translate(${xTransform}, ${yTransform})`;
}

function toNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function resolveCoordinateValue(value: number | string, axisSize: number): number {
  if (typeof value === "number") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  const asNumber = Number.parseFloat(trimmed);
  if (Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return asNumber;
  }

  const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percentMatch) {
    const percentage = Number.parseFloat(percentMatch[1]);
    return (axisSize * percentage) / 100;
  }

  const pixelsMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (pixelsMatch) {
    return Number.parseFloat(pixelsMatch[1]);
  }

  const expressionMatch = trimmed.match(
    /^(-?\d+(?:\.\d+)?)%\s*([+-])\s*(-?\d+(?:\.\d+)?)px$/i,
  );
  if (expressionMatch) {
    const percentage = Number.parseFloat(expressionMatch[1]);
    const operator = expressionMatch[2];
    const pixels = Number.parseFloat(expressionMatch[3]);
    const percentageValue = (axisSize * percentage) / 100;
    return operator === "-" ? percentageValue - pixels : percentageValue + pixels;
  }

  return 0;
}

function resolveTextValue(
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
      return resolveOverlayMmrDisplayValue(runtimeState);
    case "status":
      return runtimeState.status;
    default:
      return "";
  }
}

function renderThemeElement(
  element: WinLossOverlayThemeElement,
  params: {
    runtimeState: WinLossOverlayRuntimeState;
    settings: WinLossOverlayThemeSettings;
    shadowColor: string;
    theme: ReturnType<typeof resolveOverlayThemeConfig>;
    brokenImageIds: Set<string>;
    markImageBroken: (id: string) => void;
  },
): ReactElement | null {
  if (element.visible === false) {
    return null;
  }

  const {
    runtimeState,
    settings,
    shadowColor,
    theme,
    brokenImageIds,
    markImageBroken,
  } = params;

  if (element.type === "image") {
    if (brokenImageIds.has(element.id)) {
      return null;
    }

    const imageScale = Number.isFinite(element.scale) ? Number(element.scale) : 1;
    const left = toNumber(resolveCoordinateValue(element.x, theme.baseWidth));
    const top = toNumber(resolveCoordinateValue(element.y, theme.baseHeight));
    const width = typeof element.width === "number" ? toNumber(element.width) : undefined;
    const height = typeof element.height === "number" ? toNumber(element.height) : undefined;
    const transform = `${toAnchorTransform(element.align, element.verticalAlign)} scale(${imageScale})`;
    return (
      <img
        key={element.id}
        className="overlay-theme-image"
        src={element.src}
        alt=""
        draggable={false}
        style={{
          left,
          top,
          width,
          height,
          transform,
          transformOrigin: "top left",
          opacity: typeof element.opacity === "number"
            ? Math.max(0, Math.min(1, element.opacity))
            : 1,
        }}
        onError={() => {
          markImageBroken(element.id);
        }}
      />
    );
  }

  if (!shouldRenderTextElement(element, settings)) {
    return null;
  }

  const value = resolveTextValue(element, runtimeState, settings);
  const color = resolveOverlayTextColor(element, value, theme);
  const baseFontSize = Number.isFinite(element.scale)
    ? theme.baseFontSize * Number(element.scale)
    : element.fontSize ?? theme.baseFontSize;
  const fontSize = toNumber(baseFontSize);
  const transform = toAnchorTransform(element.align, element.verticalAlign);
  const textShadowDistance = Math.round(theme.shadowOffset);
  const textShadow = textShadowDistance > 0
    ? `${textShadowDistance}px ${textShadowDistance}px 0 ${shadowColor}`
    : "none";
  const left = toNumber(resolveCoordinateValue(element.x, theme.baseWidth));
  const top = toNumber(resolveCoordinateValue(element.y, theme.baseHeight));

  return (
    <span
      key={element.id}
      className={`overlay-theme-text overlay-theme-text-${element.id}`}
      style={{
        left,
        top,
        color,
        fontSize,
        transform,
        fontWeight: element.fontWeight ?? 400,
        letterSpacing: typeof element.letterSpacing === "number" ? `${element.letterSpacing}px` : undefined,
        textShadow,
      }}
    >
      {value}
    </span>
  );
}

function renderCirclePanel(
  runtimeState: WinLossOverlayRuntimeState,
  settings: WinLossOverlayThemeSettings,
  displayMode: "live" | "preview",
  className: string | undefined,
  style: CSSProperties | undefined,
  resolvedTheme: ReturnType<typeof resolveOverlayThemeConfig>,
  renderScale: number,
  overlayWidth: number,
  overlayHeight: number,
  circleBackgroundImage: string,
  circleBackgroundBroken: boolean,
  markCircleBackgroundBroken: () => void,
): ReactElement {
  const streakSignedValue = normalizeRocketStatsStreak(runtimeState.streak);
  const streakValue = getRocketStatsStreakDisplay(runtimeState.streak);
  const streakColor = getRocketStatsStreakColor(streakSignedValue);
  const mmrDisplayValue = resolveOverlayMmrDisplayValue(runtimeState);

  return (
    <section
      className={[
        "overlay-theme-panel",
        "overlay-theme-panel-circle",
        displayMode === "live" ? "overlay-theme-panel-live" : "overlay-theme-panel-preview",
        className ?? "",
      ].join(" ").trim()}
      aria-live="polite"
      style={{
        ...style,
        width: overlayWidth,
        height: overlayHeight,
        opacity: settings.opacity,
      }}
    >
      <div
        className="overlay-theme-circle-canvas"
        style={{
          width: ROCKETSTATS_CIRCLE_WIDTH,
          height: ROCKETSTATS_CIRCLE_HEIGHT,
          transform: `scale(${renderScale})`,
          transformOrigin: "top left",
          ...(circleBackgroundBroken
            ? {}
            : {
              backgroundImage: `url("${circleBackgroundImage}")`,
              backgroundSize: "400px 300px",
              backgroundRepeat: "no-repeat",
            }),
        }}
      >
        {!circleBackgroundBroken ? (
          <img
            className="overlay-theme-circle-image-loader"
            src={circleBackgroundImage}
            alt=""
            draggable={false}
            onError={markCircleBackgroundBroken}
          />
        ) : null}
        {circleBackgroundBroken ? (
          <div className="overlay-theme-fallback-surface" aria-hidden="true" />
        ) : null}

        <span
          className="overlay-theme-circle-value overlay-theme-circle-value-mmr"
          style={{
            top: ROCKETSTATS_CIRCLE_MMR_TOP,
            left: ROCKETSTATS_CIRCLE_MMR_LEFT,
            fontSize: ROCKETSTATS_CIRCLE_MMR_SIZE,
            color: "#FFFFFF",
            fontFamily: ROCKETSTATS_CIRCLE_FONT_FAMILY,
          }}
        >
          {mmrDisplayValue}
        </span>

        <span
          className="overlay-theme-circle-value overlay-theme-circle-value-streak"
            style={{
              top: ROCKETSTATS_CIRCLE_STREAK_TOP,
              left: ROCKETSTATS_CIRCLE_STREAK_LEFT,
              fontSize: ROCKETSTATS_CIRCLE_STREAK_SIZE,
              color: streakColor,
              fontFamily: ROCKETSTATS_CIRCLE_FONT_FAMILY,
            }}
          >
            {streakValue}
          </span>

        <span
          className="overlay-theme-circle-value overlay-theme-circle-value-wins"
            style={{
              top: ROCKETSTATS_CIRCLE_WINS_TOP,
              left: ROCKETSTATS_CIRCLE_WINS_LEFT,
              fontSize: ROCKETSTATS_CIRCLE_WINS_SIZE,
              color: "rgb(0, 255, 0)",
              fontFamily: ROCKETSTATS_CIRCLE_FONT_FAMILY,
            }}
          >
            {runtimeState.wins}
          </span>

        <span
          className="overlay-theme-circle-value overlay-theme-circle-value-losses"
            style={{
              top: ROCKETSTATS_CIRCLE_LOSSES_TOP,
              left: ROCKETSTATS_CIRCLE_LOSSES_LEFT,
              fontSize: ROCKETSTATS_CIRCLE_LOSSES_SIZE,
              color: "rgb(255, 0, 0)",
              fontFamily: ROCKETSTATS_CIRCLE_FONT_FAMILY,
            }}
          >
            {runtimeState.losses}
          </span>

        {settings.show_status ? (
          <span
            className="overlay-theme-circle-status"
            style={{
              top: ROCKETSTATS_CIRCLE_STATUS_TOP,
              left: ROCKETSTATS_CIRCLE_STATUS_LEFT,
              fontSize: ROCKETSTATS_CIRCLE_STATUS_SIZE,
              color: resolvedTheme.palette.status,
            }}
          >
            {runtimeState.status}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function renderJstkissPanel(
  runtimeState: WinLossOverlayRuntimeState,
  settings: WinLossOverlayThemeSettings,
  displayMode: "live" | "preview",
  className: string | undefined,
  style: CSSProperties | undefined,
  renderScale: number,
  overlayWidth: number,
  overlayHeight: number,
  jstkissBackgroundImage: string,
  jstkissBackgroundBroken: boolean,
  markJstkissBackgroundBroken: () => void,
): ReactElement {
  return (
    <section
      className={[
        "overlay-theme-panel",
        "overlay-theme-panel-jstkiss",
        displayMode === "live" ? "overlay-theme-panel-live" : "overlay-theme-panel-preview",
        className ?? "",
      ].join(" ").trim()}
      aria-live="polite"
      style={{
        ...style,
        width: overlayWidth,
        height: overlayHeight,
        opacity: settings.opacity,
      }}
    >
      <div
        className="overlay-theme-jstkiss-canvas"
        style={{
          width: ROCKETSTATS_JSTKISS_WIDTH,
          height: ROCKETSTATS_JSTKISS_HEIGHT,
          transform: `scale(${renderScale})`,
          transformOrigin: "top left",
          ...(jstkissBackgroundBroken
            ? {}
            : {
              backgroundImage: `url("${jstkissBackgroundImage}")`,
              backgroundSize: "400px 300px",
              backgroundRepeat: "no-repeat",
            }),
        }}
      >
        {!jstkissBackgroundBroken ? (
          <img
            className="overlay-theme-jstkiss-image-loader"
            src={jstkissBackgroundImage}
            alt=""
            draggable={false}
            onError={markJstkissBackgroundBroken}
          />
        ) : null}
        {jstkissBackgroundBroken ? (
          <div className="overlay-theme-fallback-surface" aria-hidden="true" />
        ) : null}

        <span
          className="overlay-theme-jstkiss-value overlay-theme-jstkiss-value-wins"
          style={{
            top: ROCKETSTATS_JSTKISS_WINS_TOP,
            left: ROCKETSTATS_JSTKISS_WINS_LEFT,
            fontSize: ROCKETSTATS_JSTKISS_WINS_SIZE,
            color: ROCKETSTATS_JSTKISS_TEXT_COLOR,
            fontFamily: ROCKETSTATS_JSTKISS_FONT_FAMILY,
          }}
        >
          {runtimeState.wins}
        </span>

        <span
          className="overlay-theme-jstkiss-value overlay-theme-jstkiss-value-losses"
          style={{
            top: ROCKETSTATS_JSTKISS_LOSSES_TOP,
            left: ROCKETSTATS_JSTKISS_LOSSES_LEFT,
            fontSize: ROCKETSTATS_JSTKISS_LOSSES_SIZE,
            color: ROCKETSTATS_JSTKISS_TEXT_COLOR,
            fontFamily: ROCKETSTATS_JSTKISS_FONT_FAMILY,
          }}
        >
          {runtimeState.losses}
        </span>

        <span
          className="overlay-theme-jstkiss-value overlay-theme-jstkiss-value-streak"
          style={{
            top: ROCKETSTATS_JSTKISS_STREAK_TOP,
            left: ROCKETSTATS_JSTKISS_STREAK_LEFT,
            fontSize: ROCKETSTATS_JSTKISS_STREAK_SIZE,
            color: ROCKETSTATS_JSTKISS_TEXT_COLOR,
            fontFamily: ROCKETSTATS_JSTKISS_FONT_FAMILY,
          }}
        >
          {getRocketStatsStreakDisplay(runtimeState.streak)}
        </span>
      </div>
    </section>
  );
}

function renderNativePanel(
  runtimeState: WinLossOverlayRuntimeState,
  settings: WinLossOverlayThemeSettings,
  displayMode: "live" | "preview",
  className: string | undefined,
  style: CSSProperties | undefined,
  renderScale: number,
  overlayWidth: number,
  overlayHeight: number,
  nativeBackgroundImage: string,
  nativeBackgroundBroken: boolean,
  markNativeBackgroundBroken: () => void,
): ReactElement {
  return (
    <section
      className={[
        "overlay-theme-panel",
        "overlay-theme-panel-native",
        displayMode === "live" ? "overlay-theme-panel-live" : "overlay-theme-panel-preview",
        className ?? "",
      ].join(" ").trim()}
      aria-live="polite"
      style={{
        ...style,
        width: overlayWidth,
        height: overlayHeight,
        opacity: settings.opacity,
      }}
    >
      <div
        className="overlay-theme-native-canvas"
        style={{
          width: ROCKETSTATS_NATIVE_WIDTH,
          height: ROCKETSTATS_NATIVE_HEIGHT,
          transform: `scale(${renderScale})`,
          transformOrigin: "top left",
          ...(nativeBackgroundBroken
            ? {}
            : {
              backgroundImage: `url("${nativeBackgroundImage}")`,
              backgroundSize: "264px 275px",
              backgroundRepeat: "no-repeat",
            }),
        }}
      >
        {!nativeBackgroundBroken ? (
          <img
            className="overlay-theme-native-image-loader"
            src={nativeBackgroundImage}
            alt=""
            draggable={false}
            onError={markNativeBackgroundBroken}
          />
        ) : null}
        {nativeBackgroundBroken ? (
          <div className="overlay-theme-fallback-surface" aria-hidden="true" />
        ) : null}

        <span
          className="overlay-theme-native-value overlay-theme-native-value-mmr"
          style={{
            top: ROCKETSTATS_NATIVE_MMR_TOP,
            left: ROCKETSTATS_NATIVE_MMR_LEFT,
            fontSize: ROCKETSTATS_NATIVE_MMR_SIZE,
            color: ROCKETSTATS_NATIVE_MMR_COLOR,
            fontFamily: ROCKETSTATS_NATIVE_FONT_FAMILY_STACK,
            textShadow: ROCKETSTATS_NATIVE_TEXT_SHADOW,
          }}
        >
          {resolveOverlayMmrDisplayValue(runtimeState)}
        </span>

        <span
          className="overlay-theme-native-value overlay-theme-native-value-streak"
          style={{
            top: ROCKETSTATS_NATIVE_STREAK_TOP,
            left: ROCKETSTATS_NATIVE_STREAK_LEFT,
            fontSize: ROCKETSTATS_NATIVE_STREAK_SIZE,
            color: ROCKETSTATS_NATIVE_STREAK_COLOR,
            fontFamily: ROCKETSTATS_NATIVE_FONT_FAMILY_STACK,
            textShadow: ROCKETSTATS_NATIVE_TEXT_SHADOW,
          }}
        >
          {getRocketStatsStreakDisplay(runtimeState.streak)}
        </span>

        <span
          className="overlay-theme-native-value overlay-theme-native-value-wins"
          style={{
            top: ROCKETSTATS_NATIVE_WINS_TOP,
            left: ROCKETSTATS_NATIVE_WINS_LEFT,
            fontSize: ROCKETSTATS_NATIVE_WINS_SIZE,
            color: ROCKETSTATS_NATIVE_WINS_COLOR,
            fontFamily: ROCKETSTATS_NATIVE_FONT_FAMILY_STACK,
            textShadow: ROCKETSTATS_NATIVE_TEXT_SHADOW,
          }}
        >
          {runtimeState.wins}
        </span>

        <span
          className="overlay-theme-native-value overlay-theme-native-value-losses"
          style={{
            top: ROCKETSTATS_NATIVE_LOSSES_TOP,
            left: ROCKETSTATS_NATIVE_LOSSES_LEFT,
            fontSize: ROCKETSTATS_NATIVE_LOSSES_SIZE,
            color: ROCKETSTATS_NATIVE_LOSSES_COLOR,
            fontFamily: ROCKETSTATS_NATIVE_FONT_FAMILY_STACK,
            textShadow: ROCKETSTATS_NATIVE_TEXT_SHADOW,
          }}
        >
          {runtimeState.losses}
        </span>
      </div>
    </section>
  );
}

function renderMinimalistPanel(
  runtimeState: WinLossOverlayRuntimeState,
  settings: WinLossOverlayThemeSettings,
  displayMode: "live" | "preview",
  className: string | undefined,
  style: CSSProperties | undefined,
  renderScale: number,
  overlayWidth: number,
  overlayHeight: number,
  minimalistBackgroundImage: string,
  minimalistBackgroundBroken: boolean,
  markMinimalistBackgroundBroken: () => void,
): ReactElement {
  return (
    <section
      className={[
        "overlay-theme-panel",
        "overlay-theme-panel-minimalist",
        displayMode === "live" ? "overlay-theme-panel-live" : "overlay-theme-panel-preview",
        className ?? "",
      ].join(" ").trim()}
      aria-live="polite"
      style={{
        ...style,
        width: overlayWidth,
        height: overlayHeight,
        opacity: settings.opacity,
      }}
    >
      <div
        className="overlay-theme-minimalist-canvas"
        style={{
          width: MINIMALIST_WIDTH,
          height: MINIMALIST_HEIGHT,
          transform: `scale(${renderScale})`,
          transformOrigin: "top left",
          ...(minimalistBackgroundBroken
            ? {}
            : {
              backgroundImage: `url("${minimalistBackgroundImage}")`,
              backgroundSize: "146px 177px",
              backgroundRepeat: "no-repeat",
            }),
        }}
      >
        {!minimalistBackgroundBroken ? (
          <img
            className="overlay-theme-minimalist-image-loader"
            src={minimalistBackgroundImage}
            alt=""
            draggable={false}
            onError={markMinimalistBackgroundBroken}
          />
        ) : null}
        {minimalistBackgroundBroken ? (
          <div className="overlay-theme-fallback-surface" aria-hidden="true" />
        ) : null}

        <span
          className="overlay-theme-minimalist-value overlay-theme-minimalist-value-mmr"
          style={{
            top: MINIMALIST_MMR_TOP,
            left: MINIMALIST_MMR_LEFT,
            fontSize: MINIMALIST_MMR_SIZE,
            color: MINIMALIST_MMR_COLOR,
            fontFamily: MINIMALIST_FONT_FAMILY_STACK,
            textShadow: MINIMALIST_TEXT_SHADOW,
          }}
        >
          {resolveOverlayMmrDisplayValue(runtimeState)}
        </span>

        <span
          className="overlay-theme-minimalist-value overlay-theme-minimalist-value-streak"
          style={{
            top: MINIMALIST_STREAK_TOP,
            left: MINIMALIST_STREAK_LEFT,
            fontSize: MINIMALIST_STREAK_SIZE,
            color: MINIMALIST_STREAK_COLOR,
            fontFamily: MINIMALIST_FONT_FAMILY_STACK,
            textShadow: MINIMALIST_TEXT_SHADOW,
          }}
        >
          {getRocketStatsStreakDisplay(runtimeState.streak)}
        </span>

        <span
          className="overlay-theme-minimalist-value overlay-theme-minimalist-value-wins"
          style={{
            top: MINIMALIST_WINS_TOP,
            left: MINIMALIST_WINS_LEFT,
            fontSize: MINIMALIST_WINS_SIZE,
            color: MINIMALIST_WINS_COLOR,
            fontFamily: MINIMALIST_FONT_FAMILY_STACK,
            textShadow: MINIMALIST_TEXT_SHADOW,
          }}
        >
          {runtimeState.wins}
        </span>

        <span
          className="overlay-theme-minimalist-value overlay-theme-minimalist-value-losses"
          style={{
            top: MINIMALIST_LOSSES_TOP,
            left: MINIMALIST_LOSSES_LEFT,
            fontSize: MINIMALIST_LOSSES_SIZE,
            color: MINIMALIST_LOSSES_COLOR,
            fontFamily: MINIMALIST_FONT_FAMILY_STACK,
            textShadow: MINIMALIST_TEXT_SHADOW,
          }}
        >
          {runtimeState.losses}
        </span>
      </div>
    </section>
  );
}

export function WinLossOverlayThemePanel({
  runtimeState,
  settings,
  themeOverride,
  displayMode = "preview",
  className,
  style,
}: WinLossOverlayThemePanelProps) {
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());
  const resolvedTheme = useMemo(
    () => resolveOverlayThemeConfig(settings.theme_id, themeOverride),
    [settings.theme_id, themeOverride],
  );
  const hasVisibleImage = resolvedTheme.elements.some(
    (element) => element.type === "image" && element.visible !== false && !brokenImageIds.has(element.id),
  );
  const isCircleTheme = resolvedTheme.id === ROCKETSTATS_CIRCLE_THEME_ID;
  const isJstkissTheme = resolvedTheme.id === ROCKETSTATS_JSTKISS_THEME_ID;
  const isNativeTheme = resolvedTheme.id === ROCKETSTATS_NATIVE_THEME_ID;
  const isMinimalistTheme = resolvedTheme.id === MINIMALIST_THEME_ID;
  const baseWidth = isCircleTheme
    ? ROCKETSTATS_CIRCLE_WIDTH
    : isJstkissTheme
      ? ROCKETSTATS_JSTKISS_WIDTH
      : isNativeTheme
        ? ROCKETSTATS_NATIVE_WIDTH
        : isMinimalistTheme
          ? MINIMALIST_WIDTH
          : resolvedTheme.baseWidth;
  const baseHeight = isCircleTheme
    ? ROCKETSTATS_CIRCLE_HEIGHT
    : isJstkissTheme
      ? ROCKETSTATS_JSTKISS_HEIGHT
      : isNativeTheme
        ? ROCKETSTATS_NATIVE_HEIGHT
        : isMinimalistTheme
          ? MINIMALIST_HEIGHT
          : resolvedTheme.baseHeight;
  const renderScale = (isCircleTheme || isJstkissTheme || isNativeTheme || isMinimalistTheme)
    ? settings.scale
    : settings.scale * resolvedTheme.baseScale;
  const overlayWidth = Math.round(baseWidth * renderScale);
  const overlayHeight = Math.round(baseHeight * renderScale);
  const circleBackgroundImage = useMemo(() => {
    const panelElement = resolvedTheme.elements.find(
      (element) => element.type === "image" && element.id === "panel_bg",
    );
    if (!panelElement || panelElement.type !== "image" || panelElement.src.trim().length === 0) {
      return DEFAULT_CIRCLE_BACKGROUND_URL;
    }
    return panelElement.src;
  }, [resolvedTheme.elements]);
  const circleBackgroundBroken = brokenImageIds.has("panel_bg");
  const jstkissBackgroundImage = useMemo(() => {
    const panelElement = resolvedTheme.elements.find(
      (element) => element.type === "image" && element.id === "panel_bg",
    );
    if (!panelElement || panelElement.type !== "image" || panelElement.src.trim().length === 0) {
      return DEFAULT_JSTKISS_BACKGROUND_URL;
    }
    return panelElement.src;
  }, [resolvedTheme.elements]);
  const jstkissBackgroundBroken = brokenImageIds.has("panel_bg");
  const nativeBackgroundImage = useMemo(() => {
    const panelElement = resolvedTheme.elements.find(
      (element) => element.type === "image" && element.id === "panel_bg",
    );
    if (!panelElement || panelElement.type !== "image" || panelElement.src.trim().length === 0) {
      return DEFAULT_NATIVE_BACKGROUND_URL;
    }
    return panelElement.src;
  }, [resolvedTheme.elements]);
  const nativeBackgroundBroken = brokenImageIds.has("panel_bg");
  const minimalistBackgroundImage = useMemo(() => {
    const panelElement = resolvedTheme.elements.find(
      (element) => element.type === "image" && element.id === "panel_bg",
    );
    if (!panelElement || panelElement.type !== "image" || panelElement.src.trim().length === 0) {
      return DEFAULT_MINIMALIST_BACKGROUND_URL;
    }
    return panelElement.src;
  }, [resolvedTheme.elements]);
  const minimalistBackgroundBroken = brokenImageIds.has("panel_bg");

  useEffect(() => {
    setBrokenImageIds(new Set());
  }, [resolvedTheme.id]);

  if (isCircleTheme) {
    return renderCirclePanel(
      runtimeState,
      settings,
      displayMode,
      className,
      style,
      resolvedTheme,
      renderScale,
      overlayWidth,
      overlayHeight,
      circleBackgroundImage,
      circleBackgroundBroken,
      () => {
        setBrokenImageIds((current) => {
          if (current.has("panel_bg")) {
            return current;
          }
          const next = new Set(current);
          next.add("panel_bg");
          return next;
        });
      },
    );
  }

  if (isJstkissTheme) {
    return renderJstkissPanel(
      runtimeState,
      settings,
      displayMode,
      className,
      style,
      renderScale,
      overlayWidth,
      overlayHeight,
      jstkissBackgroundImage,
      jstkissBackgroundBroken,
      () => {
        setBrokenImageIds((current) => {
          if (current.has("panel_bg")) {
            return current;
          }
          const next = new Set(current);
          next.add("panel_bg");
          return next;
        });
      },
    );
  }

  if (isNativeTheme) {
    return renderNativePanel(
      runtimeState,
      settings,
      displayMode,
      className,
      style,
      renderScale,
      overlayWidth,
      overlayHeight,
      nativeBackgroundImage,
      nativeBackgroundBroken,
      () => {
        setBrokenImageIds((current) => {
          if (current.has("panel_bg")) {
            return current;
          }
          const next = new Set(current);
          next.add("panel_bg");
          return next;
        });
      },
    );
  }

  if (isMinimalistTheme) {
    return renderMinimalistPanel(
      runtimeState,
      settings,
      displayMode,
      className,
      style,
      renderScale,
      overlayWidth,
      overlayHeight,
      minimalistBackgroundImage,
      minimalistBackgroundBroken,
      () => {
        setBrokenImageIds((current) => {
          if (current.has("panel_bg")) {
            return current;
          }
          const next = new Set(current);
          next.add("panel_bg");
          return next;
        });
      },
    );
  }

  return (
    <section
      className={[
        "overlay-theme-panel",
        displayMode === "live" ? "overlay-theme-panel-live" : "overlay-theme-panel-preview",
        className ?? "",
      ].join(" ").trim()}
      aria-live="polite"
      style={{
        ...style,
        width: overlayWidth,
        height: overlayHeight,
        opacity: settings.opacity,
      }}
    >
      <div
        className="overlay-theme-canvas"
        style={{
          width: resolvedTheme.baseWidth,
          height: resolvedTheme.baseHeight,
          transform: `scale(${renderScale})`,
        }}
      >
        {!hasVisibleImage ? (
          <div className="overlay-theme-fallback-surface" aria-hidden="true" />
        ) : null}
        {resolvedTheme.elements.map((element) => renderThemeElement(element, {
          runtimeState,
          settings,
          shadowColor: resolvedTheme.shadowColor,
          theme: resolvedTheme,
          brokenImageIds,
          markImageBroken: (id) => {
            setBrokenImageIds((current) => {
              if (current.has(id)) {
                return current;
              }
              const next = new Set(current);
              next.add(id);
              return next;
            });
          },
        }))}
      </div>
    </section>
  );
}
