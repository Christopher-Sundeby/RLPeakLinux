import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  getSharedCatalogSnapshot,
  type CatalogLoadSnapshot,
} from "../../modules/items/catalogService";
import { openBackupsFolder, openCookedPcConsoleFolder } from "../../modules/items/folderActionsService";
import { resetAll } from "../../modules/items/restoreService";
import {
  ensureRocketLeaguePathForActions,
  normalizeRocketLeaguePathInput,
  ROCKET_LEAGUE_PATH_SETUP_MESSAGE,
  resolvePreferredRocketLeaguePath,
  type RocketLeaguePathValidationResult,
  validateRocketLeaguePath,
} from "../../modules/items/rocketLeaguePathService";
import { loadAppState, saveRocketLeaguePathSetting } from "../../modules/items/stateService";
import {
  getMetricsEnabledSetting,
  setMetricsEnabled,
} from "../../modules/metrics/metricsStateService";

interface ActionStatus {
  ok: boolean;
  message: string;
}

function summarizeCatalogReload(snapshot: CatalogLoadSnapshot): ActionStatus {
  const allLoaded = snapshot.skin.ok && snapshot.wheel.ok && snapshot.boost.ok;
  if (allLoaded) {
    return {
      ok: true,
      message: "Catalogs reloaded successfully.",
    };
  }

  return {
    ok: false,
    message: "Catalog reload completed with one or more catalog errors.",
  };
}

