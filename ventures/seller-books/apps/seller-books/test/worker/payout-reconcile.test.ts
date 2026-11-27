// POST /reports/payout-reconcile: a bank statement's deposits against the payouts the books expect, held to
// the P&L's own figures; nothing stored; another shop's books answer 404.
import { describe, expect, it } from "vitest";
import poshCsv from "../fixtures/poshmark-my-sales-report.csv?raw";
import { api, json, setupTenant } from "./helpers";

type Res = {
  from: string;
  to: string;
  platforms: {
    platform: string;
    expectedCents: number;
    depositsCents: number;
    gapCents: number;
    status: string;
  }[];
  deposits: { line: number; platform: string | null; excluded: boolean }[];
  otherDepositsCents: number;
  findings: string[];
  disclaimer: string;
};

const check = (as: string, orgId: string, body: unknown) =>
  api(`/api/orgs/${orgId}/reports/payout-reconcile`, { method: "POST", as, json: body });

const dollars = (cents: number) => (cents / 100).toFixed(2);

describe("payout reconciliation", () => {
  it("sets the statement's deposits against the books' expected payouts", async () => {
    const { userId, orgId } = await setupTenant();
    const imported = await api(`/api/orgs/${orgId}/imports`, {
      method: "POST",
      as: userId,
      json: { report: "poshmark_my_sales_report", fileName: "posh.csv", csv: poshCsv },
    });
    expect(imported.status).toBe(201);
    const pnl = await json<{
      cells: {
        platform: string;
        month: string;
        revenueCents: number;
        feesCents: number;
        postageCents: number;
      }[];
    }>(await api(`/api/orgs/${orgId}/reports/pnl?from=2000-01-01&to=2100-12-31`, { as: userId }));
    const posh = pnl.cells.filter((c) => c.platform === "poshmark");
    expect(posh.length).toBeGreaterThan(0);
    const months = posh.map((c) => c.month).sort();
    const first = months[0] as string;
    const last = months.at(-1) as string;
    const expected = posh.reduce((s, c) => s + c.revenueCents - c.feesCents - c.postageCents, 0);

    const csv = [
      "Date,Description,Debit,Credit",
      `${first}-01,USPS POSTAGE,9.99,`,
      `${last}-27,ACH POSHMARK INC PAYOUT,,${dollars(expected)}`,
      `${last}-28,ZELLE FROM A FRIEND,,40.00`,
    ].join("\n");
    const res = await check(userId, orgId, { csv });
    expect(res.status).toBe(200);
    const r = await json<Res>(res);
    expect(r.from).toBe(`${first}-01`);
    expect(r.to).toBe(`${last}-28`);
    expect(r.platforms).toEqual([
      expect.objectContaining({
        platform: "poshmark",
        expectedCents: expected,
        depositsCents: expected,
        gapCents: 0,
        status: "matches",
      }),
    ]);
    expect(r.otherDepositsCents).toBe(4000);
    expect(r.disclaimer).toMatch(/not tax or accounting advice/);

    // Excluding the payout line leaves Poshmark with no deposits.
    const payoutLine = r.deposits.find((d) => d.platform === "poshmark")?.line;
    const excluded = await json<Res>(await check(userId, orgId, { csv, exclude: [payoutLine] }));
    expect(excluded.platforms[0]?.status).toBe("no_deposits");

    // A file that is not a statement is refused with the importer's message.
    expect((await check(userId, orgId, { csv: "foo,bar\n1,2" })).status).toBe(400);
  });

  it("answers 404 for another shop's books and is open to a viewer", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const csv =
      "Date,Description,Amount\n2026-01-05,EBAY COMMERCE,-10.00\n2026-01-06,STAPLES,25.00";
    expect((await check(b.userId, a.orgId, { csv })).status).toBe(404);
    const v = await setupTenant("viewer");
    expect((await check(v.userId, v.orgId, { csv })).status).toBe(200);
  });
});
