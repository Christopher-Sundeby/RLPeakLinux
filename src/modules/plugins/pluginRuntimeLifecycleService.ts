import type { AppState, PluginStateEntry, PluginsState } from "../items/types";
import { getLocalAppDataPaths } from "../items/pathService";
import { loadAppState } from "../items/stateService";
import {
  forceStopWinLossOverlayRuntime,
  hideWinLossOverlayWindow,
  showWinLossOverlayWindow,
  startWinLossOverlayRuntime,
  stopWinLossOverlayRuntime,
  type RuntimeActionResult,
  type WinLossOverlayWindowLayout,
} from "./winLossOverlayRuntimeService";
import {
  forceStopWorkshopMapLoaderRuntime,
  startWorkshopMapLoaderRuntime,
  stopWorkshopMapLoaderRuntime,
} from "./workshopMapLoaderRuntimeService";
import {
  getDefaultWinLossOverlayThemeSettings,
  readWinLossOverlayThemeSettingsFromPluginEntry,
  resolveWinLossOverlayWindowLayout,
} from "./winLossOverlayThemeSettingsService";

export const WIN_LOSS_OVERLAY_PLUGIN_ID = "win_loss_overlay";
export const WIN_LOSS_OVERLAY_RUNTIME_ID = "builtin.win_loss_overlay.v1";
export const WORKSHOP_MAP_LOADER_PLUGIN_ID = "workshop_map_loader";
export const WORKSHOP_MAP_LOADER_RUNTIME_ID = "builtin.workshop_map_loader.v1";

const DEFAULT_WIN_LOSS_LAYOUT: Required<WinLossOverlayWindowLayout> = resolveWinLossOverlayWindowLayout(
  getDefaultWinLossOverlayThemeSettings(),
);

interface PluginRuntimeContext {
  pluginId: string;
  runtimeId: string;
  rocketLeaguePath: string;
  appDataRoot: string;
}

interface ActivePluginRuntimeEntry {
  pluginId: string;
  runtimeId: string;
  rocketLeaguePath: string;
  appDataRoot: string;
}

interface PluginRuntimeAdapter {
  pluginId: string;
  runtimeId: string;
  requiresRocketLeaguePath: boolean;
  start: (context: PluginRuntimeContext) => Promise<RuntimeActionResult>;
  stop: (context: PluginRuntimeContext) => Promise<RuntimeActionResult>;
  forceStop: (context: PluginRuntimeContext) => Promise<RuntimeActionResult>;
  show: (context: PluginRuntimeContext, layout?: WinLossOverlayWindowLayout) => Promise<RuntimeActionResult>;
  hide: (context: PluginRuntimeContext) => Promise<RuntimeActionResult>;
  shutdown: (context: PluginRuntimeContext) => Promise<RuntimeActionResult>;
}

export interface PluginRuntimeLifecycleResult extends RuntimeActionResult {
  status: "started" | "stopped" | "shown" | "hidden" | "shutdown" | "failed" | "skipped";
  pluginId: string;
  runtimeId: string | null;
}

export interface PluginRuntimeBootstrapSummary {
  attempted: number;
  started: number;
  skipped: number;
  failed: number;
  details: PluginRuntimeLifecycleResult[];
}

export interface PluginRuntimeShutdownSummary {
  attempted: number;
  stopped: number;
  failed: number;
  details: PluginRuntimeLifecycleResult[];
}

type LifecycleDependencies = {
  loadAppState: () => Promise<AppState>;
  getLocalAppDataPaths: () => Promise<{ appDataRoot: string }>;
};

const defaultDependencies: LifecycleDependencies = {
  loadAppState,
  getLocalAppDataPaths,
};

const runtimeRegistry = new Map<string, PluginRuntimeAdapter>();
const pluginIdToRuntimeId = new Map<string, string>();
const activeRuntimes = new Map<string, ActivePluginRuntimeEntry>();

function toDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  const value = String(error).trim();
  return value.length > 0 ? value : "Unknown error";
}

function runtimeKey(pluginId: string, runtimeId: string): string {
  return `${pluginId}::${runtimeId}`;
}