export function SettingsPage() {
  const [rocketLeaguePath, setRocketLeaguePath] = useState("");
  const [validation, setValidation] = useState<RocketLeaguePathValidationResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<ActionStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBrowsingPath, setIsBrowsingPath] = useState(false);

  const [folderActionStatus, setFolderActionStatus] = useState<ActionStatus | null>(null);
  const [catalogReloadStatus, setCatalogReloadStatus] = useState<ActionStatus | null>(null);
  const [isReloadingCatalogs, setIsReloadingCatalogs] = useState(false);
  const [resetAllStatus, setResetAllStatus] = useState<ActionStatus | null>(null);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [metricsEnabled, setMetricsEnabledState] = useState(true);
  const [isSavingMetricsSetting, setIsSavingMetricsSetting] = useState(false);
  const [metricsStatus, setMetricsStatus] = useState<ActionStatus | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([loadAppState(), getMetricsEnabledSetting()])
      .then(async ([appStateResult, metricsResult]) => {
        if (!isMounted) {
          return;
        }

        if (metricsResult.status === "fulfilled") {
          setMetricsEnabledState(metricsResult.value);
        } else {
          setMetricsEnabledState(true);
        }

        const appState = appStateResult.status === "fulfilled" ? appStateResult.value : {};
        const savedPath = typeof appState.rocketLeaguePath === "string" ? appState.rocketLeaguePath : undefined;
        const resolvedPath = await resolvePreferredRocketLeaguePath(savedPath);
        if (!isMounted) {
          return;
        }
        setRocketLeaguePath(resolvedPath.rocketLeaguePath);
        if (resolvedPath.source === "detected") {
          setStatusMessage({
            ok: true,
            message: "Detected Rocket League folder. Review it and click Save Path.",
          });
          return;
        }

        if (resolvedPath.source === "empty") {
          setStatusMessage({
            ok: false,
            message: ROCKET_LEAGUE_PATH_SETUP_MESSAGE,
          });
        }
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setStatusMessage({
          ok: false,
          message: ROCKET_LEAGUE_PATH_SETUP_MESSAGE,
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleMetricsEnabledToggle = async (enabled: boolean) => {
    setMetricsStatus(null);
    setMetricsEnabledState(enabled);
    setIsSavingMetricsSetting(true);

    try {
      await setMetricsEnabled(enabled);
      setMetricsStatus({
        ok: true,
        message: enabled ? "Anonymous usage metrics enabled." : "Anonymous usage metrics disabled.",
      });
    } catch {
      setMetricsEnabledState(!enabled);
      setMetricsStatus({
        ok: false,
        message: "Could not update anonymous usage metrics setting.",
      });
    } finally {
      setIsSavingMetricsSetting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const trimmedPath = rocketLeaguePath.trim();
      if (!trimmedPath) {
        if (isMounted) {
          setValidation(null);
        }
        return;
      }

      const result = await validateRocketLeaguePath(trimmedPath);
      if (!isMounted) {
        return;
      }
      setValidation(result);
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [rocketLeaguePath]);

  const handleSavePath = async () => {
    setStatusMessage(null);
    setIsSaving(true);

    const result = await validateRocketLeaguePath(rocketLeaguePath);
    setValidation(result);
    if (!result.isValid) {
      setStatusMessage({
        ok: false,
        message: ROCKET_LEAGUE_PATH_SETUP_MESSAGE,
      });
      setIsSaving(false);
      return;
    }

    try {
      await saveRocketLeaguePathSetting(result.rocketLeaguePath);
      setStatusMessage({
        ok: true,
        message: "Saved successfully",
      });
      setRocketLeaguePath(result.rocketLeaguePath);
    } catch {
      setStatusMessage({
        ok: false,
        message: "Save failed",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBrowsePath = async () => {
    setStatusMessage(null);
    setIsBrowsingPath(true);
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Select Rocket League folder",
        defaultPath: rocketLeaguePath.trim() || undefined,
      });

      if (typeof selectedPath === "string" && selectedPath.trim()) {
        const result = await validateRocketLeaguePath(selectedPath.trim());
        setValidation(result);
        if (result.isValid) {
          setRocketLeaguePath(result.rocketLeaguePath);
          setStatusMessage(null);
          return;
        }

        setRocketLeaguePath(normalizeRocketLeaguePathInput(selectedPath));
        setStatusMessage({
          ok: false,
          message: ROCKET_LEAGUE_PATH_SETUP_MESSAGE,
        });
      }
    } catch {
      setStatusMessage({
        ok: false,
        message: "Folder picker failed",
      });
    } finally {
      setIsBrowsingPath(false);
    }
  };

  const handleOpenCookedPcConsole = async () => {
    const result = await openCookedPcConsoleFolder(rocketLeaguePath);
    setFolderActionStatus({
      ok: result.ok,
      message: result.message,
    });
  };

  const handleOpenBackupsFolder = async () => {
    const result = await openBackupsFolder();
    setFolderActionStatus({
      ok: result.ok,
      message: result.message,
    });
  };

  const handleReloadCatalogs = async () => {
    setCatalogReloadStatus(null);
    setIsReloadingCatalogs(true);
    try {
      const snapshot = await getSharedCatalogSnapshot({ forceReload: true });
      setCatalogReloadStatus(summarizeCatalogReload(snapshot.snapshot));
    } catch {
      setCatalogReloadStatus({
        ok: false,
        message: "Catalog reload failed",
      });
    } finally {
      setIsReloadingCatalogs(false);
    }
  };

  const handleResetAll = async () => {
    const guard = await ensureRocketLeaguePathForActions(rocketLeaguePath);
    if (!guard.ok) {
      setResetAllStatus({
        ok: false,
        message: guard.message,
      });
      return;
    }

    const trimmedPath = guard.rocketLeaguePath;
    if (trimmedPath !== rocketLeaguePath.trim()) {
      setRocketLeaguePath(trimmedPath);
    }

    setResetAllStatus(null);
    setIsResettingAll(true);
    try {
      const result = await resetAll({ rocketLeaguePath: trimmedPath });
      setResetAllStatus({
        ok: result.ok,
        message: result.message,
      });
    } catch {
      setResetAllStatus({
        ok: false,
        message: "Restore failed",
      });
    } finally {
      setIsResettingAll(false);
    }
  };

  const showPathSetupPrompt = !rocketLeaguePath.trim() || (validation ? !validation.isValid : false);

  return (
    <section className="page settings-page">
      <h1>Settings</h1>
      <p>Configure your Rocket League folder and maintenance actions for RLPeak.</p>

      <div className="settings-layout">
        <section className="settings-card">
          <h2 className="catalog-heading">Game Path and Actions</h2>
          <p className="settings-card-copy">
            Set your Rocket League root folder once, then manage catalogs, backups, and restore actions from here.
          </p>

          {showPathSetupPrompt ? (
            <div className="settings-setup-prompt" role="status" aria-live="polite">
              <h3 className="settings-setup-title">Set up Rocket League folder</h3>
              <p className="settings-setup-copy">
                RLPeak needs your Rocket League folder before it can apply items. Click Browse, select your Rocket
                League folder, then save.
              </p>
              <button
                type="button"
                className="settings-btn-primary settings-setup-btn"
                onClick={() => {
                  void handleBrowsePath();
                }}
                disabled={isBrowsingPath}
              >
                {isBrowsingPath ? "Browsing..." : "Choose folder"}
              </button>
            </div>
          ) : null}

          <label className="settings-label" htmlFor="rocket-league-path">
            Rocket League path
          </label>
          <div className="settings-path-row">
            <input
              id="rocket-league-path"
              className="settings-input"
              type="text"
              value={rocketLeaguePath}
              onChange={(event) => {
                setRocketLeaguePath(event.currentTarget.value);
                setStatusMessage(null);
              }}
              placeholder="C:\\Program Files\\Epic Games\\rocketleague"
            />
            <button
              type="button"
              className="settings-btn-secondary settings-browse-btn"
              onClick={() => {
                void handleBrowsePath();
              }}
              disabled={isBrowsingPath}
            >
              {isBrowsingPath ? "Browsing..." : "Browse..."}
            </button>
          </div>

          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn-primary"
              onClick={handleSavePath}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Path"}
            </button>
          </div>

          {statusMessage ? (
            <p className={statusMessage.ok ? "status-ok status-message" : "status-error status-message"}>
              {statusMessage.message}
            </p>
          ) : null}

          <div className="settings-actions settings-actions-secondary">
            <button type="button" className="settings-btn-secondary" onClick={handleOpenCookedPcConsole}>
              Open CookedPCConsole
            </button>
            <button type="button" className="settings-btn-secondary" onClick={handleOpenBackupsFolder}>
              Open Backups
            </button>
            <button
              type="button"
              className="settings-btn-secondary"
              onClick={handleReloadCatalogs}
              disabled={isReloadingCatalogs}
            >
              {isReloadingCatalogs ? "Reloading..." : "Reload Catalogs"}
            </button>
            <button
              type="button"
              className="settings-btn-secondary"
              onClick={handleResetAll}
              disabled={isResettingAll}
            >
              {isResettingAll ? "Resetting..." : "Reset All"}
            </button>
          </div>

          {folderActionStatus ? (
            <p className={folderActionStatus.ok ? "status-ok status-message" : "status-error status-message"}>
              {folderActionStatus.message}
            </p>
          ) : null}

          {catalogReloadStatus ? (
            <p className={catalogReloadStatus.ok ? "status-ok status-message" : "status-error status-message"}>
              {catalogReloadStatus.message}
            </p>
          ) : null}

          {resetAllStatus ? (
            <p className={resetAllStatus.ok ? "status-ok status-message" : "status-error status-message"}>
              {resetAllStatus.message}
            </p>
          ) : null}
          {!rocketLeaguePath.trim() ? (
            <p className="settings-empty-path-hint">{ROCKET_LEAGUE_PATH_SETUP_MESSAGE}</p>
          ) : validation && !validation.isValid ? (
            <p className="settings-empty-path-hint">{ROCKET_LEAGUE_PATH_SETUP_MESSAGE}</p>
          ) : null}
        </section>

        <section className="settings-card">
          <h2 className="catalog-heading">Privacy</h2>
          <p className="settings-card-copy">
            Anonymous usage metrics help improve RLPeak stability and plugin quality.
          </p>

          <label className="settings-label settings-toggle-row" htmlFor="metrics-enabled-toggle">
            <span>Anonymous usage metrics</span>
            <input
              id="metrics-enabled-toggle"
              type="checkbox"
              checked={metricsEnabled}
              disabled={isSavingMetricsSetting}
              onChange={(event) => {
                void handleMetricsEnabledToggle(event.currentTarget.checked);
              }}
            />
          </label>

          <p className="settings-card-copy">
            Help improve RLPeak by sending anonymous usage events such as app start, app version, plugin usage and
            error codes. No personal data, no Rocket League account data, and no local file paths.
          </p>

          {metricsStatus ? (
            <p className={metricsStatus.ok ? "status-ok status-message" : "status-error status-message"}>
              {metricsStatus.message}
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
}
