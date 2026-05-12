import type { RuntimeActionResult, WinLossOverlayRuntimeState } from "../../modules/plugins/winLossOverlayRuntimeService";

export type PluginActionName =
  | "install"
  | "uninstall"
  | "enable"
  | "disable"
  | "forceStop"
  | "resetSession"
  | "showOverlay"
  | "hideOverlay"
  | "openLogs"
  | "saveOverlaySettings"
  | "resetOverlaySettings"
  | "refreshWorkshopMaps"
  | "loadWorkshopMap"
  | "restoreWorkshopMap"
  | "openWorkshopCache"
  | "openWorkshopLogs";

export type PluginActionBusyMap = Record<string, boolean>;

export const WIN_LOSS_RUNTIME_STATUSES_KEEP_DISABLE = new Set<WinLossOverlayRuntimeState["status"]>([
  "Waiting for Rocket League",
  "Restart Rocket League",
  "Connected",
  "In Match",
  "Error",
]);

export function makePluginActionBusyKey(pluginId: string, action: PluginActionName): string {
  return `${pluginId}:${action}`;
}

export function withPluginActionBusyState(
  state: PluginActionBusyMap,
  pluginId: string,
  action: PluginActionName,
  busy: boolean,
): PluginActionBusyMap {
  const key = makePluginActionBusyKey(pluginId, action);
  if (busy) {
    return {
      ...state,
      [key]: true,
    };
  }

  const next = { ...state };
  delete next[key];
  return next;
}

export function isPluginActionBusy(
  state: PluginActionBusyMap,
  pluginId: string,
  action: PluginActionName,
): boolean {
  return state[makePluginActionBusyKey(pluginId, action)] === true;
}

export function isAnyPluginActionBusyForPlugin(
  state: PluginActionBusyMap,
  pluginId: string,
): boolean {
  return Object.keys(state).some((key) => key.startsWith(`${pluginId}:`) && state[key] === true);
}

export function shouldShowDisableControl(params: {
  isInstalled: boolean;
  isEnabled: boolean;
  isWinLossRuntime: boolean;
  runtimeState: WinLossOverlayRuntimeState | undefined;
}): boolean {
  const { isInstalled, isEnabled, isWinLossRuntime, runtimeState } = params;
  if (!isInstalled) {
    return false;
  }

  if (!isWinLossRuntime) {
    return isEnabled;
  }

  if (isEnabled) {
    return true;
  }

  if (!runtimeState) {
    return false;
  }

  return WIN_LOSS_RUNTIME_STATUSES_KEEP_DISABLE.has(runtimeState.status);
}

export function toRuntimeActionFailure(error: unknown, fallbackMessage: string): RuntimeActionResult {
  const details = error instanceof Error && error.message.trim().length > 0
    ? error.message
    : String(error);
  return {
    ok: false,
    message: fallbackMessage,
    details,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`PLUGIN_ACTION_TIMEOUT:${timeoutMs}`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  });
}

export async function runPluginActionWithBusyState(params: {
  pluginId: string;
  action: PluginActionName;
  actionRunner: () => Promise<RuntimeActionResult>;
  setBusyState: (updater: (current: PluginActionBusyMap) => PluginActionBusyMap) => void;
  fallbackMessage: string;
  timeoutMs?: number | null;
  timeoutMessage?: string;
}): Promise<RuntimeActionResult> {
  const {
    pluginId,
    action,
    actionRunner,
    setBusyState,
    fallbackMessage,
    timeoutMs = 15_000,
    timeoutMessage = "Plugin action timed out. Try Disable or Force stop overlay.",
  } = params;

  setBusyState((current) => withPluginActionBusyState(current, pluginId, action, true));
  try {
    if (timeoutMs === null) {
      return await actionRunner();
    }
    return await withTimeout(actionRunner(), timeoutMs);
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    if (details.startsWith("PLUGIN_ACTION_TIMEOUT:")) {
      return {
        ok: false,
        message: timeoutMessage,
        details,
      };
    }
    return toRuntimeActionFailure(error, fallbackMessage);
  } finally {
    setBusyState((current) => withPluginActionBusyState(current, pluginId, action, false));
  }
}
