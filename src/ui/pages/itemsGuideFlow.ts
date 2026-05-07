export interface ItemsGuideVisibilityState {
  isOpen: boolean;
  isFirstVisitFlow: boolean;
}

export interface ItemsGuideAcknowledgeResult extends ItemsGuideVisibilityState {
  shouldPersistSeen: boolean;
}

export const ITEMS_GUIDE_TITLE = "Before using RLPeak items";
export const ITEMS_GUIDE_BOOST_RESTART_COPY =
  "Boosts work differently. After applying or resetting a Boost in RLPeak, restart Rocket League to see the change.";

export function resolveItemsGuideInitialState(itemsGuideSeen: boolean): ItemsGuideVisibilityState {
  if (itemsGuideSeen) {
    return {
      isOpen: false,
      isFirstVisitFlow: false,
    };
  }

  return {
    isOpen: true,
    isFirstVisitFlow: true,
  };
}

export function resolveItemsGuideCloseForLater(): ItemsGuideAcknowledgeResult {
  return {
    isOpen: false,
    isFirstVisitFlow: false,
    shouldPersistSeen: false,
  };
}

export function resolveItemsGuideAcknowledge(isFirstVisitFlow: boolean): ItemsGuideAcknowledgeResult {
  return {
    isOpen: false,
    isFirstVisitFlow: false,
    shouldPersistSeen: isFirstVisitFlow,
  };
}

export function resolveItemsGuideManualOpen(): ItemsGuideVisibilityState {
  return {
    isOpen: true,
    isFirstVisitFlow: false,
  };
}
