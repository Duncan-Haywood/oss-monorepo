// QuickBooks Online through the HTTP API with the fake gateway (ports/accounting.ts): plan gate,
// connect (single-use state bound to the admin), encrypted tokens, sending a pay application as an
// invoice whose total is line 8, idempotency, roles and tenant isolation.

import type {
  PayAppDetailDto,
  PayAppQuickBooksDto,
  ProjectDetailDto,
  ProjectDto,
  QuickBooksStatusDto,
} from "@shared/api/types";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { invoiceBillEmail } from "@worker/services/quickbooks";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let app1: string;
let app2: string;

async function connect(org: string, user: string) {
  const { url } = await call<{ url: string }>(`/api/orgs/${org}/quickbooks/connect`, {
    method: "POST",
    as: user,
  });
  const u = new URL(url);
  const res = await api(`${u.pathname}${u.search}`, { as: user, redirect: "manual" });
  return { res, location: res.headers.get("location") ?? "", state: u.searchParams.get("state") };
}

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Mesa Clinic TI",
      number: "24-117",
      gcName: "Copper State Builders",
      originalContractSumCents: 10_000_000,
      payTermsDays: 30,
    },
  });
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      lines: [
        { itemNumber: "1", description: "Rough-in", originalCents: 6_000_000 },
        { itemNumber: "2", description: "Fixtures", originalCents: 4_000_000 },
      ],
    },
  });
  const [l1, l2] = d.sovLines;
  const mk = async (from: string, to: string, lines: unknown[]) => {
    const a = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: from, periodTo: to, applicationDate: to },
    });
    await call(`${base}/pay-apps/${a.id}/lines`, { method: "PUT", as, json: { lines } });
    return a.id;
  };
  const line = (id: string | undefined, work: number, stored = 0) => ({
    sovLineId: id,
    workThisPeriodCents: work,
    storedMaterialsCents: stored,
    retainageReleasedCents: 0,
  });
  app1 = await mk("2026-10-01", "2026-10-31", [line(l1?.id, 2_000_000), line(l2?.id, 0, 500_000)]);
  await call(`${base}/pay-apps/${app1}/submit`, { method: "POST", as });
  app2 = await mk("2026-11-01", "2026-11-30", [line(l1?.id, 1_000_000)]);
});

