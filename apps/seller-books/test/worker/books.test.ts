import { describe, expect, it } from "vitest";
import ebayCsv from "../fixtures/ebay-transaction-report.csv?raw";
import etsyOrdersCsv from "../fixtures/etsy-sold-orders.csv?raw";
import etsyStatementCsv from "../fixtures/etsy-statement.csv?raw";
import poshCsv from "../fixtures/poshmark-my-sales-report.csv?raw";
import { api, BASE, json, setupTenant } from "./helpers";

type Summary = {
  id: string;
  salesCreated: number;
  chargesCreated: number;
  duplicatesSkipped: number;
  rowsSkipped: number;
  itemsLinked: number;
};

async function upload(
  as: string,
  orgId: string,
  report: string,
  csv: string,
  fileName = "report.csv",
) {
  return api(`/api/orgs/${orgId}/imports`, { method: "POST", as, json: { report, fileName, csv } });
}

describe("auth + orgs", () => {
  it("signs up with email and password, creates an org and lists it", async () => {
    const email = `seller-${crypto.randomUUID()}@example.test`;
    const res = await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: BASE },
      json: { email, password: "correct-horse-battery", name: "Sam Seller" },
    });
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const created = await api("/api/orgs", {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE },
      json: { name: "Sam's Resale" },
    });
    expect(created.status).toBe(201);
    const { orgId } = await json<{ orgId: string }>(created);
    const me = await json<{ memberships: { orgId: string; role: string }[] }>(
      await api("/api/me", { headers: { Cookie: cookie } }),
    );
    expect(me.memberships).toEqual([{ orgId, orgName: "Sam's Resale", role: "owner" }]);
  });

  it("rejects cross-origin writes and anonymous access", async () => {
    expect((await api("/api/orgs")).status).toBe(401);
    const { userId } = await setupTenant();
    const res = await api("/api/orgs", {
      method: "POST",
      as: userId,
      headers: { Origin: "https://evil.example" },
      json: { name: "x" },
    });
    expect(res.status).toBe(403);
  });
});

