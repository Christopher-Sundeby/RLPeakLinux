import { invoke, isTauri } from "@tauri-apps/api/core";
import { getLocalAppDataPaths } from "./pathService";
import type { ActiveBoostEntry, AppState, ItemsUiSelectionState } from "./types";

const LOCAL_STORAGE_STATE_KEY = "rlhub_app_state_json";

function normalizeOptionalSelectionValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function sanitizeItemsUiSelectionState(value: ItemsUiSelectionState | undefined): ItemsUiSelectionState {
  return {
    selectedCarKey: normalizeOptionalSelectionValue(value?.selectedCarKey),
    selectedSkinFolder: normalizeOptionalSelectionValue(value?.selectedSkinFolder),
    selectedWheelFolder: normalizeOptionalSelectionValue(value?.selectedWheelFolder),
    selectedBoostFolder: normalizeOptionalSelectionValue(value?.selectedBoostFolder),
  };
}

function hasItemsSelectionValues(value: ItemsUiSelectionState): boolean {
  return Boolean(
    value.selectedCarKey
      || value.selectedSkinFolder
      || value.selectedWheelFolder
      || value.selectedBoostFolder,
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrateAppState(state: AppState): AppState {
  const activeItemsRecord = isObjectRecord(state.activeItems) ? state.activeItems : {};
  const wheelRecord = isObjectRecord(activeItemsRecord.Wheel) ? activeItemsRecord.Wheel : {};
  const boostRecord = isObjectRecord(activeItemsRecord.Boost) ? activeItemsRecord.Boost : {};
  const rawBoostCurrent = Object.prototype.hasOwnProperty.call(boostRecord, "current")
    ? boostRecord.current
    : null;
  const normalizedBoostCurrent: ActiveBoostEntry | null = isObjectRecord(rawBoostCurrent)
    ? (rawBoostCurrent as ActiveBoostEntry)
    : null;

  const uiSelectionsRecord = isObjectRecord(state.uiSelections) ? state.uiSelections : {};
  const itemsSelectionRecord = sanitizeItemsUiSelectionState(
    isObjectRecord(uiSelectionsRecord.items) ? (uiSelectionsRecord.items as ItemsUiSelectionState) : undefined,
  );
  const uiStateRecord = isObjectRecord(state.uiState) ? state.uiState : {};
  const itemsGuideSeen = uiStateRecord.itemsGuideSeen === true;

  return {
    ...state,
    activeItems: {
      ...activeItemsRecord,
      Wheel: {
        ...wheelRecord,
      },
      Boost: {
        ...boostRecord,
        current: normalizedBoostCurrent,
      },
    },
    uiSelections: {
      ...uiSelectionsRecord,
      items: {
        ...itemsSelectionRecord,
        selectedBoostFolder: itemsSelectionRecord.selectedBoostFolder ?? null,
      },
    },
    uiState: {
      ...uiStateRecord,
      itemsGuideSeen,
    },
  };
}

function parseAppState(raw: string): AppState {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isObjectRecord(parsed)) {
      return migrateAppState(parsed as AppState);
    }
  } catch {
    return migrateAppState({});
  }

  return migrateAppState({});
}

export async function loadAppState(): Promise<AppState> {
  if (!isTauri()) {
    const raw = localStorage.getItem(LOCAL_STORAGE_STATE_KEY);
    return raw ? parseAppState(raw) : migrateAppState({});
  }

  const paths = await getLocalAppDataPaths();
  try {
    const raw = await invoke<string>("read_text_file", { path: paths.stateFilePath });
    return parseAppState(raw);
  } catch {
    return migrateAppState({});
  }
}

export async function saveAppState(state: AppState): Promise<void> {
  const migratedState = migrateAppState(state);
  const payload = JSON.stringify(migratedState, null, 2);

  if (!isTauri()) {
    localStorage.setItem(LOCAL_STORAGE_STATE_KEY, payload);
    return;
  }

  const paths = await getLocalAppDataPaths();
  await invoke("write_text_file", { path: paths.stateFilePath, contents: payload });
}

export async function saveRocketLeaguePathSetting(rocketLeaguePath: string): Promise<void> {
  const current = await loadAppState();
  const nextState: AppState = {
    ...current,
    rocketLeaguePath,
  };
  await saveAppState(nextState);
}

export function readItemsUiSelectionState(state: AppState): ItemsUiSelectionState {
  return sanitizeItemsUiSelectionState(state.uiSelections?.items);
}

export function readItemsGuideSeenState(state: AppState): boolean {
  return state.uiState?.itemsGuideSeen === true;
}

export async function saveItemsUiSelectionState(selection: ItemsUiSelectionState): Promise<void> {
  const current = await loadAppState();
  const mergedItemsSelection = sanitizeItemsUiSelectionState({
    ...readItemsUiSelectionState(current),
    ...selection,
  });

  const nextState: AppState = {
    ...current,
    uiSelections: hasItemsSelectionValues(mergedItemsSelection)
      ? {
          ...(current.uiSelections ?? {}),
          items: mergedItemsSelection,
        }
      : {
          ...(current.uiSelections ?? {}),
          items: {
            ...mergedItemsSelection,
            selectedBoostFolder: null,
          },
        },
  };

  await saveAppState(nextState);
}

export async function saveItemsGuideSeenState(itemsGuideSeen: boolean): Promise<void> {
  const current = await loadAppState();
  const nextState: AppState = {
    ...current,
    uiState: {
      ...(current.uiState ?? {}),
      itemsGuideSeen,
    },
  };
  await saveAppState(nextState);
}
