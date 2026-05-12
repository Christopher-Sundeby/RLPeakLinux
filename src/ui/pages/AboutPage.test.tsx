// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  isTauri: vi.fn(),
  openPluginExternalLink: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocked.isTauri,
}));

vi.mock("./pluginExternalLinkService", () => ({
  openPluginExternalLink: mocked.openPluginExternalLink,
}));

import { AboutPage } from "./AboutPage";

describe("AboutPage social links", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocked.isTauri.mockReturnValue(false);
    mocked.openPluginExternalLink.mockReset();
  });

  it("renders Discord link with expected href and target behavior", () => {
    render(<AboutPage />);

    const link = screen.getByRole("link", { name: "rlpeak.com/discord" });
    expect(link.getAttribute("href")).toBe("https://rlpeak.com/discord");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders broader companion-app description and removes item-swap-only wording", () => {
    render(<AboutPage />);

    expect(screen.getByText(/rocket league companion app/i)).toBeTruthy();
    expect(screen.getByText(/without DLL injection, memory editing, or process hooking\./i)).toBeTruthy();
    expect(screen.queryByText(/desktop utility for managing rocket league item swaps/i)).toBeNull();
  });

  it("renders X/Twitter link", () => {
    render(<AboutPage />);

    const link = screen.getByRole("link", { name: "x.com/rlpeak_off" });
    expect(link.getAttribute("href")).toBe("https://x.com/rlpeak_off");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("uses safe external opener on click in Tauri runtime", () => {
    mocked.isTauri.mockReturnValue(true);
    mocked.openPluginExternalLink.mockResolvedValue({
      ok: true,
      message: "Opened",
    });

    render(<AboutPage />);
    fireEvent.click(screen.getByRole("link", { name: "rlpeak.com/discord" }));

    expect(mocked.openPluginExternalLink).toHaveBeenCalledWith("https://rlpeak.com/discord");
  });
});
