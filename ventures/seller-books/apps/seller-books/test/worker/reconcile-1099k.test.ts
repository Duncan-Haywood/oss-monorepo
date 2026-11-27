// POST /reports/1099k-reconcile: the books' totals for one platform and year against the typed form figures,
// held to the P&L's own figures; nothing stored; another shop's books answer 404.
import { describe, expect, it } from "vitest";
import poshCsv from "../fixtures/poshmark-my-sales-report.csv?raw";
import { api, json, setupTenant } from "./helpers";

type Rec = {
  bases: { key: string; booksCents: number; differenceCents: number }[];
  closest: string;
  matches: boolean;
  booksOrders: number;
  months: { month: string; booksCents: number; formCents: number | null }[] | null;
  findings: string[];
  disclaimer: string;
};

const reconcile = (as: string, orgId: string, body: unknown) =>
  api(`/api/orgs/${orgId}/reports/1099k-reconcile`, { method: "POST", as, json: body });

describe("1099-K reconciliation", () => {
  it("sums the platform's year from the books and compares it with the form", async () => {
    const { userId, orgId } = await setupTenant();
    const imported = await api(`/api/orgs/${orgId}/imports`, {
      method: "POST",
      as: userId,
      json: { report: "poshmark_my_sales_report", fileName: "posh.csv", csv: poshCsv },
    });
    expect(imported.status).toBe(201);
    const pnl = await json<{
      byPlatform: {
        platform: string;
        orders: number;
        itemSalesCents: number;
        shippingChargedCents: number;
        salesTaxCollectedCents: number;
      }[];
    }>(await api(`/api/orgs/${orgId}/reports/pnl?from=2026-01-01&to=2026-12-31`, { as: userId }));
    const posh = pnl.byPlatform.find((p) => p.platform === "poshmark");
    if (!posh) throw new Error("no Poshmark row in the P&L");
    const items = posh.itemSalesCents;
    expect(items).toBeGreaterThan(0);

    const months = Array(12).fill(null);
    months[0] = items / 100;
    const res = await reconcile(userId, orgId, {
      year: 2026,
      platform: "poshmark",
      box1a: items / 100,
      months,
      box3: posh.orders,
    });
    expect(res.status).toBe(200);
    const r = await json<Rec>(res);
    expect(r.bases[0]).toMatchObject({ key: "items", booksCents: items, differenceCents: 0 });
    expect(r.matches).toBe(true);
    expect(r.booksOrders).toBe(posh.orders);
    expect(r.months?.[0]).toMatchObject({ month: "2026-01", booksCents: items, formCents: items });
    expect(r.disclaimer).toMatch(/not tax advice/);

    // Another platform with nothing imported: the whole form is unexplained, and January is named.
    const ebay = await json<Rec>(
      await reconcile(userId, orgId, { year: 2026, platform: "ebay", box1a: 500, months }),
    );
    expect(ebay.bases[0]?.booksCents).toBe(0);
    expect(ebay.matches).toBe(false);
    expect(ebay.findings.some((f) => f.startsWith("January: the form shows"))).toBe(true);

    // Bad input is refused.
    expect(
      (await reconcile(userId, orgId, { year: 2026, platform: "facebook", box1a: 1 })).status,
    ).toBe(400);
    expect(
      (await reconcile(userId, orgId, { year: 2026, platform: "ebay", box1a: 1, months: [1, 2] }))
        .status,
    ).toBe(400);
  });

  it("answers 404 for another shop's books", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    expect(
      (await reconcile(b.userId, a.orgId, { year: 2026, platform: "ebay", box1a: 1 })).status,
    ).toBe(404);
  });

  it("is open to a viewer, who can read the books", async () => {
    const v = await setupTenant("viewer");
    expect(
      (await reconcile(v.userId, v.orgId, { year: 2026, platform: "ebay", box1a: 1 })).status,
    ).toBe(200);
  });
});
