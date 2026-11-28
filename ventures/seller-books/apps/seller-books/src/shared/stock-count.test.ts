import { describe, expect, it } from "vitest";
import {
  COUNT_SHEET_HEADER,
  type CountItem,
  countEffect,
  countSheetCsv,
  expectedOnCount,
  matchCode,
  readCountSheet,
  summariseCount,
} from "./stock-count";

const item = (id: string, over: Partial<CountItem> = {}): CountItem => ({
  id,
  title: `Item ${id}`,
  sku: null,
  acquiredDate: "2026-03-01",
  costCents: 500,
  lotName: null,
  source: null,
  ...over,
});

describe("expectedOnCount", () => {
  it("keeps items still in stock and bought on or before the count date", () => {
    const rows = [
      { id: "a", status: "in_stock", acquiredDate: "2026-12-31" },
      { id: "b", status: "in_stock", acquiredDate: "2027-01-01" },
      { id: "c", status: "sold", acquiredDate: "2026-01-01" },
      { id: "d", status: "written_off", acquiredDate: "2026-01-01" },
    ];
    expect(expectedOnCount(rows, "2026-12-31").map((r) => r.id)).toEqual(["a"]);
  });
});

describe("matchCode", () => {
  const items = [
    item("a", { sku: "JEANS-1" }),
    item("b", { sku: "jeans-1" }),
    item("c", { sku: "VASE 3" }),
  ];
  it("ticks one item per scan of a SKU shared by several, ignoring case and spacing", () => {
    const first = matchCode(items, new Set(), " jeans-1 ");
    expect(first).toMatchObject({ kind: "found", item: { id: "a" } });
    expect(matchCode(items, new Set(["a"]), "JEANS-1")).toMatchObject({
      kind: "found",
      item: { id: "b" },
    });
    expect(matchCode(items, new Set(["a", "b"]), "JEANS-1")).toEqual({
      kind: "already",
      sku: "JEANS-1",
    });
    expect(matchCode(items, new Set(), "vase   3")).toMatchObject({ item: { id: "c" } });
  });
  it("never matches a blank code or an unknown SKU", () => {
    expect(matchCode(items, new Set(), "  ")).toEqual({ kind: "none" });
    expect(matchCode(items, new Set(), "LAMP")).toEqual({ kind: "none" });
  });
});

describe("summariseCount", () => {
  it("adds up found and missing, missing oldest first", () => {
    const items = [
      item("a", { costCents: 1000, acquiredDate: "2026-05-01" }),
      item("b", { costCents: 250, acquiredDate: "2026-01-02" }),
      item("c", { costCents: 199 }),
    ];
    const s = summariseCount(items, new Set(["a"]));
    expect(s).toMatchObject({
      expected: 3,
      expectedCents: 1449,
      found: 1,
      foundCents: 1000,
      missing: 2,
      missingCents: 449,
    });
    expect(s.missingItems.map((i) => i.id)).toEqual(["b", "c"]);
  });
});

describe("count sheet", () => {
  const items = [
    item("itm_2", { sku: "B-2", title: "Lamp", lotName: "Estate haul", costCents: 1234 }),
    item("itm_1", { sku: "A-1", title: "=HYPERLINK(evil)" }),
    item("itm_3", { title: "No SKU scarf" }),
  ];
  it("writes one row per item, by SKU, formula-safe, with the Found column", () => {
    const csv = countSheetCsv(items, new Set(["itm_2"]));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(COUNT_SHEET_HEADER.join(","));
    expect(lines[1]).toBe("itm_1,A-1,'=HYPERLINK(evil),,,2026-03-01,5.00,");
    expect(lines[2]).toBe("itm_2,B-2,Lamp,Estate haul,,2026-03-01,12.34,Y");
    expect(lines[3]?.startsWith("itm_3,,No SKU scarf")).toBe(true);
  });

  it("reads a filled-in sheet back by Item ID, naming every row it cannot use", () => {
    const filled = [
      "Found (Y/N),Item ID,Notes",
      "y,itm_1,top shelf",
      "N,itm_2,",
      ",itm_3,",
      "yes,itm_9,",
      "maybe,itm_3,",
      "x,,",
      ",,",
      "Y,itm_1,",
    ].join("\n");
    const r = readCountSheet(filled, items);
    expect(r.found).toEqual(["itm_1"]);
    expect(r.notFound).toEqual(["itm_2"]);
    expect(r.blank).toBe(1);
    expect(r.problems).toEqual([
      "Line 5: itm_9 is not on this count (sold or removed since the sheet was made, or a sheet from another day).",
      "Line 6: itm_3 is on the sheet twice; the first row counts.",
      "Line 7: no Item ID, so it cannot be matched to an item.",
      "Line 9: itm_1 is on the sheet twice; the first row counts.",
    ]);
  });

  it("round-trips its own download", () => {
    const r = readCountSheet(countSheetCsv(items, new Set(["itm_1", "itm_3"])), items);
    expect(r.found.sort()).toEqual(["itm_1", "itm_3"]);
    expect(r.blank).toBe(1);
    expect(r.problems).toEqual([]);
  });

  it("refuses a file that is not a count sheet", () => {
    const r = readCountSheet("Title,SKU\nLamp,B-2\n", items);
    expect(r.found).toEqual([]);
    expect(r.problems[0]).toMatch(/not a count sheet/);
  });

  it("reads an unexpected mark as a problem, not a guess", () => {
    const r = readCountSheet("Item ID,Found (Y/N)\nitm_1,2\n", items);
    expect(r.found).toEqual([]);
    expect(r.problems).toEqual([
      'Line 2: "2" is not Y or N, so itm_1 is left as it is on the page.',
    ]);
  });
});

describe("countEffect", () => {
  it("says where the cost goes for a year-end write-off and for personal use", () => {
    expect(countEffect("2026-12-31", "written_off", 1999)).toBe(
      "They leave line 41 (closing inventory) for 2026, so $19.99 more goes into cost of goods sold (line 42).",
    );
    expect(countEffect("2026-06-30", "personal_use", 500)).toMatch(
      /from 2026-06-30, so 2026's closing inventory .* \$5\.00 lower.*off line 36/,
    );
  });
});
