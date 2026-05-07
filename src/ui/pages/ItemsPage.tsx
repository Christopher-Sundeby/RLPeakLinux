import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSharedCatalogSnapshot,
  type CatalogLoadResult,
} from "../../modules/items/catalogService";
import { applyBoost, applySkin, applyWheel } from "../../modules/items/itemApplyService";
import { resetBoost, resetSelectedCar, resetWheels } from "../../modules/items/restoreService";
import { ensureRocketLeaguePathForActions } from "../../modules/items/rocketLeaguePathService";
import {
  loadAppState,
  readItemsGuideSeenState,
  readItemsUiSelectionState,
  saveRocketLeaguePathSetting,
  saveItemsGuideSeenState,
  saveItemsUiSelectionState,
} from "../../modules/items/stateService";
import {
  filterCarEntries,
  filterSkinEntriesForCar,
  formatCurrentPillLabel,
  pinActiveFirst,
  resolveCarComboboxInputValue,
  resolveSelectedCarKeyFromEntries,
  type CarListEntry,
} from "./itemsPageSelectors";
import {
  ITEMS_GUIDE_BOOST_RESTART_COPY,
  ITEMS_GUIDE_TITLE,
  resolveItemsGuideAcknowledge,
  resolveItemsGuideCloseForLater,
  resolveItemsGuideInitialState,
  resolveItemsGuideManualOpen,
} from "./itemsGuideFlow";
import type {
  AppState,
  BoostCatalog,
  BoostCatalogItem,
  SkinCatalog,
  SkinCarCatalogEntry,
  SkinCatalogItem,
  WheelCatalog,
  WheelCatalogItem,
} from "../../modules/items/types";

interface ToastStatus {
  kind: "success" | "error" | "info";
  message: string;
  warnings?: string[];
}

interface ToastMessage {
  id: number;
  kind: ToastStatus["kind"];
  message: ToastStatus["message"];
  warnings?: ToastStatus["warnings"];
}

function sortByLabel(a: CarListEntry, b: CarListEntry): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}

function sortWheelsByName(a: WheelCatalogItem, b: WheelCatalogItem): number {
  return a.ingame_wheel_name.localeCompare(b.ingame_wheel_name, undefined, { sensitivity: "base" });
}

function sortBoostsByName(a: BoostCatalogItem, b: BoostCatalogItem): number {
  return a.ingame_boost_name.localeCompare(b.ingame_boost_name, undefined, { sensitivity: "base" });
}

function isUniversalDecal(skin: SkinCatalogItem): boolean {
  return Boolean(skin.is_universal_source || skin.is_universal_ingame);
}

function buildListRowClassName(options: {
  isActive: boolean;
  isSelectedPending: boolean;
}): string {
  const classes = ["items-list-row"];
  if (options.isActive) {
    classes.push("is-active");
  } else if (options.isSelectedPending) {
    classes.push("is-selected-pending");
  }

  return classes.join(" ");
}

function resolveDecalDisplayName(
  catalog: SkinCatalog,
  carKey: string,
  skinFolder: string,
): string | null {
  const carEntry = catalog.cars[carKey];
  if (!carEntry) {
    return null;
  }

  const skinEntry = carEntry.skins.find((entry) => entry.skin_folder === skinFolder);
  return skinEntry ? skinEntry.ingame_decal_name : null;
}

function readActiveSkinByCar(state: AppState): Record<string, string> {
  const skinEntries = state.activeItems?.Skin;
  if (!skinEntries || typeof skinEntries !== "object") {
    return {};
  }

  const entries = Object.entries(skinEntries);
  const result: Record<string, string> = {};
  for (const [carKey, value] of entries) {
    const skinFolder = typeof value?.skin_folder === "string" ? value.skin_folder.trim() : "";
    if (skinFolder) {
      result[carKey] = skinFolder;
    }
  }

  return result;
}

function readActiveWheelFolder(state: AppState): string {
  const wheelFolder = state.activeItems?.Wheel?.current?.wheel_folder;
  return typeof wheelFolder === "string" ? wheelFolder.trim() : "";
}

