import { parseCsv } from "@shared/csv";
import { POLICY_VERSION } from "@shared/legal";
import { describe, expect, it } from "vitest";
import amazonCsv from "../fixtures/amazon-date-range-report.csv?raw";
import ebayCsv from "../fixtures/ebay-transaction-report.csv?raw";
import etsyOrdersCsv from "../fixtures/etsy-sold-orders.csv?raw";
import etsyStatementCsv from "../fixtures/etsy-statement.csv?raw";
import poshCsv from "../fixtures/poshmark-my-sales-report.csv?raw";
import shopifyOrdersCsv from "../fixtures/shopify-orders-export.csv?raw";
import shopifyTxCsv from "../fixtures/shopify-payments-transactions.csv?raw";
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
  it("signs up with email and password, accepts the terms, creates an org and lists it", async () => {
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
    const createOrg = () =>
      api("/api/orgs", {
        method: "POST",
        headers: { Cookie: cookie, Origin: BASE },
        json: { name: "Sam's Resale" },
      });
    // A new account has not accepted the legal documents yet: the API refuses the books until it does.
    expect((await createOrg()).status).toBe(403);
    const accepted = await api("/api/me/legal/accept", {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE },
      json: { version: POLICY_VERSION },
    });
    expect(accepted.status).toBe(200);
    const created = await createOrg();
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
    expect(body.error.message).toMatch(/Mercari Gross Sales Report/);
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

    // Quarterly estimates read the same books: the year's last period is the worksheet's line 29, and
    // each earlier period is the year to its end.
    const est = await json<{
      rows: { profitToDate: number | null; status: string; due: string }[];
      safeHarbor: { prior: number | null; required: number | null };
    }>(
      await api(`/api/orgs/${orgId}/reports/estimated-tax`, {
        method: "POST",
        as: userId,
        json: { year: 2026, asOf: "2026-12-31", mileageRate: 70, priorYearTax: 1200, paid: [100] },
      }),
    );
    expect(est.rows[3]?.profitToDate).toBe(line("29"));
    expect(est.rows.map((r) => r.status)).toEqual(["complete", "complete", "complete", "complete"]);
    expect(est.rows.map((r) => r.due)).toEqual([
      "2026-04-15",
      "2026-06-15",
      "2026-09-15",
      "2027-01-15",
    ]);
    expect(est.safeHarbor.prior).toBe(120000);
    const midYear = await json<{ rows: { profitToDate: number | null; status: string }[] }>(
      await api(`/api/orgs/${orgId}/reports/estimated-tax`, {
        method: "POST",
        as: userId,
        json: { year: 2026, asOf: "2026-04-10" },
      }),
    );
    expect(midYear.rows.map((r) => r.status)).toEqual([
      "complete",
      "in-progress",
      "not-started",
      "not-started",
    ]);
    expect(midYear.rows[2]?.profitToDate).toBeNull();

    const csv = await api(`/api/orgs/${orgId}/reports/schedule-c.csv?year=2026`, { as: userId });
    expect(csv.headers.get("Content-Type")).toMatch(/text\/csv/);
    const text = await csv.text();
    expect(text).toMatch(/not a tax return and not tax advice/);
    // With no rate typed in, line 9 prices the trip at the IRS rate on its date: 25 mi × 72.5¢ in May 2026.
    expect(text).toMatch(/I\/II,9,Car and truck expenses \(standard mileage\),18\.13,/);
    expect(text).toMatch(/IR-2025-128/);

    // The sales ledger lists every row behind those figures, and its gross profit is the P&L's.
    const ledger = await api(
      `/api/orgs/${orgId}/reports/sales-ledger.csv?from=2026-01-01&to=2026-12-31`,
      { as: userId },
    );
    expect(ledger.status).toBe(200);
    expect(ledger.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(ledger.headers.get("Content-Disposition")).toBe(
      "attachment; filename=sales-ledger-2026-01-01-to-2026-12-31.csv",
    );
    const rows = parseCsv(await ledger.text());
    const header = rows.findIndex((r) => r[0] === "Date");
    const col = (name: string) => rows[header]?.indexOf(name) ?? -1;
    const total = rows.find((r) => r[0] === "Total") ?? [];
    expect(total[col("Revenue")]).toBe("92.70");
    expect(total[col("Fees")]).toBe("8.62");
    expect(total[col("Postage")]).toBe("5.10");
    expect(total[col("Cost of goods")]).toBe("10.00");
    expect(total[col("Gross profit")]).toBe(((9270 - 862 - 510 - 1000) / 100).toFixed(2));
    const data = rows.slice(header + 1, rows.indexOf(total));
    expect(data.every((r) => r[col("Platform")] === "Etsy")).toBe(true);
    expect(data.filter((r) => r[col("Type")] === "Sale")).toHaveLength(2);
    expect(data.filter((r) => r[col("Type")] === "Refund")).toHaveLength(1);
    expect(data.some((r) => /^Cost from inventory item: /.test(r[col("Note")] ?? ""))).toBe(true);
    expect(rows.some((r) => /1 sale\(s\) have no inventory item linked/.test(r[0] ?? ""))).toBe(
      true,
    );
    const bad = await api(
      `/api/orgs/${orgId}/reports/sales-ledger.csv?from=2026-12-31&to=2026-01-01`,
      { as: userId },
    );
    expect(bad.status).toBe(400);

    // The same rows as QuickBooks Online journal entries: header first, every journal balanced, the
    // clearing account holding what the ledger says the platform kept.
    const qbo = await api(
      `/api/orgs/${orgId}/reports/quickbooks-journal.csv?from=2026-01-01&to=2026-12-31&cogs=1&account.sales=${encodeURIComponent("Income:Resale")}`,
      { as: userId },
    );
    expect(qbo.status).toBe(200);
    expect(qbo.headers.get("Content-Disposition")).toBe(
      "attachment; filename=quickbooks-journal-2026-01-01-to-2026-12-31.csv",
    );
    const jr = parseCsv(await qbo.text()).filter((r) => r.some((x) => x !== ""));
    expect(jr[0]).toEqual([
      "Journal No.",
      "Journal Date",
      "Account Name",
      "Journal/Description",
      "Debits",
      "Credits",
    ]);
    const cents = (v: string | undefined) => Math.round(Number(v || "0") * 100);
    const byJournal = new Map<string, number>();
    for (const r of jr.slice(1)) {
      expect(r[0]).toMatch(/^SB-ETSY-2026-\d\d$/);
      expect(r[1]).toMatch(/^\d\d\/\d\d\/2026$/);
      byJournal.set(r[0] ?? "", (byJournal.get(r[0] ?? "") ?? 0) + cents(r[4]) - cents(r[5]));
    }
    expect([...byJournal.values()].every((v) => v === 0)).toBe(true);
    const sum = (account: string) =>
      jr.filter((r) => r[2] === account).reduce((t, r) => t + cents(r[4]) - cents(r[5]), 0);
    expect(sum("Income:Resale")).toBeLessThan(0);
    expect(sum("Sales")).toBe(0);
    expect(sum("Cost of Goods Sold")).toBe(1000);
    expect(sum("Etsy Clearing")).toBe(9270 - 862 - 510);
    const badAccount = await api(
      `/api/orgs/${orgId}/reports/quickbooks-journal.csv?from=2026-01-01&to=2026-12-31&account.sales=${"x".repeat(101)}`,
      { as: userId },
    );
    expect(badAccount.status).toBe(400);
  });
});

