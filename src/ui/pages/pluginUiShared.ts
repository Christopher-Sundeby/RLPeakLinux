import type { PluginManifestEntry } from "../../modules/plugins/types";
import type {
  WinLossOverlayMmrFailureReason,
  WinLossOverlayMmrStatus,
  WinLossOverlayRuntimeState,
} from "../../modules/plugins/winLossOverlayRuntimeService";
import type {
  PluginCreditEntry,
  PluginDetailFile,
  PluginExternalLinkEntry,
} from "../../modules/plugins/types/pluginCatalog";
import {
  WIN_LOSS_OVERLAY_PLUGIN_ID,
  WIN_LOSS_OVERLAY_RUNTIME_ID,
  WORKSHOP_MAP_LOADER_PLUGIN_ID,
  WORKSHOP_MAP_LOADER_RUNTIME_ID,
} from "../../modules/plugins/pluginRuntimeLifecycleService";
import { buildPluginAssetUrl } from "../../modules/plugins/pluginSecurity";

export const WIN_LOSS_PLUGIN_ID = WIN_LOSS_OVERLAY_PLUGIN_ID;
export const WIN_LOSS_RUNTIME_ID = WIN_LOSS_OVERLAY_RUNTIME_ID;
export const WORKSHOP_PLUGIN_ID = WORKSHOP_MAP_LOADER_PLUGIN_ID;
export const WORKSHOP_RUNTIME_ID = WORKSHOP_MAP_LOADER_RUNTIME_ID;
const ACTION_ONLY_PLUGIN_TYPES = new Set(["tool", "tools", "action", "actions", "utility", "utilities"]);
const RUNTIME_IDS_WITHOUT_ENABLE_DISABLE = new Set([WORKSHOP_RUNTIME_ID]);

export interface PluginRuntimePill {
  label: string;
  className: string;
}

export interface PluginPresentationLink {
  label: string;
  url: string;
}

export interface PluginPresentationCredit {
  name: string;
  role?: string;
  url?: string;
  license?: string;
}

export interface PluginPresentation {
  title: string;
  shortDescription: string;
  description: string;
  longDescriptionMarkdown: string;
  tags: string[];
  categories: string[];
  credits: PluginPresentationCredit[];
  attribution?: string;
  externalLinks: PluginPresentationLink[];
}

const ROCKETSTATS_LONG_DESCRIPTION_MARKDOWN = `
**RocketStats** is a Rocket League overlay re-integrated into **RLPeak**, inspired by the original RocketStats BakkesMod plugin. It displays session information such as **MMR delta**, **wins**, **losses** and **streak** directly in game.

The original RocketStats plugin was built for BakkesMod. Since BakkesMod is no longer supported by Rocket League, RLPeak brings the RocketStats-style experience back through its own built-in overlay runtime.

Current RLPeak version includes the **RocketStats Circle** theme, live session tracking, transparent click-through overlay, and tracker.gg based MMR delta sync.

### Features
- In-game transparent overlay
- Session wins/losses/streak
- MMR delta through tracker.gg
- RocketStats Circle theme
- Click-through overlay
- Custom position, opacity and scale
- No DLL injection, no memory editing, no process hooking

### Theme support
RocketStats originally introduced themes built from JSON files. RLPeak starts with the Circle theme and is designed to support more themes in the future.

### Credits
RocketStats was originally created by the RocketStats team and contributors. RLPeak re-integrates the RocketStats-style overlay experience for the post-BakkesMod era.
`.trim();

const ROCKETSTATS_DEFAULT_EXTERNAL_LINKS: PluginPresentationLink[] = [
  {
    label: "Original RocketStats source",
    url: "https://github.com/Lyliya/RocketStats",
  },
];