function resolveRuntimeId(pluginId: string, entry?: PluginStateEntry): string | null {
  if (typeof entry?.runtime === "string" && entry.runtime.trim().length > 0) {
    return entry.runtime;
  }

  return pluginIdToRuntimeId.get(pluginId) ?? null;
}

function unsupportedRuntimeResult(pluginId: string, runtimeId: string | null): PluginRuntimeLifecycleResult {
  return {
    ok: true,
    status: "skipped",
    pluginId,
    runtimeId,
    message: runtimeId
      ? `Runtime ${runtimeId} is not supported by this build yet.`
      : "No supported runtime is configured for this plugin.",
  };
}

async function stopWithRecovery(context: PluginRuntimeContext, adapter: PluginRuntimeAdapter): Promise<RuntimeActionResult> {
  const hideResult = await adapter.hide(context);
  const stopResult = await adapter.stop(context);
  if (stopResult.ok) {
    if (!hideResult.ok) {
      return {
        ok: true,
        message: "Runtime stopped. Overlay window may already be closed.",
        details: hideResult.details,
        state: stopResult.state,
      };
    }

    return stopResult;
  }

  const forceStopResult = await adapter.forceStop(context);
  if (!forceStopResult.ok) {
    return forceStopResult;
  }

  return {
    ok: true,
    message: "Runtime stopped after force recovery.",
    details: stopResult.details ?? hideResult.details,
    state: forceStopResult.state,
  };
}

const winLossOverlayAdapter: PluginRuntimeAdapter = {
  pluginId: WIN_LOSS_OVERLAY_PLUGIN_ID,
  runtimeId: WIN_LOSS_OVERLAY_RUNTIME_ID,
  requiresRocketLeaguePath: true,
  async start(context) {
    return startWinLossOverlayRuntime(context.rocketLeaguePath, context.appDataRoot);
  },
  async stop() {
    return stopWinLossOverlayRuntime();
  },
  async forceStop() {
    return forceStopWinLossOverlayRuntime();
  },
  async show(_context, layout) {
    return showWinLossOverlayWindow(layout ?? DEFAULT_WIN_LOSS_LAYOUT);
  },
  async hide() {
    return hideWinLossOverlayWindow();
  },
  async shutdown(context) {
    return stopWithRecovery(context, winLossOverlayAdapter);
  },
};

const workshopMapLoaderAdapter: PluginRuntimeAdapter = {
  pluginId: WORKSHOP_MAP_LOADER_PLUGIN_ID,
  runtimeId: WORKSHOP_MAP_LOADER_RUNTIME_ID,
  requiresRocketLeaguePath: false,
  async start() {
    return startWorkshopMapLoaderRuntime();
  },
  async stop() {
    return stopWorkshopMapLoaderRuntime();
  },
  async forceStop() {
    return forceStopWorkshopMapLoaderRuntime();
  },
  async show() {
    return {
      ok: true,
      message: "Workshop Map Loader does not expose an overlay window.",
    };
  },
  async hide() {
    return {
      ok: true,
      message: "Workshop Map Loader does not expose an overlay window.",
    };
  },
  async shutdown() {
    return stopWorkshopMapLoaderRuntime();
  },
};

function registerAdapter(adapter: PluginRuntimeAdapter): void {
  runtimeRegistry.set(adapter.runtimeId, adapter);
  pluginIdToRuntimeId.set(adapter.pluginId, adapter.runtimeId);
}

registerAdapter(winLossOverlayAdapter);
registerAdapter(workshopMapLoaderAdapter);

function markRuntimeActive(context: PluginRuntimeContext): void {
  activeRuntimes.set(runtimeKey(context.pluginId, context.runtimeId), {
    pluginId: context.pluginId,
    runtimeId: context.runtimeId,
    rocketLeaguePath: context.rocketLeaguePath,
    appDataRoot: context.appDataRoot,
  });
}

function markRuntimeInactive(pluginId: string, runtimeId: string): void {
  activeRuntimes.delete(runtimeKey(pluginId, runtimeId));
}