describe("imports", () => {
  it("imports an eBay transaction report once and skips duplicates on re-import", async () => {
    const { userId, orgId } = await setupTenant();
    const first = await upload(userId, orgId, "ebay_transaction_report", ebayCsv);
    expect(first.status).toBe(201);
    const s1 = await json<Summary>(first);
    expect(s1).toMatchObject({
      salesCreated: 3,
      chargesCreated: 2,
      duplicatesSkipped: 0,
      rowsSkipped: 2,
    });

    const s2 = await json<Summary>(await upload(userId, orgId, "ebay_transaction_report", ebayCsv));
    expect(s2).toMatchObject({ salesCreated: 0, chargesCreated: 0, duplicatesSkipped: 5 });

    const sales = await json<{ items: { kind: string; fees: { kind: string }[] }[] }>(
      await api(`/api/orgs/${orgId}/sales?platform=ebay`, { as: userId }),
    );
    expect(sales.items).toHaveLength(3);
    expect(sales.items.flatMap((s) => s.fees.map((f) => f.kind))).toContain("international");

    const batches = await json<{ items: { id: string }[] }>(
      await api(`/api/orgs/${orgId}/imports`, { as: userId }),
    );
    expect(batches.items).toHaveLength(2);
    // Deleting the first batch removes its rows.
    expect(
      (await api(`/api/orgs/${orgId}/imports/${s1.id}`, { method: "DELETE", as: userId })).status,
    ).toBe(200);
    const after = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${orgId}/sales`, { as: userId }),
    );
    expect(after.items).toHaveLength(0);
  });

  it("imports a real-sized report (hundreds of rows, under D1's 100-parameter cap per statement)", async () => {
    // Regression: inserts were 8 rows at a time, 160 parameters for a 20-column sale row, so any
    // report with 5 or more new sales failed with a 500 (2026-11-26).
    const { userId, orgId } = await setupTenant();
    const head =
      '"Item Id","Sold Date","Completed Date","Order Status","Item Title","Item Price","Buyer Shipping Fee","Seller Shipping Fee","Mercari Selling Fee","Payment Processing Fee","Shipping Adjustment Fee","Sales Tax Charged to Buyer","Buyer Protection Charged to Buyer","Net Seller Proceeds"';
    const rows = Array.from(
      { length: 300 },
      (_, i) =>
        `"m${String(i).padStart(11, "0")}","2026-05-01","2026-05-04","completed","Item ${i}","20.00","0.00","5.00","2.00","0.50","0.00","1.60","0.72","12.50"`,
    );
    const res = await upload(userId, orgId, "mercari_sales_report", [head, ...rows].join("\n"));
    expect(res.status).toBe(201);
    const s = await json<Summary>(res);
    expect(s.salesCreated).toBe(300);
  });

  it("explains a wrong file instead of importing it", async () => {
    const { userId, orgId } = await setupTenant();
    const res = await upload(userId, orgId, "mercari_sales_report", poshCsv);
    expect(res.status).toBe(400);
    const body = await json<{ error: { message: string; details: { field: string }[] } }>(res);
    expect(body.error.message).toMatch(/Mercari sales report/);
    expect(body.error.details.map((d) => d.field)).toContain("itemId");
  });

  it("viewers cannot import", async () => {
    const { userId, orgId } = await setupTenant("viewer");
    expect((await upload(userId, orgId, "poshmark_my_sales_report", poshCsv)).status).toBe(403);
  });
});

describe("inventory, P&L and Schedule C", () => {
  it("links sales to lot items by SKU, and the P&L and worksheet use that cost", async () => {
    const { userId, orgId } = await setupTenant();
    const lot = await api(`/api/orgs/${orgId}/inventory/lots`, {
      method: "POST",
      as: userId,
      json: {
        name: "Estate sale haul",
        acquiredDate: "2025-12-20",
        totalCostCents: 3000,
        items: [
          { title: "Blue glass vase", sku: "VASE-03" },
          { title: "Candle holders", sku: "CANDLE-1" },
          { title: "Brass bell", sku: null, costCents: 1000 },
        ],
      },
    });
    expect(lot.status).toBe(201);
    const { id: lotId } = await json<{ id: string }>(lot);
    const detail = await json<{ items: { sku: string | null; costCents: number }[] }>(
      await api(`/api/orgs/${orgId}/inventory/lots/${lotId}`, { as: userId }),
    );
    expect(detail.items.map((i) => [i.sku, i.costCents])).toEqual([
      ["VASE-03", 1000],
      ["CANDLE-1", 1000],
      [null, 1000],
    ]);

    const orders = await json<Summary>(
      await upload(userId, orgId, "etsy_sold_orders", etsyOrdersCsv),
    );
    expect(orders.itemsLinked).toBe(1);
    await upload(userId, orgId, "etsy_payment_statement", etsyStatementCsv);
    await api(`/api/orgs/${orgId}/expenses`, {
      method: "POST",
      as: userId,
      json: { date: "2026-05-05", category: "supplies", amountCents: 1299, vendor: "Uline" },
    });
    await api(`/api/orgs/${orgId}/mileage`, {
      method: "POST",
      as: userId,
      json: { date: "2026-05-06", purpose: "Estate sale pickup", miles: 12.5, roundTrip: true },
    });

    const pnl = await json<{
      cells: {
        platform: string;
        month: string;
        cogsCents: number;
        ordersWithoutCost: number;
        netProfitCents: number;
      }[];
      total: {
        revenueCents: number;
        feesCents: number;
        postageCents: number;
        cogsCents: number;
        expensesCents: number;
        netProfitCents: number;
      };
    }>(await api(`/api/orgs/${orgId}/reports/pnl?from=2026-01-01&to=2026-12-31`, { as: userId }));
    const etsyMay = pnl.cells.find((c) => c.platform === "etsy" && c.month === "2026-05");
    expect(etsyMay).toMatchObject({ cogsCents: 1000, ordersWithoutCost: 1 });
    // Revenue: (3420 + 650) + (6400 + 800) − 2000 refund. Fees: 147 + 261 card, 222 + 42 − 130 transaction,
    // 20 listing, 300 ads. Postage 510. COGS 1000. Expenses 1299.
    expect(pnl.total).toMatchObject({
      revenueCents: 9270,
      feesCents: 862,
      postageCents: 510,
      cogsCents: 1000,
      expensesCents: 1299,
      netProfitCents: 9270 - 862 - 510 - 1000 - 1299,
    });

    const ws = await json<{
      lines: { line: string; amountCents: number | null }[];
      partIII: { line: string; amountCents: number }[];
    }>(await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026&mileageRate=70`, { as: userId }));
    const line = (l: string) => ws.lines.find((x) => x.line === l)?.amountCents;
    expect(line("1")).toBe(11270);
    expect(line("2")).toBe(2000);
    expect(line("4")).toBe(1000);
    expect(line("9")).toBe(1750);
    expect(ws.partIII.find((l) => l.line === "35")?.amountCents).toBe(3000);

    const csv = await api(`/api/orgs/${orgId}/reports/schedule-c.csv?year=2026`, { as: userId });
    expect(csv.headers.get("Content-Type")).toMatch(/text\/csv/);
    const text = await csv.text();
    expect(text).toMatch(/not a tax return and not tax advice/);
    expect(text).toMatch(/Mileage logged but no standard mileage rate/);
  });
});

