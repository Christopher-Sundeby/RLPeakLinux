import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLocalAppDataPaths } from "../../modules/items/pathService";
import { ensureRocketLeaguePathForActions } from "../../modules/items/rocketLeaguePathService";
import { loadAppState } from "../../modules/items/stateService";
import type { PluginsState } from "../../modules/items/types";
import {
  loadPluginDetail,
  loadPluginManifest,
} from "../../modules/plugins/pluginCatalogService";
import {
  installPlugin,
  readPluginsState,
  setPluginEnabled,
} from "../../modules/plugins/pluginInstallService";
import {
  getRuntimeIdForPlugin,
  runtimeRequiresRocketLeaguePath,
  startPluginRuntimeLifecycle,
  stopPluginRuntimeLifecycle,
} from "../../modules/plugins/pluginRuntimeLifecycleService";
import type { PluginManifestEntry } from "../../modules/plugins/types";
import type { PluginDetailFile } from "../../modules/plugins/types";
import {
  broadcastWinLossOverlayThemeSettings,
  readWinLossOverlayThemeSettingsFromPluginsState,
  resolveWinLossOverlayWindowLayout,
} from "../../modules/plugins/winLossOverlayThemeSettingsService";
import {
  createDefaultWinLossOverlayState,
  getWinLossOverlayRuntimeState,
  listenWinLossOverlayRuntimeState,
  type RuntimeActionResult,
  type WinLossOverlayRuntimeState,
} from "../../modules/plugins/winLossOverlayRuntimeService";
import {
  isAnyPluginActionBusyForPlugin,
  isPluginActionBusy,
  runPluginActionWithBusyState,
  shouldShowDisableControl,
  type PluginActionBusyMap,
  type PluginActionName,
} from "./pluginsPageSelectors";
import {
  getPluginBannerUrl,
  getPluginIconUrl,
  pluginSupportsEnableDisable,
  readPluginRuntimeStatus,
  resolvePluginPresentation,
  WIN_LOSS_PLUGIN_ID,
  WIN_LOSS_RUNTIME_ID,
} from "./pluginUiShared";

interface PluginCardState {
  manifestEntry: PluginManifestEntry;
  detail: PluginDetailFile | null;
  pluginState?: {
    installed: boolean;
    enabled: boolean;
  };
}

const DEFAULT_PLUGIN_BANNER_URL = "/overlay-themes/rocketstats-circle/background.png";

interface RuntimeActionResultWithState extends RuntimeActionResult {
  state?: WinLossOverlayRuntimeState;
}