function buildContext(params: {
  pluginId: string;
  runtimeId: string;
  rocketLeaguePath: string;
  appDataRoot: string;
}): PluginRuntimeContext {
  return {
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
    rocketLeaguePath: params.rocketLeaguePath,
    appDataRoot: params.appDataRoot,
  };
}

function resolveAdapter(runtimeId: string | null): PluginRuntimeAdapter | null {
  if (!runtimeId) {
    return null;
  }

  return runtimeRegistry.get(runtimeId) ?? null;
}

export function runtimeRequiresRocketLeaguePath(runtimeId: string | null): boolean {
  const adapter = resolveAdapter(runtimeId);
  if (!adapter) {
    return false;
  }
  return adapter.requiresRocketLeaguePath;
}

export async function startPluginRuntimeLifecycle(params: {
  pluginId: string;
  runtimeId: string | null;
  rocketLeaguePath: string;
  appDataRoot: string;
  overlayLayout?: WinLossOverlayWindowLayout;
}): Promise<PluginRuntimeLifecycleResult> {
  const adapter = resolveAdapter(params.runtimeId);
  if (!adapter || !params.runtimeId) {
    return unsupportedRuntimeResult(params.pluginId, params.runtimeId);
  }

  if (adapter.requiresRocketLeaguePath && params.rocketLeaguePath.trim().length === 0) {
    return {
      ok: false,
      status: "failed",
      pluginId: params.pluginId,
      runtimeId: params.runtimeId,
      message: "Choose your Rocket League folder in Settings before enabling this plugin.",
      details: "Missing Rocket League path for runtime start.",
    };
  }

  const context = buildContext({
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
    rocketLeaguePath: params.rocketLeaguePath,
    appDataRoot: params.appDataRoot,
  });

  const startResult = await adapter.start(context);
  if (!startResult.ok) {
    return {
      ...startResult,
      status: "failed",
      pluginId: params.pluginId,
      runtimeId: params.runtimeId,
    };
  }
  markRuntimeActive(context);

  const showResult = await adapter.show(context, params.overlayLayout);
  if (!showResult.ok) {
    return {
      ...showResult,
      status: "failed",
      pluginId: params.pluginId,
      runtimeId: params.runtimeId,
      details: showResult.details ?? startResult.details,
    };
  }

  return {
    ...startResult,
    status: "started",
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
  };
}

export async function stopPluginRuntimeLifecycle(params: {
  pluginId: string;
  runtimeId: string | null;
  rocketLeaguePath?: string;
  appDataRoot?: string;
}): Promise<PluginRuntimeLifecycleResult> {
  const adapter = resolveAdapter(params.runtimeId);
  if (!adapter || !params.runtimeId) {
    return unsupportedRuntimeResult(params.pluginId, params.runtimeId);
  }

  const active = activeRuntimes.get(runtimeKey(params.pluginId, params.runtimeId));
  const context = buildContext({
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
    rocketLeaguePath: active?.rocketLeaguePath ?? params.rocketLeaguePath ?? "",
    appDataRoot: active?.appDataRoot ?? params.appDataRoot ?? "AppData",
  });

  const result = await stopWithRecovery(context, adapter);
  if (result.ok) {
    markRuntimeInactive(params.pluginId, params.runtimeId);
    return {
      ...result,
      status: "stopped",
      pluginId: params.pluginId,
      runtimeId: params.runtimeId,
    };
  }

  return {
    ...result,
    status: "failed",
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
  };
}

export async function forceStopPluginRuntimeLifecycle(params: {
  pluginId: string;
  runtimeId: string | null;
  rocketLeaguePath?: string;
  appDataRoot?: string;
}): Promise<PluginRuntimeLifecycleResult> {
  const adapter = resolveAdapter(params.runtimeId);
  if (!adapter || !params.runtimeId) {
    return unsupportedRuntimeResult(params.pluginId, params.runtimeId);
  }

  const active = activeRuntimes.get(runtimeKey(params.pluginId, params.runtimeId));
  const context = buildContext({
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
    rocketLeaguePath: active?.rocketLeaguePath ?? params.rocketLeaguePath ?? "",
    appDataRoot: active?.appDataRoot ?? params.appDataRoot ?? "AppData",
  });
  const result = await adapter.forceStop(context);
  if (result.ok) {
    markRuntimeInactive(params.pluginId, params.runtimeId);
    return {
      ...result,
      status: "stopped",
      pluginId: params.pluginId,
      runtimeId: params.runtimeId,
    };
  }

  return {
    ...result,
    status: "failed",
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
  };
}

