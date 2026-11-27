import { readFileSync } from "node:fs";
import { parseInventorySheet, splitCents } from "@worker/services/importers/inventory-sheet";
import { ImportFormatError } from "@worker/services/importers/parse";
import { describe, expect, it } from "vitest";

const sheet = readFileSync(new URL("../fixtures/sourcing-sheet.csv", import.meta.url), "utf8");

describe("sourcing sheet import", () => {
  it("reads items, splits row totals, and keeps cents adding up", () => {
    const r = parseInventorySheet(sheet);
    expect(r.rowCount).toBe(9);
    expect(
      r.items.map((i) => [i.line, i.title, i.sku, i.acquiredDate, i.costCents, i.status]),
    ).toEqual([
      [2, "Blue glass vase", "VASE-03", "2025-12-20", 400, "in_stock"],
      [3, "Levi's 501 jeans", "JEANS-1", "2026-01-04", 334, "in_stock"],
      [3, "Levi's 501 jeans", "JEANS-1", "2026-01-04", 333, "in_stock"],
      [3, "Levi's 501 jeans", "JEANS-1", "2026-01-04", 333, "in_stock"],
      [4, "Pyrex bowl", "PYREX-2", "2026-01-09", 101550, "in_stock"],
      [5, "Winter coat", "COAT-7", "2026-02-01", 1200, "personal_use"],
    ]);
    expect(r.items[5]?.disposedDate).toBe("2026-03-15");
    expect(r.skipped.map((s) => s.line)).toEqual([6, 7, 8, 9, 10]);
    expect(r.skipped[0]?.reason).toMatch(/date removed/);
    expect(r.skipped[2]?.reason).toBe("No cost on this row.");
    expect(r.skipped[3]?.reason).toMatch(/Quantity/);
    expect(r.skipped[4]?.reason).toMatch(/Purchase date/);
    expect(r.warnings.join(" ")).toMatch(/Sold dates/);
    expect(r.matched).toMatchObject({
      title: "Item",
      sku: "SKU",
      unitCost: "Unit Cost",
      bought: "Date Bought",
    });
  });

  it("splitCents always adds back up", () => {
    for (const [total, n] of [
      [1000, 3],
      [1, 4],
      [0, 2],
      [99999, 7],
    ] as const) {
      const parts = splitCents(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    }
  });

  it("names the missing columns when the file is not a sourcing sheet", () => {
    try {
      parseInventorySheet("Item,Date Bought\nVase,2026-01-01\n");
      throw new Error("expected a format error");
    } catch (e) {
      expect(e).toBeInstanceOf(ImportFormatError);
      expect((e as ImportFormatError).details).toEqual([
        expect.objectContaining({ field: "cost" }),
      ]);
    }
    expect(() => parseInventorySheet("Item,Cost\nVase,4\n")).toThrow(ImportFormatError);
  });

  it("warns when there is no SKU column, and uses the SKU as the title when the name is blank", () => {
    const r = parseInventorySheet("Title,Cost,Purchase Date\nVase,4,2026-01-01\n");
    expect(r.warnings.join(" ")).toMatch(/no SKU column/);
    const s = parseInventorySheet("Title,SKU,Cost,Purchase Date\n,ABC-1,4,2026-01-01\n");
    expect(s.items[0]).toMatchObject({ title: "ABC-1", sku: "ABC-1" });
  });

  it("refuses a negative cost and a huge quantity rather than guessing", () => {
    const r = parseInventorySheet(
      "Title,Qty,Cost,Purchase Date\nA,1,-4.00,2026-01-01\nB,9000,1,2026-01-01\n",
    );
    expect(r.items).toHaveLength(0);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/Cost not readable/),
      expect.stringMatching(/more than 500/),
    ]);
  });
});
