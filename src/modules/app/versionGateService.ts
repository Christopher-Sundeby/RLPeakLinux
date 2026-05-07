import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";

export const VERSION_CHECK_ENDPOINT = "https://api.rlpeak.com/v1/app/version.json";
export const DEFAULT_RLPEAK_WEBSITE_URL = "https://rlpeak.com/";
const VERSION_CHECK_TIMEOUT_MS = 8000;
const ALLOWED_WEBSITE_HOSTS = new Set(["rlpeak.com", "www.rlpeak.com"]);
const FALLBACK_APP_VERSION = typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim().length > 0
  ? __APP_VERSION__.trim()
  : "0.0.0";

interface VersionCheckPayload {
  required_version: string;
  website_url?: string;
  status: string;
  message?: string;
}

export type VersionGateCheckResult =
  | {
      status: "boot-ok";
      currentVersion: string;
      requiredVersion: string;
      websiteUrl: string;
      message: string;
    }
  | {
      status: "boot-outdated";
      currentVersion: string;
      requiredVersion: string;
      websiteUrl: string;
      message: string;
    }
  | {
      status: "boot-error";
      currentVersion: string;
      websiteUrl: string;
      message: string;
      details?: string;
    };

interface CheckStartupVersionGateOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  getRuntimeVersion?: () => Promise<string>;
}

function toErrorDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown error";
}

function isAllowedWebsiteUrl(urlValue: URL): boolean {
  return (
    urlValue.protocol === "https:"
    && ALLOWED_WEBSITE_HOSTS.has(urlValue.hostname.toLowerCase())
  );
}

export function normalizeWebsiteUrl(urlValue?: string): string {
  const normalizedInput = urlValue?.trim();
  if (!normalizedInput) {
    return DEFAULT_RLPEAK_WEBSITE_URL;
  }

  try {
    const parsed = new URL(normalizedInput);
    if (!isAllowedWebsiteUrl(parsed)) {
      return DEFAULT_RLPEAK_WEBSITE_URL;
    }

    return parsed.toString();
  } catch {
    return DEFAULT_RLPEAK_WEBSITE_URL;
  }
}

function parseVersionCheckPayload(payload: unknown): VersionCheckPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Version payload must be an object");
  }

  const record = payload as Record<string, unknown>;
  const requiredVersion = record.required_version;
  const status = record.status;
  const message = record.message;
  const websiteUrl = record.website_url;

  if (typeof requiredVersion !== "string" || requiredVersion.trim().length === 0) {
    throw new Error("required_version must be a non-empty string");
  }

  if (typeof status !== "string" || status.trim().toLowerCase() !== "ok") {
    throw new Error("status must be `ok`");
  }

  if (message !== undefined && typeof message !== "string") {
    throw new Error("message must be a string when provided");
  }

  if (websiteUrl !== undefined && typeof websiteUrl !== "string") {
    throw new Error("website_url must be a string when provided");
  }

  return {
    required_version: requiredVersion.trim(),
    website_url: typeof websiteUrl === "string" ? websiteUrl.trim() : undefined,
    status: status.trim(),
    message: typeof message === "string" ? message.trim() : undefined,
  };
}

async function fetchVersionCheckPayload(
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<VersionCheckPayload> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(VERSION_CHECK_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Version endpoint returned ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return parseVersionCheckPayload(payload);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function readLocalAppVersion(getRuntimeVersion?: () => Promise<string>): Promise<string> {
  try {
    if (getRuntimeVersion) {
      const runtimeVersion = (await getRuntimeVersion()).trim();
      if (runtimeVersion.length > 0) {
        return runtimeVersion;
      }
    }

    if (isTauri()) {
      const tauriVersion = (await getVersion()).trim();
      if (tauriVersion.length > 0) {
        return tauriVersion;
      }
    }
  } catch {
    // Fall through to fallback version.
  }

  return FALLBACK_APP_VERSION;
}

export async function checkStartupVersionGate(
  options?: CheckStartupVersionGateOptions,
): Promise<VersionGateCheckResult> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? VERSION_CHECK_TIMEOUT_MS;
  const currentVersion = await readLocalAppVersion(options?.getRuntimeVersion);

  try {
    const payload = await fetchVersionCheckPayload(fetchImpl, timeoutMs);
    const requiredVersion = payload.required_version;
    const websiteUrl = normalizeWebsiteUrl(payload.website_url);
    const message = payload.message?.trim() || "A new RLPeak version is required.";

    if (currentVersion === requiredVersion) {
      return {
        status: "boot-ok",
        currentVersion,
        requiredVersion,
        websiteUrl,
        message,
      };
    }

    return {
      status: "boot-outdated",
      currentVersion,
      requiredVersion,
      websiteUrl,
      message,
    };
  } catch (error: unknown) {
    return {
      status: "boot-error",
      currentVersion,
      websiteUrl: DEFAULT_RLPEAK_WEBSITE_URL,
      message: "RLPeak could not verify the current application version.",
      details: toErrorDetails(error),
    };
  }
}
