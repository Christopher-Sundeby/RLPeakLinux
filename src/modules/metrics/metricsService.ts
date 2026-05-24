import {
  getOrCreateTelemetryState,
  saveTelemetryState,
} from "./metricsStateService";
import type {
  MetricsErrorCode,
  MetricsEventName,
  MetricsEventPayload,
  TelemetryState,
} from "./types";

export const METRICS_ENDPOINT = "https://api.rlpeak.com/v1/metrics/event";
export const METRICS_PAYLOAD_SCHEMA = "rlpeak_metrics_event.v1";
export const METRICS_TIMEOUT_MS = 2000;

const ALLOWED_ERROR_CODES = new Set<MetricsErrorCode>([
  "permission_denied",
  "network_error",
  "invalid_path",
  "download_failed",
  "restore_failed",
  "unknown",
]);

const APP_VERSION = typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim().length > 0
  ? __APP_VERSION__.trim()
  : "0.0.0";

let hasTrackedAppStartForLaunch = false;

export interface TrackEventOptions {
  pluginId?: string | null;
  errorCode?: MetricsErrorCode | null;
  timestamp?: string;
}

function logMetricsDebug(message: string, details?: string): void {
  if (import.meta.env.DEV) {
    if (details) {
      console.debug(`[metrics] ${message}: ${details}`);
      return;
    }

    console.debug(`[metrics] ${message}`);
  }
}

function resolveUtcDayKey(timestamp: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizePluginId(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeErrorCode(value?: MetricsErrorCode | null): MetricsErrorCode | null {
  if (!value) {
    return null;
  }

  return ALLOWED_ERROR_CODES.has(value) ? value : "unknown";
}

export function mapItemApplyFailureToMetricsCode(input: {
  code?: string;
  message?: string;
  details?: string;
}): MetricsErrorCode {
  const message = input.message?.toLowerCase() ?? "";
  const details = input.details?.toLowerCase() ?? "";
  const applyCode = input.code ?? "";

  if (message.includes("admin permission required")
    || details.includes("eacces")
    || details.includes("eperm")
    || details.includes("permission")) {
    return "permission_denied";
  }

  if (message.includes("download failed")) {
    return "download_failed";
  }

  if (message.includes("servers are unavailable")
    || message.includes("network")
    || details.includes("network")
    || details.includes("timeout")) {
    return "network_error";
  }

  if (applyCode === "InvalidInput" || applyCode === "MissingItemFile" || applyCode === "GameFileNotFound") {
    return "invalid_path";
  }

  return "unknown";
}

function getMetricsPlatform(): "windows" | "linux" | "macos" {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("windows")) return "windows";
    if (ua.includes("mac")) return "macos";
    if (ua.includes("linux")) return "linux";
  }
  return "linux";
}

export function buildMetricsPayload(
  event: MetricsEventName,
  state: TelemetryState,
  options?: TrackEventOptions,
): MetricsEventPayload {
  return {
    schema: METRICS_PAYLOAD_SCHEMA,
    event,
    install_id: state.install_id,
    app_version: APP_VERSION,
    platform: getMetricsPlatform(),
    timestamp: options?.timestamp ?? new Date().toISOString(),
    plugin_id: normalizePluginId(options?.pluginId),
    error_code: normalizeErrorCode(options?.errorCode),
  };
}

async function postPayload(payload: MetricsEventPayload): Promise<void> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, METRICS_TIMEOUT_MS);

  try {
    const response = await fetch(METRICS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function initializeMetrics(): Promise<void> {
  try {
    await getOrCreateTelemetryState();
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    logMetricsDebug("initialize_failed", details);
  }
}

export async function trackEvent(event: MetricsEventName, options?: TrackEventOptions): Promise<void> {
  try {
    const state = await getOrCreateTelemetryState();
    if (!state.metrics_enabled) {
      return;
    }

    const payload = buildMetricsPayload(event, state, options);
    await postPayload(payload);
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    logMetricsDebug(`send_failed:${event}`, details);
  }
}

export async function trackAppStart(): Promise<void> {
  if (hasTrackedAppStartForLaunch) {
    return;
  }
  hasTrackedAppStartForLaunch = true;

  try {
    const state = await getOrCreateTelemetryState();
    if (!state.metrics_enabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    await saveTelemetryState({
      ...state,
      last_app_start_sent_at: timestamp,
    });
    await postPayload(buildMetricsPayload("app_start", state, { timestamp }));
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    logMetricsDebug("app_start_failed", details);
  }
}

export async function trackDailyActive(): Promise<void> {
  try {
    const state = await getOrCreateTelemetryState();
    if (!state.metrics_enabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    const todayUtc = resolveUtcDayKey(timestamp);
    const lastSentUtc = resolveUtcDayKey(state.last_daily_active_sent_at);
    if (todayUtc && lastSentUtc === todayUtc) {
      return;
    }

    await saveTelemetryState({
      ...state,
      last_daily_active_sent_at: timestamp,
    });
    await postPayload(buildMetricsPayload("daily_active", state, { timestamp }));
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    logMetricsDebug("daily_active_failed", details);
  }
}

export function resetMetricsLaunchStateForTests(): void {
  hasTrackedAppStartForLaunch = false;
}