export async function showPluginRuntimeLifecycle(params: {
  pluginId: string;
  runtimeId: string | null;
  rocketLeaguePath?: string;
  appDataRoot?: string;
  overlayLayout?: WinLossOverlayWindowLayout;
}): Promise<PluginRuntimeLifecycleResult> {
  const adapter = resolveAdapter(params.runtimeId);
  if (!adapter || !params.runtimeId) {
    return unsupportedRuntimeResult(params.pluginId, params.runtimeId);
  }

  const active = activeRuntimes.get(runtimeKey(params.pluginId, params.runtimeId));
  const context = buildContext({
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
    rocketLeaguePath: active?.rocketLeaguePath ?? params.rocketLeaguePath ?? "",
    appDataRoot: active?.appDataRoot ?? params.appDataRoot ?? "AppData",
  });
  const result = await adapter.show(context, params.overlayLayout);
  if (result.ok) {
    return {
      ...result,
      status: "shown",
      pluginId: params.pluginId,
      runtimeId: params.runtimeId,
    };
  }

  return {
    ...result,
    status: "failed",
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
  };
}

export async function hidePluginRuntimeLifecycle(params: {
  pluginId: string;
  runtimeId: string | null;
  rocketLeaguePath?: string;
  appDataRoot?: string;
}): Promise<PluginRuntimeLifecycleResult> {
  const adapter = resolveAdapter(params.runtimeId);
  if (!adapter || !params.runtimeId) {
    return unsupportedRuntimeResult(params.pluginId, params.runtimeId);
  }

  const active = activeRuntimes.get(runtimeKey(params.pluginId, params.runtimeId));
  const context = buildContext({
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
    rocketLeaguePath: active?.rocketLeaguePath ?? params.rocketLeaguePath ?? "",
    appDataRoot: active?.appDataRoot ?? params.appDataRoot ?? "AppData",
  });
  const result = await adapter.hide(context);
  if (result.ok) {
    return {
      ...result,
      status: "hidden",
      pluginId: params.pluginId,
      runtimeId: params.runtimeId,
    };
  }

  return {
    ...result,
    status: "failed",
    pluginId: params.pluginId,
    runtimeId: params.runtimeId,
  };
}

function shouldAttemptRuntimeStart(entry: PluginStateEntry | undefined): boolean {
  return entry?.installed === true && entry?.enabled === true;
}

export async function bootstrapEnabledPluginRuntimes(
  options?: {
    rocketLeaguePath?: string | null;
    dependencies?: Partial<LifecycleDependencies>;
  },
): Promise<PluginRuntimeBootstrapSummary> {
  const dependencies: LifecycleDependencies = {
    ...defaultDependencies,
    ...options?.dependencies,
  };

  const state = await dependencies.loadAppState();
  const pluginsState: PluginsState = state.plugins ?? {};
  const { appDataRoot } = await dependencies.getLocalAppDataPaths();
  const results: PluginRuntimeLifecycleResult[] = [];

  const pluginEntries = Object.entries(pluginsState);
  for (const [pluginId, pluginState] of pluginEntries) {
    if (!shouldAttemptRuntimeStart(pluginState)) {
      results.push({
        ok: true,
        status: "skipped",
        pluginId,
        runtimeId: resolveRuntimeId(pluginId, pluginState),
        message: "Plugin runtime auto-start skipped: plugin is not enabled.",
      });
      continue;
    }

    const runtimeId = resolveRuntimeId(pluginId, pluginState);
    const pathFromState = typeof state.rocketLeaguePath === "string" ? state.rocketLeaguePath.trim() : "";
    const rocketLeaguePath = options?.rocketLeaguePath?.trim() || pathFromState;
    const runtimeNeedsPath = runtimeRequiresRocketLeaguePath(runtimeId);
    if (runtimeNeedsPath && rocketLeaguePath.length === 0) {
      results.push({
        ok: false,
        status: "failed",
        pluginId,
        runtimeId,
        message: "Choose your Rocket League folder in Settings before enabling this plugin.",
        details: "Missing Rocket League path during startup runtime bootstrap.",
      });
      continue;
    }

    results.push(await startPluginRuntimeLifecycle({
      pluginId,
      runtimeId,
      rocketLeaguePath,
      appDataRoot,
      overlayLayout: runtimeId === WIN_LOSS_OVERLAY_RUNTIME_ID
        ? resolveWinLossOverlayWindowLayout(readWinLossOverlayThemeSettingsFromPluginEntry(pluginState))
        : undefined,
    }));
  }

  return {
    attempted: results.filter((result) => result.runtimeId !== null).length,
    started: results.filter((result) => result.status === "started").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    details: results,
  };
}

