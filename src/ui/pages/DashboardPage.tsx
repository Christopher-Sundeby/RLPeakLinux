import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getBuiltInFallbackDashboardNewsItems,
  loadDashboardNews,
  type DashboardNewsItem,
  type DashboardNewsType,
} from "../../modules/app/dashboardNewsService";
import { ensureRocketLeaguePathForActions } from "../../modules/items/rocketLeaguePathService";
import { readRocketLeagueProcessStatus, type RocketLeagueProcessStatus } from "../../modules/items/rocketLeagueProcessService";
import { resetAll } from "../../modules/items/restoreService";
import { loadAppState, saveRocketLeaguePathSetting } from "../../modules/items/stateService";
import {
  getUserFacingRocketLeagueStatus,
  readActiveLoadoutSummary,
  type ActiveLoadoutSummary,
} from "./dashboardPageSelectors";
import { openPluginExternalLink } from "./pluginExternalLinkService";

interface DashboardQuickActionStatus {
  ok: boolean;
  message: string;
}

interface DashboardStatusSnapshot {
  rocketLeaguePath: string;
  processStatus: RocketLeagueProcessStatus;
  activeLoadout: ActiveLoadoutSummary;
}

interface DashboardNewsStatus {
  ok: boolean;
  message: string;
}

async function readDashboardSnapshot(): Promise<DashboardStatusSnapshot> {
  const [appState, processStatus] = await Promise.all([
    loadAppState(),
    readRocketLeagueProcessStatus(),
  ]);

  const rocketLeaguePath = typeof appState.rocketLeaguePath === "string" ? appState.rocketLeaguePath.trim() : "";

  return {
    rocketLeaguePath,
    processStatus,
    activeLoadout: readActiveLoadoutSummary(appState),
  };
}

