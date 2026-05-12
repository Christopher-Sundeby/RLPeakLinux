import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getLocalAppDataPaths } from "../items/pathService";
import { fetchRemoteJson } from "../items/remoteApiService";

export const DASHBOARD_NEWS_URL = "https://api.rlpeak.com/v1/news/dashboard.json";
export const DASHBOARD_NEWS_SCHEMA = "rlpeak_dashboard_news.v1";
export const DASHBOARD_NEWS_CACHE_SCHEMA = "rlpeak_dashboard_news_cache.v1";
export const DASHBOARD_NEWS_CACHE_FILE_NAME = "dashboard_news_cache.json";
export const DASHBOARD_NEWS_CACHE_LOCAL_STORAGE_KEY = "rlpeak_dashboard_news_cache_json";
export const DASHBOARD_NEWS_MAX_ITEMS = 5;

export type DashboardNewsType = "news" | "info" | "update" | "warning";

export interface DashboardNewsItemCta {
  label: string;
  route?: string;
  url?: string;
}

export interface DashboardNewsItem {
  id: string;
  type: DashboardNewsType;
  title: string;
  summary: string;
  body?: string;
  date?: string;
  badge?: string;
  priority: number;
  cta?: DashboardNewsItemCta;
}

interface DashboardNewsPayload {
  version?: string;
  items: DashboardNewsItem[];
}

interface DashboardNewsCachePayload {
  schema: string;
  fetched_at: string;
  source_version: string | null;
  items: DashboardNewsItem[];
}

export type DashboardNewsSource = "remote" | "cache" | "fallback";

export interface DashboardNewsLoadResult {
  source: DashboardNewsSource;
  sourceVersion?: string;
  fetchedAt?: string;
  items: DashboardNewsItem[];
}

