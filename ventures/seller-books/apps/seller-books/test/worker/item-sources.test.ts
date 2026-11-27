// Where items were bought: typed on an item, read from a sourcing sheet's "Where Bought" column, or taken
// from a lot's vendor, and the stock report's profit by source (services/books/stock.ts).
import type { SourceRow } from "@worker/services/books/stock";
import { describe, expect, it } from "vitest";
import etsyOrdersCsv from "../fixtures/etsy-sold-orders.csv?raw";
import { api, json, setupTenant } from "./helpers";

const SHEET = [
  "Item,SKU,Qty,Unit Cost,Total Cost,Date Bought,Where Bought,Status",
  "Blue glass vase,VASE-03,1,$4.00,,12/20/2025,Goodwill Main St,",
  "Levi's 501 jeans,JEANS-1,2,3.00,,2026-01-04,goodwill  main st,",
  "Lamp,LAMP-1,1,9.00,,2026-01-05,,",
].join("\n");

describe("item sources", () => {
  it("saves the source from the sheet, the item form and a lot, and groups profit by it", async () => {
    const { userId: as, orgId } = await setupTenant();
    const base = `/api/orgs/${orgId}`;
    const imported = await api(`${base}/inventory/items/import`, {
      method: "POST",
      as,
      json: { fileName: "sourcing.csv", csv: SHEET },
    });
    expect(imported.status).toBe(201);
    expect(await json<{ matched: Record<string, string> }>(imported)).toMatchObject({
      matched: { source: "Where Bought" },
    });
    // The Etsy order for VASE-03 (2026-05-02) sells the vase.
    await api(`${base}/imports`, {
      method: "POST",
      as,
      json: { report: "etsy_sold_orders", fileName: "orders.csv", csv: etsyOrdersCsv },
    });

    // A lot with a vendor, one item taking it and one with its own source.
    const lot = await json<{ id: string }>(
      await api(`${base}/inventory/lots`, {
        method: "POST",
        as,
        json: {
          name: "Estate haul",
          acquiredDate: "2026-02-01",
          vendor: "Estate sale on Elm",
          totalCostCents: 2000,
          items: [{ title: "Clock" }, { title: "Mirror", source: "Flea market" }],
        },
      }),
    );
    expect(lot.id).toBeTruthy();
    const added = await api(`${base}/inventory/items`, {
      method: "POST",
      as,
      json: { title: "Scarf", acquiredDate: "2026-02-03", costCents: 500, source: "Flea market" },
    });
    expect(added.status).toBe(201);
    const scarf = await json<{ id: string; source: string | null }>(added);
    expect(scarf.source).toBe("Flea market");

    // Editing the source, and clearing it.
    const lamp = (
      await json<{ items: { id: string; title: string }[] }>(
        await api(`${base}/inventory/items`, { as }),
      )
    ).items.find((i) => i.title === "Lamp");
    const patched = await api(`${base}/inventory/items/${lamp?.id}`, {
      method: "PATCH",
      as,
      json: { source: "Garage sale" },
    });
    expect(await json<{ source: string | null }>(patched)).toMatchObject({ source: "Garage sale" });
    const cleared = await api(`${base}/inventory/items/${scarf.id}`, {
      method: "PATCH",
      as,
      json: { source: "" },
    });
    expect(await json<{ source: string | null }>(cleared)).toMatchObject({ source: null });

    const report = await json<{ sources: SourceRow[] }>(
      await api(`${base}/reports/stock?asOf=2026-06-30&from=2026-01-01&to=2026-06-30`, { as }),
    );
    const by = new Map(report.sources.map((s) => [s.source, s]));
    // Two spellings of one store are one row, labelled with the first bought; the vase sold from it.
    const goodwill = by.get("Goodwill Main St");
    expect(goodwill).toMatchObject({ sold: 1, costCents: 400, inStock: 2, inStockCostCents: 600 });
    expect(goodwill?.proceedsCents).toBeGreaterThan(0);
    expect(goodwill?.profitCents).toBe((goodwill?.proceedsCents ?? 0) - 400);
    expect(by.has("goodwill  main st")).toBe(false);
    expect(by.get("Estate sale on Elm")).toMatchObject({ sold: 0, inStock: 1 });
    expect(by.get("Flea market")).toMatchObject({ sold: 0, inStock: 1 });
    expect(by.get("Garage sale")).toMatchObject({ inStock: 1, inStockCostCents: 900 });
    // The scarf, its source cleared, is the "no source" row, listed last.
    expect(report.sources.at(-1)).toMatchObject({
      source: null,
      inStock: 1,
      inStockCostCents: 500,
    });
  });
});
