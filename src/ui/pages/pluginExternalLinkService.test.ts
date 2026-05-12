import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

import {
  normalizePluginExternalLinkUrl,
  openPluginExternalLink,
} from "./pluginExternalLinkService";

describe("pluginExternalLinkService", () => {
  it("normalizes https plugin external links", () => {
    expect(normalizePluginExternalLinkUrl("https://github.com/Lyliya/RocketStats")).toBe(
      "https://github.com/Lyliya/RocketStats",
    );
  });

  it("rejects unsafe plugin external links", () => {
    expect(normalizePluginExternalLinkUrl("http://github.com/Lyliya/RocketStats")).toBeNull();
    expect(normalizePluginExternalLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePluginExternalLinkUrl("https://localhost/test")).toBeNull();
  });

  it("opens safe external link via backend command", async () => {
    mocked.isTauri.mockReturnValue(true);
    mocked.invoke.mockResolvedValue(undefined);

    const result = await openPluginExternalLink("https://github.com/Lyliya/RocketStats");

    expect(result.ok).toBe(true);
    expect(mocked.invoke).toHaveBeenCalledWith("open_external_url", {
      url: "https://github.com/Lyliya/RocketStats",
    });
  });

  it("returns friendly failure when backend open fails", async () => {
    mocked.isTauri.mockReturnValue(true);
    mocked.invoke.mockRejectedValue(new Error("OPEN_FAILED"));

    const result = await openPluginExternalLink("https://github.com/Lyliya/RocketStats");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Could not open this external link.");
  });
});