describe("Shopify: the orders export and the Payments transactions together", () => {
  it("books sales from one file and fees from the other, once, into the worksheet", async () => {
    const { userId, orgId } = await setupTenant();
    const orders = await json<Summary>(
      await upload(userId, orgId, "shopify_orders_export", shopifyOrdersCsv, "orders_export_1.csv"),
    );
    expect(orders).toMatchObject({ salesCreated: 4, rowsSkipped: 2 });
    const tx = await json<Summary>(
      await upload(userId, orgId, "shopify_payments_transactions", shopifyTxCsv),
    );
    expect(tx).toMatchObject({ salesCreated: 2, chargesCreated: 4, rowsSkipped: 7 });
    const again = await json<Summary>(
      await upload(userId, orgId, "shopify_payments_transactions", shopifyTxCsv),
    );
    expect(again).toMatchObject({ salesCreated: 0, chargesCreated: 0, duplicatesSkipped: 6 });

    const ws = await json<{ lines: { line: string; amountCents: number | null }[] }>(
      await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026&mileageRate=70`, { as: userId }),
    );
    const line = (l: string) => ws.lines.find((x) => x.line === l)?.amountCents;
    // Goods + shipping: (8000 + 800) + 4500 + 3600. The charge rows' amounts are not counted again.
    expect(line("1")).toBe(16900);
    // The 20.00 refund; the chargeback and the won dispute cancel out.
    expect(line("2")).toBe(2000);
    // Processing fees 3.04 + 1.71 and the 15.00 chargeback-fee adjustment.
    expect(line("10")).toBe(1975);
  });
});

describe("Amazon: the Date Range Report", () => {
  it("books orders, the refund and account fees once, into the worksheet", async () => {
    const { userId, orgId } = await setupTenant();
    const first = await json<Summary>(
      await upload(
        userId,
        orgId,
        "amazon_date_range_report",
        amazonCsv,
        "2026MarMonthlyTransaction.csv",
      ),
    );
    expect(first).toMatchObject({ salesCreated: 3, chargesCreated: 6, rowsSkipped: 3 });
    const again = await json<Summary>(
      await upload(userId, orgId, "amazon_date_range_report", amazonCsv),
    );
    expect(again).toMatchObject({ salesCreated: 0, chargesCreated: 0, duplicatesSkipped: 9 });

    const ws = await json<{ lines: { line: string; amountCents: number | null }[] }>(
      await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026&mileageRate=70`, { as: userId }),
    );
    const line = (l: string) => ws.lines.find((x) => x.line === l)?.amountCents;
    // Goods + shipping: 25.00 + (39.00 + 5.99). Tax Amazon collected and withheld is not income.
    expect(line("1")).toBe(6999);
    expect(line("2")).toBe(2500);
    // The advertising row.
    expect(line("8")).toBe(1234);
    // Fees: 3.75 + 4.20 + 6.75 + 0.13 - 3.00 credited back + 3.21 x 2 storage - 8.50 reimbursement.
    expect(line("10")).toBe(975);
    // Part V: the selling plan (39.99) and the label bought through Amazon (6.10).
    expect(line("27a")).toBe(4609);
  });
});

