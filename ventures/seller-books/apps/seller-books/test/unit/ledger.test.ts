import { parseCsv, toCsv } from "@shared/csv";
import {
  buildSalesLedger,
  type LedgerSaleInput,
  ledgerCsvRows,
} from "@worker/services/books/ledger";
import { buildPnl } from "@worker/services/books/pnl";
import { describe, expect, it } from "vitest";

const base: Omit<LedgerSaleInput, "kind" | "date"> = {
  platform: "ebay",
  orderId: "12-3456",
  title: "Wool coat",
  sku: "COAT-1",
  quantity: 1,
  itemCents: 0,
  shippingChargedCents: 0,
  salesTaxCents: 0,
  refundCents: 0,
  shippingLabelCents: 0,
  netCents: null,
  fees: [],
  item: null,
};

const sales: LedgerSaleInput[] = [
  {
    ...base,
    kind: "order",
    date: "2026-03-02",
    itemCents: 5000,
    shippingChargedCents: 800,
    salesTaxCents: 400,
    shippingLabelCents: 650,
    netCents: 4310,
    fees: [
      { kind: "final_value", amountCents: 765 },
      { kind: "per_order", amountCents: 40 },
      { kind: "final_value", amountCents: 35 },
    ],
    item: { title: "Wool coat (thrift)", costCents: 1200 },
  },
  {
    ...base,
    platform: "poshmark",
    orderId: "p1",
    title: '=HYPERLINK("x")',
    sku: null,
    kind: "order",
    date: "2026-03-01",
    itemCents: 2000,
    fees: [{ kind: "marketplace_fee", amountCents: 400 }],
  },
  {
    ...base,
    kind: "refund",
    date: "2026-03-20",
    refundCents: 1500,
    fees: [{ kind: "final_value", amountCents: -200 }],
  },
  { ...base, kind: "order", date: "2027-01-01", itemCents: 9999 },
];

const charges = [
  {
    platform: "ebay",
    date: "2026-03-05",
    kind: "shipping_label",
    amountCents: 300,
    orderId: null,
    description: "Label",
  },
  {
    platform: "ebay",
    date: "2026-03-06",
    kind: "advertising",
    amountCents: 250,
    orderId: null,
    description: "Promoted listings",
  },
  {
    platform: "ebay",
    date: "2026-03-07",
    kind: "subscription",
    amountCents: 2195,
    orderId: null,
    description: "Store",
  },
];

describe("buildSalesLedger", () => {
  const ledger = buildSalesLedger("2026-01-01", "2026-12-31", { sales, charges });

  it("lists rows in the range by date, with the P&L's per-row arithmetic", () => {
    expect(ledger.rows.map((r) => [r.date, r.type])).toEqual([
      ["2026-03-01", "Sale"],
      ["2026-03-02", "Sale"],
      ["2026-03-05", "Account charge: Shipping label"],
      ["2026-03-06", "Account charge: Ads / promoted listings"],
      ["2026-03-07", "Account charge: Subscription"],
      ["2026-03-20", "Refund"],
    ]);
    const coat = ledger.rows[1];
    expect(coat).toMatchObject({
      revenueCents: 5800,
      feesCents: 840,
      postageCents: 650,
      cogsCents: 1200,
      grossProfitCents: 5800 - 840 - 650 - 1200,
      salesTaxCollectedCents: 400,
      netPerReportCents: 4310,
      feeDetail: "Final value fee 8.00; Per-order fee 0.40",
      note: "Cost from inventory item: Wool coat (thrift)",
    });
    expect(ledger.rows[0]?.note).toMatch(/No inventory item linked/);
    expect(ledger.rows[5]).toMatchObject({
      revenueCents: -1500,
      feesCents: -200,
      grossProfitCents: -1300,
    });
    expect(ledger.rows[4]).toMatchObject({ subscriptionCents: 2195, grossProfitCents: 0 });
    expect(ledger.totals.ordersWithoutCost).toBe(1);
  });

  it("totals to the P&L's revenue, fees, postage, cost of goods and gross profit", () => {
    const pnl = buildPnl("2026-01-01", "2026-12-31", {
      sales: sales.map((s) => ({ ...s, cogsCents: s.item?.costCents ?? null })),
      charges,
      expenses: [],
    });
    const t = pnl.total;
    expect(ledger.totals).toMatchObject({
      revenueCents: t.revenueCents,
      feesCents: t.feesCents,
      postageCents: t.postageCents,
      cogsCents: t.cogsCents,
      grossProfitCents: t.grossProfitCents,
      subscriptionCents: t.expensesCents,
      salesTaxCollectedCents: t.salesTaxCollectedCents,
    });
  });

  it("writes a CSV that round-trips and neutralises formula-like titles", () => {
    const rows = parseCsv(toCsv(ledgerCsvRows(ledger, (p) => p.toUpperCase())));
    const header = rows.findIndex((r) => r[0] === "Date");
    const head = rows[header] ?? [];
    expect(head).toContain("Gross profit");
    const posh = rows[header + 1] ?? [];
    expect(posh[head.indexOf("Platform")]).toBe("POSHMARK");
    expect(posh[head.indexOf("Title / description")]).toBe('\'=HYPERLINK("x")');
    const total = rows.find((r) => r[0] === "Total") ?? [];
    expect(total[head.indexOf("Gross profit")]).toBe(
      (ledger.totals.grossProfitCents / 100).toFixed(2),
    );
    expect(rows.some((r) => /1 sale\(s\) have no inventory item linked/.test(r[0] ?? ""))).toBe(
      true,
    );
    expect(rows[1]?.[0]).toMatch(/not a tax return and not tax advice/);
  });
});
