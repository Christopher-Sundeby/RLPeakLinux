import { describe, expect, it, vi } from "vitest";
import {
  checkStartupVersionGate,
  DEFAULT_RLPEAK_WEBSITE_URL,
  normalizeWebsiteUrl,
  VERSION_CHECK_ENDPOINT,
} from "./versionGateService";

describe("versionGateService", () => {
  it("allows startup when current version matches required version", async () => {
    const result = await checkStartupVersionGate({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          required_version: "1.0.0",
          website_url: "https://rlpeak.com/",
          status: "ok",
          message: "A new RLPeak version is required.",
        }),
      } as Response)),
      getRuntimeVersion: async () => "1.0.0",
      timeoutMs: 10_000,
    });

    expect(result.status).toBe("boot-ok");
    if (result.status !== "boot-ok") {
      return;
    }

    expect(result.currentVersion).toBe("1.0.0");
    expect(result.requiredVersion).toBe("1.0.0");
    expect(result.websiteUrl).toBe("https://rlpeak.com/");
  });

  it("blocks startup when current version is outdated", async () => {
    const result = await checkStartupVersionGate({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          required_version: "1.0.0",
          website_url: "https://rlpeak.com/",
          status: "ok",
          message: "A new RLPeak version is required.",
        }),
      } as Response)),
      getRuntimeVersion: async () => "0.9.9",
      timeoutMs: 10_000,
    });

    expect(result.status).toBe("boot-outdated");
    if (result.status !== "boot-outdated") {
      return;
    }

    expect(result.currentVersion).toBe("0.9.9");
    expect(result.requiredVersion).toBe("1.0.0");
    expect(result.websiteUrl).toBe("https://rlpeak.com/");
  });

  it("returns boot-error for invalid version endpoint payload shape", async () => {
    const result = await checkStartupVersionGate({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "ok",
          website_url: "https://rlpeak.com/",
        }),
      } as Response)),
      getRuntimeVersion: async () => "1.0.0",
      timeoutMs: 10_000,
    });

    expect(result.status).toBe("boot-error");
    if (result.status !== "boot-error") {
      return;
    }

    expect(result.message).toBe("RLPeak could not verify the current application version.");
    expect(result.websiteUrl).toBe(DEFAULT_RLPEAK_WEBSITE_URL);
  });

  it("returns boot-error when version endpoint request fails", async () => {
    const result = await checkStartupVersionGate({
      fetchImpl: vi.fn(async () => {
        throw new Error("network unavailable");
      }),
      getRuntimeVersion: async () => "1.0.0",
      timeoutMs: 10_000,
    });

    expect(result.status).toBe("boot-error");
    if (result.status !== "boot-error") {
      return;
    }

    expect(result.message).toBe("RLPeak could not verify the current application version.");
    expect(result.websiteUrl).toBe(DEFAULT_RLPEAK_WEBSITE_URL);
  });

  it("supports retry flow by allowing a second check to succeed after an initial failure", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(VERSION_CHECK_ENDPOINT);
      attempt += 1;

      if (attempt === 1) {
        throw new Error("network unavailable");
      }

      return {
        ok: true,
        json: async () => ({
          required_version: "1.0.0",
          status: "ok",
          website_url: "https://rlpeak.com/",
        }),
      } as Response;
    });

    const first = await checkStartupVersionGate({
      fetchImpl,
      getRuntimeVersion: async () => "1.0.0",
      timeoutMs: 10_000,
    });
    const second = await checkStartupVersionGate({
      fetchImpl,
      getRuntimeVersion: async () => "1.0.0",
      timeoutMs: 10_000,
    });

    expect(first.status).toBe("boot-error");
    expect(second.status).toBe("boot-ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("normalizes missing or unsupported website URLs to RLPeak default", () => {
    expect(normalizeWebsiteUrl()).toBe(DEFAULT_RLPEAK_WEBSITE_URL);
    expect(normalizeWebsiteUrl("https://example.com")).toBe(DEFAULT_RLPEAK_WEBSITE_URL);
    expect(normalizeWebsiteUrl("not-a-url")).toBe(DEFAULT_RLPEAK_WEBSITE_URL);
    expect(normalizeWebsiteUrl("https://www.rlpeak.com/download")).toBe("https://www.rlpeak.com/download");
  });
});
