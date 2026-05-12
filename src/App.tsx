import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  checkStartupVersionGate,
  type VersionGateCheckResult,
} from "./modules/app/versionGateService";
import { checkStartupPathSetup } from "./modules/app/startupPathSetupService";
import { saveRocketLeaguePathSetting } from "./modules/items/stateService";
import {
  createPluginRuntimeBootstrapRunner,
  shutdownActivePluginRuntimes,
} from "./modules/plugins/pluginRuntimeLifecycleService";
import { createPluginRuntimeCloseFlowController } from "./modules/plugins/pluginRuntimeCloseFlowService";
import { openRLPeakWebsite } from "./modules/app/websiteActionService";
import {
  initializeMetrics,
  trackAppStart,
  trackDailyActive,
} from "./modules/metrics/metricsService";
import { shouldRenderMainRoutes } from "./ui/bootGateState";
import {
  readWindowMaximizedState,
  runWindowAction,
} from "./ui/windowShellService";
import { AboutPage } from "./ui/pages/AboutPage";
import { DashboardPage } from "./ui/pages/DashboardPage";
import { ItemsPage } from "./ui/pages/ItemsPage";
import { PluginDetailPage } from "./ui/pages/PluginDetailPage";
import { PluginsPage } from "./ui/pages/PluginsPage";
import { SettingsPage } from "./ui/pages/SettingsPage";
import { WinLossOverlayPage } from "./ui/pages/WinLossOverlayPage";
import "./App.css";

type BootGateState = { status: "boot-loading" } | VersionGateCheckResult;
const appPluginRuntimeBootstrapRunner = createPluginRuntimeBootstrapRunner();