describe("QuickBooks Online", () => {
  it("is part of Crew and up: Free sees the status but cannot connect", async () => {
    const s = await call<QuickBooksStatusDto>(`/api/orgs/${orgId}/quickbooks`, { as });
    expect(s).toMatchObject({
      available: true,
      mode: "fake",
      planIncludes: false,
      connection: null,
    });
    const res = await api(`/api/orgs/${orgId}/quickbooks/connect`, { method: "POST", as });
    expect(res.status).toBe(402);
  });

  it("previews a sent application as an invoice that totals line 8", async () => {
    await grantPlan(orgId, "crew", "active");
    const q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    const detail = await call<PayAppDetailDto>(`${base}/pay-apps/${app1}`, { as });
    expect(q.sent).toBeNull();
    expect(q.preview?.docNumber).toBe("PA24-117-01");
    expect(q.preview?.customerName).toBe("Copper State Builders");
    const total = q.preview?.lines.reduce((s, l) => s + l.amountCents, 0);
    expect(total).toBe(q.preview?.totalCents);
    expect(q.preview?.totalCents).toBe(detail.computed.summary.currentPaymentDueCents);
    expect(q.preview?.lines.at(-1)?.kind).toBe("retainage_held");
    // No GC billing contact yet: the invoice would go without a billing email, and says so.
    expect(q.preview?.billEmail).toBeNull();
    expect(q.preview?.billEmailNote).toMatch(/add the GC billing contact on the job page/);
    await call(base, { method: "PATCH", as, json: { gcBillingEmail: "ap@copperstate.example" } });
    const withContact = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, {
      as,
    });
    expect(withContact.preview?.billEmail).toBe("ap@copperstate.example");
    expect(withContact.preview?.billEmailNote).toBeNull();
    const draft = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app2}/quickbooks`, { as });
    expect(draft.preview).toBeNull();
    expect(draft.previewProblem).toMatch(/Submit the application first/);
  });

  it("leaves off a billing email QuickBooks would refuse instead of failing the send", () => {
    // The job form takes up to 254 characters; QuickBooks takes 100.
    const long = `${"a".repeat(100)}@builder.example`;
    expect(invoiceBillEmail(long)).toMatchObject({ billEmail: null });
    expect(invoiceBillEmail(long).billEmailNote).toMatch(/longer than QuickBooks takes \(100/);
    expect(invoiceBillEmail(" ap@builder.example ")).toEqual({
      billEmail: "ap@builder.example",
      billEmailNote: null,
    });
    expect(invoiceBillEmail(null).billEmail).toBeNull();
  });

  it("refuses to send before a company is connected", async () => {
    const res = await api(`${base}/pay-apps/${app1}/quickbooks`, { method: "POST", as });
    expect(res.status).toBe(409);
  });

  it("connects through a single-use state bound to the admin, and stores tokens encrypted", async () => {
    // Another user cannot finish an admin's connection.
    const stranger = await createTestUser();
    const { url } = await call<{ url: string }>(`/api/orgs/${orgId}/quickbooks/connect`, {
      method: "POST",
      as,
    });
    const u = new URL(url);
    const stolen = await api(`${u.pathname}${u.search}`, { as: stranger.id, redirect: "manual" });
    expect(stolen.headers.get("location")).toBe("/?quickbooks_error=unknown_state");
    // The state was consumed by that attempt: the admin's own replay is refused too.
    const replay = await api(`${u.pathname}${u.search}`, { as, redirect: "manual" });
    expect(replay.headers.get("location")).toBe("/?quickbooks_error=unknown_state");

    const ok = await connect(orgId, as);
    expect(ok.location).toBe(`/orgs/${orgId}/quickbooks?connected=1`);
    const row = await testDb()
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get();
    expect(row?.tokensEnc.startsWith("v1.")).toBe(true);
    expect(row?.tokensEnc).not.toContain("fake-access");
    expect(row?.tokensEnc).not.toContain("fake-refresh");
    const s = await call<QuickBooksStatusDto>(`/api/orgs/${orgId}/quickbooks`, { as });
    expect(s.connection?.realmId).toBe(row?.realmId);
  });

  it("only admins connect; viewers cannot send", async () => {
    const editor = await createTestUser();
    const viewer = await createTestUser();
    await addToOrg(orgId, editor.id, "editor");
    await addToOrg(orgId, viewer.id, "viewer");
    const r1 = await api(`/api/orgs/${orgId}/quickbooks/connect`, {
      method: "POST",
      as: editor.id,
    });
    expect(r1.status).toBe(403);
    const r2 = await api(`${base}/pay-apps/${app1}/quickbooks`, { method: "POST", as: viewer.id });
    expect(r2.status).toBe(403);
  });

  it("sends the application once: customer, retainage setup and the invoice", async () => {
    const sent = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, {
      method: "POST",
      as,
    });
    expect(sent.sent?.docNumber).toBe("PA24-117-01");
    expect(sent.sent?.totalCents).toBe(sent.preview?.totalCents);
    const row = await testDb()
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get();
    const books = fakeQuickBooks.books(row?.realmId ?? "");
    const invoice = await books.findInvoiceByDocNumber("PA24-117-01");
    expect(invoice?.totalCents).toBe(sent.sent?.totalCents);
    expect(invoice?.txnDate).toBe("2026-10-31");
    expect(invoice?.dueDate).toBe("2026-11-30");
    // The job's GC billing contact is the invoice's own billing email, not the customer's.
    expect(invoice?.billEmail).toBe("ap@copperstate.example");
    const customer = await books.findCustomerByDisplayName("Copper State Builders");
    expect(invoice?.customerId).toBe(customer?.id);
    const retainageItem = await books.findItemByName("Retainage");
    const held = invoice?.lines.filter((l) => l.itemId === retainageItem?.id) ?? [];
    expect(held).toHaveLength(1);
    expect(held[0]?.amountCents).toBeLessThan(0);
    // Sending again is refused rather than duplicated.
    const again = await api(`${base}/pay-apps/${app1}/quickbooks`, { method: "POST", as });
    expect(again.status).toBe(409);
    expect(books.calls.filter((c) => c.method === "createInvoice")).toHaveLength(1);
  });

  it("sends payments received to QuickBooks against the invoice, once each", async () => {
    const detail = await call<PayAppDetailDto>(`${base}/pay-apps/${app1}`, { as });
    const first = Math.floor(detail.expectedCents / 2);
    await call(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: first, receivedOn: "2026-11-20", reference: "CHK-10422" },
    });
    const q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    expect(q.payments).toHaveLength(1);
    const pay = q.payments[0];
    expect(pay).toMatchObject({ amountCents: first, reference: "CHK-10422", sent: null });
    const url = `${base}/pay-apps/${app1}/payments/${pay?.paymentId}/quickbooks`;

    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await api(url, { method: "POST", as: viewer.id })).status).toBe(403);

    const conn = await testDb()
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get();
    const books = fakeQuickBooks.books(conn?.realmId ?? "");
    const invoice = await books.findInvoiceByDocNumber("PA24-117-01");
    const sent = await call<PayAppQuickBooksDto>(url, { method: "POST", as });
    expect(sent.payments[0]?.sent?.byHand).toBe(false);
    const qboId = sent.payments[0]?.sent?.qboPaymentId ?? "";
    const created = await books.getPayment(qboId);
    expect(created).toMatchObject({
      customerId: invoice?.customerId,
      totalCents: first,
      txnDate: "2026-11-20",
      paymentRefNum: "CHK-10422",
      appliedTo: [{ invoiceId: invoice?.id, amountCents: first }],
    });
    const call0 = books.calls.find((c) => c.method === "recordPayment");
    expect((call0?.input as { requestId?: string } | undefined)?.requestId).toMatch(
      /^[0-9a-f]{32}$/,
    );
    expect((await books.getInvoice(invoice?.id ?? ""))?.balanceCents).toBe(
      (invoice?.totalCents ?? 0) - first,
    );

    // Once each: a second send is refused and nothing more reaches QuickBooks.
    expect((await api(url, { method: "POST", as })).status).toBe(409);
    expect(books.calls.filter((c) => c.method === "recordPayment")).toHaveLength(1);
  });

  it("sends nothing when QuickBooks shows a payment PayApps does not know about", async () => {
    await call(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: 100_000, receivedOn: "2026-11-21", reference: null },
    });
    const q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    const second = q.payments.find((p) => p.sent === null);
    const conn = await testDb()
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get();
    const books = fakeQuickBooks.books(conn?.realmId ?? "");
    const invoice = await books.findInvoiceByDocNumber("PA24-117-01");
    // The bookkeeper entered the same check in QuickBooks by hand.
    await books.recordPayment({
      customerId: invoice?.customerId ?? "",
      totalCents: 100_000,
      applyTo: [{ invoiceId: invoice?.id ?? "", amountCents: 100_000 }],
    });
    const calls = books.calls.filter((c) => c.method === "recordPayment").length;
    const url = `${base}/pay-apps/${app1}/payments/${second?.paymentId}/quickbooks`;
    const res = await api(url, { method: "POST", as });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("quickbooks_balance_mismatch");
    expect(body.error.message).toMatch(/nothing was sent/);
    expect(books.calls.filter((c) => c.method === "recordPayment")).toHaveLength(calls);

    const marked = await call<PayAppQuickBooksDto>(`${url}?already=1`, { method: "POST", as });
    const row = marked.payments.find((p) => p.paymentId === second?.paymentId);
    expect(row?.sent).toMatchObject({ byHand: true, qboPaymentId: null });
    expect(books.calls.filter((c) => c.method === "recordPayment")).toHaveLength(calls);
  });

  it("asks before deleting a payment that is in QuickBooks", async () => {
    const q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    const second = q.payments.at(-1);
    const url = `${base}/pay-apps/${app1}/payments/${second?.paymentId}`;
    const res = await api(url, { method: "DELETE", as });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "payment_in_quickbooks",
    );
    await call(`${url}?confirmQuickBooks=1`, { method: "DELETE", as });
    const after = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    expect(after.payments.map((p) => p.paymentId)).not.toContain(second?.paymentId);
  });

  it("sends each payment as it is recorded once an admin turns that on, never blocking the record", async () => {
    const auto = `/api/orgs/${orgId}/quickbooks/auto-payments`;
    const editorUser = await createTestUser();
    await addToOrg(orgId, editorUser.id, "editor");
    await call(auto, { method: "PUT", as: editorUser.id, expect: 403, json: { enabled: true } });
    await call(auto, { method: "PUT", as, expect: 400, json: { enabled: "yes" } });

    const conn = await testDb()
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get();
    const books = fakeQuickBooks.books(conn?.realmId ?? "");
    const invoice = await books.findInvoiceByDocNumber("PA24-117-01");
    const sends = () => books.calls.filter((c) => c.method === "recordPayment").length;
    // The earlier test deleted here a $1,000 check that stays in QuickBooks: record it again and
    // mark it as already there, so both sides agree before the automatic sends.
    await call(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: 100_000, receivedOn: "2026-11-21", reference: "CHK-10450" },
    });
    const realign = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    const prior = realign.payments.find((p) => p.reference === "CHK-10450");
    await call(`${base}/pay-apps/${app1}/payments/${prior?.paymentId}/quickbooks?already=1`, {
      method: "POST",
      as,
    });

    type Recorded = PayAppDetailDto & {
      quickbooksAuto?: { sent: boolean; message: string | null } | null;
    };

    const on = await call<QuickBooksStatusDto>(auto, {
      method: "PUT",
      as,
      json: { enabled: true },
    });
    expect(on.connection?.autoSendPayments).toBe(true);

    // Recorded, then sent at once: a QuickBooks payment against the invoice.
    let before = sends();
    const r1 = await call<Recorded>(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as: editorUser.id,
      expect: 201,
      json: { amountCents: 50_000, receivedOn: "2026-11-22", reference: "CHK-10500" },
    });
    expect(r1.quickbooksAuto).toEqual({ sent: true, message: null });
    expect(sends()).toBe(before + 1);
    let q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    const p1 = q.payments.find((p) => p.reference === "CHK-10500");
    expect(p1?.sent).toMatchObject({ byHand: false });
    expect(p1?.sent?.qboPaymentId).toBeTruthy();
    // Its history says it went to QuickBooks.
    const hist = await call<{ items: { action: string }[] }>(`${base}/pay-apps/${app1}/history`, {
      as,
    });
    expect(hist.items.map((e) => e.action)).toContain("quickbooks_payment_sent");

    // QuickBooks shows a check PayApps does not know: recorded here, nothing sent, reason given.
    await books.recordPayment({
      customerId: invoice?.customerId ?? "",
      totalCents: 25_000,
      applyTo: [{ invoiceId: invoice?.id ?? "", amountCents: 25_000 }],
    });
    before = sends();
    const r2 = await call<Recorded>(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: 25_000, receivedOn: "2026-11-23", reference: "CHK-10501" },
    });
    expect(r2.quickbooksAuto?.sent).toBe(false);
    expect(r2.quickbooksAuto?.message).toMatch(/nothing was sent/);
    expect(sends()).toBe(before);
    expect(r2.payments.map((p) => p.reference)).toContain("CHK-10501");
    q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    expect(q.payments.find((p) => p.reference === "CHK-10501")?.sent).toBeNull();

    // Off again: recording sends nothing and says nothing about QuickBooks.
    const off = await call<QuickBooksStatusDto>(auto, {
      method: "PUT",
      as,
      json: { enabled: false },
    });
    expect(off.connection?.autoSendPayments).toBe(false);
    before = sends();
    const r3 = await call<Recorded>(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: 10_000, receivedOn: "2026-11-24", reference: null },
    });
    expect(r3.quickbooksAuto ?? null).toBeNull();
    expect(sends()).toBe(before);
  });

  it("other companies cannot read or send this company's applications", async () => {
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const res = await api(
      `/api/orgs/${other.orgId}/projects/${base.split("/").pop()}/pay-apps/${app1}/quickbooks`,
      {
        as: other.userId,
      },
    );
    expect(res.status).toBe(404);
    const res2 = await api(`${base}/pay-apps/${app1}/quickbooks`, { as: other.userId });
    expect(res2.status).toBe(404);
    const q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    const res3 = await api(
      `${base}/pay-apps/${app1}/payments/${q.payments[0]?.paymentId}/quickbooks`,
      { method: "POST", as: other.userId },
    );
    expect(res3.status).toBe(404);
  });

  it("disconnects: revokes the refresh token and forgets it; the sent record stays", async () => {
    const before = fakeQuickBooks.revoked.length;
    const s = await call<QuickBooksStatusDto>(`/api/orgs/${orgId}/quickbooks`, {
      method: "DELETE",
      as,
    });
    expect(s.connection).toBeNull();
    expect(fakeQuickBooks.revoked.length).toBe(before + 1);
    expect(fakeQuickBooks.revoked.at(-1)).toMatch(/^fake-refresh-/);
    const q = await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { as });
    expect(q.sent?.docNumber).toBe("PA24-117-01");
  });
});
