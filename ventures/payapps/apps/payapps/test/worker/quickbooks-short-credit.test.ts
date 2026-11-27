// A balance closed short sent to QuickBooks as a credit memo applied to the pay application's
// invoice (docs/QUICKBOOKS.md, "Balance closed short"): only once every payment is there and the
// invoice's open balance is exactly what PayApps can account for; QuickBooks applying the credit on
// its own, to this invoice or another; a retry after a lost response; marking it by hand; reopening
// asks first; roles and tenancy.
import type {
  PayAppDetailDto,
  PayAppQuickBooksDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

// A $100,000 job, 10% retainage; application #1 bills $50,000 of work, so line 8 (the invoice) is
// $45,000. The GC pays $40,000 and backcharges the rest.
async function invoicedApp(opts: { certifiedAmountCents?: number } = {}) {
  const { orgId, userId: as } = await setupTenant("owner");
  await grantPlan(orgId, "crew", "active");
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
    },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
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
    json: { periodFrom: "2026-10-01", periodTo: "2026-10-31", applicationDate: "2026-10-31" },
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
  if (opts.certifiedAmountCents !== undefined) {
    await call(`${appPath}/certify`, {
      method: "POST",
      as,
      json: { certifiedAmountCents: opts.certifiedAmountCents },
    });
  }
  const { url } = await call<{ url: string }>(`/api/orgs/${orgId}/quickbooks/connect`, {
    method: "POST",
    as,
  });
  const u = new URL(url);
  await api(`${u.pathname}${u.search}`, { as, redirect: "manual" });
  await call<PayAppQuickBooksDto>(`${appPath}/quickbooks`, { method: "POST", as });
  const conn = await testDb()
    .select()
    .from(qboConnections)
    .where(eq(qboConnections.orgId, orgId))
    .get();
  const books = fakeQuickBooks.books(conn?.realmId ?? "");
  const invoice = await books.findInvoiceByDocNumber("PA24-117-01");
  if (!invoice) throw new Error("invoice not sent");
  return { orgId, as, appPath, books, invoiceId: invoice.id, customerId: invoice.customerId };
}

async function payAndClose(t: Awaited<ReturnType<typeof invoicedApp>>, send = true) {
  const paid = await call<PayAppDetailDto>(`${t.appPath}/payments`, {
    method: "POST",
    as: t.as,
    expect: 201,
    json: { amountCents: 4_000_000, receivedOn: "2026-11-18", reference: "CHK-881" },
  });
  if (send) {
    await call(`${t.appPath}/payments/${paid.payments[0]?.id}/quickbooks`, {
      method: "POST",
      as: t.as,
    });
  }
  await call(`${t.appPath}/close-short`, {
    method: "POST",
    as: t.as,
    json: { reason: "backcharge", closedOn: "2026-11-20", note: "Cleanup, GC letter 11/19" },
  });
}

const creditUrl = (t: { appPath: string }) => `${t.appPath}/quickbooks/short-credit`;
const balance = async (t: Awaited<ReturnType<typeof invoicedApp>>) =>
  (await t.books.getInvoice(t.invoiceId))?.balanceCents;

