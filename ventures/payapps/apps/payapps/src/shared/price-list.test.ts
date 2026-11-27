// The price list's matching and merging, worked by hand: which lines and items are the same price,
// what a batch adds or updates, which older estimate lines would change, and the picker's search.
import { describe, expect, it } from "vitest";
import type { EstimateLineInput } from "./estimate";
import {
  itemProblems,
  itemsFromLines,
  linesOnList,
  type PriceItem,
  type PriceItemInput,
  planMerge,
  priceChanges,
  priceKey,
  searchItems,
} from "./price-list";

const item = (patch: Partial<PriceItem>): PriceItem => ({
  id: "pli_1",
  category: "material",
  code: null,
  description: "Galvanized duct",
  unit: "LB",
  unitCostMicros: 4_875_000,
  note: null,
  ...patch,
});

const input = (patch: Partial<PriceItemInput>): PriceItemInput => {
  const { id: _id, ...rest } = item({});
  return { ...rest, ...patch };
};

const line = (patch: Partial<EstimateLineInput>): EstimateLineInput => ({
  bidItem: "Ductwork",
  category: "material",
  description: "Galvanized duct",
  quantityMilli: 1_450_000,
  unit: "LB",
  unitCostMicros: 4_875_000,
  ...patch,
});

describe("priceKey", () => {
  it("matches across case and spacing, not across category or unit", () => {
    expect(priceKey(item({}))).toBe(
      priceKey(item({ description: "  galvanized   DUCT ", unit: "lb" })),
    );
    expect(priceKey(item({}))).not.toBe(priceKey(item({ category: "labor" })));
    expect(priceKey(item({}))).not.toBe(priceKey(item({ unit: "FT" })));
    expect(priceKey(item({ unit: null }))).toBe(priceKey(item({ unit: "  " })));
  });
});

describe("itemProblems", () => {
  it("needs a name and a cost of zero or more", () => {
    expect(itemProblems(input({}))).toEqual([]);
    expect(itemProblems(input({ description: " " }))).toEqual(["Name the item."]);
    expect(itemProblems(input({ unitCostMicros: -1 }))).toHaveLength(1);
    expect(itemProblems(input({ unitCostMicros: 0 }))).toEqual([]);
  });
});

describe("planMerge", () => {
  const list = [
    item({ id: "a", code: "GD-26", note: "Ferguson 11/01" }),
    item({
      id: "b",
      category: "labor",
      description: "Sheet metal journeyman",
      unit: "HR",
      unitCostMicros: 68_500_000,
    }),
  ];

  it("adds new keys, updates changed costs and counts the rest", () => {
    const plan = planMerge(list, [
      // Same key, new cost, no code given: the saved code and note stay, the saved spelling too.
      input({ description: "GALVANIZED DUCT", unit: "lb", unitCostMicros: 5_125_000 }),
      // Same cost: unchanged.
      input({
        category: "labor",
        description: "Sheet metal journeyman",
        unit: "HR",
        unitCostMicros: 68_500_000,
      }),
      // New.
      input({ description: "Flex duct 8in", unit: "FT", unitCostMicros: 2_400_000 }),
    ]);
    expect(plan.add.map((x) => x.description)).toEqual(["Flex duct 8in"]);
    expect(plan.update).toEqual([
      {
        id: "a",
        oldUnitCostMicros: 4_875_000,
        item: {
          category: "material",
          code: "GD-26",
          description: "Galvanized duct",
          unit: "LB",
          unitCostMicros: 5_125_000,
          note: "Ferguson 11/01",
        },
      },
    ]);
    expect(plan.unchanged).toBe(1);
    expect(plan.conflicts).toEqual([]);
  });

  it("updates a new note or code at the same cost", () => {
    const plan = planMerge(list, [input({ note: "Ferguson 11/20" })]);
    expect(plan.update.map((u) => u.item.note)).toEqual(["Ferguson 11/20"]);
    expect(plan.unchanged).toBe(0);
  });

  it("takes the last of a key given twice and names it when the costs differ", () => {
    const plan = planMerge(
      [],
      [
        input({ unitCostMicros: 4_000_000, code: "X1" }),
        input({ description: "Flex duct 8in", unit: "FT" }),
        input({ description: "galvanized duct", unitCostMicros: 4_500_000 }),
      ],
    );
    expect(plan.add.map((x) => [x.description, x.unitCostMicros, x.code])).toEqual([
      ["Flex duct 8in", 4_875_000, null],
      ["galvanized duct", 4_500_000, "X1"],
    ]);
    expect(plan.conflicts).toEqual(["galvanized duct"]);
  });

  it("tidies spacing and blank fields before it compares", () => {
    const plan = planMerge([], [input({ description: "  Flex   duct ", unit: " ", code: " " })]);
    expect(plan.add).toEqual([
      {
        category: "material",
        code: null,
        description: "Flex duct",
        unit: null,
        unitCostMicros: 4_875_000,
        note: null,
      },
    ]);
  });
});