function createDefaultRuntimeStateMap(): Record<string, WinLossOverlayRuntimeState> {
  return {
    [WIN_LOSS_PLUGIN_ID]: createDefaultWinLossOverlayState(),
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildPluginManagePath(pluginId: string): string {
  return `/plugins/${pluginId}`;
}

interface PluginCatalogCardProps {
  pluginId: string;
  title: string;
  shortDescription: string;
  bannerUrl: string;
  iconUrl: string | null;
  version: string;
  status: string;
  runtimeStatusLabel: string;
  runtimeStatusClassName: string;
  tags: string[];
  categories: string[];
  isInstalled: boolean;
  isEnabled: boolean;
  supportsEnableDisable: boolean;
  installStateLabel: string;
  canShowInstall: boolean;
  canShowEnable: boolean;
  canShowDisable: boolean;
  isInstallDisabled: boolean;
  isEnableDisabled: boolean;
  isDisableDisabled: boolean;
  onInstall: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onManage: () => void;
}

export function PluginCatalogCard({
  pluginId,
  title,
  shortDescription,
  bannerUrl,
  iconUrl,
  version,
  status,
  runtimeStatusLabel,
  runtimeStatusClassName,
  tags,
  categories,
  isInstalled,
  isEnabled,
  supportsEnableDisable,
  installStateLabel,
  canShowInstall,
  canShowEnable,
  canShowDisable,
  isInstallDisabled,
  isEnableDisabled,
  isDisableDisabled,
  onInstall,
  onEnable,
  onDisable,
  onManage,
}: PluginCatalogCardProps) {
  return (
    <article key={pluginId} className="plugins-card plugins-market-card">
      <div className="plugins-card-media">
        <img className="plugins-card-banner" src={bannerUrl} alt={`${title} banner`} />
        <header className="plugins-card-header">
          <div className="plugins-card-title-wrap">
            {iconUrl ? (
              <img className="plugins-card-icon" src={iconUrl} alt="" aria-hidden="true" />
            ) : (
              <span className="plugins-card-icon plugins-card-icon-fallback" aria-hidden="true">
                RP
              </span>
            )}
            <h2 className="plugins-card-title">{title}</h2>
          </div>
          <span className="plugins-card-version">v{version}</span>
        </header>
      </div>

      <p className="plugins-card-summary">{shortDescription}</p>

      <div className="plugins-card-pill-row">
        <span className="plugins-card-pill">Status: {status}</span>
        <span className={`plugins-card-pill ${isInstalled ? "is-installed" : ""}`}>
          {installStateLabel}
        </span>
        {supportsEnableDisable ? (
          <span className={`plugins-card-pill ${isEnabled ? "is-enabled" : ""}`}>
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
        ) : null}
        <span className={runtimeStatusClassName}>{runtimeStatusLabel}</span>
        {tags.slice(0, 2).map((tag) => (
          <span key={tag} className="plugins-card-tag">{tag}</span>
        ))}
        {categories.slice(0, 1).map((category) => (
          <span key={category} className="plugins-card-tag">{category}</span>
        ))}
      </div>

      <div className="plugins-card-actions">
        {canShowInstall ? (
          <button
            type="button"
            className="settings-btn-primary"
            disabled={isInstallDisabled}
            onClick={onInstall}
          >
            Install
          </button>
        ) : null}

        {canShowEnable ? (
          <button
            type="button"
            className="settings-btn-primary"
            disabled={isEnableDisabled}
            onClick={onEnable}
          >
            Enable
          </button>
        ) : null}

        {canShowDisable ? (
          <button
            type="button"
            className="settings-btn-secondary"
            disabled={isDisableDisabled}
            onClick={onDisable}
          >
            Disable
          </button>
        ) : null}

        <button
          type="button"
          className="settings-btn-secondary"
          onClick={onManage}
        >
          Manage
        </button>
      </div>
    </article>
  );
}

export function PluginsPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [manifestEntries, setManifestEntries] = useState<PluginManifestEntry[]>([]);
  const [pluginDetailsById, setPluginDetailsById] = useState<Record<string, PluginDetailFile>>({});
  const [pluginsState, setPluginsState] = useState<PluginsState>({});
  const [runtimeStateByPluginId, setRuntimeStateByPluginId] = useState<Record<string, WinLossOverlayRuntimeState>>(
    createDefaultRuntimeStateMap(),
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionStatusTone, setActionStatusTone] = useState<"success" | "error">("success");
  const [actionBusyState, setActionBusyState] = useState<PluginActionBusyMap>({});

  const refreshData = useCallback(async (options?: { forceReload?: boolean }) => {
    setIsLoading(true);
    setCatalogError(null);
    try {
      const [manifestResult, nextPluginsState, winLossRuntimeState] = await Promise.all([
        loadPluginManifest({ forceReload: options?.forceReload === true }),
        readPluginsState(),
        getWinLossOverlayRuntimeState(),
      ]);

      setPluginsState(nextPluginsState);
      setRuntimeStateByPluginId((current) => ({
        ...current,
        [WIN_LOSS_PLUGIN_ID]: winLossRuntimeState,
      }));

      if (!manifestResult.ok || !manifestResult.manifest) {
        setManifestEntries([]);
        setPluginDetailsById({});
        setCatalogError(manifestResult.message ?? "RLPeak plugin catalog is unavailable. Please try again later.");
        return;
      }

      setManifestEntries(manifestResult.manifest.plugins);

      const details = await Promise.all(
        manifestResult.manifest.plugins.map(async (entry) => {
          const detailResult = await loadPluginDetail(entry.id, entry.manifest_path, {
            allowCacheFallback: true,
          });
          return {
            pluginId: entry.id,
            detail: detailResult.ok ? detailResult.detail ?? null : null,
          };
        }),
      );

      const nextDetails: Record<string, PluginDetailFile> = {};
      for (const detailItem of details) {
        if (detailItem.detail) {
          nextDetails[detailItem.pluginId] = detailItem.detail;
        }
      }
      setPluginDetailsById(nextDetails);
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      console.error(`Plugins refresh failed: ${details}`);
      setCatalogError("Plugins are temporarily unavailable. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    void (async () => {
      const nextUnlisten = await listenWinLossOverlayRuntimeState((state) => {
        if (!isMounted) {
          return;
        }

        setRuntimeStateByPluginId((current) => ({
          ...current,
          [WIN_LOSS_PLUGIN_ID]: state,
        }));
      });

      if (!isMounted) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    })();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const pluginCards = useMemo<PluginCardState[]>(
    () => manifestEntries.map((entry) => ({
      manifestEntry: entry,
      detail: pluginDetailsById[entry.id] ?? null,
      pluginState: {
        installed: pluginsState[entry.id]?.installed === true,
        enabled: pluginsState[entry.id]?.enabled === true,
      },
    })),
    [manifestEntries, pluginDetailsById, pluginsState],
  );

  const runPluginAction = useCallback(async (
    pluginId: string,
    actionName: PluginActionName,
    action: () => Promise<RuntimeActionResultWithState>,
  ) => {
    setActionStatus(null);
    setActionStatusTone("success");

    const result = await runPluginActionWithBusyState({
      pluginId,
      action: actionName,
      actionRunner: action,
      setBusyState: setActionBusyState,
      fallbackMessage: "Plugin action failed.",
    });

    setActionStatus(result.message);
    setActionStatusTone(result.ok ? "success" : "error");
    if (!result.ok && result.details) {
      console.error(result.details);
    }

    if (result.state && pluginId === WIN_LOSS_PLUGIN_ID) {
      setRuntimeStateByPluginId((current) => ({
        ...current,
        [WIN_LOSS_PLUGIN_ID]: result.state as WinLossOverlayRuntimeState,
      }));
    }

    try {
      await refreshData();
    } catch (error: unknown) {
      console.error(`Plugins refresh after action failed: ${String(error)}`);
    }
  }, [refreshData]);

  const handleEnablePlugin = useCallback(async (manifestEntry: PluginManifestEntry): Promise<RuntimeActionResultWithState> => {
    const persistResult = await setPluginEnabled(manifestEntry.id, true);
    if (!persistResult.ok) {
      return persistResult;
    }

    const runtimeId = getRuntimeIdForPlugin(manifestEntry.id, {
      runtime: manifestEntry.runtime,
    });
    if (!runtimeId) {
      return persistResult;
    }

    const needsRocketLeaguePath = runtimeRequiresRocketLeaguePath(runtimeId);
    const appState = await loadAppState();
    const configuredPath = typeof appState.rocketLeaguePath === "string" ? appState.rocketLeaguePath : "";
    let rocketLeaguePathForRuntime = configuredPath;
    if (needsRocketLeaguePath) {
      const pathGuard = await ensureRocketLeaguePathForActions(configuredPath);
      if (!pathGuard.ok) {
        navigate("/settings");
        await setPluginEnabled(manifestEntry.id, false);
        return {
          ok: false,
          message: pathGuard.message,
        };
      }
      rocketLeaguePathForRuntime = pathGuard.rocketLeaguePath;
    }

    const appDataPaths = await getLocalAppDataPaths();
    const overlaySettings = readWinLossOverlayThemeSettingsFromPluginsState(pluginsState, manifestEntry.id);
    const overlayLayout = runtimeId === WIN_LOSS_RUNTIME_ID
      ? resolveWinLossOverlayWindowLayout(overlaySettings)
      : undefined;
    const startResult = await startPluginRuntimeLifecycle({
      pluginId: manifestEntry.id,
      runtimeId,
      rocketLeaguePath: rocketLeaguePathForRuntime,
      appDataRoot: appDataPaths.appDataRoot,
      overlayLayout,
    });
    if (!startResult.ok) {
      await setPluginEnabled(manifestEntry.id, false);
      return startResult;
    }

    if (runtimeId === WIN_LOSS_RUNTIME_ID) {
      await broadcastWinLossOverlayThemeSettings(overlaySettings);
    }

    return {
      ok: true,
      message: startResult.message,
      state: startResult.state,
    };
  }, [navigate, pluginsState]);

  const handleDisablePlugin = useCallback(async (manifestEntry: PluginManifestEntry): Promise<RuntimeActionResultWithState> => {
    const runtimeId = getRuntimeIdForPlugin(manifestEntry.id, {
      runtime: manifestEntry.runtime,
    });
    if (runtimeId) {
      const stopResult = await stopPluginRuntimeLifecycle({
        pluginId: manifestEntry.id,
        runtimeId,
      });
      if (!stopResult.ok) {
        return stopResult;
      }
    }

    const persistResult = await setPluginEnabled(manifestEntry.id, false);
    if (!persistResult.ok) {
      return persistResult;
    }

    const message = runtimeId ? "Overlay runtime stopped." : "Plugin disabled.";

    return {
      ok: true,
      message,
    };
  }, []);

  return (
    <section className="page">
      <div className="plugins-page-header">
        <h1>Plugins</h1>
        <button
          type="button"
          className="settings-btn-secondary plugins-reload-btn"
          onClick={() => {
            void refreshData({ forceReload: true });
          }}
          disabled={isLoading}
        >
          Reload plugins
        </button>
      </div>

      <p className="plugins-page-subtitle">
        Browse RLPeak plugins, then open Manage for plugin actions, runtime controls, and settings.
      </p>

      {actionStatus ? (
        <p className={`plugins-action-status ${actionStatusTone === "error" ? "is-error" : "is-success"}`}>
          {actionStatus}
        </p>
      ) : null}

      {isLoading ? (
        <div className="plugins-coming-soon">
          <h2 className="catalog-heading">Loading</h2>
          <p className="plugins-coming-copy">Fetching plugin catalog...</p>
        </div>
      ) : null}

      {!isLoading && catalogError ? (
        <div className="plugins-coming-soon">
          <h2 className="catalog-heading">Plugins unavailable</h2>
          <p className="plugins-coming-copy">{catalogError}</p>
          <button
            type="button"
            className="settings-btn-secondary plugins-retry-btn"
            onClick={() => {
              void refreshData({ forceReload: true });
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!isLoading && !catalogError && pluginCards.length === 0 ? (
        <div className="plugins-coming-soon">
          <h2 className="catalog-heading">No plugins</h2>
          <p className="plugins-coming-copy">No plugins are available in the current catalog.</p>
        </div>
      ) : null}

      {!isLoading && !catalogError && pluginCards.length > 0 ? (
        <div className="plugins-grid">
          {pluginCards.map(({ manifestEntry, pluginState, detail }) => {
            const isInstalled = pluginState?.installed === true;
            const isEnabled = isInstalled && pluginState?.enabled === true;
            const supportsEnableDisable = pluginSupportsEnableDisable({
              manifestEntry,
              detail,
            });
            const runtimeState = runtimeStateByPluginId[manifestEntry.id];
            const runtimeStatus = readPluginRuntimeStatus({
              manifestEntry,
              runtimeState,
              isEnabled,
              isInstalled,
            });
            const presentation = resolvePluginPresentation({
              manifestEntry,
              detail,
            });
            const iconUrl = getPluginIconUrl(detail, manifestEntry);
            const bannerUrl = getPluginBannerUrl(detail, manifestEntry) ?? DEFAULT_PLUGIN_BANNER_URL;
            const isAnyActionBusy = isAnyPluginActionBusyForPlugin(actionBusyState, manifestEntry.id);
            const isInstallBusy = isPluginActionBusy(actionBusyState, manifestEntry.id, "install");
            const isEnableBusy = isPluginActionBusy(actionBusyState, manifestEntry.id, "enable");
            const isDisableBusy = isPluginActionBusy(actionBusyState, manifestEntry.id, "disable");
            const shouldShowDisable = supportsEnableDisable && shouldShowDisableControl({
              isInstalled,
              isEnabled,
              isWinLossRuntime: manifestEntry.runtime === WIN_LOSS_RUNTIME_ID,
              runtimeState,
            });
            const installStateLabel = isInstalled
              ? (supportsEnableDisable ? "Installed" : "Installed / Ready")
              : "Not installed";

            return (
              <PluginCatalogCard
                key={manifestEntry.id}
                pluginId={manifestEntry.id}
                title={presentation.title}
                shortDescription={presentation.shortDescription}
                bannerUrl={bannerUrl}
                iconUrl={iconUrl}
                version={manifestEntry.version}
                status={manifestEntry.status}
                runtimeStatusLabel={runtimeStatus.label}
                runtimeStatusClassName={runtimeStatus.className}
                tags={presentation.tags}
                categories={presentation.categories}
                isInstalled={isInstalled}
                isEnabled={isEnabled}
                supportsEnableDisable={supportsEnableDisable}
                installStateLabel={installStateLabel}
                canShowInstall={!isInstalled}
                canShowEnable={supportsEnableDisable && isInstalled && !isEnabled && !shouldShowDisable}
                canShowDisable={supportsEnableDisable && isInstalled && shouldShowDisable}
                isInstallDisabled={isInstallBusy || isAnyActionBusy}
                isEnableDisabled={isEnableBusy || isAnyActionBusy}
                isDisableDisabled={isDisableBusy}
                onInstall={() => {
                  void runPluginAction(manifestEntry.id, "install", async () => installPlugin(manifestEntry));
                }}
                onEnable={() => {
                  void runPluginAction(manifestEntry.id, "enable", async () => handleEnablePlugin(manifestEntry));
                }}
                onDisable={() => {
                  void runPluginAction(manifestEntry.id, "disable", async () => handleDisablePlugin(manifestEntry));
                }}
                onManage={() => {
                  navigate(buildPluginManagePath(manifestEntry.id));
                }}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
