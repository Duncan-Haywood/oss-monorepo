// Late-payment interest sent to QuickBooks as its own invoice to the GC (docs/QUICKBOOKS.md,
// "Late-payment interest"): one line on the "Late Payment Interest" item, numbered LI + the
// application's invoice tail; sending marks the interest billed when it was not, and logs both;
// a marked figure and date are kept; refused when waived, not paid late, twice, or for a viewer; a
// retry finds the invoice a lost response created; marking it by hand sends nothing. Dates count
// back from today so the cash report's 365-day window never ages the fixture out.
import type {
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
  QuickBooksInterestInvoicesDto,
} from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// A $100,000 job, net 30, 1.5% a month from "Subcontract § 7.2"; #1 bills $50,000 (line 8 $45,000),
// dated 120 days ago, so due 90 days ago, and is paid in full 60 days ago: 30 days late, $675.
async function paidLate(opts: { connect?: boolean; sendInvoice?: boolean; plan?: string } = {}) {
  const { orgId, userId: as } = await setupTenant("owner");
  await grantPlan(orgId, opts.plan ?? "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Elm St clinic",
      number: "24-117",
      gcName: "Harbor Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
      payTermsDays: 30,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  await call(base, {
    method: "PATCH",
    as,
    json: {
      lateInterestBps: 150,
      lateInterestPer: "month",
      lateInterestSource: "Subcontract § 7.2",
    },
  });
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 10_000_000 }] },
  });
  const a = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: day(-150), periodTo: day(-120), applicationDate: day(-120) },
  });
  const appPath = `${base}/pay-apps/${a.id}`;
  await call(`${appPath}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: d.sovLines[0]?.id,
          workThisPeriodCents: 5_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${appPath}/submit`, { method: "POST", as });
  await call(`${appPath}/payments`, {
    method: "POST",
    as,
    expect: 201,
    json: { amountCents: 4_500_000, receivedOn: day(-60), reference: "CHK-881" },
  });
  let books = null as ReturnType<typeof fakeQuickBooks.books> | null;
  if (opts.connect !== false) {
    const { url } = await call<{ url: string }>(`/api/orgs/${orgId}/quickbooks/connect`, {
      method: "POST",
      as,
    });
    const u = new URL(url);
    await api(`${u.pathname}${u.search}`, { as, redirect: "manual" });
    if (opts.sendInvoice) await call(`${appPath}/quickbooks`, { method: "POST", as });
    const conn = await testDb()
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get();
    books = fakeQuickBooks.books(conn?.realmId ?? "");
  }
  return { orgId, as, appPath, payAppId: a.id, books };
}

const url = (t: { appPath: string }) => `${t.appPath}/quickbooks/interest-invoice`;
const cash = (t: { orgId: string; as: string }) =>
  call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
const list = (t: { orgId: string; as: string }) =>
  call<QuickBooksInterestInvoicesDto>(`/api/orgs/${t.orgId}/quickbooks/interest-invoices`, {
    as: t.as,
  });

