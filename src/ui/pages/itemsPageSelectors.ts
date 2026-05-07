import type { SkinCarCatalogEntry, SkinCatalogItem } from "../../modules/items/types";

export interface CarListEntry {
  key: string;
  label: string;
}

export function resolveCarComboboxInputValue(options: {
  isOpen: boolean;
  searchQuery: string;
  selectedCarLabel: string;
}): string {
  if (options.isOpen) {
    return options.searchQuery;
  }

  return options.selectedCarLabel;
}

function sortSkinsByName(a: SkinCatalogItem, b: SkinCatalogItem): number {
  return a.ingame_decal_name.localeCompare(b.ingame_decal_name, undefined, { sensitivity: "base" });
}

export function resolveSelectedCarKeyFromEntries(
  entries: CarListEntry[],
  selectedCarKey: string,
): string {
  const normalizedCarKey = selectedCarKey.trim();
  if (!normalizedCarKey || entries.length === 0) {
    return "";
  }

  return entries.some((entry) => entry.key === normalizedCarKey) ? normalizedCarKey : "";
}

export function filterSkinEntriesForCar(
  selectedCarEntry: SkinCarCatalogEntry | null,
  search: string,
): SkinCatalogItem[] {
  if (!selectedCarEntry) {
    return [];
  }

  const orderedSkins = [...selectedCarEntry.skins].sort(sortSkinsByName);
  const searchValue = search.trim().toLowerCase();
  if (!searchValue) {
    return orderedSkins;
  }

  return orderedSkins.filter((skin) => skin.ingame_decal_name.toLowerCase().includes(searchValue));
}

export function filterCarEntries(entries: CarListEntry[], query: string): CarListEntry[] {
  const searchValue = query.trim().toLowerCase();
  if (!searchValue) {
    return entries;
  }

  return entries.filter((entry) => {
    return entry.label.toLowerCase().includes(searchValue) || entry.key.toLowerCase().includes(searchValue);
  });
}

export function pinActiveFirst<T>(
  entries: T[],
  getEntryKey: (entry: T) => string,
  activeKey: string,
): T[] {
  const normalizedActiveKey = activeKey.trim();
  if (!normalizedActiveKey) {
    return entries;
  }

  const activeEntries: T[] = [];
  const otherEntries: T[] = [];
  for (const entry of entries) {
    if (getEntryKey(entry) === normalizedActiveKey) {
      activeEntries.push(entry);
    } else {
      otherEntries.push(entry);
    }
  }

  return [...activeEntries, ...otherEntries];
}

export function formatCurrentPillLabel(label: string): string {
  const normalizedLabel = label.trim();
  return normalizedLabel ? `Current: ${normalizedLabel}` : "";
}