function isWinLossOverlayRoute(pathname: string, hash?: string): boolean {
  if (pathname === "/overlay/win-loss") {
    return true;
  }

  return typeof hash === "string" && hash.startsWith("#/overlay/win-loss");
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlayWindowRoute = isWinLossOverlayRoute(
    location.pathname,
    typeof window !== "undefined" ? window.location.hash : "",
  );
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [windowActionStatus, setWindowActionStatus] = useState<string | null>(null);
  const [bootGateState, setBootGateState] = useState<BootGateState>({ status: "boot-loading" });
  const [bootGateActionStatus, setBootGateActionStatus] = useState<string | null>(null);
  const [hasCheckedPathSetupAfterBoot, setHasCheckedPathSetupAfterBoot] = useState(false);
  const [startupRocketLeaguePath, setStartupRocketLeaguePath] = useState<string | null>(null);
  const [hasAttemptedPluginRuntimeBootstrap, setHasAttemptedPluginRuntimeBootstrap] = useState(false);
  const [pluginRuntimeBootstrapStatus, setPluginRuntimeBootstrapStatus] = useState<string | null>(null);

  const syncMaximizedState = useCallback(async (): Promise<boolean> => {
    const result = await readWindowMaximizedState();
    if (result.ok) {
      setIsWindowMaximized(result.maximized);
      return true;
    }

    setWindowActionStatus(result.message);
    console.error(result.message);
    return false;
  }, []);

  const runStartupVersionCheck = useCallback(async () => {
    setBootGateActionStatus(null);
    setBootGateState({ status: "boot-loading" });

    const result = await checkStartupVersionGate();
    setBootGateState(result);

    if (result.status === "boot-error" && result.details) {
      console.error(`Startup version check failed: ${result.details}`);
    }
  }, []);

  useEffect(() => {
    if (isOverlayWindowRoute) {
      return undefined;
    }

    let unlistenResize: (() => void) | null = null;
    let isMounted = true;

    void (async () => {
      const synced = await syncMaximizedState();
      if (!isMounted || !synced) {
        return;
      }

      try {
        const appWindow = getCurrentWindow();
        unlistenResize = await appWindow.onResized(() => {
          void syncMaximizedState();
        });
      } catch (error) {
        const statusMessage = `Window resize listener failed: ${String(error)}`;
        if (isMounted) {
          setWindowActionStatus(statusMessage);
        }
        console.error(statusMessage);
      }
    })();

    return () => {
      isMounted = false;
      if (unlistenResize) {
        unlistenResize();
      }
    };
  }, [isOverlayWindowRoute, syncMaximizedState]);

  useEffect(() => {
    if (isOverlayWindowRoute) {
      return undefined;
    }

    void initializeMetrics();
    void trackAppStart();
    void trackDailyActive();

    return undefined;
  }, [isOverlayWindowRoute]);

  useEffect(() => {
    if (isOverlayWindowRoute) {
      return undefined;
    }

    let isMounted = true;

    void (async () => {
      const result = await checkStartupVersionGate();
      if (!isMounted) {
        return;
      }

      setBootGateState(result);
      if (result.status === "boot-error" && result.details) {
        console.error(`Startup version check failed: ${result.details}`);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOverlayWindowRoute]);

  useEffect(() => {
    if (isOverlayWindowRoute) {
      return undefined;
    }

    if (bootGateState.status !== "boot-ok") {
      setHasCheckedPathSetupAfterBoot(false);
      setHasAttemptedPluginRuntimeBootstrap(false);
      setStartupRocketLeaguePath(null);
      setPluginRuntimeBootstrapStatus(null);
      return;
    }

    if (hasCheckedPathSetupAfterBoot) {
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const setupResult = await checkStartupPathSetup();

        if (!isMounted) {
          return;
        }

        if (setupResult.status === "needs-setup") {
          setStartupRocketLeaguePath(null);
          if (location.pathname !== "/settings") {
            navigate("/settings", { replace: true });
          }
          setHasCheckedPathSetupAfterBoot(true);
          return;
        }

        setStartupRocketLeaguePath(setupResult.rocketLeaguePath);
        if (setupResult.shouldPersist) {
          try {
            await saveRocketLeaguePathSetting(setupResult.rocketLeaguePath);
          } catch (error) {
            console.error(`Failed to persist normalized Rocket League path: ${String(error)}`);
          }
        }

        setHasCheckedPathSetupAfterBoot(true);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error(`Startup Rocket League path check failed: ${String(error)}`);
        setStartupRocketLeaguePath(null);
        if (location.pathname !== "/settings") {
          navigate("/settings", { replace: true });
        }
        setHasCheckedPathSetupAfterBoot(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [bootGateState.status, hasCheckedPathSetupAfterBoot, isOverlayWindowRoute, location.pathname, navigate]);

  useEffect(() => {
    if (isOverlayWindowRoute) {
      return undefined;
    }

    if (bootGateState.status !== "boot-ok" || !hasCheckedPathSetupAfterBoot) {
      return undefined;
    }

    if (hasAttemptedPluginRuntimeBootstrap) {
      return undefined;
    }

    let isMounted = true;
    setHasAttemptedPluginRuntimeBootstrap(true);

    void (async () => {
      const result = await appPluginRuntimeBootstrapRunner.run({
        rocketLeaguePath: startupRocketLeaguePath,
      });
      if (!isMounted) {
        return;
      }

      if (result.failed > 0) {
        const firstFailure = result.details.find((entry) => entry.status === "failed");
        const message = firstFailure
          ? `Plugin runtime auto-start failed: ${firstFailure.message}`
          : "Plugin runtime auto-start failed.";
        setPluginRuntimeBootstrapStatus(message);
        if (firstFailure?.details) {
          console.error(`${message} (${firstFailure.details})`);
        } else {
          console.error(message);
        }
        return;
      }

      setPluginRuntimeBootstrapStatus(null);
    })();

    return () => {
      isMounted = false;
    };
  }, [
    bootGateState.status,
    hasAttemptedPluginRuntimeBootstrap,
    hasCheckedPathSetupAfterBoot,
    isOverlayWindowRoute,
    startupRocketLeaguePath,
  ]);

  useEffect(() => {
    if (isOverlayWindowRoute) {
      return undefined;
    }

    let isMounted = true;
    let unlistenCloseRequested: (() => void) | null = null;

    void (async () => {
      try {
        const appWindow = getCurrentWindow();
        const closeFlowController = createPluginRuntimeCloseFlowController({
          runShutdownCleanup: shutdownActivePluginRuntimes,
          finalizeClose: async () => {
            await appWindow.destroy();
          },
          reportStatus: (message: string) => {
            if (!isMounted) {
              return;
            }
            setWindowActionStatus(message);
          },
          reportError: (message: string) => {
            console.error(message);
          },
        });
        const nextUnlistenCloseRequested = await appWindow.onCloseRequested(
          (event) => closeFlowController.handleCloseRequested(event),
        );
        if (!isMounted) {
          nextUnlistenCloseRequested();
          return;
        }
        unlistenCloseRequested = nextUnlistenCloseRequested;
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = `Window close hook failed: ${String(error)}`;
        setWindowActionStatus(message);
        console.error(message);
      }
    })();

    return () => {
      isMounted = false;
      if (unlistenCloseRequested) {
        unlistenCloseRequested();
      }
    };
  }, [isOverlayWindowRoute]);

  const handleMinimize = useCallback(async () => {
    const result = await runWindowAction("minimize", async (windowRef) => {
      await windowRef.minimize();
    });

    if (result.ok) {
      setWindowActionStatus(null);
      return;
    }

    setWindowActionStatus(result.message ?? "Window minimize failed");
    console.error(result.message ?? "Window minimize failed");
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    const result = await runWindowAction("maximize/restore", async (windowRef) => {
      await windowRef.toggleMaximize();
    });

    if (!result.ok) {
      setWindowActionStatus(result.message ?? "Window maximize/restore failed");
      console.error(result.message ?? "Window maximize/restore failed");
      return;
    }

    setWindowActionStatus(null);
    await syncMaximizedState();
  }, [syncMaximizedState]);

  const handleClose = useCallback(async () => {
    const result = await runWindowAction("close", async (windowRef) => {
      await windowRef.close();
    });

    if (result.ok) {
      setWindowActionStatus(null);
      return;
    }

    setWindowActionStatus(result.message ?? "Window close failed");
    console.error(result.message ?? "Window close failed");
  }, []);

  const handleTitlebarDragMouseDown = useCallback(async (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const result = await runWindowAction("drag", async (windowRef) => {
      await windowRef.startDragging();
    });

    if (result.ok) {
      setWindowActionStatus(null);
      return;
    }

    setWindowActionStatus(result.message ?? "Window drag failed");
    console.error(result.message ?? "Window drag failed");
  }, []);

  const handleOpenWebsite = useCallback(async (url?: string) => {
    const result = await openRLPeakWebsite(url);
    if (result.ok) {
      setBootGateActionStatus(null);
      return;
    }

    setBootGateActionStatus(result.message);
  }, []);

  const isMainRoutesEnabled = shouldRenderMainRoutes(bootGateState.status);
  const bootWebsiteUrl = bootGateState.status === "boot-outdated" || bootGateState.status === "boot-error"
    ? bootGateState.websiteUrl
    : undefined;

  if (isOverlayWindowRoute) {
    return <WinLossOverlayPage />;
  }

  return (
    <div className="app-shell">
      <header className="window-chrome">
        <div
          className="window-drag-region"
          role="presentation"
          data-tauri-drag-region
          onMouseDown={handleTitlebarDragMouseDown}
        >
          <div className="app-brand">
            <span className="app-icon" aria-hidden="true">
              <svg
                className="app-icon-svg"
                viewBox="0 0 18 18"
                focusable="false"
                aria-hidden="true"
              >
                <polygon
                  points="9,2.4 14.6,5.7 14.6,12.3 9,15.6 3.4,12.3 3.4,5.7"
                />
              </svg>
            </span>
            <span className="app-title">
              RLPeak
            </span>
          </div>
        </div>

        {isMainRoutesEnabled ? (
          <nav className="nav-links" role="navigation" aria-label="Main navigation">
            <NavLink to="/dashboard" className="nav-link">
              Dashboard
            </NavLink>
            <NavLink to="/items" className="nav-link">
              Items
            </NavLink>
            <NavLink to="/plugins" className="nav-link">
              Plugins
            </NavLink>
            <NavLink to="/settings" className="nav-link">
              Settings
            </NavLink>
            <NavLink to="/about" className="nav-link">
              About
            </NavLink>
          </nav>
        ) : (
          <div className="window-boot-title" aria-live="polite">
            Startup check
          </div>
        )}

        <div className="window-right-zone">
          <div
            className="window-drag-region window-drag-region-spacer"
            role="presentation"
            data-tauri-drag-region
            onMouseDown={handleTitlebarDragMouseDown}
          />

          <div className="window-controls">
            <button
              type="button"
              className="window-control-btn"
              onClick={handleMinimize}
              aria-label="Minimize window"
              title="Minimize"
            >
              <span className="window-control-glyph window-control-minimize" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="window-control-btn"
              onClick={handleToggleMaximize}
              aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
              title={isWindowMaximized ? "Restore" : "Maximize"}
            >
              <span
                className={`window-control-glyph ${
                  isWindowMaximized
                    ? "window-control-restore"
                    : "window-control-maximize"
                }`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="window-control-btn window-control-close"
              onClick={handleClose}
              aria-label="Close window"
              title="Close"
            >
              <span className="window-control-glyph window-control-close-glyph" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className={`page-content${isMainRoutesEnabled ? "" : " page-content-boot"}`}>
        {windowActionStatus ? <p className="window-action-status">{windowActionStatus}</p> : null}
        {pluginRuntimeBootstrapStatus ? <p className="window-action-status">{pluginRuntimeBootstrapStatus}</p> : null}

        {isMainRoutesEnabled ? (
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/plugins" element={<PluginsPage />} />
            <Route path="/plugins/:pluginId" element={<PluginDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        ) : (
          <section className="boot-gate-screen" aria-live="polite">
            <article className="boot-gate-card">
              <div className="boot-gate-brand-row">
                <span className="app-icon" aria-hidden="true">
                  <svg
                    className="app-icon-svg"
                    viewBox="0 0 18 18"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <polygon
                      points="9,2.4 14.6,5.7 14.6,12.3 9,15.6 3.4,12.3 3.4,5.7"
                    />
                  </svg>
                </span>
                <div className="boot-gate-brand-copy">
                  <h1 className="boot-gate-brand-title">RLPeak</h1>
                </div>
              </div>

              {bootGateState.status === "boot-loading" ? (
                <div className="boot-gate-content">
                  <h2 className="boot-gate-title">Checking application version...</h2>
                  <p className="boot-gate-body">Please wait a moment.</p>
                  <span className="boot-gate-spinner" aria-hidden="true" />
                </div>
              ) : null}

              {bootGateState.status === "boot-outdated" ? (
                <div className="boot-gate-content">
                  <h2 className="boot-gate-title">Update required</h2>
                  <p className="boot-gate-body">
                    Your version of RLPeak is no longer supported.
                  </p>
                  <p className="boot-gate-body">
                    Please download the latest version to continue.
                  </p>
                  <p className="boot-gate-meta">
                    Current version: <strong>{bootGateState.currentVersion}</strong>
                  </p>
                  <p className="boot-gate-meta">
                    Required version: <strong>{bootGateState.requiredVersion}</strong>
                  </p>
                  <div className="boot-gate-actions">
                    <button
                      type="button"
                      className="settings-btn-primary boot-gate-btn-primary"
                      onClick={() => {
                        void handleOpenWebsite(bootWebsiteUrl);
                      }}
                    >
                      Download latest version
                    </button>
                    <button
                      type="button"
                      className="settings-btn-secondary boot-gate-btn-secondary"
                      onClick={() => {
                        void runStartupVersionCheck();
                      }}
                    >
                      Retry
                    </button>
                  </div>
                  <p className="boot-gate-footnote">RLPeak must be up to date before use.</p>
                </div>
              ) : null}

              {bootGateState.status === "boot-error" ? (
                <div className="boot-gate-content">
                  <h2 className="boot-gate-title">Version check unavailable</h2>
                  <p className="boot-gate-body">
                    RLPeak could not verify the current application version.
                  </p>
                  <p className="boot-gate-body">Please try again in a moment.</p>
                  <div className="boot-gate-actions">
                    <button
                      type="button"
                      className="settings-btn-primary boot-gate-btn-primary"
                      onClick={() => {
                        void runStartupVersionCheck();
                      }}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="settings-btn-secondary boot-gate-btn-secondary"
                      onClick={() => {
                        void handleOpenWebsite(bootWebsiteUrl);
                      }}
                    >
                      Open RLPeak website
                    </button>
                  </div>
                </div>
              ) : null}

              {bootGateActionStatus ? (
                <p className="boot-gate-action-status">{bootGateActionStatus}</p>
              ) : null}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
