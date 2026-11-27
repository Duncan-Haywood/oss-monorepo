import { describe, expect, it } from "vitest";
import etsyOrdersCsv from "../fixtures/etsy-sold-orders.csv?raw";
import sheetCsv from "../fixtures/sourcing-sheet.csv?raw";
import { api, json, setupTenant } from "./helpers";

type Summary = {
  dryRun: boolean;
  itemsCreated: number;
  duplicatesSkipped: number;
  rowsSkipped: number;
  salesLinked: number;
  totalCostCents: number;
};

const importSheet = (as: string, orgId: string, csv: string, dryRun?: boolean) =>
  api(`/api/orgs/${orgId}/inventory/items/import`, {
    method: "POST",
    as,
    json: { fileName: "sourcing.csv", csv, dryRun },
  });

describe("sourcing sheet import", () => {
  it("previews without writing, imports, skips duplicates, and links earlier orders by SKU", async () => {
    const { userId, orgId } = await setupTenant();
    // Orders first: the Etsy order for VASE-03 (2026-05-02) has no item yet.
    await api(`/api/orgs/${orgId}/imports`, {
      method: "POST",
      as: userId,
      json: { report: "etsy_sold_orders", fileName: "orders.csv", csv: etsyOrdersCsv },
    });

    const preview = await importSheet(userId, orgId, sheetCsv, true);
    expect(preview.status).toBe(200);
    expect(await json<Summary>(preview)).toMatchObject({
      dryRun: true,
      itemsCreated: 6,
      salesLinked: 1,
      rowsSkipped: 5,
      totalCostCents: 400 + 1000 + 101550 + 1200,
    });
    const none = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${orgId}/inventory/items`, { as: userId }),
    );
    expect(none.items).toHaveLength(0);

    const first = await importSheet(userId, orgId, sheetCsv);
    expect(first.status).toBe(201);
    expect(await json<Summary>(first)).toMatchObject({ itemsCreated: 6, salesLinked: 1 });

    const items = await json<{
      items: { sku: string | null; status: string; disposedDate: string | null }[];
    }>(await api(`/api/orgs/${orgId}/inventory/items`, { as: userId }));
    expect(items.items).toHaveLength(6);
    expect(items.items.find((i) => i.sku === "VASE-03")).toMatchObject({
      status: "sold",
      disposedDate: "2026-05-02",
    });
    expect(items.items.find((i) => i.sku === "COAT-7")).toMatchObject({
      status: "personal_use",
      disposedDate: "2026-03-15",
    });
    const unlinked = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${orgId}/sales?unlinked=true`, { as: userId }),
    );
    expect(unlinked.items).toHaveLength(1); // the order with no SKU

    // The same sheet again, plus one new row: only the new row is added.
    const grown = `${sheetCsv.trimEnd()}\nCandle holders,CANDLE-1,1,2.50,,2026-03-01,,,\n`;
    expect(await json<Summary>(await importSheet(userId, orgId, grown))).toMatchObject({
      itemsCreated: 1,
      duplicatesSkipped: 6,
      salesLinked: 0,
    });
  });

  it("does not link an order dated before the item was bought", async () => {
    const { userId, orgId } = await setupTenant();
    await api(`/api/orgs/${orgId}/imports`, {
      method: "POST",
      as: userId,
      json: { report: "etsy_sold_orders", fileName: "orders.csv", csv: etsyOrdersCsv },
    });
    const late = "Item,SKU,Cost,Date Bought\nBlue glass vase,VASE-03,4.00,2026-06-01\n";
    expect(await json<Summary>(await importSheet(userId, orgId, late))).toMatchObject({
      itemsCreated: 1,
      salesLinked: 0,
    });
  });

  it("explains a wrong file, refuses viewers, and keeps orgs apart", async () => {
    const { userId, orgId } = await setupTenant();
    const bad = await importSheet(userId, orgId, "Item,Date Bought\nVase,2026-01-01\n");
    expect(bad.status).toBe(400);
    const body = await json<{ error: { details: { field: string }[] } }>(bad);
    expect(body.error.details.map((d) => d.field)).toEqual(["cost"]);

    const viewer = await setupTenant("viewer");
    expect((await importSheet(viewer.userId, viewer.orgId, sheetCsv)).status).toBe(403);

    // Another org's member cannot import into this org, and this org's items are not seen as duplicates there.
    const other = await setupTenant();
    expect((await importSheet(other.userId, orgId, sheetCsv)).status).toBe(404);
    await importSheet(userId, orgId, sheetCsv);
    expect(
      await json<Summary>(await importSheet(other.userId, other.orgId, sheetCsv)),
    ).toMatchObject({ itemsCreated: 6, duplicatesSkipped: 0 });
  });
});