describe("estimate lines and the list", () => {
  const list = [
    item({ id: "a", unitCostMicros: 5_125_000 }),
    item({
      id: "b",
      category: "labor",
      description: "Sheet metal journeyman",
      unit: "HR",
      unitCostMicros: 72_000_000,
    }),
    item({
      id: "c",
      category: "equipment",
      description: "Scissor lift",
      unit: "DAY",
      unitCostMicros: 185_000_000,
    }),
  ];
  const lines = [
    line({}),
    line({
      category: "labor",
      description: "sheet metal journeyman",
      unit: "hr",
      quantityMilli: 120_000,
      unitCostMicros: 68_500_000,
    }),
    line({
      category: "equipment",
      description: "Scissor lift",
      unit: "DAY",
      unitCostMicros: 185_000_000,
    }),
    line({
      category: "subcontract",
      description: "Crane and rigging",
      unit: "LS",
      unitCostMicros: 3_200_000_000,
    }),
  ];

  it("lists the lines whose item costs something else now", () => {
    expect(priceChanges(lines, list)).toEqual([
      {
        line: 0,
        itemId: "a",
        description: "Galvanized duct",
        fromMicros: 4_875_000,
        toMicros: 5_125_000,
      },
      {
        line: 1,
        itemId: "b",
        description: "sheet metal journeyman",
        fromMicros: 68_500_000,
        toMicros: 72_000_000,
      },
    ]);
    expect(linesOnList(lines, list)).toBe(3);
  });

  it("turns lines into items without their quantity or bid item, skipping unnamed lines", () => {
    expect(itemsFromLines([lines[3] as EstimateLineInput, line({ description: " " })])).toEqual([
      {
        category: "subcontract",
        code: null,
        description: "Crane and rigging",
        unit: "LS",
        unitCostMicros: 3_200_000_000,
        note: null,
      },
    ]);
  });
});

describe("searchItems", () => {
  const list = [
    item({ id: "1", description: "Galvanized duct 26 ga", code: "GD-26" }),
    item({ id: "2", description: "Flex duct 8in", unit: "FT", note: "Ferguson quote" }),
    item({ id: "3", category: "labor", description: "Duct installer", unit: "HR" }),
    item({ id: "4", category: "equipment", description: "Scissor lift", unit: "DAY" }),
  ];
  it("finds every word in any field, in a category when one is picked", () => {
    expect(searchItems(list, "duct").map((i) => i.id)).toEqual(["3", "2", "1"]);
    expect(searchItems(list, "gd-26").map((i) => i.id)).toEqual(["1"]);
    expect(searchItems(list, "ferguson flex").map((i) => i.id)).toEqual(["2"]);
    expect(searchItems(list, "duct", "material").map((i) => i.id)).toEqual(["2", "1"]);
    expect(searchItems(list, "").map((i) => i.id)).toEqual(["4", "3", "2", "1"]);
  });
});
