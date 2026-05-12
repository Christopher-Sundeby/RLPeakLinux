import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getLocalAppDataPaths } from "../items/pathService";
import { loadAppState, saveAppState } from "../items/stateService";
import type { PluginStateEntry, PluginsState } from "../items/types";
import { trackEvent } from "../metrics/metricsService";
import { loadPluginDetail } from "./pluginCatalogService";
import {
  buildPluginAssetUrl,
  isPluginAssetExtensionAllowed,
  resolvePluginAssetRelativeSegments,
} from "./pluginSecurity";
import type { PluginManifestEntry } from "./types";

export interface PluginActionResult {
  ok: boolean;
  message: string;
  details?: string;
}

function toDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const asString = String(error).trim();
  return asString.length > 0 ? asString : "Unknown error";
}

function safeTrackMetricsEvent(
  event: "plugin_installed" | "plugin_uninstalled" | "plugin_enabled" | "plugin_disabled",
  pluginId: string,
): void {
  try {
    void trackEvent(event, { pluginId });
  } catch {
    // Metrics failures must never block plugin actions.
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("path_exists", { path });
  } catch {
    return false;
  }
}

async function removePath(path: string): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(path);
    return;
  }

  await invoke("remove_path", { path });
}

async function updatePluginsState(
  updater: (plugins: PluginsState) => PluginsState,
): Promise<PluginsState> {
  const state = await loadAppState();
  const currentPlugins = state.plugins ?? {};
  const nextPlugins = updater({ ...currentPlugins });
  await saveAppState({
    ...state,
    plugins: nextPlugins,
  });
  return nextPlugins;
}

export async function readPluginsState(): Promise<PluginsState> {
  const state = await loadAppState();
  return state.plugins ?? {};
}

export async function installPlugin(manifestEntry: PluginManifestEntry): Promise<PluginActionResult> {
  const detailResult = await loadPluginDetail(manifestEntry.id, manifestEntry.manifest_path, {
    allowCacheFallback: true,
  });
  if (!detailResult.ok || !detailResult.detail) {
    return {
      ok: false,
      message: detailResult.message ?? "Plugin install failed.",
      details: detailResult.details,
    };
  }

  const detail = detailResult.detail;
  const paths = await getLocalAppDataPaths();
  const pluginCacheRoot = await join(paths.cachePluginsRoot, manifestEntry.id);

  for (const file of detail.files) {
    if (!isPluginAssetExtensionAllowed(file.filename)) {
      return {
        ok: false,
        message: "Plugin install blocked: unsupported asset type.",
        details: `Blocked plugin asset extension: ${file.filename}`,
      };
    }

    let relativeSegments: string[];
    let remoteAssetUrl: string;
    try {
      relativeSegments = resolvePluginAssetRelativeSegments(
        manifestEntry.id,
        file.filename,
        file.remote_path,
      );
      remoteAssetUrl = buildPluginAssetUrl(file.remote_path);
    } catch (error: unknown) {
      return {
        ok: false,
        message: "Plugin install blocked: invalid plugin asset path.",
        details: toDetails(error),
      };
    }

    const destinationPath = await join(pluginCacheRoot, ...relativeSegments);
    const alreadyCached = await pathExists(destinationPath);
    if (!alreadyCached) {
      try {
        await invoke("download_remote_file", {
          url: remoteAssetUrl,
          destinationPath,
        });
      } catch (error: unknown) {
        return {
          ok: false,
          message: "Plugin install failed. Please check your connection and try again.",
          details: toDetails(error),
        };
      }

      if (!(await pathExists(destinationPath))) {
        return {
          ok: false,
          message: "Plugin install failed. Please check your connection and try again.",
          details: `Plugin asset missing after download: ${destinationPath}`,
        };
      }
    }
  }

  await updatePluginsState((plugins) => {
    const existing = plugins[manifestEntry.id] ?? {};
    const nextEntry: PluginStateEntry = {
      ...existing,
      installed: true,
      enabled: existing.enabled === true,
      name: manifestEntry.name,
      summary: manifestEntry.summary,
      version: manifestEntry.version,
      type: manifestEntry.type,
      runtime: manifestEntry.runtime,
      installed_at: existing.installed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return {
      ...plugins,
      [manifestEntry.id]: nextEntry,
    };
  });

  safeTrackMetricsEvent("plugin_installed", manifestEntry.id);

  return {
    ok: true,
    message: "Plugin installed successfully.",
  };
}

export async function uninstallPlugin(pluginId: string): Promise<PluginActionResult> {
  const paths = await getLocalAppDataPaths();
  const pluginCacheRoot = await join(paths.cachePluginsRoot, pluginId);

  try {
    await removePath(pluginCacheRoot);
  } catch (error: unknown) {
    return {
      ok: false,
      message: "Plugin uninstall failed.",
      details: toDetails(error),
    };
  }

  await updatePluginsState((plugins) => {
    const next = { ...plugins };
    delete next[pluginId];
    return next;
  });

  safeTrackMetricsEvent("plugin_uninstalled", pluginId);

  return {
    ok: true,
    message: "Plugin uninstalled successfully.",
  };
}

export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<PluginActionResult> {
  let isInstalled = false;

  await updatePluginsState((plugins) => {
    const existing = plugins[pluginId];
    if (!existing?.installed) {
      return plugins;
    }

    isInstalled = true;
    return {
      ...plugins,
      [pluginId]: {
        ...existing,
        enabled,
        updated_at: new Date().toISOString(),
      },
    };
  });

  if (!isInstalled) {
    return {
      ok: false,
      message: "Install this plugin before changing enabled state.",
    };
  }

  if (enabled) {
    safeTrackMetricsEvent("plugin_enabled", pluginId);
    return {
      ok: true,
      message: "Plugin enabled.",
    };
  }

  safeTrackMetricsEvent("plugin_disabled", pluginId);
  return {
    ok: true,
    message: "Plugin disabled.",
  };
}