const NEWS_TYPE_SET: ReadonlySet<DashboardNewsType> = new Set(["news", "info", "update", "warning"]);
const INTERNAL_ROUTE_REGEX = /^\/[a-zA-Z0-9/_-]*$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const BUILTIN_FALLBACK_NEWS_ITEMS: DashboardNewsItem[] = [
  {
    id: "rlpeak-v1",
    type: "update",
    title: "RLPeak V1 is live",
    summary: "Decals, Wheels, and Boosts are available in Items.",
    body: "Use Apply for instant swaps and Reset controls to restore backups.",
    badge: "RLPeak V1",
    priority: 90,
    cta: {
      label: "Open Items",
      route: "/items",
    },
  },
  {
    id: "instant-apply",
    type: "info",
    title: "Instant Apply workflow",
    summary: "Select an item, press Apply, then equip the highlighted base item in Rocket League.",
    badge: "Instant Apply",
    priority: 80,
  },
  {
    id: "plugins-updates",
    type: "news",
    title: "Plugins and tooling updates",
    summary: "Check Plugins for RocketStats overlay and Workshop Map Loader improvements.",
    badge: "Plugins",
    priority: 70,
    cta: {
      label: "Open Plugins",
      route: "/plugins",
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(source: Record<string, unknown>, key: string, context: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function toDetails(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const value = String(error).trim();
  return value.length > 0 ? value : "Unknown error";
}

function parseDateToTimestamp(dateValue: string | undefined): number {
  if (!dateValue || !DATE_ONLY_REGEX.test(dateValue)) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(`${dateValue}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) {
    return Number.NEGATIVE_INFINITY;
  }
  return timestamp;
}

export function isSafeDashboardNewsRoute(routeValue: string | undefined): routeValue is string {
  if (typeof routeValue !== "string") {
    return false;
  }
  const trimmed = routeValue.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (!INTERNAL_ROUTE_REGEX.test(trimmed)) {
    return false;
  }

  if (trimmed.startsWith("//")) {
    return false;
  }

  return true;
}

export function normalizeDashboardNewsExternalUrl(rawUrl: string | undefined): string | null {
  if (typeof rawUrl !== "string") {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  if (!parsed.hostname || parsed.username || parsed.password) {
    return null;
  }

  const loweredHost = parsed.hostname.toLowerCase();
  if (loweredHost === "localhost" || loweredHost === "127.0.0.1" || loweredHost === "[::1]") {
    return null;
  }

  return parsed.toString();
}

function parseDashboardNewsCta(rawValue: unknown): DashboardNewsItemCta | undefined {
  if (!isRecord(rawValue)) {
    return undefined;
  }

  const label = readOptionalString(rawValue, "label");
  if (!label) {
    return undefined;
  }

  const routeValue = readOptionalString(rawValue, "route");
  if (isSafeDashboardNewsRoute(routeValue)) {
    return {
      label,
      route: routeValue.trim(),
    };
  }

  const urlValue = normalizeDashboardNewsExternalUrl(readOptionalString(rawValue, "url"));
  if (urlValue) {
    return {
      label,
      url: urlValue,
    };
  }

  return undefined;
}

function parseDashboardNewsType(rawType: unknown): DashboardNewsType | null {
  if (typeof rawType !== "string") {
    return null;
  }

  const normalized = rawType.trim().toLowerCase();
  if (!NEWS_TYPE_SET.has(normalized as DashboardNewsType)) {
    return null;
  }

  return normalized as DashboardNewsType;
}

function parseDashboardNewsItem(rawValue: unknown): DashboardNewsItem | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const id = readOptionalString(rawValue, "id");
  const type = parseDashboardNewsType(rawValue.type);
  const title = readOptionalString(rawValue, "title");
  const summary = readOptionalString(rawValue, "summary");
  if (!id || !type || !title || !summary) {
    return null;
  }

  const item: DashboardNewsItem = {
    id,
    type,
    title,
    summary,
    priority: readOptionalNumber(rawValue, "priority") ?? 0,
  };

  const body = readOptionalString(rawValue, "body");
  if (body) {
    item.body = body;
  }

  const date = readOptionalString(rawValue, "date");
  if (date) {
    item.date = date;
  }

  const badge = readOptionalString(rawValue, "badge");
  if (badge) {
    item.badge = badge;
  }

  const cta = parseDashboardNewsCta(rawValue.cta);
  if (cta) {
    item.cta = cta;
  }

  return item;
}

export function sortDashboardNewsItems(items: DashboardNewsItem[]): DashboardNewsItem[] {
  return [...items].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    const rightDate = parseDateToTimestamp(right.date);
    const leftDate = parseDateToTimestamp(left.date);
    if (rightDate !== leftDate) {
      return rightDate - leftDate;
    }

    return left.id.localeCompare(right.id, undefined, { sensitivity: "base" });
  });
}

export function limitDashboardNewsItems(items: DashboardNewsItem[], limit = DASHBOARD_NEWS_MAX_ITEMS): DashboardNewsItem[] {
  return items.slice(0, Math.max(0, limit));
}

export function parseDashboardNewsPayload(payload: unknown): DashboardNewsPayload {
  if (!isRecord(payload)) {
    throw new Error("Dashboard news payload must be an object.");
  }

  const schema = readRequiredString(payload, "schema", "Dashboard news");
  if (schema !== DASHBOARD_NEWS_SCHEMA) {
    throw new Error(`Dashboard news schema is invalid: ${schema}`);
  }

  const version = readOptionalString(payload, "version");
  const rawItems = payload.items;
  if (!Array.isArray(rawItems)) {
    throw new Error("Dashboard news.items must be an array.");
  }

  const parsedItems = rawItems
    .map((item) => parseDashboardNewsItem(item))
    .filter((item): item is DashboardNewsItem => item !== null);

  if (rawItems.length > 0 && parsedItems.length === 0) {
    throw new Error("Dashboard news contains no valid items.");
  }

  return {
    version,
    items: limitDashboardNewsItems(sortDashboardNewsItems(parsedItems)),
  };
}

function parseDashboardNewsCachePayload(payload: unknown): {
  fetchedAt: string;
  sourceVersion?: string;
  items: DashboardNewsItem[];
} {
  if (!isRecord(payload)) {
    throw new Error("Dashboard news cache payload must be an object.");
  }

  const schema = readRequiredString(payload, "schema", "Dashboard news cache");
  if (schema !== DASHBOARD_NEWS_CACHE_SCHEMA) {
    throw new Error(`Dashboard news cache schema is invalid: ${schema}`);
  }

  const fetchedAt = readRequiredString(payload, "fetched_at", "Dashboard news cache");
  const sourceVersion = readOptionalString(payload, "source_version");
  const rawItems = payload.items;
  if (!Array.isArray(rawItems)) {
    throw new Error("Dashboard news cache.items must be an array.");
  }

  const items = rawItems
    .map((item) => parseDashboardNewsItem(item))
    .filter((item): item is DashboardNewsItem => item !== null);

  return {
    fetchedAt,
    sourceVersion,
    items: limitDashboardNewsItems(sortDashboardNewsItems(items)),
  };
}

async function readCacheRaw(path: string): Promise<string | null> {
  if (!isTauri()) {
    return localStorage.getItem(DASHBOARD_NEWS_CACHE_LOCAL_STORAGE_KEY);
  }

  try {
    return await invoke<string>("read_text_file", { path });
  } catch {
    return null;
  }
}

async function writeCacheRaw(path: string, value: string): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(DASHBOARD_NEWS_CACHE_LOCAL_STORAGE_KEY, value);
    return;
  }

  await invoke("write_text_file", { path, contents: value });
}

async function readCachedDashboardNews(path: string): Promise<{
  fetchedAt: string;
  sourceVersion?: string;
  items: DashboardNewsItem[];
} | null> {
  const raw = await readCacheRaw(path);
  if (!raw) {
    return null;
  }

  try {
    return parseDashboardNewsCachePayload(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function writeCachedDashboardNews(path: string, payload: DashboardNewsCachePayload): Promise<void> {
  await writeCacheRaw(path, JSON.stringify(payload, null, 2));
}

export function getBuiltInFallbackDashboardNewsItems(): DashboardNewsItem[] {
  return BUILTIN_FALLBACK_NEWS_ITEMS.map((item) => ({
    ...item,
    cta: item.cta ? { ...item.cta } : undefined,
  }));
}

export async function getDashboardNewsCachePath(): Promise<string> {
  if (!isTauri()) {
    return DASHBOARD_NEWS_CACHE_FILE_NAME;
  }

  const paths = await getLocalAppDataPaths();
  return join(paths.appDataRoot, DASHBOARD_NEWS_CACHE_FILE_NAME);
}

export async function loadDashboardNews(): Promise<DashboardNewsLoadResult> {
  const cachePath = await getDashboardNewsCachePath();

  try {
    const remotePayload = await fetchRemoteJson(DASHBOARD_NEWS_URL);
    const parsedRemote = parseDashboardNewsPayload(remotePayload);
    const fetchedAt = new Date().toISOString();
    await writeCachedDashboardNews(cachePath, {
      schema: DASHBOARD_NEWS_CACHE_SCHEMA,
      fetched_at: fetchedAt,
      source_version: parsedRemote.version ?? null,
      items: parsedRemote.items,
    });

    return {
      source: "remote",
      sourceVersion: parsedRemote.version,
      fetchedAt,
      items: parsedRemote.items,
    };
  } catch (remoteError: unknown) {
    const cachedPayload = await readCachedDashboardNews(cachePath);
    if (cachedPayload) {
      return {
        source: "cache",
        sourceVersion: cachedPayload.sourceVersion,
        fetchedAt: cachedPayload.fetchedAt,
        items: cachedPayload.items,
      };
    }

    console.error(`Dashboard news fetch failed: ${toDetails(remoteError)}`);
    return {
      source: "fallback",
      items: getBuiltInFallbackDashboardNewsItems(),
    };
  }
}

