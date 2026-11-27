// Another marketplace's file, read with the columns the seller chose (POST /imports/mapped): the books, the
// saved mapping, re-import de-duplication, the tax of "another marketplace" on the seller's report, and
// tenant isolation of the saved mappings.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

const CSV = [
  "Sold On,Order #,Listing,Sale Price,Shipping Paid,Tax,Commission,Payout",
  "2026-03-02,S-1,Retro sneakers,180.00,14.00,12.00,-16.20,177.80",
  "2026-03-04,S-2,Leather boots,95.00,0,6.40,-8.55,86.45",
  "",
].join("\n");

const MAPPING = {
  date: "Sold On",
  orderId: "Order #",
  title: "Listing",
  itemPrice: "Sale Price",
  shipping: "Shipping Paid",
  salesTax: "Tax",
  net: "Payout",
  fees: [{ column: "Commission", kind: "commission" }],
};

const upload = (t: Tenant, platform: string, mapping: unknown = MAPPING, csv = CSV) =>
  api(path(t, "/imports/mapped"), {
    method: "POST",
    as: t.userId,
    json: { platform, mapping, fileName: "sales.csv", csv },
  });

interface Summary {
  platform: string;
  reportKind: string;
  salesCreated: number;
  duplicatesSkipped: number;
}

const pnl = async (t: Tenant) =>
  json<{
    total: { revenueCents: number; sellerSalesTaxCents: number; marketplaceSalesTaxCents: number };
    byPlatform?: unknown;
  }>(await api(path(t, "/reports/pnl?from=2026-01-01&to=2026-12-31"), { as: t.userId }));

describe("column-mapped import", () => {
  it("imports a StockX file once, saves the columns for next time, and skips it the second time", async () => {
    const t = await setupTenant();
    const first = await upload(t, "stockx");
    expect(first.status).toBe(201);
    expect(await json<Summary>(first)).toMatchObject({
      platform: "stockx",
      reportKind: "mapped_csv",
      salesCreated: 2,
      duplicatesSkipped: 0,
    });
    const again = await json<Summary>(await upload(t, "stockx"));
    expect(again).toMatchObject({ salesCreated: 0, duplicatesSkipped: 2 });

    const sales = await json<{ items: { platform: string; itemCents: number; fees: unknown[] }[] }>(
      await api(path(t, "/sales"), { as: t.userId }),
    );
    expect(sales.items.map((s) => [s.platform, s.itemCents]).sort()).toEqual([
      ["stockx", 18000],
      ["stockx", 9500],
    ]);
    // StockX collects the tax as the marketplace: never the seller's to file.
    expect((await pnl(t)).total).toMatchObject({
      revenueCents: 18000 + 1400 + 9500,
      sellerSalesTaxCents: 0,
      marketplaceSalesTaxCents: 1200 + 640,
    });

    const saved = await json<{ items: { platform: string; mapping: typeof MAPPING }[] }>(
      await api(path(t, "/imports/mappings"), { as: t.userId }),
    );
    expect(saved.items).toEqual([
      expect.objectContaining({ platform: "stockx", mapping: MAPPING }),
    ]);
  });

  it("counts another marketplace's tax as the seller's, so the sales tax report shows it", async () => {
    const t = await setupTenant();
    expect((await upload(t, "other")).status).toBe(201);
    expect((await pnl(t)).total).toMatchObject({ sellerSalesTaxCents: 1200 + 640 });
    const csv = await (
      await api(path(t, "/reports/sales-tax.csv?from=2026-01-01&to=2026-12-31"), { as: t.userId })
    ).text();
    expect(csv).toContain("Another marketplace");
  });

  it("refuses a column the file lacks with the reason, and saves nothing", async () => {
    const t = await setupTenant();
    const res = await upload(t, "grailed", { ...MAPPING, net: "Total payout" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('the file has no column \\"Total payout\\"');
    const saved = await json<{ items: unknown[] }>(
      await api(path(t, "/imports/mappings"), { as: t.userId }),
    );
    expect(saved.items).toEqual([]);
  });

  it("takes only the column-mapped platforms, and editors only", async () => {
    const t = await setupTenant();
    expect((await upload(t, "ebay")).status).toBe(400);
    const viewer = await setupTenant("viewer");
    expect((await upload(viewer, "vinted")).status).toBe(403);
  });

  it("another shop can neither read the saved columns nor import into this shop", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await upload(a, "vinted");
    expect((await api(path(a, "/imports/mappings"), { as: b.userId })).status).toBe(404);
    expect(
      (
        await api(path(a, "/imports/mapped"), {
          method: "POST",
          as: b.userId,
          json: { platform: "vinted", mapping: MAPPING, fileName: "x.csv", csv: CSV },
        })
      ).status,
    ).toBe(404);
    const own = await json<{ items: unknown[] }>(
      await api(path(b, "/imports/mappings"), { as: b.userId }),
    );
    expect(own.items).toEqual([]);
  });
});
