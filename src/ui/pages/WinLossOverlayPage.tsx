import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getLocalAppDataPaths } from "../../modules/items/pathService";
import {
  getWinLossOverlayRuntimeState,
  listenWinLossOverlayRuntimeState,
  type WinLossOverlayRuntimeState,
} from "../../modules/plugins/winLossOverlayRuntimeService";
import {
  getDefaultWinLossOverlayThemeSettings,
  loadWinLossOverlayThemeSettings,
  sanitizeWinLossOverlayThemeSettings,
  WIN_LOSS_OVERLAY_SETTINGS_EVENT,
  type WinLossOverlayThemeSettings,
} from "../../modules/plugins/winLossOverlayThemeSettingsService";
import { ensureRocketStatsAzonixFontLoaded } from "../../modules/plugins/rocketStatsFontService";
import {
  createOverlayFallbackState,
  parseOverlayThemeOverride,
  resolveOverlayThemeConfig,
} from "./winLossOverlayPageSelectors";
import { WinLossOverlayThemePanel } from "../components/WinLossOverlayThemePanel";
import type { WinLossOverlayThemeOverride } from "../../modules/plugins/winLossOverlayThemeRegistry";

async function loadOverlayThemeOverride(): Promise<WinLossOverlayThemeOverride | undefined> {
  try {
    const paths = await getLocalAppDataPaths();
    const themePath = await join(paths.cachePluginsRoot, "win_loss_overlay", "overlay_theme.json");
    const content = await invoke<string>("read_text_file", { path: themePath });
    return parseOverlayThemeOverride(JSON.parse(content));
  } catch {
    return undefined;
  }
}

export function WinLossOverlayPage() {
  const [runtimeState, setRuntimeState] = useState<WinLossOverlayRuntimeState>(createOverlayFallbackState());
  const [themeSettings, setThemeSettings] = useState<WinLossOverlayThemeSettings>(
    getDefaultWinLossOverlayThemeSettings(),
  );
  const [themeOverride, setThemeOverride] = useState<WinLossOverlayThemeOverride | undefined>(undefined);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const activeClassName = "overlay-window-mode";
    const rootElement = document.getElementById("root");
    document.documentElement.classList.add(activeClassName);
    document.body.classList.add(activeClassName);
    rootElement?.classList.add(activeClassName);

    return () => {
      document.documentElement.classList.remove(activeClassName);
      document.body.classList.remove(activeClassName);
      rootElement?.classList.remove(activeClassName);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let unlistenRuntime: (() => void) | null = null;
    let unlistenSettings: (() => void) | null = null;

    void (async () => {
      void ensureRocketStatsAzonixFontLoaded();
      const [initialState, loadedSettings, loadedOverride] = await Promise.all([
        getWinLossOverlayRuntimeState(),
        loadWinLossOverlayThemeSettings(),
        loadOverlayThemeOverride(),
      ]);
      if (!isMounted) {
        return;
      }

      setRuntimeState(initialState);
      setThemeSettings(loadedSettings);
      setThemeOverride(loadedOverride);

      const runtimeUnlisten = await listenWinLossOverlayRuntimeState((state) => {
        if (!isMounted) {
          return;
        }
        setRuntimeState(state);
      });

      if (!isMounted) {
        runtimeUnlisten();
        return;
      }
      unlistenRuntime = runtimeUnlisten;

      const settingsUnlisten = await listen<unknown>(WIN_LOSS_OVERLAY_SETTINGS_EVENT, (event) => {
        if (!isMounted) {
          return;
        }
        setThemeSettings(sanitizeWinLossOverlayThemeSettings(event.payload));
      });

      if (!isMounted) {
        settingsUnlisten();
        return;
      }
      unlistenSettings = settingsUnlisten;
    })();

    return () => {
      isMounted = false;
      if (unlistenRuntime) {
        unlistenRuntime();
      }
      if (unlistenSettings) {
        unlistenSettings();
      }
    };
  }, []);

  const resolvedTheme = useMemo(
    () => resolveOverlayThemeConfig(themeSettings.theme_id, themeOverride),
    [themeOverride, themeSettings.theme_id],
  );

  const rootStyle = useMemo(
    () => ({
      "--overlay-panel-bg": resolvedTheme.palette.panelBackground,
      "--overlay-panel-border": resolvedTheme.palette.panelBorder,
      "--overlay-text-primary": resolvedTheme.palette.textPrimary,
      "--overlay-text-secondary": resolvedTheme.palette.textSecondary,
      "--overlay-accent": resolvedTheme.palette.accent,
      "--overlay-font-family": resolvedTheme.fontFamily,
    }) as CSSProperties,
    [resolvedTheme],
  );

  return (
    <main className="overlay-window-root" style={rootStyle}>
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={themeSettings}
        themeOverride={themeOverride}
        displayMode="live"
      />
    </main>
  );
}
