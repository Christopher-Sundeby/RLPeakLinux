// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";

const mocked = vi.hoisted(() => ({
  navigate: vi.fn(),
  loadDashboardNews: vi.fn(),
  readRocketLeagueProcessStatus: vi.fn(),
  loadAppState: vi.fn(),
  ensureRocketLeaguePathForActions: vi.fn(),
  resetAll: vi.fn(),
  saveRocketLeaguePathSetting: vi.fn(),
  openPluginExternalLink: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mocked.navigate,
  };
});

vi.mock("../../modules/app/dashboardNewsService", () => ({
  loadDashboardNews: mocked.loadDashboardNews,
  getBuiltInFallbackDashboardNewsItems: vi.fn(() => [
    {
      id: "fallback-news",
      type: "update",
      title: "RLPeak V1 is live",
      summary: "Fallback item",
      priority: 10,
      badge: "RLPeak V1",
      cta: {
        label: "Open Items",
        route: "/items",
      },
    },
  ]),
}));

vi.mock("../../modules/items/rocketLeagueProcessService", () => ({
  readRocketLeagueProcessStatus: mocked.readRocketLeagueProcessStatus,
  getRocketLeagueProcessStatusLabel: (status: { available: boolean; isRunning: boolean }) => {
    if (!status.available) {
      return "Status unavailable";
    }
    return status.isRunning ? "Running" : "Not running";
  },
}));

vi.mock("../../modules/items/stateService", () => ({
  loadAppState: mocked.loadAppState,
  saveRocketLeaguePathSetting: mocked.saveRocketLeaguePathSetting,
}));

vi.mock("../../modules/items/rocketLeaguePathService", () => ({
  ensureRocketLeaguePathForActions: mocked.ensureRocketLeaguePathForActions,
}));

vi.mock("../../modules/items/restoreService", () => ({
  resetAll: mocked.resetAll,
}));

vi.mock("./pluginExternalLinkService", () => ({
  openPluginExternalLink: mocked.openPluginExternalLink,
}));

describe("DashboardPage remote news rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.readRocketLeagueProcessStatus.mockResolvedValue({
      available: true,
      isRunning: false,
      message: "Not running",
    });
    mocked.loadAppState.mockResolvedValue({
      rocketLeaguePath: "C:/Games/rocketleague",
      activeItems: {
        Skin: {},
        Wheel: { current: null },
        Boost: { current: null },
      },
    });
    mocked.ensureRocketLeaguePathForActions.mockResolvedValue({
      ok: true,
      rocketLeaguePath: "C:/Games/rocketleague",
      message: "",
    });
    mocked.resetAll.mockResolvedValue({
      ok: true,
      message: "Restored successfully",
    });
    mocked.openPluginExternalLink.mockResolvedValue({
      ok: true,
      message: "Opened",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders remote news and supports internal route CTA", async () => {
    mocked.loadDashboardNews.mockResolvedValue({
      source: "remote",
      sourceVersion: "2026.05.1",
      items: [
        {
          id: "rocketstats-release",
          type: "update",
          title: "RocketStats overlay is now available",
          summary: "Session MMR, wins, losses and streaks are now available through the RocketStats plugin.",
          body: "You can install RocketStats from the Plugins page.",
          date: "2026-05-11",
          badge: "New",
          priority: 100,
          cta: {
            label: "Open Plugins",
            route: "/plugins",
          },
        },
      ],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("RocketStats overlay is now available")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Plugins" }));
    expect(mocked.navigate).toHaveBeenCalledWith("/plugins");
  });

  it("shows empty state when remote list is empty", async () => {
    mocked.loadDashboardNews.mockResolvedValue({
      source: "remote",
      sourceVersion: "2026.05.1",
      items: [],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No dashboard updates are available right now.")).toBeTruthy();
    });
  });

  it("does not crash when remote load fails and keeps fallback UI", async () => {
    mocked.loadDashboardNews.mockRejectedValue(new Error("network failure"));

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("RLPeak V1 is live")).toBeTruthy();
      expect(screen.getByText("Using built-in dashboard news while remote news is unavailable.")).toBeTruthy();
    });
  });
});