describe("stock report", () => {
  it("ages unsold lot items, times the sold one and shows the lot's payback", async () => {
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
    // Links VASE-03 to Etsy order 3011111111, sold 2026-05-02.
    await upload(userId, orgId, "etsy_sold_orders", etsyOrdersCsv);

    const bad = await api(
      `/api/orgs/${orgId}/reports/stock?asOf=2026-06-01&from=2026-01-01&to=2026-07-01`,
      { as: userId },
    );
    expect(bad.status).toBe(400);

    const r = await json<{
      inStock: { items: number; costCents: number };
      aging: { key: string; items: number }[];
      sellThrough: { startItems: number; soldItems: number; percent: number | null };
      speed: { platform: string; sold: number; medianDays: number | null; proceedsCents: number }[];
      lots: {
        name: string;
        sold: number;
        inStock: number;
        proceedsCents: number;
        paybackCents: number;
      }[];
    }>(
      await api(`/api/orgs/${orgId}/reports/stock?asOf=2026-06-01&from=2026-01-01&to=2026-06-01`, {
        as: userId,
      }),
    );
    expect(r.inStock).toEqual({ items: 2, costCents: 2000 });
    // 2025-12-20 to 2026-06-01 is 163 days.
    expect(r.aging.find((b) => b.key === "91-180")?.items).toBe(2);
    expect(r.sellThrough).toMatchObject({ startItems: 3, soldItems: 1, percent: 33 });
    expect(r.speed).toHaveLength(1);
    expect(r.speed[0]).toMatchObject({ platform: "etsy", sold: 1, medianDays: 133 });
    // The order's proceeds from the report's own columns; the lot's payback is them less its cost.
    const proceeds = r.speed[0]?.proceedsCents ?? 0;
    // 38.00 − 3.80 coupon + 6.50 shipping. The sold-orders file carries no fees of its own (Etsy's fees
    // come in with the payment statement as account charges), so none are taken off this order.
    expect(proceeds).toBe(4070);
    expect(r.lots).toEqual([
      expect.objectContaining({
        name: "Estate sale haul",
        sold: 1,
        inStock: 2,
        proceedsCents: proceeds,
        paybackCents: proceeds - 3000,
      }),
    ]);
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
      "/reports/stock?asOf=2026-12-31&from=2026-01-01&to=2026-12-31",
      "/reports/sales-ledger.csv?from=2026-01-01&to=2026-12-31",
      "/reports/quickbooks-journal.csv?from=2026-01-01&to=2026-12-31",
    ]) {
      expect((await api(`/api/orgs/${a.orgId}${path}`, { as: b.userId })).status, path).toBe(404);
    }
    expect(
      (
        await api(`/api/orgs/${a.orgId}/reports/estimated-tax`, {
          method: "POST",
          as: b.userId,
          json: { year: 2026 },
        })
      ).status,
    ).toBe(404);
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
