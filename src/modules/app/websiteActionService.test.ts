import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

import { openRLPeakWebsite } from "./websiteActionService";

describe("websiteActionService", () => {
  beforeEach(() => {
    mocked.isTauri.mockReturnValue(true);
    mocked.invoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens the website through backend command with allowlisted URL", async () => {
    const result = await openRLPeakWebsite("https://rlpeak.com/");

    expect(result.ok).toBe(true);
    expect(mocked.invoke).toHaveBeenCalledWith("open_website", {
      url: "https://rlpeak.com/",
    });
  });

  it("falls back to default website URL when provided URL is unsupported", async () => {
    const result = await openRLPeakWebsite("https://example.com/hijack");

    expect(result.ok).toBe(true);
    expect(mocked.invoke).toHaveBeenCalledWith("open_website", {
      url: "https://rlpeak.com/",
    });
  });

  it("returns a friendly error when backend website open fails", async () => {
    mocked.invoke.mockRejectedValue(new Error("OPEN_FAILED"));

    const result = await openRLPeakWebsite("https://rlpeak.com/");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Could not open RLPeak website.");
  });

  it("returns manual open guidance outside desktop runtime", async () => {
    mocked.isTauri.mockReturnValue(false);

    const result = await openRLPeakWebsite();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Please open https://rlpeak.com/");
  });
});
