// The estimate page's form readers: what a person types in the header and the cost lines, read into
// the API's bodies, or the first problem shown instead of a request that would be refused.

import { readEstimatePaste } from "@shared/estimate-import";
import { expect, it } from "vitest";
import {
  blank,
  bodyOf,
  type LineForm,
  parseLines,
  rowFromPrice,
  withImported,
  withListPrices,
} from "../../src/client/pages/estimates";
import { blankPrice, mergeMessage, readPriceForm } from "../../src/client/pages/price-list";

const row = (patch: Partial<LineForm>): LineForm => ({
  key: 1,
  bidItem: "Ductwork",
  category: "labor",
  description: "Crew",
  quantity: "120",
  unit: "HR",
  unitCost: "68.50",
  ...patch,
});

it("reads cost lines and skips empty rows", () => {
  const r = parseLines([
    row({}),
    row({ bidItem: "", description: "", quantity: "", unitCost: "" }),
    row({ category: "material", quantity: "1,450", unitCost: "$4.875", unit: " " }),
  ]);
  expect(r).toEqual({
    lines: [
      {
        bidItem: "Ductwork",
        category: "labor",
        description: "Crew",
        quantityMilli: 120_000,
        unit: "HR",
        unitCostMicros: 68_500_000,
      },
      {
        bidItem: "Ductwork",
        category: "material",
        description: "Crew",
        quantityMilli: 1_450_000,
        unit: null,
        unitCostMicros: 4_875_000,
      },
    ],
  });
});

it("names the first line that does not read", () => {
  expect(parseLines([row({}), row({ bidItem: " " })])).toEqual({
    problem: "Line 2: name its bid item.",
  });
  expect(parseLines([row({ quantity: "12 boxes" })])).toEqual({
    problem: "Line 1: the quantity does not read.",
  });
  expect(parseLines([row({ quantity: "-2" })])).toEqual({
    problem: "Line 1: the quantity does not read.",
  });
  expect(parseLines([row({ unitCost: "a lot" })])).toEqual({
    problem: "Line 1: the unit cost does not read.",
  });
});

it("reads the header with markups and tax as basis points", () => {
  const r = bodyOf({
    ...blank,
    name: " Riverside Clinic ",
    gcName: "Harbor Builders",
    laborMarkup: "15",
    materialMarkup: "10%",
    materialTax: "7.25",
  });
  expect(r).toEqual({
    body: expect.objectContaining({
      name: "Riverside Clinic",
      gcName: "Harbor Builders",
      laborMarkupBps: 1500,
      materialMarkupBps: 1000,
      equipmentMarkupBps: 0,
      materialTaxBps: 725,
      validDays: 30,
      gcContactEmail: null,
    }),
  });
  expect(bodyOf({ ...blank, gcName: "x" })).toEqual({ problem: "Name the job." });
  expect(bodyOf({ ...blank, name: "x", gcName: "y", laborMarkup: "lots" })).toEqual({
    problem: "Labor markup: enter a percent from 0 to 500.",
  });
  // Markups over 100% read (a small service line is often marked up more), to the API's 500%.
  const over = bodyOf({ ...blank, name: "x", gcName: "y", otherMarkup: "150" });
  expect("body" in over && over.body.otherMarkupBps).toBe(15_000);
  expect(bodyOf({ ...blank, name: "x", gcName: "y", otherMarkup: "501" })).toEqual({
    problem: "Other markup: enter a percent from 0 to 500.",
  });
});

it("imported lines go after the last filled row and save exactly as read", () => {
  const read = readEstimatePaste(
    "Bid item,Category,Description,Qty,Unit,Unit cost\nControls,Labor,Programming,12.5,HR,95.125\nControls,Sub,Startup,,,",
  );
  if (!read.ok) throw new Error(read.error);
  const rows = withImported(
    [row({}), row({ bidItem: "", description: "", quantity: "", unitCost: "" })],
    read.lines,
  );
  expect(rows.map((r) => [r.bidItem, r.quantity, r.unitCost])).toEqual([
    ["Ductwork", "120", "68.50"],
    ["Controls", "12.5", "95.125"],
  ]);
  const saved = parseLines(rows);
  if (!("lines" in saved)) throw new Error(saved.problem);
  expect(saved.lines[1]).toEqual({
    bidItem: "Controls",
    category: "labor",
    description: "Programming",
    quantityMilli: 12_500,
    unit: "HR",
    unitCostMicros: 95_125_000,
  });
});

it("prices rows from the price list: a picked item, and older lines brought to list prices", () => {
  const item = {
    id: "pli_1",
    category: "material" as const,
    code: "GD-26",
    description: "Galvanized duct",
    unit: "LB",
    unitCostMicros: 5_125_000,
    note: null,
    updatedAt: "2026-11-26T00:00:00.000Z",
  };
  const picked = rowFromPrice(item, "Ductwork");
  expect(picked).toMatchObject({
    bidItem: "Ductwork",
    category: "material",
    description: "Galvanized duct",
    quantity: "",
    unit: "LB",
    unitCost: "5.125",
  });

  const rows = [
    row({ category: "material", description: "galvanized  duct", unit: "lb", unitCost: "4.875" }),
    row({}),
    row({ bidItem: "", description: "", quantity: "", unitCost: "" }),
    row({ category: "material", description: "Galvanized duct", unit: "LB", unitCost: "5.125" }),
  ];
  const r = withListPrices(rows, [item]);
  expect(r.changed).toBe(1);
  expect(r.rows.map((x) => x.unitCost)).toEqual(["5.125", "68.50", "", "5.125"]);
});

it("reads the price list's form and says what a merge did", () => {
  expect(
    readPriceForm({ ...blankPrice, description: " Scissor lift ", unit: "DAY", unitCost: "$185" }),
  ).toEqual({
    body: {
      category: "material",
      code: null,
      description: "Scissor lift",
      unit: "DAY",
      unitCostMicros: 185_000_000,
      note: null,
    },
  });
  expect(readPriceForm({ ...blankPrice, unitCost: "1" })).toEqual({ problem: "Name the item." });
  expect(readPriceForm({ ...blankPrice, description: "X", unitCost: "abc" })).toEqual({
    problem: "The unit cost does not read.",
  });
  expect(mergeMessage({ added: 1, updated: 2, unchanged: 0, conflicts: ["Scissor lift"] })).toBe(
    "1 price added, 2 updated, 0 already on the list at that cost. Given twice at different costs, the last one kept: Scissor lift.",
  );
});
