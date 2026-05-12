import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPluginManagePath, PluginCatalogCard } from "./PluginsPage";

describe("PluginsPage card UI", () => {
  it("renders compact product card with media, title, summary, statuses, and actions", () => {
    const markup = renderToStaticMarkup(
      <PluginCatalogCard
        pluginId="win_loss_overlay"
        title="RocketStats"
        shortDescription="RocketStats is an in-game Rocket League overlay for session MMR, wins, losses and streaks, re-integrated into RLPeak."
        bannerUrl="https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/banner.png"
        iconUrl="https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/icon.png"
        version="1.0.0"
        status="active"
        runtimeStatusLabel="Connected"
        runtimeStatusClassName="plugins-runtime-pill is-running"
        tags={["Overlay", "Stats"]}
        categories={["Built-in runtime"]}
        isInstalled
        isEnabled
        supportsEnableDisable
        installStateLabel="Installed"
        canShowInstall={false}
        canShowEnable={false}
        canShowDisable
        isInstallDisabled={false}
        isEnableDisabled={false}
        isDisableDisabled={false}
        onInstall={() => undefined}
        onEnable={() => undefined}
        onDisable={() => undefined}
        onManage={() => undefined}
      />,
    );

    expect(markup).toContain("plugins-card-banner");
    expect(markup).toContain("RocketStats");
    expect(markup).toContain("session MMR");
    expect(markup).toContain("v1.0.0");
    expect(markup).toContain("Installed");
    expect(markup).toContain("Enabled");
    expect(markup).toContain("Connected");
    expect(markup).toContain(">Manage<");
  });

  it("does not render overlay settings controls inside catalog card", () => {
    const markup = renderToStaticMarkup(
      <PluginCatalogCard
        pluginId="win_loss_overlay"
        title="RocketStats"
        shortDescription="Summary"
        bannerUrl="https://api.rlpeak.com/v1/files/Plugins/win_loss_overlay/banner.png"
        iconUrl={null}
        version="1.0.0"
        status="active"
        runtimeStatusLabel="Stopped"
        runtimeStatusClassName="plugins-runtime-pill is-stopped"
        tags={[]}
        categories={[]}
        isInstalled={false}
        isEnabled={false}
        supportsEnableDisable
        installStateLabel="Not installed"
        canShowInstall
        canShowEnable={false}
        canShowDisable={false}
        isInstallDisabled={false}
        isEnableDisabled={false}
        isDisableDisabled={false}
        onInstall={() => undefined}
        onEnable={() => undefined}
        onDisable={() => undefined}
        onManage={() => undefined}
      />,
    );

    expect(markup).not.toContain("Theme preview");
    expect(markup).not.toContain("Save overlay settings");
    expect(markup).not.toContain("Reset overlay settings");
  });

  it("builds plugin detail manage route", () => {
    expect(buildPluginManagePath("win_loss_overlay")).toBe("/plugins/win_loss_overlay");
  });

  it("does not render Enable/Disable actions for action-only workshop plugins", () => {
    const markup = renderToStaticMarkup(
      <PluginCatalogCard
        pluginId="workshop_map_loader"
        title="Workshop Map Loader"
        shortDescription="Browse and load Rocket League workshop maps."
        bannerUrl="https://api.rlpeak.com/v1/files/Plugins/workshop_map_loader/banner.png"
        iconUrl="https://api.rlpeak.com/v1/files/Plugins/workshop_map_loader/icon.png"
        version="1.0.0"
        status="active"
        runtimeStatusLabel="Ready"
        runtimeStatusClassName="plugins-runtime-pill is-running"
        tags={["Workshop", "Maps"]}
        categories={["Built-in runtime"]}
        isInstalled
        isEnabled={false}
        supportsEnableDisable={false}
        installStateLabel="Installed / Ready"
        canShowInstall={false}
        canShowEnable={false}
        canShowDisable={false}
        isInstallDisabled={false}
        isEnableDisabled={false}
        isDisableDisabled={false}
        onInstall={() => undefined}
        onEnable={() => undefined}
        onDisable={() => undefined}
        onManage={() => undefined}
      />,
    );

    expect(markup).not.toContain(">Enable<");
    expect(markup).not.toContain(">Disable<");
    expect(markup).toContain(">Installed / Ready<");
    expect(markup).toContain(">Manage<");
  });
});