function toDisplayRuntimeStatus(status?: WinLossOverlayRuntimeState["status"]): PluginRuntimePill {
  if (status === "Connected" || status === "In Match") {
    return {
      label: status,
      className: "plugins-runtime-pill is-running",
    };
  }

  if (status === "Restart Rocket League") {
    return {
      label: status,
      className: "plugins-runtime-pill is-restart",
    };
  }

  if (status === "Error") {
    return {
      label: status,
      className: "plugins-runtime-pill is-error",
    };
  }

  if (status === "Waiting for Rocket League") {
    return {
      label: status,
      className: "plugins-runtime-pill is-stopped",
    };
  }

  return {
    label: "Stopped",
    className: "plugins-runtime-pill is-stopped",
  };
}

function toWorkshopRuntimeStatus(isInstalled: boolean): PluginRuntimePill {
  return {
    label: isInstalled ? "Ready" : "Stopped",
    className: isInstalled ? "plugins-runtime-pill is-running" : "plugins-runtime-pill is-stopped",
  };
}

export function readPluginRuntimeStatus(params: {
  manifestEntry: PluginManifestEntry;
  runtimeState: WinLossOverlayRuntimeState | undefined;
  isEnabled?: boolean;
  isInstalled?: boolean;
}): PluginRuntimePill {
  const {
    manifestEntry,
    runtimeState,
    isInstalled = false,
  } = params;
  if (manifestEntry.runtime !== WIN_LOSS_RUNTIME_ID) {
    if (manifestEntry.runtime === WORKSHOP_RUNTIME_ID) {
      return toWorkshopRuntimeStatus(isInstalled);
    }

    return {
      label: "Stopped",
      className: "plugins-runtime-pill is-stopped",
    };
  }

  return toDisplayRuntimeStatus(runtimeState?.status);
}

function sanitizeRemotePath(remotePath: string | undefined): string | null {
  if (typeof remotePath !== "string") {
    return null;
  }

  const trimmed = remotePath.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return buildPluginAssetUrl(trimmed);
  } catch {
    return null;
  }
}

function readRemotePathFromFiles(
  detail: PluginDetailFile,
  matcher: (filename: string) => boolean,
): string | undefined {
  for (const file of detail.files) {
    if (matcher(file.filename)) {
      return file.remote_path;
    }
  }

  return undefined;
}

export function sanitizeExternalLinkUrl(rawUrl: string | undefined): string | null {
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

function mapExternalLinks(links: PluginExternalLinkEntry[] | undefined): PluginPresentationLink[] {
  if (!links) {
    return [];
  }

  const mapped = links
    .map((entry) => {
      const normalizedUrl = sanitizeExternalLinkUrl(entry.url);
      if (!normalizedUrl) {
        return null;
      }

      const label = entry.label.trim();
      if (label.length === 0) {
        return null;
      }

      return {
        label,
        url: normalizedUrl,
      };
    })
    .filter((entry): entry is PluginPresentationLink => entry !== null);

  return mapped;
}

function mapCredits(credits: PluginCreditEntry[] | undefined): PluginPresentationCredit[] {
  if (!credits) {
    return [];
  }

  const mapped: PluginPresentationCredit[] = [];
  for (const entry of credits) {
    const name = entry.name.trim();
    if (name.length === 0) {
      continue;
    }

    const next: PluginPresentationCredit = { name };
    if (entry.role) {
      next.role = entry.role;
    }
    if (entry.license) {
      next.license = entry.license;
    }
    const url = sanitizeExternalLinkUrl(entry.url);
    if (url) {
      next.url = url;
    }
    mapped.push(next);
  }

  return mapped;
}

function combineUnique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    if (!value) {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(trimmed);
  }
  return ordered;
}

function combineUniqueArrays(values: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const list of values) {
    if (!list) {
      continue;
    }
    for (const item of list) {
      const trimmed = item.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      ordered.push(trimmed);
    }
  }
  return ordered;
}

function isWinLossOverlayPlugin(
  manifestEntry: PluginManifestEntry | null,
  detail: PluginDetailFile | null,
): boolean {
  return manifestEntry?.id === WIN_LOSS_PLUGIN_ID || detail?.id === WIN_LOSS_PLUGIN_ID;
}

