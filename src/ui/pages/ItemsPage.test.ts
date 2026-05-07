import { describe, expect, it } from "vitest";
import type { SkinCarCatalogEntry } from "../../modules/items/types";
import {
  filterCarEntries,
  filterSkinEntriesForCar,
  formatCurrentPillLabel,
  pinActiveFirst,
  resolveCarComboboxInputValue,
  resolveSelectedCarKeyFromEntries,
} from "./itemsPageSelectors";

function createCarEntry(): SkinCarCatalogEntry {
  return {
    car: "Octane",
    skin_count: 3,
    base_files: ["skin_aa_flames_tierall_SF.upk"],
    skins: [
      {
        car_folder: "ACE",
        skin_folder: "skin_zeta",
        ingame_decal_name: "Zeta",
        item_type: "Skin",
        output_upk_file: "zeta.upk",
      },
      {
        car_folder: "ACE",
        skin_folder: "skin_alpha",
        ingame_decal_name: "Alpha",
        item_type: "Skin",
        output_upk_file: "alpha.upk",
      },
      {
        car_folder: "ACE",
        skin_folder: "skin_aurora",
        ingame_decal_name: "Aurora",
        item_type: "Skin",
        output_upk_file: "aurora.upk",
      },
    ],
  };
}

describe("ItemsPage selectors", () => {
  it("keeps selected car key when it exists in entries", () => {
    const next = resolveSelectedCarKeyFromEntries(
      [
        { key: "ACE", label: "Octane" },
        { key: "CAT", label: "Fennec" },
      ],
      "ACE",
    );

    expect(next).toBe("ACE");
  });

  it("clears selected car key when it does not exist in entries", () => {
    const next = resolveSelectedCarKeyFromEntries(
      [{ key: "ACE", label: "Octane" }],
      "UNKNOWN",
    );

    expect(next).toBe("");
  });

  it("returns decals sorted and filtered for the selected car", () => {
    const filtered = filterSkinEntriesForCar(createCarEntry(), "au");
    expect(filtered.map((entry) => entry.ingame_decal_name)).toEqual(["Aurora"]);
  });

  it("returns all sorted decals when search is empty", () => {
    const filtered = filterSkinEntriesForCar(createCarEntry(), "");
    expect(filtered.map((entry) => entry.ingame_decal_name)).toEqual(["Alpha", "Aurora", "Zeta"]);
  });

  it("filters car entries case-insensitively for combobox search", () => {
    const filtered = filterCarEntries(
      [
        { key: "ACE", label: "Octane" },
        { key: "CAT", label: "Fennec" },
      ],
      "oc",
    );

    expect(filtered).toEqual([{ key: "ACE", label: "Octane" }]);
  });

  it("keeps full car list available when combobox query is empty", () => {
    const filtered = filterCarEntries(
      [
        { key: "ACE", label: "Octane" },
        { key: "CAT", label: "Fennec" },
      ],
      "",
    );

    expect(filtered).toEqual([
      { key: "ACE", label: "Octane" },
      { key: "CAT", label: "Fennec" },
    ]);
  });

  it("uses selected car label when combobox is closed and query text when open", () => {
    expect(
      resolveCarComboboxInputValue({
        isOpen: false,
        searchQuery: "",
        selectedCarLabel: "Octane",
      }),
    ).toBe("Octane");

    expect(
      resolveCarComboboxInputValue({
        isOpen: true,
        searchQuery: "",
        selectedCarLabel: "Octane",
      }),
    ).toBe("");
  });

  it("pins active item first while keeping non-active order", () => {
    const ordered = pinActiveFirst(
      [
        { key: "zeta", name: "Zeta" },
        { key: "alpha", name: "Alpha" },
        { key: "aurora", name: "Aurora" },
      ],
      (entry) => entry.key,
      "aurora",
    );

    expect(ordered.map((entry) => entry.key)).toEqual(["aurora", "zeta", "alpha"]);
  });

  it("formats panel active pill labels with Current prefix", () => {
    expect(formatCurrentPillLabel("Gold Rush")).toBe("Current: Gold Rush");
  });
});
