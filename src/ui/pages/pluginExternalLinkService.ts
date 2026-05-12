import { invoke, isTauri } from "@tauri-apps/api/core";

export interface PluginExternalLinkActionResult {
  ok: boolean;
  message: string;
}

export function normalizePluginExternalLinkUrl(rawUrl: string | undefined): string | null {
  if (typeof rawUrl !== "string") {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  if (!parsed.hostname || parsed.username || parsed.password) {
    return null;
  }

  const loweredHost = parsed.hostname.toLowerCase();
  if (loweredHost === "localhost" || loweredHost === "127.0.0.1" || loweredHost === "[::1]") {
    return null;
  }

  return parsed.toString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown error";
}

export async function openPluginExternalLink(rawUrl: string): Promise<PluginExternalLinkActionResult> {
  const normalizedUrl = normalizePluginExternalLinkUrl(rawUrl);
  if (!normalizedUrl) {
    return {
      ok: false,
      message: "External link is invalid.",
    };
  }

  if (!isTauri()) {
    return {
      ok: false,
      message: `Please open ${normalizedUrl} in your browser.`,
    };
  }

  try {
    await invoke("open_external_url", {
      url: normalizedUrl,
    });
    return {
      ok: true,
      message: `Opened ${normalizedUrl}`,
    };
  } catch (error: unknown) {
    const details = toErrorMessage(error);
    console.error(`Open plugin external link failed (${normalizedUrl}): ${details}`);
    return {
      ok: false,
      message: "Could not open this external link.",
    };
  }
}