function isWorkshopMapLoaderPlugin(
  manifestEntry: PluginManifestEntry | null,
  detail: PluginDetailFile | null,
): boolean {
  return manifestEntry?.id === WORKSHOP_PLUGIN_ID || detail?.id === WORKSHOP_PLUGIN_ID;
}

function toWorkshopFallbackPresentation(): PluginPresentation {
  return {
    title: "Workshop Map Loader",
    shortDescription: "Browse and load Rocket League workshop maps directly from RLPeak.",
    description: "Load curated workshop maps by writing CookedPCConsole/mods/Labs_Utopia_P.upk while keeping the original game file untouched.",
    longDescriptionMarkdown: [
      "**Workshop Map Loader** lets you browse, load, and restore Rocket League workshop maps from inside RLPeak.",
      "",
      "### Features",
      "- Browse remote workshop catalog",
      "- Search by map name and author",
      "- One-click load to TAGame/CookedPCConsole/mods/Labs_Utopia_P.upk",
      "- Keep TAGame/CookedPCConsole/Labs_Utopia_P.upk untouched",
      "- Remove loaded map to return to normal Utopia Retro behavior",
      "- No injection, no memory editing, no process hooks",
    ].join("\n"),
    tags: ["Workshop", "Maps"],
    categories: ["Built-in runtime"],
    credits: [],
    externalLinks: [],
  };
}

function toRocketStatsFallbackPresentation(): PluginPresentation {
  return {
    title: "RocketStats",
    shortDescription:
      "RocketStats is an in-game Rocket League overlay for session MMR, wins, losses and streaks, re-integrated into RLPeak.",
    description:
      "RocketStats is a Rocket League overlay re-integrated into RLPeak with live session MMR, wins, losses and streak tracking.",
    longDescriptionMarkdown: ROCKETSTATS_LONG_DESCRIPTION_MARKDOWN,
    tags: ["Overlay", "Stats"],
    categories: ["Built-in runtime"],
    credits: [
      {
        name: "RocketStats team and contributors",
        role: "Original plugin creators",
        license: "MIT",
      },
    ],
    attribution: "RocketStats assets/theme are from the RocketStats project (MIT licensed).",
    externalLinks: [...ROCKETSTATS_DEFAULT_EXTERNAL_LINKS],
  };
}

export function resolvePluginPresentation(params: {
  manifestEntry: PluginManifestEntry | null;
  detail: PluginDetailFile | null;
}): PluginPresentation {
  const { manifestEntry, detail } = params;
  const isRocketStats = isWinLossOverlayPlugin(manifestEntry, detail);
  const isWorkshop = isWorkshopMapLoaderPlugin(manifestEntry, detail);
  const fallback = isRocketStats
    ? toRocketStatsFallbackPresentation()
    : (isWorkshop ? toWorkshopFallbackPresentation() : null);

  const title = combineUnique([
    detail?.title,
    manifestEntry?.title,
    fallback?.title,
    detail?.name,
    manifestEntry?.name,
  ])[0] ?? "Plugin";

  const shortDescription = combineUnique([
    detail?.short_description,
    manifestEntry?.short_description,
    fallback?.shortDescription,
    manifestEntry?.summary,
    detail?.description,
  ])[0] ?? "Plugin description is not available.";

  const description = combineUnique([
    detail?.description,
    fallback?.description,
    detail?.short_description,
    manifestEntry?.summary,
  ])[0] ?? "Plugin description is not available.";

  const longDescriptionMarkdown = combineUnique([
    detail?.long_description_markdown,
    detail?.long_description_html,
    fallback?.longDescriptionMarkdown,
  ])[0] ?? description;

  const tags = combineUniqueArrays([
    detail?.tags,
    manifestEntry?.tags,
    fallback?.tags,
  ]);

  const categories = combineUniqueArrays([
    detail?.categories,
    manifestEntry?.categories,
    fallback?.categories,
  ]);

  const credits = [
    ...mapCredits(detail?.credits),
    ...(fallback?.credits ?? []),
  ];

  const externalLinks = [
    ...mapExternalLinks(detail?.external_links),
    ...(fallback?.externalLinks ?? []),
  ];

  const dedupedLinks = externalLinks.filter((entry, index, list) => (
    list.findIndex((candidate) => candidate.url === entry.url) === index
  ));

  return {
    title,
    shortDescription,
    description,
    longDescriptionMarkdown,
    tags,
    categories,
    credits,
    attribution: detail?.attribution ?? fallback?.attribution,
    externalLinks: dedupedLinks,
  };
}

