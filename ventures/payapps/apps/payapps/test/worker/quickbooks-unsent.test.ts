// Payments not yet in QuickBooks, listed on the cash report (docs/QUICKBOOKS.md, "Not yet in
// QuickBooks"): a refused automatic send shows up there, sending it again goes through the
// pay application's route with all its checks, marking it by hand clears it, and another company
// sees none of it.

import type {
  PayAppDetailDto,
  PayAppQuickBooksDto,
  ProjectDetailDto,
  ProjectDto,
  UnsentQuickBooksPaymentsDto,
} from "@shared/api/types";
import { qboConnections, qboInvoiceSyncs } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let app1: string;
let unsentUrl: string;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  unsentUrl = `/api/orgs/${orgId}/quickbooks/unsent-payments`;
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Tempe Library Reroof",
      number: "25-031",
      gcName: "Saguaro General",
      originalContractSumCents: 5_000_000,
      payTermsDays: 30,
    },
  });
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Roofing", originalCents: 5_000_000 }] },
  });
  const a = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-10-01", periodTo: "2026-10-31", applicationDate: "2026-10-31" },
  });
  app1 = a.id;
  await call(`${base}/pay-apps/${app1}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: d.sovLines[0]?.id,
          workThisPeriodCents: 2_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${base}/pay-apps/${app1}/submit`, { method: "POST", as });
  // Connect the fake company and send the application as an invoice.
  const { url } = await call<{ url: string }>(`/api/orgs/${orgId}/quickbooks/connect`, {
    method: "POST",
    as,
  });
  const u = new URL(url);
  await api(`${u.pathname}${u.search}`, { as, redirect: "manual" });
  await call<PayAppQuickBooksDto>(`${base}/pay-apps/${app1}/quickbooks`, { method: "POST", as });
});

describe("payments not yet in QuickBooks", () => {
  it("lists a refused automatic send, and sending it again from there clears it", async () => {
    // Nothing recorded yet: nothing waiting.
    const empty = await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as });
    expect(empty.status.available).toBe(true);
    expect(empty.payments).toEqual([]);

    await call(`/api/orgs/${orgId}/quickbooks/auto-payments`, {
      method: "PUT",
      as,
      json: { enabled: true },
    });
    const conn = await testDb()
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get();
    const books = fakeQuickBooks.books(conn?.realmId ?? "");
    const invoice = await books.findInvoiceByDocNumber("PA25-031-01");
    // Someone enters a check in QuickBooks directly, so the next automatic send is refused.
    await books.recordPayment({
      customerId: invoice?.customerId ?? "",
      totalCents: 30_000,
      applyTo: [{ invoiceId: invoice?.id ?? "", amountCents: 30_000 }],
    });
    const r = await call<PayAppDetailDto & { quickbooksAuto?: { sent: boolean } | null }>(
      `${base}/pay-apps/${app1}/payments`,
      {
        method: "POST",
        as,
        expect: 201,
        json: { amountCents: 40_000, receivedOn: "2026-11-20", reference: "CHK-2210" },
      },
    );
    expect(r.quickbooksAuto?.sent).toBe(false);

    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const listed = await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as: viewer.id });
    expect(listed.payments).toHaveLength(1);
    const pm = listed.payments[0];
    expect(pm).toMatchObject({
      projectName: "Tempe Library Reroof",
      projectNumber: "25-031",
      payAppId: app1,
      payAppNumber: 1,
      docNumber: "PA25-031-01",
      amountCents: 40_000,
      receivedOn: "2026-11-20",
      reference: "CHK-2210",
      otherCompany: false,
    });
    const sendUrl = `${base}/pay-apps/${app1}/payments/${pm?.paymentId}/quickbooks`;
    // A viewer can see it but not send it.
    await call(sendUrl, { method: "POST", as: viewer.id, expect: 403 });
    // Still refused while QuickBooks shows the stray check: the same check runs, it stays listed.
    const refused = await api(sendUrl, { method: "POST", as });
    expect(refused.status).toBe(409);
    expect((await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as })).payments).toHaveLength(1);

    // The stray check is a real payment the contractor had not recorded: record it here and mark
    // it as already in QuickBooks, so both sides agree; sending the refused one again now works.
    const strayHere = await call<PayAppDetailDto>(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: 30_000, receivedOn: "2026-11-19", reference: "CHK-2209" },
    });
    // With automatic sending on, that one was refused too (its money is already there): listed.
    const both = await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as });
    expect(both.payments.map((p) => p.reference)).toEqual(["CHK-2209", "CHK-2210"]);
    const strayId = strayHere.payments.find((p) => p.reference === "CHK-2209")?.id;
    await call(`${base}/pay-apps/${app1}/payments/${strayId}/quickbooks?already=1`, {
      method: "POST",
      as,
    });
    const before = books.calls.filter((c) => c.method === "recordPayment").length;
    await call(sendUrl, { method: "POST", as });
    expect(books.calls.filter((c) => c.method === "recordPayment").length).toBe(before + 1);
    expect((await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as })).payments).toEqual([]);
  });

  it("marks one entered by hand, and flags an invoice in another company", async () => {
    await call(`/api/orgs/${orgId}/quickbooks/auto-payments`, {
      method: "PUT",
      as,
      json: { enabled: false },
    });
    await call(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: 10_000, receivedOn: "2026-11-21", reference: null },
    });
    let listed = await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as });
    expect(listed.payments.map((p) => p.amountCents)).toEqual([10_000]);

    // The invoice now belongs to a company other than the one connected: shown, flagged.
    await testDb()
      .update(qboInvoiceSyncs)
      .set({ realmId: "another-realm" })
      .where(eq(qboInvoiceSyncs.payAppId, app1));
    listed = await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as });
    expect(listed.payments[0]?.otherCompany).toBe(true);
    const conn = await testDb()
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get();
    await testDb()
      .update(qboInvoiceSyncs)
      .set({ realmId: conn?.realmId ?? "" })
      .where(eq(qboInvoiceSyncs.payAppId, app1));

    const pm = listed.payments[0];
    await call(`${base}/pay-apps/${app1}/payments/${pm?.paymentId}/quickbooks?already=1`, {
      method: "POST",
      as,
    });
    expect((await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as })).payments).toEqual([]);
  });

  it("another company sees none of this company's payments", async () => {
    await call(`${base}/pay-apps/${app1}/payments`, {
      method: "POST",
      as,
      expect: 201,
      json: { amountCents: 5_000, receivedOn: "2026-11-22", reference: "CHK-2299" },
    });
    expect((await call<UnsentQuickBooksPaymentsDto>(unsentUrl, { as })).payments).toHaveLength(1);
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const theirs = await call<UnsentQuickBooksPaymentsDto>(
      `/api/orgs/${other.orgId}/quickbooks/unsent-payments`,
      { as: other.userId },
    );
    expect(theirs.payments).toEqual([]);
    // And cannot read ours.
    const res = await api(unsentUrl, { as: other.userId });
    expect(res.status).toBe(404);
  });
});
