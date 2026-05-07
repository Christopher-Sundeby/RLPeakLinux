import { describe, expect, it } from "vitest";
import {
  ITEMS_GUIDE_BOOST_RESTART_COPY,
  resolveItemsGuideAcknowledge,
  resolveItemsGuideCloseForLater,
  resolveItemsGuideInitialState,
  resolveItemsGuideManualOpen,
} from "./itemsGuideFlow";

describe("itemsGuideFlow", () => {
  it("shows the guide automatically on first visit when itemsGuideSeen is false", () => {
    expect(resolveItemsGuideInitialState(false)).toEqual({
      isOpen: true,
      isFirstVisitFlow: true,
    });
  });

  it("keeps guide closed when itemsGuideSeen is true", () => {
    expect(resolveItemsGuideInitialState(true)).toEqual({
      isOpen: false,
      isFirstVisitFlow: false,
    });
  });

  it("marks first-visit acknowledge flow as persistent", () => {
    expect(resolveItemsGuideAcknowledge(true)).toEqual({
      isOpen: false,
      isFirstVisitFlow: false,
      shouldPersistSeen: true,
    });
  });

  it("does not persist guide seen when user chooses show me again later", () => {
    expect(resolveItemsGuideCloseForLater()).toEqual({
      isOpen: false,
      isFirstVisitFlow: false,
      shouldPersistSeen: false,
    });
  });

  it("reopens guide manually without enabling first-visit persistence mode", () => {
    expect(resolveItemsGuideManualOpen()).toEqual({
      isOpen: true,
      isFirstVisitFlow: false,
    });
    expect(resolveItemsGuideAcknowledge(false)).toEqual({
      isOpen: false,
      isFirstVisitFlow: false,
      shouldPersistSeen: false,
    });
  });

  it("keeps boost restart requirement in tutorial copy", () => {
    expect(ITEMS_GUIDE_BOOST_RESTART_COPY).toContain("restart Rocket League");
  });
});