export function getPluginIconUrl(
  detail: PluginDetailFile | null,
  manifestEntry?: PluginManifestEntry | null,
): string | null {
  if (!detail && !manifestEntry) {
    return null;
  }

  const remotePath = detail?.icon_remote_path
    ?? manifestEntry?.icon_remote_path
    ?? (detail ? readRemotePathFromFiles(
      detail,
      (filename) => filename.toLowerCase() === "icon.png",
    ) : undefined);
  return sanitizeRemotePath(remotePath);
}

export function getPluginBannerUrl(
  detail: PluginDetailFile | null,
  manifestEntry?: PluginManifestEntry | null,
): string | null {
  if (!detail && !manifestEntry) {
    return null;
  }

  const remotePath = detail?.banner_remote_path
    ?? manifestEntry?.banner_remote_path
    ?? (detail ? readRemotePathFromFiles(
      detail,
      (filename) => filename.toLowerCase().includes("banner"),
    ) : undefined);
  return sanitizeRemotePath(remotePath);
}

export function getPluginScreenshotUrls(detail: PluginDetailFile | null): string[] {
  if (!detail) {
    return [];
  }

  const nextPaths: string[] = [];
  for (const screenshot of detail.screenshots ?? []) {
    nextPaths.push(screenshot.remote_path);
  }
  for (const path of detail.screenshot_remote_paths ?? []) {
    nextPaths.push(path);
  }

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const path of nextPaths) {
    const resolved = sanitizeRemotePath(path);
    if (!resolved) {
      continue;
    }

    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    urls.push(resolved);
  }

  return urls;
}

function normalizePluginType(rawType: string | undefined): string {
  return typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
}

function normalizeRuntimeId(rawRuntimeId: string | undefined): string {
  return typeof rawRuntimeId === "string" ? rawRuntimeId.trim().toLowerCase() : "";
}

export function pluginSupportsEnableDisable(params: {
  manifestEntry: PluginManifestEntry | null;
  detail: PluginDetailFile | null;
}): boolean {
  const pluginType = normalizePluginType(params.detail?.type ?? params.manifestEntry?.type);
  if (ACTION_ONLY_PLUGIN_TYPES.has(pluginType)) {
    return false;
  }

  const runtimeId = normalizeRuntimeId(params.detail?.runtime ?? params.manifestEntry?.runtime);
  if (runtimeId.length === 0 || runtimeId === "none") {
    return false;
  }

  if (RUNTIME_IDS_WITHOUT_ENABLE_DISABLE.has(runtimeId)) {
    return false;
  }

  return true;
}

export function formatMmrFailureReasonLabel(reason: WinLossOverlayMmrFailureReason | null): string {
  if (reason === null) {
    return "None";
  }

  const labels: Record<WinLossOverlayMmrFailureReason, string> = {
    player_not_detected: "Player not detected",
    tracker_blocked: "Tracker blocked",
    rate_limited: "Rate limited",
    tracker_unavailable: "Tracker unavailable",
    profile_private_or_missing: "Profile private or missing",
    non_json_response: "Non-JSON response",
    parse_failed: "Parse failed",
    no_ranked_stats: "No ranked stats",
    network_error: "Network error",
    unknown: "Unknown",
  };

  return labels[reason] ?? "Unknown";
}

export function resolveMmrFailureReasonLabel(params: {
  status: WinLossOverlayMmrStatus;
  reason: WinLossOverlayMmrFailureReason | null;
}): string {
  if (params.status !== "failed") {
    return "None";
  }
  return formatMmrFailureReasonLabel(params.reason);
}