function fallbackSnapshot(): DashboardStatusSnapshot {
  return {
    rocketLeaguePath: "",
    processStatus: {
      available: false,
      isRunning: false,
      message: "Status unavailable",
    },
    activeLoadout: {
      activeDecals: [],
      activeWheel: null,
      activeBoost: null,
    },
  };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DashboardStatusSnapshot | null>(null);
  const [quickActionStatus, setQuickActionStatus] = useState<DashboardQuickActionStatus | null>(null);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [newsItems, setNewsItems] = useState<DashboardNewsItem[]>(() => getBuiltInFallbackDashboardNewsItems());
  const [isNewsLoading, setIsNewsLoading] = useState(false);
  const [newsStatus, setNewsStatus] = useState<DashboardNewsStatus | null>(null);
  const [newsSourceLabel, setNewsSourceLabel] = useState("Fallback");

  useEffect(() => {
    let isMounted = true;

    const refresh = async () => {
      try {
        const snapshot = await readDashboardSnapshot();
        if (!isMounted) {
          return;
        }
        setStatus(snapshot);
      } catch {
        if (!isMounted) {
          return;
        }
        setStatus(fallbackSnapshot());
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const rocketLeagueStateLabel = useMemo(() => {
    if (!status) {
      return "Status unavailable";
    }

    return getUserFacingRocketLeagueStatus(status.processStatus);
  }, [status]);

  const loadNews = useCallback(async () => {
    setIsNewsLoading(true);
    setNewsStatus(null);
    try {
      const result = await loadDashboardNews();
      setNewsItems(result.items);
      if (result.source === "remote") {
        setNewsSourceLabel("Remote");
      } else if (result.source === "cache") {
        setNewsSourceLabel("Cache");
        setNewsStatus({
          ok: true,
          message: "Using cached dashboard news.",
        });
      } else {
        setNewsSourceLabel("Fallback");
        setNewsStatus({
          ok: false,
          message: "Using built-in dashboard news while remote news is unavailable.",
        });
      }
    } catch {
      setNewsItems(getBuiltInFallbackDashboardNewsItems());
      setNewsSourceLabel("Fallback");
      setNewsStatus({
        ok: false,
        message: "Using built-in dashboard news while remote news is unavailable.",
      });
    } finally {
      setIsNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const handleDashboardNewsCta = async (item: DashboardNewsItem) => {
    if (!item.cta) {
      return;
    }

    if (item.cta.route) {
      navigate(item.cta.route);
      return;
    }

    if (!item.cta.url) {
      return;
    }

    const result = await openPluginExternalLink(item.cta.url);
    setNewsStatus({
      ok: result.ok,
      message: result.message,
    });
  };

  const getTypeBadgeLabel = (type: DashboardNewsType): string => {
    if (type === "update") {
      return "Update";
    }
    if (type === "warning") {
      return "Warning";
    }
    if (type === "info") {
      return "Info";
    }
    return "News";
  };

  const handleResetAll = async () => {
    const pathGuard = await ensureRocketLeaguePathForActions(status?.rocketLeaguePath ?? "");
    if (!pathGuard.ok) {
      setQuickActionStatus({
        ok: false,
        message: pathGuard.message,
      });
      navigate("/settings");
      return;
    }
    const rocketLeaguePath = pathGuard.rocketLeaguePath;
    if (rocketLeaguePath !== (status?.rocketLeaguePath ?? "").trim()) {
      setStatus((current) => (current ? { ...current, rocketLeaguePath } : current));
      void saveRocketLeaguePathSetting(rocketLeaguePath);
    }

    setQuickActionStatus(null);
    setIsResettingAll(true);
    try {
      const result = await resetAll({ rocketLeaguePath });
      setQuickActionStatus({
        ok: result.ok,
        message: result.message,
      });
      if (result.ok) {
        const snapshot = await readDashboardSnapshot();
        setStatus(snapshot);
      }
    } catch {
      setQuickActionStatus({
        ok: false,
        message: "Restore failed",
      });
    } finally {
      setIsResettingAll(false);
    }
  };

  return (
    <section className="page dashboard-page">
      <h1>Dashboard</h1>
      <p>Your RLPeak home for game status, active loadout, and quick actions.</p>

      <div className="dashboard-top-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h2 className="catalog-heading">Game Status</h2>
          </div>
          <div className="dashboard-panel-body">
            <div className="dashboard-status-row">
              <span className="dashboard-status-label">Rocket League</span>
              <span
                className={`dashboard-process-pill ${
                  rocketLeagueStateLabel === "Running"
                    ? "is-running"
                    : rocketLeagueStateLabel === "Not running"
                      ? "is-stopped"
                      : "is-unavailable"
                }`}
              >
                {rocketLeagueStateLabel}
              </span>
            </div>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h2 className="catalog-heading">Active Loadout</h2>
          </div>
          <div className="dashboard-panel-body">
            <div className="dashboard-summary">
              <div className="dashboard-summary-row">
                <span className="meta-label">Decals</span>
                {status && status.activeLoadout.activeDecals.length > 0 ? (
                  <div className="dashboard-summary-multi">
                    {status.activeLoadout.activeDecals.map((entry) => (
                      <p key={`${entry.carKey}-${entry.displayName}`} className="dashboard-summary-line">
                        <span className="dashboard-summary-car">{entry.carKey}</span>
                        <span className="dashboard-summary-sep"> - </span>
                        <span className="dashboard-summary-item">{entry.displayName}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="dashboard-summary-empty">No active decals</p>
                )}
              </div>

              <div className="dashboard-summary-row">
                <span className="meta-label">Wheel</span>
                <p className="dashboard-summary-single">{status?.activeLoadout.activeWheel?.displayName ?? "No active wheel"}</p>
              </div>

              <div className="dashboard-summary-row">
                <span className="meta-label">Boost</span>
                <p className="dashboard-summary-single">{status?.activeLoadout.activeBoost?.displayName ?? "No active boost"}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h2 className="catalog-heading">Quick Actions</h2>
          </div>
          <div className="dashboard-panel-body">
            <div className="dashboard-actions">
              <button
                type="button"
                className="settings-btn-primary"
                onClick={() => navigate("/items")}
              >
                Open Items
              </button>
              <button
                type="button"
                className="settings-btn-secondary"
                onClick={() => navigate("/settings")}
              >
                Open Settings
              </button>
              <button
                type="button"
                className="settings-btn-secondary"
                onClick={() => {
                  void handleResetAll();
                }}
                disabled={isResettingAll}
              >
                {isResettingAll ? "Resetting..." : "Reset All"}
              </button>
            </div>

            {quickActionStatus ? (
              <p className={quickActionStatus.ok ? "status-ok status-message" : "status-error status-message"}>
                {quickActionStatus.message}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="dashboard-panel dashboard-news-panel">
        <div className="dashboard-panel-header">
          <h2 className="catalog-heading">News, Info, Updates</h2>
          <button
            type="button"
            className="settings-btn-secondary dashboard-news-refresh-btn"
            onClick={() => {
              void loadNews();
            }}
            disabled={isNewsLoading}
          >
            {isNewsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <div className="dashboard-panel-body">
          <p className="dashboard-news-meta">{`Source: ${newsSourceLabel}`}</p>
          {newsStatus ? (
            <p className={newsStatus.ok ? "status-ok status-message" : "status-error status-message"}>
              {newsStatus.message}
            </p>
          ) : null}
          <div className="dashboard-news-list">
            {newsItems.length === 0 ? (
              <p className="dashboard-news-item">No dashboard updates are available right now.</p>
            ) : (
              newsItems.map((item) => (
                <article key={item.id} className="dashboard-news-item">
                  <div className="dashboard-news-item-top">
                    <span className={`dashboard-news-tag is-${item.type}`}>{item.badge ?? getTypeBadgeLabel(item.type)}</span>
                    {item.date ? (
                      <time className="dashboard-news-date" dateTime={item.date}>{item.date}</time>
                    ) : null}
                  </div>
                  <h3 className="dashboard-news-title">{item.title}</h3>
                  <p className="dashboard-news-summary">{item.summary}</p>
                  {item.body ? <p className="dashboard-news-body">{item.body}</p> : null}
                  {item.cta ? (
                    <div className="dashboard-news-actions">
                      <button
                        type="button"
                        className="settings-btn-secondary"
                        onClick={() => {
                          void handleDashboardNewsCta(item);
                        }}
                      >
                        {item.cta.label}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