export async function shutdownActivePluginRuntimes(): Promise<PluginRuntimeShutdownSummary> {
  const runtimeEntries = Array.from(activeRuntimes.values());
  const details: PluginRuntimeLifecycleResult[] = [];

  for (const runtimeEntry of runtimeEntries) {
    const adapter = resolveAdapter(runtimeEntry.runtimeId);
    if (!adapter) {
      details.push({
        ok: true,
        status: "skipped",
        pluginId: runtimeEntry.pluginId,
        runtimeId: runtimeEntry.runtimeId,
        message: `Runtime ${runtimeEntry.runtimeId} is no longer registered; skipping shutdown.`,
      });
      markRuntimeInactive(runtimeEntry.pluginId, runtimeEntry.runtimeId);
      continue;
    }

    try {
      const result = await adapter.shutdown({
        pluginId: runtimeEntry.pluginId,
        runtimeId: runtimeEntry.runtimeId,
        rocketLeaguePath: runtimeEntry.rocketLeaguePath,
        appDataRoot: runtimeEntry.appDataRoot,
      });
      if (result.ok) {
        details.push({
          ...result,
          status: "shutdown",
          pluginId: runtimeEntry.pluginId,
          runtimeId: runtimeEntry.runtimeId,
        });
        markRuntimeInactive(runtimeEntry.pluginId, runtimeEntry.runtimeId);
      } else {
        details.push({
          ...result,
          status: "failed",
          pluginId: runtimeEntry.pluginId,
          runtimeId: runtimeEntry.runtimeId,
        });
      }
    } catch (error: unknown) {
      details.push({
        ok: false,
        status: "failed",
        pluginId: runtimeEntry.pluginId,
        runtimeId: runtimeEntry.runtimeId,
        message: "Plugin runtime shutdown failed.",
        details: toDetails(error),
      });
    }
  }

  return {
    attempted: runtimeEntries.length,
    stopped: details.filter((entry) => entry.status === "shutdown").length,
    failed: details.filter((entry) => entry.status === "failed").length,
    details,
  };
}

export function getRuntimeIdForPlugin(pluginId: string, entry?: PluginStateEntry): string | null {
  return resolveRuntimeId(pluginId, entry);
}

export function createPluginRuntimeBootstrapRunner(
  dependencies?: Partial<LifecycleDependencies>,
) {
  let attempted = false;
  let pendingRun: Promise<PluginRuntimeBootstrapSummary> | null = null;

  return {
    async run(options?: { rocketLeaguePath?: string | null }) {
      if (attempted) {
        return {
          attempted: 0,
          started: 0,
          skipped: 0,
          failed: 0,
          details: [],
        } satisfies PluginRuntimeBootstrapSummary;
      }

      if (pendingRun) {
        return pendingRun;
      }

      attempted = true;
      pendingRun = bootstrapEnabledPluginRuntimes({
        ...options,
        dependencies,
      }).finally(() => {
        pendingRun = null;
      });
      return pendingRun;
    },
    wasAttempted() {
      return attempted;
    },
  };
}

export function __resetPluginRuntimeLifecycleForTests(): void {
  activeRuntimes.clear();
}