describe("late-payment interest as a QuickBooks invoice", () => {
  it("invoices the interest once, marks it billed and logs both", async () => {
    const t = await paidLate({ sendInvoice: true });
    expect((await list(t)).invoices).toEqual([]);

    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(url(t), { method: "POST", as: viewer.id, expect: 403 });

    const out = await call<QuickBooksInterestInvoicesDto>(url(t), { method: "POST", as: t.as });
    expect(out.invoices).toEqual([
      expect.objectContaining({
        payAppId: t.payAppId,
        docNumber: "LI24-117-01",
        byHand: false,
        amountCents: 67_500,
        otherCompany: false,
      }),
    ]);
    const inv = await t.books?.findInvoiceByDocNumber("LI24-117-01");
    expect(inv).toMatchObject({ totalCents: 67_500, txnDate: day(0) });
    expect(inv?.lines).toHaveLength(1);
    expect(inv?.lines[0]?.description).toBe(
      `Interest on late payment of pay application #1, invoice PA24-117-01: $45,000.00 due ${day(-90)}, paid ${day(-60)}, 30 days late, at 1.5% a month (Subcontract § 7.2).`,
    );
    const item = [...(t.books?.items.values() ?? [])].find((i) => i.id === inv?.lines[0]?.itemId);
    expect(item?.name).toBe("Late Payment Interest");
    // Same customer as the application's own invoice.
    const payAppInvoice = await t.books?.findInvoiceByDocNumber("PA24-117-01");
    expect(inv?.customerId).toBe(payAppInvoice?.customerId);

    // Marked billed today with the invoice number, so it leaves the to-do list.
    const r = await cash(t);
    expect(r.projects[0]?.paidLate).toEqual([]);
    expect(r.projects[0]?.paidLateSettled[0]?.settled).toEqual({
      kind: "billed",
      on: day(0),
      cents: 67_500,
      note: "QuickBooks invoice LI24-117-01",
    });

    const again = await api(url(t), { method: "POST", as: t.as });
    expect(again.status).toBe(409);
    expect(t.books?.calls.filter((c) => c.method === "createInvoice")).toHaveLength(2);

    const hist = await call<{ items: { action: string; text?: string }[] }>(
      `${t.appPath}/history`,
      { as: t.as },
    );
    const actions = hist.items.map((i) => i.action);
    expect(actions).toContain("quickbooks_interest_sent");
    expect(actions).toContain("interest_billed");
  });

  it("keeps the figure and date of an earlier billed mark, and needs no pay-app invoice", async () => {
    const t = await paidLate();
    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      json: { settlement: "billed", on: day(-10), note: "Billing it separately" },
    });
    await call(url(t), { method: "POST", as: t.as });
    const inv = await t.books?.findInvoiceByDocNumber("LI24-117-01");
    expect(inv).toMatchObject({ totalCents: 67_500, txnDate: day(-10) });
    expect(inv?.lines[0]?.description).not.toContain("invoice PA");
    // The earlier note stands.
    const r = await cash(t);
    expect(r.projects[0]?.paidLateSettled[0]?.settled?.note).toBe("Billing it separately");
  });

  it("refuses waived interest, an application not paid late, and a plan without QuickBooks", async () => {
    const t = await paidLate();
    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      json: { settlement: "waived", on: day(-5) },
    });
    const waived = await api(url(t), { method: "POST", as: t.as });
    expect(waived.status).toBe(409);
    expect(t.books?.invoices.size).toBe(0);

    // No late-payment rate: nothing to invoice.
    const u = await paidLate();
    await call(u.appPath.replace(/\/pay-apps\/.*$/, ""), {
      method: "PATCH",
      as: u.as,
      json: { lateInterestBps: null },
    });
    expect((await api(url(u), { method: "POST", as: u.as })).status).toBe(409);

    const solo = await paidLate({ plan: "solo", connect: false });
    expect((await api(url(solo), { method: "POST", as: solo.as })).status).toBeGreaterThanOrEqual(
      400,
    );
  });

  it("records an invoice a lost response already created, and marks one entered by hand", async () => {
    const t = await paidLate();
    const customer = await t.books?.upsertCustomer({ displayName: "Harbor Builders" });
    const income = await t.books?.ensureAccount({ name: "Interest", accountType: "Income" });
    const item = await t.books?.ensureItem({
      name: "Late Payment Interest",
      type: "Service",
      incomeAccountId: income?.id ?? "",
    });
    const made = await t.books?.createInvoice({
      customerId: customer?.id ?? "",
      docNumber: "LI24-117-01",
      lines: [{ itemId: item?.id ?? "", amountCents: 67_500 }],
    });
    const out = await call<QuickBooksInterestInvoicesDto>(url(t), { method: "POST", as: t.as });
    expect(out.invoices[0]).toMatchObject({ invoiceId: made?.id, docNumber: "LI24-117-01" });
    expect(t.books?.invoices.size).toBe(1);

    const u = await paidLate();
    const marked = await call<QuickBooksInterestInvoicesDto>(`${url(u)}?already=1`, {
      method: "POST",
      as: u.as,
    });
    expect(marked.invoices[0]).toMatchObject({
      byHand: true,
      invoiceId: null,
      amountCents: 67_500,
    });
    expect(u.books?.invoices.size).toBe(0);
    const r = await cash(u);
    expect(r.projects[0]?.paidLateSettled[0]?.settled?.note).toBe("Entered in QuickBooks by hand");
  });

  it("refuses an invoice number QuickBooks already has for another amount", async () => {
    const t = await paidLate();
    const customer = await t.books?.upsertCustomer({ displayName: "Someone else" });
    const income = await t.books?.ensureAccount({ name: "Other", accountType: "Income" });
    const item = await t.books?.ensureItem({
      name: "X",
      type: "Service",
      incomeAccountId: income?.id ?? "",
    });
    await t.books?.createInvoice({
      customerId: customer?.id ?? "",
      docNumber: "LI24-117-01",
      lines: [{ itemId: item?.id ?? "", amountCents: 1_000 }],
    });
    const res = await api(url(t), { method: "POST", as: t.as });
    expect(res.status).toBe(409);
    // Nothing was marked.
    expect((await cash(t)).projects[0]?.paidLate).toHaveLength(1);
  });
});
