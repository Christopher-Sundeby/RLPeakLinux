import { invoke, isTauri } from "@tauri-apps/api/core";
import { DEFAULT_RLPEAK_WEBSITE_URL, normalizeWebsiteUrl } from "./versionGateService";

export interface WebsiteActionResult {
  ok: boolean;
  message: string;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown error";
}

export async function openRLPeakWebsite(urlValue?: string): Promise<WebsiteActionResult> {
  const safeUrl = normalizeWebsiteUrl(urlValue);

  if (!isTauri()) {
    return {
      ok: false,
      message: `Please open ${safeUrl} in your browser.`,
    };
  }

  try {
    await invoke("open_website", {
      url: safeUrl,
    });
    return {
      ok: true,
      message: `Opened ${safeUrl}`,
    };
  } catch (error: unknown) {
    const details = toErrorMessage(error);
    console.error(`Open website failed (${safeUrl}): ${details}`);

    return {
      ok: false,
      message: `Could not open RLPeak website. Please open ${DEFAULT_RLPEAK_WEBSITE_URL} manually.`,
    };
  }
}