describe("tenant isolation", () => {
  it("a member of one org can neither read nor change another org's books", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const imported = await json<Summary>(
      await upload(a.userId, a.orgId, "poshmark_my_sales_report", poshCsv),
    );
    const sales = await json<{ items: { id: string }[] }>(
      await api(`/api/orgs/${a.orgId}/sales`, { as: a.userId }),
    );
    const saleId = sales.items[0]?.id ?? "";
    const item = await json<{ id: string }>(
      await api(`/api/orgs/${a.orgId}/inventory/items`, {
        method: "POST",
        as: a.userId,
        json: { title: "Tote", acquiredDate: "2025-11-01", costCents: 900 },
      }),
    );

    // B uses A's org id: every router answers 404 (org ids cannot be probed).
    for (const path of [
      "",
      "/members",
      "/imports",
      "/sales",
      `/sales/${saleId}`,
      "/sales/charges",
      "/inventory/lots",
      "/inventory/items",
      "/mileage",
      "/expenses",
      "/reports/pnl?from=2026-01-01&to=2026-12-31",
      "/reports/schedule-c?year=2026",
    ]) {
      expect((await api(`/api/orgs/${a.orgId}${path}`, { as: b.userId })).status, path).toBe(404);
    }
    expect(
      (await api(`/api/orgs/${a.orgId}/imports/${imported.id}`, { method: "DELETE", as: b.userId }))
        .status,
    ).toBe(404);

    // B uses its OWN org id with A's record ids: still 404, nothing changes.
    expect((await api(`/api/orgs/${b.orgId}/sales/${saleId}`, { as: b.userId })).status).toBe(404);
    expect(
      (await api(`/api/orgs/${b.orgId}/imports/${imported.id}`, { method: "DELETE", as: b.userId }))
        .status,
    ).toBe(404);
    expect(
      (
        await api(`/api/orgs/${b.orgId}/inventory/items/${item.id}`, {
          method: "PATCH",
          as: b.userId,
          json: { costCents: 1 },
        })
      ).status,
    ).toBe(404);
    const ownSale = await json<Summary>(
      await upload(b.userId, b.orgId, "poshmark_my_sales_report", poshCsv),
    );
    expect(ownSale.salesCreated).toBe(4); // same file, separate org: not a duplicate
    const bSales = await json<{ items: { id: string }[] }>(
      await api(`/api/orgs/${b.orgId}/sales`, { as: b.userId }),
    );
    expect(
      (
        await api(`/api/orgs/${b.orgId}/sales/${bSales.items[0]?.id}/link-item`, {
          method: "POST",
          as: b.userId,
          json: { itemId: item.id },
        })
      ).status,
    ).toBe(404);

    // A's data is intact.
    const still = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${a.orgId}/sales`, { as: a.userId }),
    );
    expect(still.items).toHaveLength(4);
    const aItem = await json<{ items: { costCents: number }[] }>(
      await api(`/api/orgs/${a.orgId}/inventory/items`, { as: a.userId }),
    );
    expect(aItem.items[0]?.costCents).toBe(900);
  });

  it("invitations: only the invited email can join, with the invited role", async () => {
    const a = await setupTenant();
    const inv = await json<{ url: string }>(
      await api(`/api/orgs/${a.orgId}/members/invitations`, {
        method: "POST",
        as: a.userId,
        json: { email: "helper@example.test", role: "editor" },
      }),
    );
    const token = new URL(inv.url).searchParams.get("token") ?? "";
    const stranger = await setupTenant();
    expect(
      (
        await api("/api/invitations/accept", {
          method: "POST",
          as: stranger.userId,
          json: { token },
        })
      ).status,
    ).toBe(403);
    const { createTestUser } = await import("./helpers");
    const helper = await createTestUser("helper@example.test");
    const ok = await api("/api/invitations/accept", {
      method: "POST",
      as: helper.id,
      json: { token },
    });
    expect(ok.status).toBe(200);
    const org = await json<{ role: string }>(await api(`/api/orgs/${a.orgId}`, { as: helper.id }));
    expect(org.role).toBe("editor");
    expect(
      (await api("/api/invitations/accept", { method: "POST", as: helper.id, json: { token } }))
        .status,
    ).toBe(404);
  });

  it("deleting an org removes all of its rows", async () => {
    const a = await setupTenant();
    await upload(a.userId, a.orgId, "poshmark_my_sales_report", poshCsv);
    const bad = await api(`/api/orgs/${a.orgId}`, {
      method: "DELETE",
      as: a.userId,
      json: { confirmName: "nope" },
    });
    expect(bad.status).toBe(400);
    const res = await api(`/api/orgs/${a.orgId}`, {
      method: "DELETE",
      as: a.userId,
      json: { confirmName: "Test Shop" },
    });
    expect(res.status).toBe(200);
    const { testDb } = await import("./helpers");
    const { sale } = await import("@worker/db/schema");
    const { eq } = await import("drizzle-orm");
    expect(await testDb().select().from(sale).where(eq(sale.orgId, a.orgId))).toEqual([]);
  });
});
