import { invoke, isTauri } from "@tauri-apps/api/core";
import { getLocalAppDataPaths } from "../items/pathService";
import type { TelemetryState } from "./types";

export const TELEMETRY_STATE_SCHEMA = "rlpeak_telemetry_state.v1";
export const TELEMETRY_STATE_FILE_NAME = "telemetry.json";

const LOCAL_STORAGE_TELEMETRY_KEY = "rlpeak_telemetry_state_json";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasCryptoRandomUUID(): boolean {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function";
}

function hasCryptoGetRandomValues(): boolean {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function";
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  if (hasCryptoGetRandomValues()) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function createAnonymousInstallId(): string {
  if (hasCryptoRandomUUID()) {
    return globalThis.crypto.randomUUID();
  }

  const partA = randomHex(4);
  const partB = randomHex(2);
  const partC = `4${randomHex(2).slice(1)}`;
  const variantSource = parseInt(randomHex(1), 16);
  const variantNibble = ((variantSource & 0x3) | 0x8).toString(16);
  const partD = `${variantNibble}${randomHex(2).slice(1)}`;
  const partE = randomHex(6);

  return `${partA}-${partB}-${partC}-${partD}-${partE}`;
}

function buildDefaultTelemetryState(nowIso: string): TelemetryState {
  return {
    schema: TELEMETRY_STATE_SCHEMA,
    install_id: createAnonymousInstallId(),
    created_at: nowIso,
    metrics_enabled: true,
    last_app_start_sent_at: null,
    last_daily_active_sent_at: null,
  };
}

function sanitizeInstallId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!UUID_V4_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function sanitizeTelemetryState(rawValue: unknown, nowIso = new Date().toISOString()): TelemetryState {
  if (!isRecord(rawValue)) {
    return buildDefaultTelemetryState(nowIso);
  }

  const installId = sanitizeInstallId(rawValue.install_id);
  const createdAt = normalizeIsoOrNull(rawValue.created_at) ?? nowIso;
  const metricsEnabled = rawValue.metrics_enabled !== false;
  const lastAppStartSentAt = normalizeIsoOrNull(rawValue.last_app_start_sent_at);
  const lastDailyActiveSentAt = normalizeIsoOrNull(rawValue.last_daily_active_sent_at);

  return {
    schema: TELEMETRY_STATE_SCHEMA,
    install_id: installId ?? createAnonymousInstallId(),
    created_at: createdAt,
    metrics_enabled: metricsEnabled,
    last_app_start_sent_at: lastAppStartSentAt,
    last_daily_active_sent_at: lastDailyActiveSentAt,
  };
}

export async function getTelemetryStatePath(): Promise<string> {
  const paths = await getLocalAppDataPaths();
  const trimmedRoot = paths.appDataRoot.replace(/[\\/]+$/, "");
  return `${trimmedRoot}/${TELEMETRY_STATE_FILE_NAME}`.replace(/\\/g, "/");
}

async function readTelemetryStateRaw(path: string): Promise<string | null> {
  if (!isTauri()) {
    return localStorage.getItem(LOCAL_STORAGE_TELEMETRY_KEY);
  }

  try {
    return await invoke<string>("read_text_file", { path });
  } catch {
    return null;
  }
}

export async function saveTelemetryState(state: TelemetryState): Promise<void> {
  const payload = JSON.stringify(state, null, 2);
  if (!isTauri()) {
    localStorage.setItem(LOCAL_STORAGE_TELEMETRY_KEY, payload);
    return;
  }

  const path = await getTelemetryStatePath();
  await invoke("write_text_file", { path, contents: payload });
}

export async function loadTelemetryState(): Promise<TelemetryState | null> {
  const path = await getTelemetryStatePath();
  const rawState = await readTelemetryStateRaw(path);
  if (!rawState) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawState) as unknown;
    return sanitizeTelemetryState(parsed);
  } catch {
    return null;
  }
}

export async function getOrCreateTelemetryState(): Promise<TelemetryState> {
  const existing = await loadTelemetryState();
  if (existing) {
    return existing;
  }

  const nextState = buildDefaultTelemetryState(new Date().toISOString());
  await saveTelemetryState(nextState);
  return nextState;
}

export async function setMetricsEnabled(enabled: boolean): Promise<TelemetryState> {
  const current = await getOrCreateTelemetryState();
  const nextState: TelemetryState = {
    ...current,
    metrics_enabled: enabled,
  };
  await saveTelemetryState(nextState);
  return nextState;
}

export async function getMetricsEnabledSetting(): Promise<boolean> {
  const state = await getOrCreateTelemetryState();
  return state.metrics_enabled;
}
