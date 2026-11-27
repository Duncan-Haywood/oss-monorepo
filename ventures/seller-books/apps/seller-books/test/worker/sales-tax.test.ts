// The sales tax the seller collected themselves: typed in on direct sales, read from Square, kept out of
// revenue, and downloaded by month and quarter (GET /reports/sales-tax.csv).
import { parseCsv } from "@shared/csv";
import { describe, expect, it } from "vitest";
import squareCsv from "../fixtures/square-transactions.csv?raw";
import { api, json, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;
const range = "from=2026-01-01&to=2026-12-31";

const addSale = (t: Tenant, body: Record<string, unknown>) =>
  api(path(t, "/sales"), { method: "POST", as: t.userId, json: body });

const total = async (t: Tenant) =>
  (
    await json<{
      total: {
        revenueCents: number;
        salesTaxCollectedCents: number;
        marketplaceSalesTaxCents: number;
        sellerSalesTaxCents: number;
        sellerSalesTaxRefundedCents: number;
      };
    }>(await api(path(t, `/reports/pnl?${range}`), { as: t.userId }))
  ).total;

const csv = async (t: Tenant, as = t.userId) => {
  const res = await api(path(t, `/reports/sales-tax.csv?${range}`), { as });
  return { res, rows: res.status === 200 ? parseCsv(await res.text()) : [] };
};

describe("sales tax the seller collected", () => {
  it("a direct sale's tax stays out of revenue, lands in the report, and its refund takes it back", async () => {
    const t = await setupTenant();
    const res = await addSale(t, {
      date: "2026-05-02",
      title: "Oak side table, flea market booth",
      itemCents: 8000,
      salesTaxCents: 640,
      paymentFeeCents: 0,
    });
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    const s = await json<{ netCents: number; salesTaxCents: number }>(
      await api(path(t, `/sales/${id}`), { as: t.userId }),
    );
    expect(s).toMatchObject({ salesTaxCents: 640, netCents: 8640 });
    expect(await total(t)).toMatchObject({
      revenueCents: 8000,
      salesTaxCollectedCents: 640,
      sellerSalesTaxCents: 640,
      marketplaceSalesTaxCents: 0,
    });

    expect(
      (
        await addSale(t, {
          kind: "refund",
          date: "2026-07-10",
          title: "Oak side table returned",
          refundCents: 8000,
          salesTaxCents: 640,
        })
      ).status,
    ).toBe(201);
    expect(await total(t)).toMatchObject({ revenueCents: 0, sellerSalesTaxRefundedCents: 640 });

    const { res: r, rows } = await csv(t);
    expect(r.headers.get("Content-Type")).toContain("text/csv");
    expect(r.headers.get("Content-Disposition")).toContain(
      "sales-tax-collected-2026-01-01-to-2026-12-31.csv",
    );
    const body = rows.filter((x) => x.length > 1);
    expect(body).toContainEqual([
      "2026-05",
      "Direct sales",
      "80.00",
      "0.00",
      "6.40",
      "0.00",
      "6.40",
      "",
    ]);
    expect(body).toContainEqual([
      "2026-07",
      "Direct sales",
      "0.00",
      "80.00",
      "0.00",
      "6.40",
      "-6.40",
      "",
    ]);
    expect(body).toContainEqual([
      "2026-Q2",
      "All channels",
      "80.00",
      "0.00",
      "6.40",
      "0.00",
      "6.40",
      "",
    ]);
    expect(body).toContainEqual([
      "2026-Q3",
      "All channels",
      "0.00",
      "80.00",
      "0.00",
      "6.40",
      "-6.40",
      "",
    ]);
    expect(body.at(-1)).toEqual([
      "Total",
      "All channels",
      "80.00",
      "80.00",
      "6.40",
      "6.40",
      "0.00",
      "",
    ]);
  });

  it("an imported Square report's tax is the seller's, its refunds hand it back", async () => {
    const t = await setupTenant();
    const up = await api(path(t, "/imports"), {
      method: "POST",
      as: t.userId,
      json: { report: "square_transactions", fileName: "square.csv", csv: squareCsv },
    });
    expect(up.status).toBe(201);
    const tt = await total(t);
    expect(tt.marketplaceSalesTaxCents).toBe(0);
    expect(tt.sellerSalesTaxCents).toBe(tt.salesTaxCollectedCents);
    expect(tt.sellerSalesTaxCents).toBeGreaterThan(0);
    expect(tt.sellerSalesTaxRefundedCents).toBe(210);
    const { rows } = await csv(t);
    expect(rows.some((r) => r[1] === "Square")).toBe(true);
  });

  it("refuses tax on an empty refund, a bad range, and another shop's user", async () => {
    const t = await setupTenant();
    expect(
      (await addSale(t, { kind: "refund", date: "2026-03-01", title: "X", salesTaxCents: 50 }))
        .status,
    ).toBe(400);
    expect(
      (await api(path(t, "/reports/sales-tax.csv?from=2026-12-31&to=2026-01-01"), { as: t.userId }))
        .status,
    ).toBe(400);
    const other = await setupTenant();
    expect((await csv(t, other.userId)).res.status).toBe(404);
    const viewer = await setupTenant("viewer");
    expect((await csv(viewer)).res.status).toBe(200);
  });
});
