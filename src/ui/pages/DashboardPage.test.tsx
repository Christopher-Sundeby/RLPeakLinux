import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("renders user-facing sections without technical debug labels", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(markup).toContain("Game Status");
    expect(markup).toContain("Active Loadout");
    expect(markup).toContain("Quick Actions");
    expect(markup).toContain("News, Info, Updates");

    expect(markup).not.toContain("PROCESS_CHECK_FAILED");
    expect(markup).not.toContain("invalid utf-8");
    expect(markup).not.toContain("Rocket League path");
    expect(markup).not.toContain("CookedPCConsole");
    expect(markup).not.toContain("Resolved AppData path");
  });
});