describe("balance closed short as a QuickBooks credit memo", () => {
  it("credits the backcharge on the invoice, once, and logs it", async () => {
    const t = await invoicedApp();
    await payAndClose(t);
    expect(await balance(t)).toBe(500_000);
    const before = await call<PayAppQuickBooksDto>(`${t.appPath}/quickbooks`, { as: t.as });
    expect(before.shortCredit).toEqual({
      cents: 500_000,
      reason: "backcharge",
      closedOn: "2026-11-20",
      sent: null,
      waitingFor: null,
    });

    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    await call(creditUrl(t), { method: "POST", as: viewer.id, expect: 403 });

    const out = await call<PayAppQuickBooksDto>(creditUrl(t), { method: "POST", as: t.as });
    expect(out.shortCredit?.sent).toMatchObject({
      docNumber: "CR24-117-01",
      byHand: false,
      applied: true,
    });
    expect(await balance(t)).toBe(0);
    const memo = await t.books.findCreditMemoByDocNumber("CR24-117-01");
    expect(memo).toMatchObject({ totalCents: 500_000, remainingCents: 0, txnDate: "2026-11-20" });
    const created = t.books.calls.find((c) => c.method === "createCreditMemo")?.input as {
      lines: { amountCents: number; description: string; itemId: string }[];
    };
    expect(created.lines).toHaveLength(1);
    expect(created.lines[0]?.description).toBe(
      "Backcharge, pay application #1: Cleanup, GC letter 11/19",
    );
    // Posted to the same item as the invoice's work lines.
    const inv = await t.books.getInvoice(t.invoiceId);
    expect(created.lines[0]?.itemId).toBe(inv?.lines[0]?.itemId);

    const again = await api(creditUrl(t), { method: "POST", as: t.as });
    expect(again.status).toBe(409);
    expect(t.books.calls.filter((c) => c.method === "createCreditMemo")).toHaveLength(1);

    const hist = await call<{ items: { action: string; text?: string }[] }>(
      `${t.appPath}/history`,
      { as: t.as },
    );
    expect(hist.items.map((i) => i.action)).toContain("quickbooks_credit_sent");
  });

  it("waits until every payment is in QuickBooks", async () => {
    const t = await invoicedApp();
    await payAndClose(t, false);
    const q = await call<PayAppQuickBooksDto>(`${t.appPath}/quickbooks`, { as: t.as });
    expect(q.shortCredit?.waitingFor).toMatch(/payment above first/);
    const res = await api(creditUrl(t), { method: "POST", as: t.as });
    expect(res.status).toBe(409);
    expect(t.books.creditMemos.size).toBe(0);
  });

  it("sends nothing when QuickBooks shows a credit or payment PayApps does not know about", async () => {
    const t = await invoicedApp();
    await payAndClose(t);
    // The bookkeeper already entered a $2,000 credit by hand.
    await t.books.recordPayment({
      customerId: t.customerId,
      totalCents: 200_000,
      applyTo: [{ invoiceId: t.invoiceId, amountCents: 200_000 }],
    });
    const res = await api(creditUrl(t), { method: "POST", as: t.as });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "quickbooks_balance_mismatch",
    );
    expect(t.books.creditMemos.size).toBe(0);
    // Marking it by hand records it and sends nothing.
    const marked = await call<PayAppQuickBooksDto>(`${creditUrl(t)}?already=1`, {
      method: "POST",
      as: t.as,
    });
    expect(marked.shortCredit?.sent).toMatchObject({ byHand: true, creditMemoId: null });
    expect(t.books.creditMemos.size).toBe(0);
  });

  it("uses QuickBooks' own automatic application, and says so when it landed elsewhere", async () => {
    // Only this invoice is open: QuickBooks applies the credit to it, and PayApps applies nothing.
    const t = await invoicedApp();
    await payAndClose(t);
    t.books.autoApplyCredits = true;
    const out = await call<PayAppQuickBooksDto>(creditUrl(t), { method: "POST", as: t.as });
    expect(out.shortCredit?.sent?.applied).toBe(true);
    expect(t.books.calls.some((c) => c.method === "applyCreditMemo")).toBe(false);
    expect(await balance(t)).toBe(0);
    t.books.autoApplyCredits = false;

    // An older open invoice of the same GC takes the credit first.
    const u = await invoicedApp();
    await payAndClose(u);
    const item = [...u.books.items.values()].find((i) => i.name === "Contract Billing");
    const older = await u.books.createInvoice({
      customerId: u.customerId,
      lines: [{ itemId: item?.id ?? "", amountCents: 900_000 }],
    });
    // Make it the oldest by re-inserting the job's invoice after it.
    const ours = u.books.invoices.get(u.invoiceId);
    if (ours) {
      u.books.invoices.delete(u.invoiceId);
      u.books.invoices.set(u.invoiceId, ours);
    }
    u.books.autoApplyCredits = true;
    const elsewhere = await call<PayAppQuickBooksDto>(creditUrl(u), { method: "POST", as: u.as });
    u.books.autoApplyCredits = false;
    expect(elsewhere.shortCredit?.sent?.applied).toBe(false);
    expect(await balance(u)).toBe(500_000);
    expect((await u.books.getInvoice(older.id))?.balanceCents).toBe(400_000);
    // Reopening (after confirming) forgets the credit; the memo stays in QuickBooks.
    const late = await call<PayAppDetailDto>(`${u.appPath}/close-short?confirmQuickBooks=1`, {
      method: "DELETE",
      as: u.as,
    });
    expect(late.status).not.toBe("paid");
  });

  it("records a credit memo a lost response already created, without a second one", async () => {
    const t = await invoicedApp();
    await payAndClose(t);
    const item = [...t.books.items.values()].find((i) => i.name === "Contract Billing");
    const memo = await t.books.createCreditMemo({
      customerId: t.customerId,
      docNumber: "CR24-117-01",
      lines: [{ itemId: item?.id ?? "", amountCents: 500_000 }],
    });
    await t.books.applyCreditMemo({
      customerId: t.customerId,
      invoiceId: t.invoiceId,
      creditMemoId: memo.id,
      amountCents: 500_000,
    });
    const out = await call<PayAppQuickBooksDto>(creditUrl(t), { method: "POST", as: t.as });
    expect(out.shortCredit?.sent).toMatchObject({ creditMemoId: memo.id, applied: true });
    expect(t.books.creditMemos.size).toBe(1);
    expect(await balance(t)).toBe(0);
  });

  it("credits the certified-below-billed difference with the balance closed short", async () => {
    // Billed $45,000, certified $44,000, paid $40,000: $4,000 closed short, $5,000 open in QuickBooks.
    const t = await invoicedApp({ certifiedAmountCents: 4_400_000 });
    await payAndClose(t);
    const out = await call<PayAppQuickBooksDto>(creditUrl(t), { method: "POST", as: t.as });
    expect(out.shortCredit?.cents).toBe(400_000);
    expect(await balance(t)).toBe(0);
    const created = t.books.calls.find((c) => c.method === "createCreditMemo")?.input as {
      lines: { amountCents: number; description: string }[];
    };
    expect(created.lines.map((l) => l.amountCents)).toEqual([400_000, 100_000]);
    expect(created.lines[1]?.description).toMatch(/Certified by the GC at \$44,000\.00/);
  });

  it("asks before reopening a balance that is a credit in QuickBooks", async () => {
    const t = await invoicedApp();
    await payAndClose(t);
    await call(creditUrl(t), { method: "POST", as: t.as });
    const res = await api(`${t.appPath}/close-short`, { method: "DELETE", as: t.as });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("credit_in_quickbooks");
    expect(body.error.message).toMatch(/CR24-117-01/);
    await call(`${t.appPath}/close-short?confirmQuickBooks=1`, { method: "DELETE", as: t.as });
    const q = await call<PayAppQuickBooksDto>(`${t.appPath}/quickbooks`, { as: t.as });
    expect(q.shortCredit).toBeNull();
  });

  it("another company cannot read or send this company's credit", async () => {
    const t = await invoicedApp();
    await payAndClose(t);
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const res = await api(creditUrl(t), { method: "POST", as: other.userId });
    expect(res.status).toBe(404);
    const theirs = creditUrl(t).replace(`/orgs/${t.orgId}/`, `/orgs/${other.orgId}/`);
    const res2 = await api(theirs, { method: "POST", as: other.userId });
    expect(res2.status).toBe(404);
    expect(t.books.creditMemos.size).toBe(0);
  });
});
