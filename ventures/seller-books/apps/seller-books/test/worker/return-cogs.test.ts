// A sold item that came back on a refund (routes/org/sales.ts, "returned-items") reverses its cost of goods in
// the P&L, the sales ledger and the QuickBooks journal, in the refund's month: the same figure Schedule C
// Part III reaches through line 41, so the profit page and the worksheet agree. The eBay fixture sells
// SKU-JEANS-1 on 2026-01-05 (order 01-11111-22222) and refunds that order on 2026-02-02 ("Return accepted").
import { describe, expect, it } from "vitest";
import ebayCsv from "../fixtures/ebay-transaction-report.csv?raw";
import { api, json, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function setup() {
  const t = await setupTenant();
  const jeans = await json<{ id: string }>(
    await api(path(t, "/inventory/items"), {
      method: "POST",
      as: t.userId,
      json: { title: "Levi's 501", sku: "SKU-JEANS-1", acquiredDate: "2026-01-02", costCents: 700 },
    }),
  );
  const res = await api(path(t, "/imports"), {
    method: "POST",
    as: t.userId,
    json: { report: "ebay_transaction_report", fileName: "ebay.csv", csv: ebayCsv },
  });
  expect(res.status).toBe(201);
  const sales = await json<{ items: { id: string; kind: string; orderId: string | null }[] }>(
    await api(path(t, "/sales?limit=100"), { as: t.userId }),
  );
  const refund = sales.items.find((s) => s.kind === "refund" && s.orderId === "01-11111-22222");
  if (!refund) throw new Error("fixture changed: the jeans refund");
  return { ...t, jeansId: jeans.id, refundId: refund.id };
}

const pnl = async (t: Tenant) => {
  const r = await json<{
    cells: { platform: string; month: string; cogsCents: number; ordersWithoutCost: number }[];
    total: { cogsCents: number };
  }>(await api(path(t, "/reports/pnl?from=2026-01-01&to=2026-12-31"), { as: t.userId }));
  const month = (m: string) => r.cells.find((c) => c.platform === "ebay" && c.month === m);
  return { total: r.total.cogsCents, jan: month("2026-01"), feb: month("2026-02") };
};

const line42 = async (t: Tenant) => {
  const ws = await json<{ partIII: { line: string; amountCents: number }[] }>(
    await api(path(t, "/reports/schedule-c?year=2026&mileageRate=70"), { as: t.userId }),
  );
  return ws.partIII.find((x) => x.line === "42")?.amountCents;
};

const csv = async (t: Tenant, report: string) =>
  (
    await api(path(t, `/reports/${report}?from=2026-01-01&to=2026-12-31&cogs=1`), { as: t.userId })
  ).text();

const putBack = (t: Awaited<ReturnType<typeof setup>>) =>
  api(path(t, `/sales/${t.refundId}/returned-items`), {
    method: "POST",
    as: t.userId,
    json: { itemId: t.jeansId },
  });

describe("a return reverses cost of goods outside Part III too", () => {
  it("the P&L books the cost back in the refund's month and matches line 42", async () => {
    const t = await setup();
    // The jeans sold in January: their 700 is in cost of goods on both pages.
    expect((await pnl(t)).total).toBe(700);
    expect(await line42(t)).toBe(700);

    const res = await putBack(t);
    expect(res.status).toBe(201);
    const copyId = (await json<{ id: string }>(res)).id;

    const p = await pnl(t);
    expect(p.jan?.cogsCents).toBe(700);
    expect(p.feb?.cogsCents).toBe(-700);
    // A refund is never an order missing its cost.
    expect(p.feb?.ordersWithoutCost ?? 0).toBe(0);
    expect(p.total).toBe(0);
    expect(await line42(t)).toBe(0);

    // The ledger's refund row carries the reversal and says why; its total matches the P&L.
    const ledger = await csv(t, "sales-ledger.csv");
    const refundRow = ledger
      .split("\n")
      .find((l) => l.includes("Refund") && l.includes("01-11111"));
    expect(refundRow).toContain("-7.00");
    expect(refundRow).toContain("Returned to stock: Levi's 501");

    // QuickBooks: February's entry moves the cost from cost of goods back to inventory.
    const journal = await csv(t, "quickbooks-journal.csv");
    const feb = journal.split("\n").filter((l) => l.includes("SB-EBAY-2026-02"));
    const cogsLine = feb.find((l) => /cost of goods sold/.test(l) && /Cost of Goods Sold/i.test(l));
    expect(cogsLine).toBeDefined();
    expect(cogsLine).toContain("7.00");

    // Undo the return: back to the January cost alone.
    const undo = await api(path(t, `/sales/${t.refundId}/returned-items/${copyId}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(undo.status).toBe(200);
    expect((await pnl(t)).total).toBe(700);
  });

  it("a refund whose item stayed with the buyer reverses nothing", async () => {
    const t = await setup();
    const p = await pnl(t);
    expect(p.feb?.cogsCents ?? 0).toBe(0);
    const ledger = await csv(t, "sales-ledger.csv");
    expect(ledger).not.toContain("Returned to stock");
  });
});
