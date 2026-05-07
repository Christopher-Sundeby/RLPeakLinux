export interface AppState {
  rocketLeaguePath?: string;
  activeItems?: ActiveItemsState;
  uiSelections?: UiSelectionsState;
  uiState?: UiState;
  lastAction?: LastActionState;
  [key: string]: unknown;
}

export interface ActiveItemsState {
  Skin?: Record<string, ActiveSkinEntry>;
  Wheel?: {
    current?: ActiveWheelEntry | null;
  };
  Boost?: {
    current?: ActiveBoostEntry | null;
  };
}

export interface ActiveSkinEntry {
  skin_folder?: string;
  display_name?: string;
  base_file?: string;
  thumbnail_file?: string;
  applied_at?: string;
}

export interface ActiveWheelEntry {
  wheel_folder?: string;
  display_name?: string;
  base_file?: string;
  thumbnail_file?: string;
  applied_at?: string;
}

export interface ActiveBoostEntry {
  boost_folder?: string;
  display_name?: string;
  base_files?: string[];
  thumbnail_file?: string;
  applied_at?: string;
}

export interface LastActionState {
  type?: string;
  itemType?: string;
  displayName?: string;
  timestamp?: string;
}

export interface UiSelectionsState {
  items?: ItemsUiSelectionState;
}

export interface ItemsUiSelectionState {
  selectedCarKey?: string | null;
  selectedSkinFolder?: string | null;
  selectedWheelFolder?: string | null;
  selectedBoostFolder?: string | null;
}

export interface UiState {
  itemsGuideSeen?: boolean;
}
