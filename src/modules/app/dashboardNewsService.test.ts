// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

// Fallback localStorage mock for Node environment compatibility
if (typeof localStorage === "undefined") {
  const store = new Map<string, string>();
  global.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    length: 0,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  } as any;
}
import { fetchRemoteJson } from "../items/remoteApiService";
import {
  DASHBOARD_NEWS_CACHE_LOCAL_STORAGE_KEY,
  DASHBOARD_NEWS_CACHE_SCHEMA,
  DASHBOARD_NEWS_SCHEMA,
  getBuiltInFallbackDashboardNewsItems,
  loadDashboardNews,
  parseDashboardNewsPayload,
  sortDashboardNewsItems,
  type DashboardNewsItem,
} from "./dashboardNewsService";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));

vi.mock("../items/remoteApiService", () => ({
  fetchRemoteJson: vi.fn(),
}));

function createValidItem(overrides?: Partial<DashboardNewsItem>): DashboardNewsItem {
  return {
    id: "rocketstats-release",
    type: "update",
    title: "RocketStats overlay is now available",
    summary: "Session MMR, wins, losses and streaks are now available.",
    body: "Install RocketStats from Plugins.",
    date: "2026-05-11",
    badge: "New",
    priority: 100,
    cta: {
      label: "Open Plugins",
      route: "/plugins",
    },
    ...overrides,
  };
}

describe("dashboardNewsService", () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("parses valid remote dashboard news", async () => {
    vi.mocked(fetchRemoteJson).mockResolvedValue({
      schema: DASHBOARD_NEWS_SCHEMA,
      version: "2026.05.1",
      items: [createValidItem()],
    });

    const result = await loadDashboardNews();

    expect(result.source).toBe("remote");
    expect(result.sourceVersion).toBe("2026.05.1");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("RocketStats overlay is now available");
  });

  it("falls back to cache when remote schema is invalid", async () => {
    localStorage.setItem(
      DASHBOARD_NEWS_CACHE_LOCAL_STORAGE_KEY,
      JSON.stringify({
        schema: DASHBOARD_NEWS_CACHE_SCHEMA,
        fetched_at: "2026-05-11T12:00:00Z",
        source_version: "2026.05.0",
        items: [createValidItem({ id: "cached", title: "Cached news" })],
      }),
    );
    vi.mocked(fetchRemoteJson).mockResolvedValue({
      schema: "broken_schema",
      items: [createValidItem()],
    });

    const result = await loadDashboardNews();

    expect(result.source).toBe("cache");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("cached");
  });

  it("ignores invalid item fields while keeping valid items", () => {
    const parsed = parseDashboardNewsPayload({
      schema: DASHBOARD_NEWS_SCHEMA,
      items: [
        createValidItem({ id: "valid-1" }),
        {
          id: "invalid-1",
          type: "update",
          summary: "Missing title should invalidate this item",
        },
      ],
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].id).toBe("valid-1");
  });

  it("sorts items by priority descending", () => {
    const sorted = sortDashboardNewsItems([
      createValidItem({ id: "a", priority: 10 }),
      createValidItem({ id: "b", priority: 99 }),
      createValidItem({ id: "c", priority: 42 }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts same-priority items by date descending", () => {
    const sorted = sortDashboardNewsItems([
      createValidItem({ id: "older", priority: 50, date: "2026-04-01" }),
      createValidItem({ id: "newer", priority: 50, date: "2026-05-01" }),
      createValidItem({ id: "middle", priority: 50, date: "2026-04-20" }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["newer", "middle", "older"]);
  });

  it("uses cache when API fails", async () => {
    localStorage.setItem(
      DASHBOARD_NEWS_CACHE_LOCAL_STORAGE_KEY,
      JSON.stringify({
        schema: DASHBOARD_NEWS_CACHE_SCHEMA,
        fetched_at: "2026-05-11T12:00:00Z",
        source_version: "2026.05.0",
        items: [createValidItem({ id: "cache-hit" })],
      }),
    );
    vi.mocked(fetchRemoteJson).mockRejectedValue(new Error("network down"));

    const result = await loadDashboardNews();

    expect(result.source).toBe("cache");
    expect(result.items[0].id).toBe("cache-hit");
  });

  it("uses built-in fallback when API fails and cache is missing", async () => {
    vi.mocked(fetchRemoteJson).mockRejectedValue(new Error("network down"));

    const result = await loadDashboardNews();

    expect(result.source).toBe("fallback");
    expect(result.items).toEqual(getBuiltInFallbackDashboardNewsItems());
  });

  it("stays non-throwing when both remote and cache payloads are invalid", async () => {
    localStorage.setItem(
      DASHBOARD_NEWS_CACHE_LOCAL_STORAGE_KEY,
      JSON.stringify({
        schema: "broken_cache_schema",
        items: "bad",
      }),
    );
    vi.mocked(fetchRemoteJson).mockResolvedValue({
      schema: "broken_remote_schema",
      items: "bad",
    });

    await expect(loadDashboardNews()).resolves.toMatchObject({
      source: "fallback",
    });
  });

  it("writes cache after successful remote fetch", async () => {
    vi.mocked(fetchRemoteJson).mockResolvedValue({
      schema: DASHBOARD_NEWS_SCHEMA,
      version: "2026.05.1",
      items: [createValidItem({ id: "remote-news" })],
    });

    await loadDashboardNews();

    const rawCache = localStorage.getItem(DASHBOARD_NEWS_CACHE_LOCAL_STORAGE_KEY);
    expect(rawCache).toBeTruthy();
    const cachePayload = JSON.parse(rawCache as string) as {
      schema: string;
      source_version: string | null;
      items: Array<{ id: string }>;
    };
    expect(cachePayload.schema).toBe(DASHBOARD_NEWS_CACHE_SCHEMA);
    expect(cachePayload.source_version).toBe("2026.05.1");
    expect(cachePayload.items[0].id).toBe("remote-news");
  });

  it("rejects unsafe external CTA URLs", () => {
    const parsed = parseDashboardNewsPayload({
      schema: DASHBOARD_NEWS_SCHEMA,
      items: [
        createValidItem({
          id: "unsafe-url",
          cta: {
            label: "Open",
            url: "javascript:alert(1)",
          },
        }),
      ],
    });

    expect(parsed.items[0].cta).toBeUndefined();
  });

  it("keeps safe internal route CTAs", () => {
    const parsed = parseDashboardNewsPayload({
      schema: DASHBOARD_NEWS_SCHEMA,
      items: [
        createValidItem({
          id: "safe-route",
          cta: {
            label: "Open Plugins",
            route: "/plugins",
          },
        }),
      ],
    });

    expect(parsed.items[0].cta?.route).toBe("/plugins");
  });
});