function readActiveBoostFolder(state: AppState): string {
  const boostFolder = state.activeItems?.Boost?.current?.boost_folder;
  return typeof boostFolder === "string" ? boostFolder.trim() : "";
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-card ${
            toast.kind === "success"
              ? "toast-card-success"
              : toast.kind === "info"
                ? "toast-card-info"
                : "toast-card-error"
          }`}
        >
          <div className="toast-card-head">
            <p className="toast-card-message">{toast.message}</p>
            <button
              type="button"
              className="toast-dismiss-btn"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
            >
              x
            </button>
          </div>
          {toast.warnings?.length
            ? toast.warnings.map((warning, index) => (
                <p key={`${toast.id}-warning-${index}`} className="toast-card-warning">
                  {warning}
                </p>
              ))
            : null}
        </div>
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="items-input-icon-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.2 10.2 13 13" />
    </svg>
  );
}

export function ItemsPage() {
  const navigate = useNavigate();
  const [skinCatalogResult, setSkinCatalogResult] = useState<CatalogLoadResult<SkinCatalog> | null>(null);
  const [wheelCatalogResult, setWheelCatalogResult] = useState<CatalogLoadResult<WheelCatalog> | null>(null);
  const [boostCatalogResult, setBoostCatalogResult] = useState<CatalogLoadResult<BoostCatalog> | null>(null);
  const [rocketLeaguePath, setRocketLeaguePath] = useState("");

  const carComboboxRef = useRef<HTMLDivElement | null>(null);
  const [decalSearch, setDecalSearch] = useState("");
  const [carSearchQuery, setCarSearchQuery] = useState("");
  const [isCarDropdownOpen, setIsCarDropdownOpen] = useState(false);
  const [selectedCarKey, setSelectedCarKey] = useState("");
  const [selectedSkinFolder, setSelectedSkinFolder] = useState("");
  const [isApplyingDecal, setIsApplyingDecal] = useState(false);
  const [decalApplyStep, setDecalApplyStep] = useState<"idle" | "downloading" | "applying">("idle");
  const [isResettingDecal, setIsResettingDecal] = useState(false);

  const [wheelSearch, setWheelSearch] = useState("");
  const [selectedWheelFolder, setSelectedWheelFolder] = useState("");
  const [isApplyingWheel, setIsApplyingWheel] = useState(false);
  const [wheelApplyStep, setWheelApplyStep] = useState<"idle" | "downloading" | "applying">("idle");
  const [isResettingWheel, setIsResettingWheel] = useState(false);

  const [boostSearch, setBoostSearch] = useState("");
  const [selectedBoostFolder, setSelectedBoostFolder] = useState("");
  const [isApplyingBoost, setIsApplyingBoost] = useState(false);
  const [boostApplyStep, setBoostApplyStep] = useState<"idle" | "downloading" | "applying">("idle");
  const [isResettingBoost, setIsResettingBoost] = useState(false);

  const [hasLoadedSelectionState, setHasLoadedSelectionState] = useState(false);
  const [activeSkinByCar, setActiveSkinByCar] = useState<Record<string, string>>({});
  const [activeWheelFolder, setActiveWheelFolder] = useState("");
  const [activeBoostFolder, setActiveBoostFolder] = useState("");
  const [isItemsGuideOpen, setIsItemsGuideOpen] = useState(false);
  const [isItemsGuideFirstVisitFlow, setIsItemsGuideFirstVisitFlow] = useState(false);
  const [isSavingItemsGuideSeen, setIsSavingItemsGuideSeen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const toastTimerRef = useRef<number[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getSharedCatalogSnapshot(), loadAppState()])
      .then(([catalogs, appState]) => {
        if (!isMounted) {
          return;
        }

        const savedSelections = readItemsUiSelectionState(appState);
        const hasSeenItemsGuide = readItemsGuideSeenState(appState);
        const initialGuideState = resolveItemsGuideInitialState(hasSeenItemsGuide);
        setSkinCatalogResult(catalogs.snapshot.skin);
        setWheelCatalogResult(catalogs.snapshot.wheel);
        setBoostCatalogResult(catalogs.snapshot.boost);
        setRocketLeaguePath(typeof appState.rocketLeaguePath === "string" ? appState.rocketLeaguePath : "");
        if (savedSelections.selectedCarKey) {
          setSelectedCarKey(savedSelections.selectedCarKey);
        }
        if (savedSelections.selectedSkinFolder) {
          setSelectedSkinFolder(savedSelections.selectedSkinFolder);
        }
        if (savedSelections.selectedWheelFolder) {
          setSelectedWheelFolder(savedSelections.selectedWheelFolder);
        }
        if (savedSelections.selectedBoostFolder) {
          setSelectedBoostFolder(savedSelections.selectedBoostFolder);
        }
        setActiveSkinByCar(readActiveSkinByCar(appState));
        setActiveWheelFolder(readActiveWheelFolder(appState));
        setActiveBoostFolder(readActiveBoostFolder(appState));
        setIsItemsGuideFirstVisitFlow(initialGuideState.isFirstVisitFlow);
        setIsItemsGuideOpen(initialGuideState.isOpen);
        setHasLoadedSelectionState(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setSkinCatalogResult(null);
        setWheelCatalogResult(null);
        setBoostCatalogResult(null);
        setHasLoadedSelectionState(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const carEntries = useMemo<CarListEntry[]>(() => {
    if (!skinCatalogResult?.ok) {
      return [];
    }

    const entries = Object.entries(skinCatalogResult.data.cars).map(([carKey, entry]) => ({
      key: carKey,
      label: entry.car,
    }));

    return entries.sort(sortByLabel);
  }, [skinCatalogResult]);

  const filteredCarEntries = useMemo<CarListEntry[]>(() => {
    return filterCarEntries(carEntries, carSearchQuery);
  }, [carEntries, carSearchQuery]);

  useEffect(() => {
    const resolvedCarKey = resolveSelectedCarKeyFromEntries(carEntries, selectedCarKey);
    if (resolvedCarKey === selectedCarKey) {
      return;
    }

    if (resolvedCarKey) {
      setSelectedCarKey(resolvedCarKey);
      return;
    }

    if (selectedCarKey) {
      setSelectedCarKey("");
    }
  }, [carEntries, selectedCarKey]);

  const selectedCarLabel = useMemo(() => {
    if (!selectedCarKey) {
      return "";
    }

    const selectedEntry = carEntries.find((entry) => entry.key === selectedCarKey);
    return selectedEntry?.label ?? "";
  }, [carEntries, selectedCarKey]);

  const carComboboxInputValue = useMemo(() => {
    return resolveCarComboboxInputValue({
      isOpen: isCarDropdownOpen,
      searchQuery: carSearchQuery,
      selectedCarLabel,
    });
  }, [carSearchQuery, isCarDropdownOpen, selectedCarLabel]);

  const selectedCarEntry = useMemo<SkinCarCatalogEntry | null>(() => {
    if (!skinCatalogResult?.ok || !selectedCarKey) {
      return null;
    }

    return skinCatalogResult.data.cars[selectedCarKey] ?? null;
  }, [skinCatalogResult, selectedCarKey]);

  const activeSkinFolderForSelectedCar = selectedCarKey ? activeSkinByCar[selectedCarKey] ?? "" : "";

  const filteredSkinEntries = useMemo<SkinCatalogItem[]>(() => {
    const sorted = filterSkinEntriesForCar(selectedCarEntry, decalSearch);
    return pinActiveFirst(sorted, (entry) => entry.skin_folder, activeSkinFolderForSelectedCar);
  }, [activeSkinFolderForSelectedCar, selectedCarEntry, decalSearch]);

  useEffect(() => {
    if (filteredSkinEntries.length === 0 || !selectedSkinFolder) {
      setSelectedSkinFolder("");
      return;
    }

    const hasSelectedSkin = filteredSkinEntries.some((skin) => skin.skin_folder === selectedSkinFolder);
    if (!hasSelectedSkin) {
      setSelectedSkinFolder("");
    }
  }, [filteredSkinEntries, selectedSkinFolder]);

  const selectedSkinEntry = useMemo<SkinCatalogItem | null>(() => {
    if (!selectedCarEntry || !selectedSkinFolder) {
      return null;
    }

    return selectedCarEntry.skins.find((skin) => skin.skin_folder === selectedSkinFolder) ?? null;
  }, [selectedCarEntry, selectedSkinFolder]);

  const wheelEntries = useMemo<WheelCatalogItem[]>(() => {
    if (!wheelCatalogResult?.ok) {
      return [];
    }

    return [...wheelCatalogResult.data.wheels].sort(sortWheelsByName);
  }, [wheelCatalogResult]);

  const filteredWheelEntries = useMemo<WheelCatalogItem[]>(() => {
    const searchValue = wheelSearch.trim().toLowerCase();
    const filtered = !searchValue
      ? wheelEntries
      : wheelEntries.filter((entry) => entry.ingame_wheel_name.toLowerCase().includes(searchValue));
    return pinActiveFirst(filtered, (entry) => entry.wheel_folder, activeWheelFolder);
  }, [activeWheelFolder, wheelEntries, wheelSearch]);

  useEffect(() => {
    if (filteredWheelEntries.length === 0 || !selectedWheelFolder) {
      setSelectedWheelFolder("");
      return;
    }

    const hasSelectedWheel = filteredWheelEntries.some((entry) => entry.wheel_folder === selectedWheelFolder);
    if (!hasSelectedWheel) {
      setSelectedWheelFolder("");
    }
  }, [filteredWheelEntries, selectedWheelFolder]);

  const selectedWheelEntry = useMemo<WheelCatalogItem | null>(() => {
    if (!selectedWheelFolder) {
      return null;
    }

    return wheelEntries.find((entry) => entry.wheel_folder === selectedWheelFolder) ?? null;
  }, [wheelEntries, selectedWheelFolder]);

  const boostEntries = useMemo<BoostCatalogItem[]>(() => {
    if (!boostCatalogResult?.ok) {
      return [];
    }

    return [...boostCatalogResult.data.boosts].sort(sortBoostsByName);
  }, [boostCatalogResult]);

  const filteredBoostEntries = useMemo<BoostCatalogItem[]>(() => {
    const searchValue = boostSearch.trim().toLowerCase();
    const filtered = !searchValue
      ? boostEntries
      : boostEntries.filter((entry) => {
      return (
        entry.ingame_boost_name.toLowerCase().includes(searchValue)
        || entry.boost_folder.toLowerCase().includes(searchValue)
      );
    });
    return pinActiveFirst(filtered, (entry) => entry.boost_folder, activeBoostFolder);
  }, [activeBoostFolder, boostEntries, boostSearch]);

  useEffect(() => {
    if (filteredBoostEntries.length === 0 || !selectedBoostFolder) {
      setSelectedBoostFolder("");
      return;
    }

    const hasSelectedBoost = filteredBoostEntries.some((entry) => entry.boost_folder === selectedBoostFolder);
    if (!hasSelectedBoost) {
      setSelectedBoostFolder("");
    }
  }, [filteredBoostEntries, selectedBoostFolder]);

  const selectedBoostEntry = useMemo<BoostCatalogItem | null>(() => {
    if (!selectedBoostFolder) {
      return null;
    }

    return boostEntries.find((entry) => entry.boost_folder === selectedBoostFolder) ?? null;
  }, [boostEntries, selectedBoostFolder]);

  useEffect(() => {
    if (!hasLoadedSelectionState) {
      return;
    }

    void saveItemsUiSelectionState({
      selectedCarKey,
      selectedSkinFolder,
      selectedWheelFolder,
      selectedBoostFolder,
    });
  }, [hasLoadedSelectionState, selectedCarKey, selectedSkinFolder, selectedWheelFolder, selectedBoostFolder]);

  useEffect(() => {
    return () => {
      for (const timerId of toastTimerRef.current) {
        window.clearTimeout(timerId);
      }
      toastTimerRef.current = [];
    };
  }, []);

  useEffect(() => {
    const handleDocumentPointerDown = (event: MouseEvent) => {
      if (!carComboboxRef.current?.contains(event.target as Node)) {
        setIsCarDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown);
    };
  }, []);

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const pushToast = (status: ToastStatus) => {
    toastIdRef.current += 1;
    const nextToast: ToastMessage = {
      id: toastIdRef.current,
      kind: status.kind,
      message: status.message,
      warnings: status.warnings,
    };

    setToasts((current) => [...current, nextToast]);
    const timerId = window.setTimeout(() => {
      dismissToast(nextToast.id);
      toastTimerRef.current = toastTimerRef.current.filter((value) => value !== timerId);
    }, 4200);
    toastTimerRef.current.push(timerId);
  };

  const openItemsGuideModal = () => {
    const nextState = resolveItemsGuideManualOpen();
    setIsItemsGuideFirstVisitFlow(nextState.isFirstVisitFlow);
    setIsItemsGuideOpen(nextState.isOpen);
  };

  const closeItemsGuideModalForLater = () => {
    const nextState = resolveItemsGuideCloseForLater();
    setIsItemsGuideOpen(nextState.isOpen);
    setIsItemsGuideFirstVisitFlow(nextState.isFirstVisitFlow);
  };

  const acknowledgeItemsGuide = async () => {
    const nextState = resolveItemsGuideAcknowledge(isItemsGuideFirstVisitFlow);
    if (nextState.shouldPersistSeen) {
      setIsSavingItemsGuideSeen(true);
      try {
        await saveItemsGuideSeenState(true);
      } catch {
        pushToast({
          kind: "error",
          message: "Could not save Items guide preference. You may see this guide again.",
        });
      } finally {
        setIsSavingItemsGuideSeen(false);
      }
    }

    setIsItemsGuideOpen(nextState.isOpen);
    setIsItemsGuideFirstVisitFlow(nextState.isFirstVisitFlow);
  };

  const selectCarByKey = (nextCarKey: string) => {
    const normalizedKey = nextCarKey.trim();
    if (!normalizedKey) {
      setSelectedCarKey("");
      setSelectedSkinFolder("");
      setCarSearchQuery("");
      return;
    }

    if (normalizedKey !== selectedCarKey) {
      setSelectedSkinFolder("");
    }
    setSelectedCarKey(normalizedKey);
    setCarSearchQuery("");
    setIsCarDropdownOpen(false);
  };

  const canApplyDecal =
    !isApplyingDecal
    && !isResettingDecal
    && selectedCarKey.length > 0
    && selectedSkinEntry !== null
    && selectedSkinEntry.skin_folder !== activeSkinFolderForSelectedCar;
  const canResetCar = !isApplyingDecal && !isResettingDecal && selectedCarKey.length > 0;
  const canApplyWheel =
    !isApplyingWheel
    && !isResettingWheel
    && selectedWheelEntry !== null
    && selectedWheelEntry.wheel_folder !== activeWheelFolder;
  const canResetWheel = !isApplyingWheel && !isResettingWheel;
  const canApplyBoost =
    boostCatalogResult?.ok === true
    && !isApplyingBoost
    && !isResettingBoost
    && selectedBoostEntry !== null
    && selectedBoostEntry.boost_folder !== activeBoostFolder;
  const canResetBoost = boostCatalogResult?.ok === true && !isApplyingBoost && !isResettingBoost;

  const activeDecalPillLabel = useMemo(() => {
    if (!skinCatalogResult?.ok) {
      return "";
    }

    const selectedCarActiveSkin = selectedCarKey ? activeSkinByCar[selectedCarKey] ?? "" : "";
    if (selectedCarActiveSkin) {
      return resolveDecalDisplayName(skinCatalogResult.data, selectedCarKey, selectedCarActiveSkin) ?? selectedCarActiveSkin;
    }

    for (const [carKey, skinFolder] of Object.entries(activeSkinByCar)) {
      if (!skinFolder) {
        continue;
      }

      const displayName = resolveDecalDisplayName(skinCatalogResult.data, carKey, skinFolder);
      return displayName ?? skinFolder;
    }

    return "";
  }, [activeSkinByCar, selectedCarKey, skinCatalogResult]);

  const activeWheelPillLabel = useMemo(() => {
    if (!activeWheelFolder) {
      return "";
    }

    const wheelMatch = wheelEntries.find((entry) => entry.wheel_folder === activeWheelFolder);
    return wheelMatch?.ingame_wheel_name ?? activeWheelFolder;
  }, [activeWheelFolder, wheelEntries]);

  const activeBoostPillLabel = useMemo(() => {
    if (!activeBoostFolder) {
      return "";
    }

    const boostMatch = boostEntries.find((entry) => entry.boost_folder === activeBoostFolder);
    return boostMatch?.ingame_boost_name ?? activeBoostFolder;
  }, [activeBoostFolder, boostEntries]);

  const handleApplyDecal = async () => {
    if (!selectedCarEntry || !selectedSkinEntry) {
      pushToast({ kind: "error", message: "Apply failed" });
      return;
    }

    const pathGuard = await ensureRocketLeaguePathForActions(rocketLeaguePath);
    if (!pathGuard.ok) {
      pushToast({ kind: "error", message: pathGuard.message });
      navigate("/settings");
      return;
    }
    const resolvedRocketLeaguePath = pathGuard.rocketLeaguePath;
    if (resolvedRocketLeaguePath !== rocketLeaguePath.trim()) {
      setRocketLeaguePath(resolvedRocketLeaguePath);
      void saveRocketLeaguePathSetting(resolvedRocketLeaguePath);
    }

    setIsApplyingDecal(true);
    setDecalApplyStep("applying");

    try {
      const result = await applySkin({
        rocketLeaguePath: resolvedRocketLeaguePath,
        carKey: selectedCarKey,
        skin: selectedSkinEntry,
        thumbnailFile: selectedCarEntry.base_thumbnail,
        thumbnailPath: selectedCarEntry.base_thumbnail_path,
        remoteThumbnail: selectedCarEntry.remote_thumbnail,
        onStatusChange: (step) => {
          if (step === "downloading") {
            setDecalApplyStep("downloading");
            return;
          }
          setDecalApplyStep("applying");
        },
      });

      if (result.ok) {
        pushToast({
          kind: "success",
          message: result.message,
          warnings: result.warnings,
        });
        setActiveSkinByCar((current) => ({
          ...current,
          [selectedCarKey]: selectedSkinEntry.skin_folder,
        }));
        return;
      }

      pushToast({
        kind: "error",
        message: result.message,
      });
    } catch {
      pushToast({
        kind: "error",
        message: "Apply failed",
      });
    } finally {
      setIsApplyingDecal(false);
      setDecalApplyStep("idle");
    }
  };

  const handleResetCar = async () => {
    if (!selectedCarKey) {
      pushToast({ kind: "error", message: "Restore failed" });
      return;
    }

    const pathGuard = await ensureRocketLeaguePathForActions(rocketLeaguePath);
    if (!pathGuard.ok) {
      pushToast({ kind: "error", message: pathGuard.message });
      navigate("/settings");
      return;
    }
    const resolvedRocketLeaguePath = pathGuard.rocketLeaguePath;
    if (resolvedRocketLeaguePath !== rocketLeaguePath.trim()) {
      setRocketLeaguePath(resolvedRocketLeaguePath);
      void saveRocketLeaguePathSetting(resolvedRocketLeaguePath);
    }

    setIsResettingDecal(true);

    try {
      const result = await resetSelectedCar({
        rocketLeaguePath: resolvedRocketLeaguePath,
        carKey: selectedCarKey,
      });

      if (result.ok) {
        pushToast({ kind: "success", message: result.message });
        setActiveSkinByCar((current) => {
          const next = { ...current };
          delete next[selectedCarKey];
          return next;
        });
        setSelectedSkinFolder("");
        return;
      }

      pushToast({ kind: "error", message: result.message });
    } catch {
      pushToast({ kind: "error", message: "Restore failed" });
    } finally {
      setIsResettingDecal(false);
    }
  };

  const handleApplyWheel = async () => {
    if (!selectedWheelEntry) {
      pushToast({ kind: "error", message: "Apply failed" });
      return;
    }

    const pathGuard = await ensureRocketLeaguePathForActions(rocketLeaguePath);
    if (!pathGuard.ok) {
      pushToast({ kind: "error", message: pathGuard.message });
      navigate("/settings");
      return;
    }
    const resolvedRocketLeaguePath = pathGuard.rocketLeaguePath;
    if (resolvedRocketLeaguePath !== rocketLeaguePath.trim()) {
      setRocketLeaguePath(resolvedRocketLeaguePath);
      void saveRocketLeaguePathSetting(resolvedRocketLeaguePath);
    }

    setIsApplyingWheel(true);
    setWheelApplyStep("applying");

    try {
      const result = await applyWheel({
        rocketLeaguePath: resolvedRocketLeaguePath,
        wheel: selectedWheelEntry,
        thumbnailFile: wheelCatalogResult?.ok ? wheelCatalogResult.data.base_thumbnail : undefined,
        thumbnailPath: wheelCatalogResult?.ok ? wheelCatalogResult.data.base_thumbnail_path : undefined,
        remoteThumbnail: wheelCatalogResult?.ok ? wheelCatalogResult.data.remote_thumbnail : undefined,
        onStatusChange: (step) => {
          if (step === "downloading") {
            setWheelApplyStep("downloading");
            return;
          }
          setWheelApplyStep("applying");
        },
      });

      if (result.ok) {
        pushToast({
          kind: "success",
          message: result.message,
          warnings: result.warnings,
        });
        setActiveWheelFolder(selectedWheelEntry.wheel_folder);
        return;
      }

      pushToast({
        kind: "error",
        message: result.message,
      });
    } catch {
      pushToast({
        kind: "error",
        message: "Apply failed",
      });
    } finally {
      setIsApplyingWheel(false);
      setWheelApplyStep("idle");
    }
  };

  const handleResetWheel = async () => {
    const pathGuard = await ensureRocketLeaguePathForActions(rocketLeaguePath);
    if (!pathGuard.ok) {
      pushToast({ kind: "error", message: pathGuard.message });
      navigate("/settings");
      return;
    }
    const resolvedRocketLeaguePath = pathGuard.rocketLeaguePath;
    if (resolvedRocketLeaguePath !== rocketLeaguePath.trim()) {
      setRocketLeaguePath(resolvedRocketLeaguePath);
      void saveRocketLeaguePathSetting(resolvedRocketLeaguePath);
    }

    setIsResettingWheel(true);

    try {
      const result = await resetWheels({ rocketLeaguePath: resolvedRocketLeaguePath });
      if (result.ok) {
        pushToast({ kind: "success", message: result.message });
        setActiveWheelFolder("");
        setSelectedWheelFolder("");
        return;
      }

      pushToast({ kind: "error", message: result.message });
    } catch {
      pushToast({ kind: "error", message: "Restore failed" });
    } finally {
      setIsResettingWheel(false);
    }
  };

  const handleApplyBoost = async () => {
    if (!selectedBoostEntry) {
      pushToast({ kind: "error", message: "Apply failed" });
      return;
    }

    const pathGuard = await ensureRocketLeaguePathForActions(rocketLeaguePath);
    if (!pathGuard.ok) {
      pushToast({ kind: "error", message: pathGuard.message });
      navigate("/settings");
      return;
    }
    const resolvedRocketLeaguePath = pathGuard.rocketLeaguePath;
    if (resolvedRocketLeaguePath !== rocketLeaguePath.trim()) {
      setRocketLeaguePath(resolvedRocketLeaguePath);
      void saveRocketLeaguePathSetting(resolvedRocketLeaguePath);
    }

    setIsApplyingBoost(true);
    setBoostApplyStep("applying");

    try {
      const result = await applyBoost({
        rocketLeaguePath: resolvedRocketLeaguePath,
        boost: selectedBoostEntry,
        thumbnailFile: boostCatalogResult?.ok ? boostCatalogResult.data.base_thumbnail : undefined,
        thumbnailPath: boostCatalogResult?.ok ? boostCatalogResult.data.base_thumbnail_path : undefined,
        remoteThumbnail: boostCatalogResult?.ok ? boostCatalogResult.data.remote_thumbnail : undefined,
        onStatusChange: (step) => {
          if (step === "downloading") {
            setBoostApplyStep("downloading");
            return;
          }
          setBoostApplyStep("applying");
        },
      });

      if (result.ok) {
        pushToast({
          kind: "success",
          message: result.message,
          warnings: result.warnings,
        });
        setActiveBoostFolder(selectedBoostEntry.boost_folder);
        return;
      }

      pushToast({
        kind: "error",
        message: result.message,
      });
    } catch {
      pushToast({
        kind: "error",
        message: "Apply failed",
      });
    } finally {
      setIsApplyingBoost(false);
      setBoostApplyStep("idle");
    }
  };

  const handleResetBoost = async () => {
    const pathGuard = await ensureRocketLeaguePathForActions(rocketLeaguePath);
    if (!pathGuard.ok) {
      pushToast({ kind: "error", message: pathGuard.message });
      navigate("/settings");
      return;
    }
    const resolvedRocketLeaguePath = pathGuard.rocketLeaguePath;
    if (resolvedRocketLeaguePath !== rocketLeaguePath.trim()) {
      setRocketLeaguePath(resolvedRocketLeaguePath);
      void saveRocketLeaguePathSetting(resolvedRocketLeaguePath);
    }

    setIsResettingBoost(true);

    try {
      const result = await resetBoost({ rocketLeaguePath: resolvedRocketLeaguePath });
      if (result.ok) {
        pushToast({ kind: "success", message: result.message });
        setActiveBoostFolder("");
        setSelectedBoostFolder("");
        return;
      }

      pushToast({ kind: "error", message: result.message });
    } catch {
      pushToast({ kind: "error", message: "Restore failed" });
    } finally {
      setIsResettingBoost(false);
    }
  };

  const renderDecalPanelBody = () => {
    if (skinCatalogResult === null) {
      return <p className="items-list-empty">Loading decals...</p>;
    }

    if (!skinCatalogResult.ok) {
      return <p className="status-error">{skinCatalogResult.error.message}</p>;
    }

    return (
      <>
        <label className="items-panel-label" htmlFor="car-combobox-input">
          Select car
        </label>
        <div className="items-combobox" ref={carComboboxRef}>
          <div className={`items-combobox-control${isCarDropdownOpen ? " is-open" : ""}`}>
            <span className="items-combobox-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              id="car-combobox-input"
              className="items-combobox-input"
              type="text"
              value={carComboboxInputValue}
              onChange={(event) => {
                if (!isCarDropdownOpen) {
                  setIsCarDropdownOpen(true);
                }
                setCarSearchQuery(event.currentTarget.value);
              }}
              onFocus={() => {
                setCarSearchQuery("");
                setIsCarDropdownOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsCarDropdownOpen(false);
                  return;
                }

                if (event.key === "ArrowDown") {
                  setIsCarDropdownOpen(true);
                  return;
                }

                if (event.key === "Enter") {
                  if (filteredCarEntries.length > 0) {
                    event.preventDefault();
                    selectCarByKey(filteredCarEntries[0].key);
                  }
                }
              }}
              placeholder={
                carEntries.length === 0
                  ? "No cars available"
                  : isCarDropdownOpen
                    ? "Search car"
                    : "Select car"
              }
              disabled={carEntries.length === 0}
              role="combobox"
              aria-expanded={isCarDropdownOpen}
              aria-controls="car-combobox-listbox"
              aria-autocomplete="list"
            />
            <button
              type="button"
              className="items-combobox-toggle"
              onClick={() => {
                setIsCarDropdownOpen((current) => {
                  const nextIsOpen = !current;
                  if (nextIsOpen) {
                    setCarSearchQuery("");
                  }
                  return nextIsOpen;
                });
              }}
              aria-label="Toggle car list"
              disabled={carEntries.length === 0}
            >
              <span className="items-combobox-toggle-icon" aria-hidden="true" />
            </button>
          </div>

          {isCarDropdownOpen ? (
            <div
              id="car-combobox-listbox"
              className="items-combobox-menu"
              role="listbox"
              aria-label="Car options"
            >
              {filteredCarEntries.length > 0 ? (
                filteredCarEntries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`items-combobox-option${entry.key === selectedCarKey ? " is-selected" : ""}`}
                    onClick={() => selectCarByKey(entry.key)}
                    role="option"
                    aria-selected={entry.key === selectedCarKey}
                  >
                    {entry.label}
                  </button>
                ))
              ) : (
                <p className="items-list-empty">No cars found.</p>
              )}
            </div>
          ) : null}
        </div>

        <label className="items-panel-label" htmlFor="decal-search-input">
          Search decal
        </label>
        <div className="items-input-wrap">
          <span className="items-input-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="decal-search-input"
            className="items-input"
            type="text"
            value={decalSearch}
            onChange={(event) => setDecalSearch(event.currentTarget.value)}
            placeholder="Search decal"
            disabled={selectedCarEntry === null}
          />
        </div>

        <div className="items-list items-list-fill" role="listbox" aria-label="Decal list">
          {filteredSkinEntries.length > 0 ? (
            filteredSkinEntries.map((skin) => {
              const isSelected = selectedSkinFolder === skin.skin_folder;
              const isActive = activeSkinFolderForSelectedCar === skin.skin_folder;
              const isSelectedPending = isSelected && !isActive;
              const isUniversal = isUniversalDecal(skin);
              return (
                <button
                  key={skin.skin_folder}
                  type="button"
                  className={buildListRowClassName({
                    isActive,
                    isSelectedPending,
                  })}
                  onClick={() => {
                    if (isActive) {
                      return;
                    }
                    setSelectedSkinFolder(skin.skin_folder);
                  }}
                  aria-selected={isSelectedPending || isActive}
                >
                  <span className="items-list-row-content">
                    <span className="items-list-row-text">{skin.ingame_decal_name}</span>
                    <span className="items-row-badges">
                      {isUniversal ? <span className="items-badge-universal">Universal</span> : null}
                      {isActive ? <span className="items-badge-active">Active</span> : null}
                      {isSelectedPending ? <span className="items-badge-selected">Selected</span> : null}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="items-list-empty">No decals found.</p>
          )}
        </div>

        <div className="items-panel-footer">
          <div className="items-actions">
            <button
              type="button"
              className="items-btn-primary"
              onClick={handleApplyDecal}
              disabled={!canApplyDecal}
            >
              {isApplyingDecal
                ? decalApplyStep === "downloading"
                  ? "Downloading item files..."
                  : "Applying item..."
                : "Apply"}
            </button>
            <button
              type="button"
              className="items-btn-secondary items-btn-reset"
              onClick={handleResetCar}
              disabled={!canResetCar}
            >
              {isResettingDecal ? "Resetting..." : "Reset"}
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderWheelPanelBody = () => {
    if (wheelCatalogResult === null) {
      return <p className="items-list-empty">Loading wheels...</p>;
    }

    if (!wheelCatalogResult.ok) {
      return <p className="status-error">{wheelCatalogResult.error.message}</p>;
    }

    return (
      <>
        <label className="items-panel-label" htmlFor="wheel-search-input">
          Search wheel
        </label>
        <div className="items-input-wrap">
          <span className="items-input-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="wheel-search-input"
            className="items-input"
            type="text"
            value={wheelSearch}
            onChange={(event) => setWheelSearch(event.currentTarget.value)}
            placeholder="Search wheel"
          />
        </div>

        <div className="items-list items-list-fill items-list-wheel" role="listbox" aria-label="Wheel list">
          {filteredWheelEntries.length > 0 ? (
            filteredWheelEntries.map((wheel) => {
              const isSelected = selectedWheelFolder === wheel.wheel_folder;
              const isActive = activeWheelFolder === wheel.wheel_folder;
              const isSelectedPending = isSelected && !isActive;
              return (
                <button
                  key={wheel.wheel_folder}
                  type="button"
                  className={buildListRowClassName({
                    isActive,
                    isSelectedPending,
                  })}
                  onClick={() => {
                    if (isActive) {
                      return;
                    }
                    setSelectedWheelFolder(wheel.wheel_folder);
                  }}
                  aria-selected={isSelectedPending || isActive}
                >
                  <span className="items-list-row-content">
                    <span className="items-list-row-text">{wheel.ingame_wheel_name}</span>
                    <span className="items-row-badges">
                      {isActive ? <span className="items-badge-active">Active</span> : null}
                      {isSelectedPending ? <span className="items-badge-selected">Selected</span> : null}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="items-list-empty">No wheels found.</p>
          )}
        </div>

        <div className="items-panel-footer">
          <div className="items-actions items-actions-wheel">
            <button
              type="button"
              className="items-btn-primary"
              onClick={handleApplyWheel}
              disabled={!canApplyWheel}
            >
              {isApplyingWheel
                ? wheelApplyStep === "downloading"
                  ? "Downloading item files..."
                  : "Applying item..."
                : "Apply"}
            </button>
            <button
              type="button"
              className="items-btn-secondary items-btn-reset"
              onClick={handleResetWheel}
              disabled={!canResetWheel}
            >
              {isResettingWheel ? "Resetting..." : "Reset"}
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderBoostPanelBody = () => {
    if (boostCatalogResult === null) {
      return <p className="items-list-empty">Loading boosts...</p>;
    }

    if (!boostCatalogResult.ok) {
      return (
        <>
          <p className="status-error">{boostCatalogResult.error.message}</p>
          <div className="items-panel-footer">
            <div className="items-actions">
              <button type="button" className="items-btn-primary" disabled>
                Apply
              </button>
              <button type="button" className="items-btn-secondary items-btn-reset" disabled>
                Reset
              </button>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <label className="items-panel-label" htmlFor="boost-search-input">
          Search boost
        </label>
        <div className="items-input-wrap">
          <span className="items-input-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="boost-search-input"
            className="items-input"
            type="text"
            value={boostSearch}
            onChange={(event) => setBoostSearch(event.currentTarget.value)}
            placeholder="Search boost"
          />
        </div>

        <div className="items-list items-list-fill" role="listbox" aria-label="Boost list">
          {filteredBoostEntries.length > 0 ? (
            filteredBoostEntries.map((boost) => {
              const isSelected = selectedBoostFolder === boost.boost_folder;
              const isActive = activeBoostFolder === boost.boost_folder;
              const isSelectedPending = isSelected && !isActive;
              return (
                <button
                  key={boost.boost_folder}
                  type="button"
                  className={buildListRowClassName({
                    isActive,
                    isSelectedPending,
                  })}
                  onClick={() => {
                    if (isActive) {
                      return;
                    }
                    setSelectedBoostFolder(boost.boost_folder);
                  }}
                  aria-selected={isSelectedPending || isActive}
                >
                  <span className="items-list-row-content">
                    <span className="items-list-row-text">{boost.ingame_boost_name}</span>
                    <span className="items-row-badges">
                      {isActive ? <span className="items-badge-active">Active</span> : null}
                      {isSelectedPending ? <span className="items-badge-selected">Selected</span> : null}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="items-list-empty">No boosts found.</p>
          )}
        </div>

        <div className="items-panel-footer">
          <div className="items-actions">
            <button
              type="button"
              className="items-btn-primary"
              onClick={handleApplyBoost}
              disabled={!canApplyBoost}
            >
              {isApplyingBoost
                ? boostApplyStep === "downloading"
                  ? "Downloading item files..."
                  : "Applying item..."
                : "Apply"}
            </button>
            <button
              type="button"
              className="items-btn-secondary items-btn-reset"
              onClick={handleResetBoost}
              disabled={!canResetBoost}
            >
              {isResettingBoost ? "Resetting..." : "Reset"}
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <section className="page items-page">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {isItemsGuideOpen ? (
        <div className="items-guide-overlay" role="presentation">
          <article
            className="items-guide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="items-guide-title"
          >
            <header className="items-guide-header">
              <h2 id="items-guide-title" className="items-guide-title">
                {ITEMS_GUIDE_TITLE}
              </h2>
              <p className="items-guide-intro">
                RLPeak changes the item that Rocket League loads. If the game is already open, Rocket League may
                keep the old look in memory until you refresh it the right way.
              </p>
            </header>

            <div className="items-guide-body">
              <section className="items-guide-section" aria-label="Decals and wheels guidance">
                <h3 className="items-guide-section-title">For Decals and Wheels</h3>
                <p className="items-guide-copy">If Rocket League is already open, follow these steps:</p>
                <ol className="items-guide-steps">
                  <li>In Rocket League, equip a normal item instead of the RLPeak item.</li>
                  <li>Leave the Garage.</li>
                  <li>In RLPeak, choose your new Decal or Wheel and click Apply.</li>
                  <li>Go back to the Garage.</li>
                  <li>Equip the RLPeak item again.</li>
                </ol>
                <p className="items-guide-copy">
                  <strong>Result:</strong> Your new Decal or Wheel should appear without restarting the game.
                </p>
                <p className="items-guide-warning">
                  If you apply while the RLPeak item is already equipped, Rocket League may not refresh the look. In
                  that case, restart the game.
                </p>
              </section>

              <section className="items-guide-section" aria-label="Boost guidance">
                <h3 className="items-guide-section-title">For Boosts</h3>
                <p className="items-guide-copy">{ITEMS_GUIDE_BOOST_RESTART_COPY}</p>
              </section>

              <section className="items-guide-quick-rule" aria-label="Quick refresh rule">
                <h3 className="items-guide-quick-rule-title">Quick rule</h3>
                <ul className="items-guide-quick-rule-list">
                  <li>
                    Decals/Wheels: switch item first, leave Garage, Apply, then equip the RLPeak item again.
                  </li>
                  <li>Boosts: restart Rocket League after Apply or Reset.</li>
                </ul>
              </section>
            </div>

            <footer className="items-guide-footer">
              <p className="items-guide-footnote">You can reopen this guide anytime from the Items page.</p>
              <div className="items-guide-actions">
                <button
                  type="button"
                  className="items-btn-secondary items-guide-btn-secondary"
                  onClick={closeItemsGuideModalForLater}
                >
                  Show me again later
                </button>
                <button
                  type="button"
                  className="items-btn-primary items-guide-btn-primary"
                  onClick={() => {
                    void acknowledgeItemsGuide();
                  }}
                  disabled={isSavingItemsGuideSeen}
                >
                  {isSavingItemsGuideSeen ? "Saving..." : "I understand"}
                </button>
              </div>
            </footer>
          </article>
        </div>
      ) : null}

      <div className="items-page-heading-row">
        <div className="items-page-heading-copy">
          <h1>Items</h1>
          <p>Select an item, apply instantly, and manage active swaps by panel.</p>
        </div>
        <button type="button" className="items-btn-secondary items-guide-open-btn" onClick={openItemsGuideModal}>
          Why don’t I see my item?
        </button>
      </div>

      <div className="items-grid" role="region" aria-label="Item categories">
        <section className={`items-panel${activeDecalPillLabel ? " is-panel-active" : ""}`} aria-label="Decal panel">
          <div className="items-panel-header">
            <h2 className={`items-panel-title${activeDecalPillLabel ? " is-active" : ""}`}>Decal</h2>
            {activeDecalPillLabel ? (
              <span className="items-panel-title-pill">{formatCurrentPillLabel(activeDecalPillLabel)}</span>
            ) : null}
          </div>
          <div className="items-panel-header-divider" aria-hidden="true" />
          <div className="items-panel-body">{renderDecalPanelBody()}</div>
        </section>

        <section className={`items-panel${activeWheelFolder ? " is-panel-active" : ""}`} aria-label="Wheel panel">
          <div className="items-panel-header">
            <h2 className={`items-panel-title${activeWheelPillLabel ? " is-active" : ""}`}>Wheel</h2>
            {activeWheelPillLabel ? (
              <span className="items-panel-title-pill">{formatCurrentPillLabel(activeWheelPillLabel)}</span>
            ) : null}
          </div>
          <div className="items-panel-header-divider" aria-hidden="true" />
          <div className="items-panel-body">{renderWheelPanelBody()}</div>
        </section>

        <section className={`items-panel${activeBoostFolder ? " is-panel-active" : ""}`} aria-label="Boost panel">
          <div className="items-panel-header">
            <h2 className={`items-panel-title${activeBoostPillLabel ? " is-active" : ""}`}>Boost</h2>
            {activeBoostPillLabel ? (
              <span className="items-panel-title-pill">{formatCurrentPillLabel(activeBoostPillLabel)}</span>
            ) : null}
          </div>
          <div className="items-panel-header-divider" aria-hidden="true" />
          <div className="items-panel-body">{renderBoostPanelBody()}</div>
        </section>
      </div>

      <div className="items-legend" aria-label="Items state legend">
        <div className="items-legend-item">
          <span className="items-legend-swatch items-legend-swatch-active" />
          <span className="items-legend-label">Applied in-game</span>
        </div>
        <div className="items-legend-item">
          <span className="items-legend-swatch items-legend-swatch-selected" />
          <span className="items-legend-label">Selected - pending apply</span>
        </div>
        <div className="items-legend-item">
          <span className="items-legend-swatch items-legend-swatch-hover" />
          <span className="items-legend-label">Hover</span>
        </div>
      </div>
    </section>
  );
}
