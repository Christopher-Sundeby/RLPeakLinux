import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultWinLossOverlayState } from "../../modules/plugins/winLossOverlayRuntimeService";
import type { WinLossOverlayRuntimeState } from "../../modules/plugins/winLossOverlayRuntimeService";
import type { WinLossOverlayThemeSettings } from "../../modules/plugins/winLossOverlayThemeSettingsService";
import { WinLossOverlayThemePanel } from "./WinLossOverlayThemePanel";

const BASE_SETTINGS: WinLossOverlayThemeSettings = {
  theme_id: "rocketstats_circle",
  x: 40,
  y: 40,
  scale: 1,
  opacity: 0.92,
  show_status: false,
};

const JSTKISS_SETTINGS: WinLossOverlayThemeSettings = {
  ...BASE_SETTINGS,
  theme_id: "rocketstats_jstkiss",
};

const NATIVE_SETTINGS: WinLossOverlayThemeSettings = {
  ...BASE_SETTINGS,
  theme_id: "rocketstats_native",
};

const MINIMALIST_SETTINGS: WinLossOverlayThemeSettings = {
  ...BASE_SETTINGS,
  theme_id: "minimalist",
};

describe("WinLossOverlayThemePanel", () => {
  it("renders live and preview mode classes distinctly", () => {
    const runtimeState = createDefaultWinLossOverlayState();
    const previewMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={BASE_SETTINGS}
        displayMode="preview"
      />,
    );
    const liveMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );

    expect(previewMarkup).toContain("overlay-theme-panel-preview");
    expect(previewMarkup).not.toContain("overlay-theme-panel-live");
    expect(liveMarkup).toContain("overlay-theme-panel-live");
    expect(liveMarkup).not.toContain("overlay-theme-panel-preview");
  });

  it("renders Circle with fixed 400x300 layout and hardcoded stat row positions", () => {
    const runtimeState = createDefaultWinLossOverlayState();
    const markup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );

    expect(markup).toContain("width:400px;height:300px");
    expect(markup).toContain("transform:scale(1);transform-origin:top left");
    expect(markup).toContain("background-size:400px 300px");
    expect(markup).toContain("top:78.4px;left:240px;font-size:30px");
    expect(markup).toContain("top:133px;left:250px;font-size:25px");
    expect(markup).toContain("top:173.2px;left:250px;font-size:25px");
    expect(markup).toContain("top:206.3px;left:250px;font-size:25px");
    expect(markup).not.toContain("right:120px");
    expect(markup).not.toContain("translateY(");
  });

  it("applies user scale to Circle wrapper while keeping inner coordinates unchanged", () => {
    const runtimeState = createDefaultWinLossOverlayState();
    const markupScaleFifty = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={{
          ...BASE_SETTINGS,
          scale: 0.5,
        }}
        displayMode="live"
      />,
    );
    const markupScaleOneFifty = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={{
          ...BASE_SETTINGS,
          scale: 1.5,
        }}
        displayMode="live"
      />,
    );

    expect(markupScaleFifty).toContain("width:200px;height:150px");
    expect(markupScaleOneFifty).toContain("width:600px;height:450px");
    expect(markupScaleFifty).toContain("transform:scale(0.5);transform-origin:top left");
    expect(markupScaleOneFifty).toContain("transform:scale(1.5);transform-origin:top left");
    expect(markupScaleOneFifty).toContain("top:78.4px;left:240px;font-size:30px");
    expect(markupScaleOneFifty).toContain("top:133px;left:250px;font-size:25px");
  });

  it("always renders the Circle MMR row and applies status visibility toggle", () => {
    const runtimeState: WinLossOverlayRuntimeState = {
      ...createDefaultWinLossOverlayState(),
      status: "Connected",
    };

    const statusHiddenMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(statusHiddenMarkup).not.toContain(">Connected<");
    expect(statusHiddenMarkup).toContain("overlay-theme-circle-value-mmr");

    const statusVisibleMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={{
          ...BASE_SETTINGS,
          show_status: true,
        }}
        displayMode="live"
      />,
    );
    expect(statusVisibleMarkup).toContain(">Connected<");
    expect(statusVisibleMarkup).toContain(">...<");
  });

  it("formats streak using RocketStats sign behavior and color rules", () => {
    const winMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "1W",
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(winMarkup).toContain(">+1<");
    expect(winMarkup).toContain("color:rgb(30, 224, 24)");

    const lossMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "1L",
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(lossMarkup).toContain(">-1<");
    expect(lossMarkup).toContain("color:rgb(224, 24, 24)");
  });

  it("renders fresh session defaults as RocketStats parity values", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          wins: 0,
          losses: 0,
          streak: "0",
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );

    expect(markup).toContain(">0<");
    expect(markup).toContain("color:rgb(30, 224, 24)");
    expect(markup).toContain("color:rgb(0, 255, 0)");
    expect(markup).toContain("color:rgb(255, 0, 0)");
    expect(markup).not.toContain(">+0<");
  });

  it("renders wins/losses as raw counts and keeps loss color red", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          wins: 7,
          losses: 3,
          streak: "0",
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(markup).toContain(">7<");
    expect(markup).toContain(">3<");
    expect(markup).not.toContain(">+7<");
    expect(markup).not.toContain(">+3<");
    expect(markup).toContain("color:rgb(255, 0, 0)");
    expect(markup).not.toContain("#1E90FF");
  });

  it("formats MMR as signed value when numeric data exists", () => {
    const runtimeState = {
      ...createDefaultWinLossOverlayState(),
      streak: "0",
      mmr_status: "synced" as const,
      mmr_delta: 15,
    };
    const markup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(markup).toContain(">+15<");
  });

  it("renders loading and failed MMR statuses safely", () => {
    const loadingMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "0",
          mmr_status: "loading",
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(loadingMarkup).toContain(">...<");

    const failedMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "0",
          mmr_status: "failed",
          mmr_delta: null,
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(failedMarkup).toContain(">N/A<");

    const failedWithPreviousDelta = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "0",
          mmr_status: "failed",
          mmr_delta: 12,
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(failedWithPreviousDelta).toContain(">N/A<");
    expect(failedWithPreviousDelta).not.toContain(">+12<");
  });

  it("keeps previous MMR delta visible while syncing", () => {
    const syncingMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          mmr_status: "syncing",
          mmr_delta: 6,
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );

    expect(syncingMarkup).toContain(">+6<");
  });

  it("never renders +0 for MMR when value is zero", () => {
    const zeroMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "0",
          mmr_status: "synced",
          mmr_delta: 0,
        }}
        settings={BASE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(zeroMarkup).toContain(">0<");
    expect(zeroMarkup).not.toContain(">+0<");
  });

  it("shows fallback surface in live mode when a non-circle theme has no image elements", () => {
    const runtimeState = createDefaultWinLossOverlayState();
    const markup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={runtimeState}
        settings={{
          ...BASE_SETTINGS,
          theme_id: "safe_fallback",
        }}
        displayMode="live"
      />,
    );

    expect(markup).toContain("overlay-theme-fallback-surface");
  });

  it("renders JSTKISS with fixed 400x300 panel, exact pixel positions, and no MMR row", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          wins: 12,
          losses: 9,
          streak: "2W",
        }}
        settings={JSTKISS_SETTINGS}
        displayMode="live"
      />,
    );

    expect(markup).toContain("overlay-theme-panel-jstkiss");
    expect(markup).toContain("background-image:url(&quot;/overlay-themes/rocketstats-JSTKISS/background.png&quot;)");
    expect(markup).toContain("width:400px;height:300px");
    expect(markup).toContain("transform:scale(1);transform-origin:top left");
    expect(markup).toContain("background-size:400px 300px");
    expect(markup).toContain("top:35px;left:110px;font-size:34px;color:rgb(255, 255, 255)");
    expect(markup).toContain("top:130px;left:120px;font-size:30px;color:rgb(255, 255, 255)");
    expect(markup).toContain("top:220px;left:150px;font-size:37px;color:rgb(255, 255, 255)");
    expect(markup).toContain("font-family:&quot;RocketStats MADE Tommy&quot;, &quot;MADE Tommy&quot;, Arial, sans-serif");
    expect(markup).toContain(">12<");
    expect(markup).toContain(">9<");
    expect(markup).toContain(">+2<");
    expect(markup).not.toContain("overlay-theme-circle-value-mmr");
    expect(markup).not.toContain(">N/A<");
    expect(markup).not.toContain(">...<");
    expect(markup).not.toContain("text-shadow");
  });

  it("keeps JSTKISS streak white for positive and negative streak values", () => {
    const positiveMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "3W",
        }}
        settings={JSTKISS_SETTINGS}
        displayMode="live"
      />,
    );
    expect(positiveMarkup).toContain(">+3<");
    expect(positiveMarkup).toContain("color:rgb(255, 255, 255)");
    expect(positiveMarkup).not.toContain("rgb(30, 224, 24)");

    const negativeMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "2L",
        }}
        settings={JSTKISS_SETTINGS}
        displayMode="live"
      />,
    );
    expect(negativeMarkup).toContain(">-2<");
    expect(negativeMarkup).toContain("color:rgb(255, 255, 255)");
    expect(negativeMarkup).not.toContain("rgb(224, 24, 24)");
  });

  it("applies user scale to JSTKISS wrapper while keeping inner coordinates unchanged", () => {
    const markupScaleFifty = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={createDefaultWinLossOverlayState()}
        settings={{
          ...JSTKISS_SETTINGS,
          scale: 0.5,
        }}
        displayMode="live"
      />,
    );
    const markupScaleOneFifty = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={createDefaultWinLossOverlayState()}
        settings={{
          ...JSTKISS_SETTINGS,
          scale: 1.5,
        }}
        displayMode="live"
      />,
    );

    expect(markupScaleFifty).toContain("width:200px;height:150px");
    expect(markupScaleOneFifty).toContain("width:600px;height:450px");
    expect(markupScaleFifty).toContain("transform:scale(0.5);transform-origin:top left");
    expect(markupScaleOneFifty).toContain("transform:scale(1.5);transform-origin:top left");
    expect(markupScaleOneFifty).toContain("top:35px;left:110px;font-size:34px");
    expect(markupScaleOneFifty).toContain("top:130px;left:120px;font-size:30px");
    expect(markupScaleOneFifty).toContain("top:220px;left:150px;font-size:37px");
  });

  it("renders NativeTheme with fixed 264x275 dimensions and includes MMR row", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          wins: 11,
          losses: 8,
          streak: "2W",
          mmr_status: "synced",
          mmr_delta: 12,
        }}
        settings={NATIVE_SETTINGS}
        displayMode="live"
      />,
    );

    expect(markup).toContain("overlay-theme-panel-native");
    expect(markup).toContain("background-image:url(&quot;/overlay-themes/rocketstats-NativeTheme/background.png&quot;)");
    expect(markup).toContain("width:264px;height:275px");
    expect(markup).toContain("transform:scale(1);transform-origin:top left");
    expect(markup).toContain("background-size:264px 275px");
    expect(markup).toContain("top:20.4px;left:165px;font-size:30px;color:rgb(90, 64, 5)");
    expect(markup).toContain("top:88.6px;left:165px;font-size:30px;color:rgb(2, 66, 90)");
    expect(markup).toContain("top:156.4px;left:180px;font-size:30px;color:rgb(255, 255, 255)");
    expect(markup).toContain("top:225.9px;left:180px;font-size:30px;color:rgb(255, 255, 255)");
    expect(markup).toContain("font-family:&quot;RocketStats NativeTheme&quot;, Arial, sans-serif");
    expect(markup).toContain(">+12<");
    expect(markup).toContain(">+2<");
    expect(markup).toContain(">11<");
    expect(markup).toContain(">8<");
    expect(markup).toContain("text-shadow:0 1px 3px rgb(0 0 0 / 55%)");
  });

  it("renders NativeTheme MMR loading and failed values safely", () => {
    const loadingMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          mmr_status: "loading",
        }}
        settings={NATIVE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(loadingMarkup).toContain(">...<");

    const failedMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          mmr_status: "failed",
          mmr_delta: 15,
        }}
        settings={NATIVE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(failedMarkup).toContain(">N/A<");
    expect(failedMarkup).not.toContain(">+15<");
  });

  it("keeps NativeTheme streak color fixed for positive and negative values", () => {
    const positiveMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "3W",
        }}
        settings={NATIVE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(positiveMarkup).toContain(">+3<");
    expect(positiveMarkup).toContain("color:rgb(2, 66, 90)");
    expect(positiveMarkup).not.toContain("rgb(30, 224, 24)");

    const negativeMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "2L",
        }}
        settings={NATIVE_SETTINGS}
        displayMode="live"
      />,
    );
    expect(negativeMarkup).toContain(">-2<");
    expect(negativeMarkup).toContain("color:rgb(2, 66, 90)");
    expect(negativeMarkup).not.toContain("rgb(224, 24, 24)");
  });

  it("applies user scale to NativeTheme wrapper while keeping inner coordinates unchanged", () => {
    const markupScaleFifty = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={createDefaultWinLossOverlayState()}
        settings={{
          ...NATIVE_SETTINGS,
          scale: 0.5,
        }}
        displayMode="live"
      />,
    );
    const markupScaleOneFifty = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={createDefaultWinLossOverlayState()}
        settings={{
          ...NATIVE_SETTINGS,
          scale: 1.5,
        }}
        displayMode="live"
      />,
    );

    expect(markupScaleFifty).toContain("width:132px;height:138px");
    expect(markupScaleOneFifty).toContain("width:396px;height:413px");
    expect(markupScaleFifty).toContain("transform:scale(0.5);transform-origin:top left");
    expect(markupScaleOneFifty).toContain("transform:scale(1.5);transform-origin:top left");
    expect(markupScaleOneFifty).toContain("top:20.4px;left:165px;font-size:30px");
    expect(markupScaleOneFifty).toContain("top:88.6px;left:165px;font-size:30px");
    expect(markupScaleOneFifty).toContain("top:225.9px;left:180px;font-size:30px");
  });

  it("renders Minimalist with fixed 146x177 dimensions and includes MMR row", () => {
    const markup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          wins: 14,
          losses: 5,
          streak: "3W",
          mmr_status: "synced",
          mmr_delta: 9,
        }}
        settings={MINIMALIST_SETTINGS}
        displayMode="live"
      />,
    );

    expect(markup).toContain("overlay-theme-panel-minimalist");
    expect(markup).toContain("background-image:url(&quot;/overlay-themes/minimalist/background.png&quot;)");
    expect(markup).toContain("width:146px;height:177px");
    expect(markup).toContain("transform:scale(1);transform-origin:top left");
    expect(markup).toContain("background-size:146px 177px");
    expect(markup).toContain("top:9px;left:75px;font-size:18px;color:rgb(200, 200, 1)");
    expect(markup).toContain("top:35px;left:100px;font-size:18px;color:rgb(1, 113, 167)");
    expect(markup).toContain("top:61px;left:75px;font-size:18px;color:rgb(1, 204, 1)");
    expect(markup).toContain("top:85px;left:100px;font-size:18px;color:rgb(118, 1, 1)");
    expect(markup).toContain("font-family:&quot;RLPeak Minimalist Minecraft&quot;, monospace, sans-serif");
    expect(markup).toContain(">+9<");
    expect(markup).toContain(">+3<");
    expect(markup).toContain(">14<");
    expect(markup).toContain(">5<");
    expect(markup).toContain("text-shadow:0 1px 3px rgb(0 0 0 / 55%)");
  });

  it("renders Minimalist MMR loading and failed values safely", () => {
    const loadingMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          mmr_status: "loading",
        }}
        settings={MINIMALIST_SETTINGS}
        displayMode="live"
      />,
    );
    expect(loadingMarkup).toContain(">...<");

    const failedMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          mmr_status: "failed",
          mmr_delta: 7,
        }}
        settings={MINIMALIST_SETTINGS}
        displayMode="live"
      />,
    );
    expect(failedMarkup).toContain(">N/A<");
    expect(failedMarkup).not.toContain(">+7<");
  });

  it("keeps Minimalist streak color fixed for positive and negative values", () => {
    const positiveMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "4W",
        }}
        settings={MINIMALIST_SETTINGS}
        displayMode="live"
      />,
    );
    expect(positiveMarkup).toContain(">+4<");
    expect(positiveMarkup).toContain("color:rgb(1, 113, 167)");
    expect(positiveMarkup).not.toContain("rgb(30, 224, 24)");

    const negativeMarkup = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={{
          ...createDefaultWinLossOverlayState(),
          streak: "2L",
        }}
        settings={MINIMALIST_SETTINGS}
        displayMode="live"
      />,
    );
    expect(negativeMarkup).toContain(">-2<");
    expect(negativeMarkup).toContain("color:rgb(1, 113, 167)");
    expect(negativeMarkup).not.toContain("rgb(224, 24, 24)");
  });

  it("applies user scale to Minimalist wrapper while keeping inner coordinates unchanged", () => {
    const markupScaleFifty = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={createDefaultWinLossOverlayState()}
        settings={{
          ...MINIMALIST_SETTINGS,
          scale: 0.5,
        }}
        displayMode="live"
      />,
    );
    const markupScaleOneFifty = renderToStaticMarkup(
      <WinLossOverlayThemePanel
        runtimeState={createDefaultWinLossOverlayState()}
        settings={{
          ...MINIMALIST_SETTINGS,
          scale: 1.5,
        }}
        displayMode="live"
      />,
    );

    expect(markupScaleFifty).toContain("width:73px;height:89px");
    expect(markupScaleOneFifty).toContain("width:219px;height:266px");
    expect(markupScaleFifty).toContain("transform:scale(0.5);transform-origin:top left");
    expect(markupScaleOneFifty).toContain("transform:scale(1.5);transform-origin:top left");
    expect(markupScaleOneFifty).toContain("top:9px;left:75px;font-size:18px");
    expect(markupScaleOneFifty).toContain("top:35px;left:100px;font-size:18px");
    expect(markupScaleOneFifty).toContain("top:61px;left:75px;font-size:18px");
    expect(markupScaleOneFifty).toContain("top:85px;left:100px;font-size:18px");
  });
});
