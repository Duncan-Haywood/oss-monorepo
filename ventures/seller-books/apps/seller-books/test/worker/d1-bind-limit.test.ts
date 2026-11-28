// D1 binds at most 100 parameters a statement. Two paths bound one parameter per row of a list a
// seller can grow past that: the sales list (the import screen asks for `limit=500`, and each listed
// sale's fees were read with one `IN (...)` over every id on the page), and the sourcing-sheet
// import (an order for 120 units of one SKU marked all 120 items sold in one `IN (...)`).
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

const ETSY_HEADER =
  "Sale Date,Order ID,Buyer User ID,Full Name,First Name,Last Name,Number of Items,Payment Method,Date Shipped,Street 1,Street 2,Ship City,Ship State,Ship Zipcode,Ship Country,Currency,Order Value,Coupon Code,Coupon Details,Discount Amount,Shipping Discount,Shipping,Sales Tax,Order Total,Status,Card Processing Fees,Order Net,Adjusted Order Total,Adjusted Card Processing Fees,Adjusted Net Order Amount,Buyer,Order Type,Payment Type,InPerson Discount,InPerson Location,SKU";

/** One Etsy sold-orders row: `items` units of `sku` for $10.00 each, with a card fee. */
function etsyRow(n: number, items: number, sku: string): string {
  const id = String(4000000000 + n);
  const value = (items * 10).toFixed(2);
  return `05/02/26,${id},buyer${n},Dana Smith,Dana,Smith,${items},Credit Card,05/04/2026,1 Main St,,Portland,OR,97201,United States,USD,${value},,,0,0,0,0,${value},Completed,0.50,${value},,,,buyer${n},online,online_cc,,,${sku}`;
}

const importOrders = (userId: string, orgId: string, rows: string[]) =>
  api(`/api/orgs/${orgId}/imports`, {
    method: "POST",
    as: userId,
    json: {
      report: "etsy_sold_orders",
      fileName: "orders.csv",
      csv: `${ETSY_HEADER}\n${rows.join("\n")}\n`,
    },
  });

describe("lists longer than D1's 100 bound parameters", () => {
  it("lists 150 sales on one page with each sale's own fees", async () => {
    const { userId, orgId } = await setupTenant();
    const rows = Array.from({ length: 150 }, (_, i) => etsyRow(i, 1, `SKU-${i}`));
    expect((await importOrders(userId, orgId, rows)).status).toBe(201);

    const res = await api(`/api/orgs/${orgId}/sales?limit=500`, { as: userId });
    expect(res.status).toBe(200);
    const page = await json<{
      items: { id: string; fees: { saleId: string }[] }[];
      nextCursor?: string;
    }>(res);
    expect(page.items).toHaveLength(150);
    expect(page.nextCursor).toBeUndefined();
    // Every sale carries its fees, and only its own.
    for (const s of page.items) {
      expect(s.fees.length).toBeGreaterThan(0);
      for (const f of s.fees) expect(f.saleId).toBe(s.id);
    }
    // The default page (100 + 1 rows fetched to see if there is more) also stays under the limit.
    const first = await json<{ items: unknown[]; nextCursor?: string }>(
      await api(`/api/orgs/${orgId}/sales`, { as: userId }),
    );
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).toBe("100");
  });

  it("links one order for 120 units to all 120 items from the sourcing sheet", async () => {
    const { userId, orgId } = await setupTenant();
    expect((await importOrders(userId, orgId, [etsyRow(1, 120, "LOT-120")])).status).toBe(201);

    const sheet =
      "Item,SKU,Qty,Unit Cost,Total Cost,Date Bought,Status,Date Removed,Date Sold\n" +
      "Enamel pins,LOT-120,120,$1.00,,2026-01-04,,,\n";
    const res = await api(`/api/orgs/${orgId}/inventory/items/import`, {
      method: "POST",
      as: userId,
      json: { fileName: "sourcing.csv", csv: sheet },
    });
    expect(res.status).toBe(201);
    expect(await json<{ itemsCreated: number; salesLinked: number }>(res)).toMatchObject({
      itemsCreated: 120,
      salesLinked: 1,
    });
    const items = await json<{ items: { status: string; disposedDate: string | null }[] }>(
      await api(`/api/orgs/${orgId}/inventory/items?limit=500`, { as: userId }),
    );
    expect(items.items).toHaveLength(120);
    expect(items.items.every((i) => i.status === "sold" && i.disposedDate === "2026-05-02")).toBe(
      true,
    );
  });
});
