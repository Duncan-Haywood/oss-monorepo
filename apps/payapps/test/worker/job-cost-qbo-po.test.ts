// Purchase orders from QuickBooks (docs/QUICKBOOKS.md, "Purchase orders from QuickBooks"): the
// job's customer's purchase-order lines are listed with their status and imported as commitments,
// never twice; bills made from those orders are put against them whichever is imported first, and
// a cost a person moved off a commitment stays off. Roles, plans and other companies are kept out.

import { fakeCosts } from "@qbo-sync";
import type {
  JobCostDto,
  JobCostQboPoLinesDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let lineId: string;
let jobId: string;
let po1001: string;
let po1003: string;

const window = { from: "2026-08-01", to: "2026-11-30" };
const qb = () => `${base}/job-cost/quickbooks`;
const poUrl = () => `${qb()}/purchase-orders?from=${window.from}&to=${window.to}`;
type Imported = { added: number; skipped: number; linked: number };

async function book(org: string) {
  const row = await testDb()
    .select()
    .from(qboConnections)
    .where(eq(qboConnections.orgId, org))
    .get();
  return fakeCosts(fakeQuickBooks.books(row?.realmId ?? ""));
}

async function importAllCosts() {
  const r = await call<{ lines: { source: string; imported: unknown }[] }>(
    `${qb()}/lines?from=${window.from}&to=${window.to}`,
    { as },
  );
  return call<Imported>(`${qb()}/import`, {
    method: "POST",
    as,
    json: {
      ...window,
      lines: r.lines
        .filter((l) => l.imported === null)
        .map((l) => ({ source: l.source, sovLineId: lineId, category: "material" })),
    },
  });
}

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Riverside Clinic",
      gcName: "Acme General",
      originalContractSumCents: 10_000_000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Gear", originalCents: 10_000_000 }] },
  });
  lineId = d.sovLines[0]?.id ?? "";
  const { url } = await call<{ url: string }>(`/api/orgs/${orgId}/quickbooks/connect`, {
    method: "POST",
    as,
  });
  const u = new URL(url);
  await api(`${u.pathname}${u.search}`, { as, redirect: "manual" });
  const b = await book(orgId);
  const gc = b.addCustomer("Acme General");
  jobId = b.addCustomer("Riverside Clinic", gc.id).id;
  await call(`${qb()}/link`, { method: "PUT", as, json: { customerId: jobId } });

  po1001 = b.addPurchaseOrder({
    txnDate: "2026-09-12",
    docNumber: "1001",
    vendorName: "Graybar Electric",
    lines: [
      { customerId: jobId, itemName: "Switchgear materials", amountCents: 1_800_000 },
      { customerId: gc.id, itemName: "Switchgear materials", amountCents: 99_900 },
    ],
  });
  b.addPurchaseOrder({
    txnDate: "2026-09-20",
    docNumber: "1002",
    vendorName: "Sparky Subs LLC",
    status: "Closed",
    manuallyClosed: true,
    lines: [{ customerId: jobId, accountName: "Subcontractors", amountCents: 500_000 }],
  });
  po1003 = b.addPurchaseOrder({
    txnDate: "2026-09-25",
    docNumber: "1003",
    vendorName: "Sunbelt Rentals",
    lines: [{ customerId: jobId, accountName: "Equipment Rental", amountCents: 200_000 }],
  });
  // A bill from PO 1001 line 1; one naming only PO 1003; one from no order.
  b.addExpense({
    txnType: "Bill",
    txnDate: "2026-10-03",
    docNumber: "INV-1",
    vendorName: "Graybar Electric",
    lines: [
      {
        customerId: jobId,
        accountName: "Job Materials",
        amountCents: 900_000,
        purchaseOrder: { txnId: po1001, lineId: "1" },
      },
    ],
  });
  b.addExpense({
    txnType: "Bill",
    txnDate: "2026-10-05",
    docNumber: "R-77",
    vendorName: "Sunbelt Rentals",
    lines: [
      {
        customerId: jobId,
        accountName: "Equipment Rental",
        amountCents: 50_000,
        purchaseOrder: { txnId: po1003 },
      },
    ],
  });
  b.addExpense({
    txnType: "Purchase",
    paymentType: "Check",
    txnDate: "2026-10-07",
    vendorName: "City permits",
    lines: [{ customerId: jobId, accountName: "Permits", amountCents: 12_500 }],
  });
});

describe("purchase orders from QuickBooks", () => {
  it("imports bills before their orders without guessing a commitment", async () => {
    const lines = await call<{ lines: { fromPurchaseOrder: boolean }[] }>(
      `${qb()}/lines?from=${window.from}&to=${window.to}`,
      { as },
    );
    expect(lines.lines.map((l) => l.fromPurchaseOrder)).toEqual([true, true, false]);
    expect(await importAllCosts()).toEqual({ added: 3, skipped: 0, linked: 0 });
    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(jc.entries.every((e) => e.commitmentId === null)).toBe(true);
  });

  it("lists the job's order lines with status, closed ones flagged", async () => {
    const r = await call<JobCostQboPoLinesDto>(poUrl(), { as });
    expect(
      r.lines.map((l) => [
        l.docNumber,
        l.vendor,
        l.amountCents,
        l.status,
        l.manuallyClosed,
        l.suggestedCategory,
      ]),
    ).toEqual([
      ["1001", "Graybar Electric", 1_800_000, "Open", false, "material"],
      ["1002", "Sparky Subs LLC", 500_000, "Closed", true, "subcontract"],
      ["1003", "Sunbelt Rentals", 200_000, "Open", false, "equipment"],
    ]);
    expect(r.lines.every((l) => l.imported === null)).toBe(true);
  });

  it("imports open orders as commitments once and puts their bills against them", async () => {
    const r = await call<JobCostQboPoLinesDto>(poUrl(), { as });
    const [l1001, , l1003] = r.lines;
    const body = {
      ...window,
      lines: [
        { source: l1001?.source, sovLineId: lineId, category: "material" },
        { source: l1003?.source, sovLineId: null, category: "equipment" },
      ],
    };
    const first = await call<Imported>(`${qb()}/purchase-orders/import`, {
      method: "POST",
      as,
      json: body,
    });
    expect(first).toEqual({ added: 2, skipped: 0, linked: 2 });
    const again = await call<Imported>(`${qb()}/purchase-orders/import`, {
      method: "POST",
      as,
      json: body,
    });
    expect(again).toEqual({ added: 0, skipped: 2, linked: 0 });

    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(
      jc.commitments.map((c) => [
        c.kind,
        c.vendor,
        c.reference,
        c.committedOn,
        c.amountCents,
        c.invoicedCents,
        c.openCents,
        c.fromQuickBooks,
      ]),
    ).toEqual([
      [
        "purchase_order",
        "Graybar Electric",
        "PO 1001",
        "2026-09-12",
        1_800_000,
        900_000,
        900_000,
        true,
      ],
      [
        "purchase_order",
        "Sunbelt Rentals",
        "PO 1003",
        "2026-09-25",
        200_000,
        50_000,
        150_000,
        true,
      ],
    ]);
    const onOrder = new Map(jc.entries.map((e) => [e.reference, e.commitmentId]));
    expect(onOrder.get("Bill INV-1")).toBe(jc.commitments[0]?.id);
    expect(onOrder.get("Bill R-77")).toBe(jc.commitments[1]?.id);
    expect(onOrder.get("Check")).toBeNull();
    const listed = await call<JobCostQboPoLinesDto>(poUrl(), { as });
    expect(listed.lines.map((l) => l.imported?.thisJob ?? null)).toEqual([true, null, true]);
  });

  it("puts a later bill against its order on import", async () => {
    (await book(orgId)).addExpense({
      txnType: "Bill",
      txnDate: "2026-11-02",
      docNumber: "INV-2",
      vendorName: "Graybar Electric",
      lines: [
        {
          customerId: jobId,
          accountName: "Job Materials",
          amountCents: 400_000,
          purchaseOrder: { txnId: po1001, lineId: "1" },
        },
      ],
    });
    expect(await importAllCosts()).toEqual({ added: 1, skipped: 0, linked: 1 });
    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(jc.commitments[0]?.openCents).toBe(500_000);
  });

  it("leaves a cost a person moved off its order where they put it", async () => {
    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    const inv1 = jc.entries.find((e) => e.reference === "Bill INV-1");
    await call(`${base}/job-cost/entries/${inv1?.id}`, {
      method: "PATCH",
      as,
      json: { commitmentId: null },
    });
    const r = await call<JobCostQboPoLinesDto>(poUrl(), { as });
    const closed = r.lines[1];
    const res = await call<Imported>(`${qb()}/purchase-orders/import`, {
      method: "POST",
      as,
      json: {
        ...window,
        lines: [{ source: closed?.source, sovLineId: null, category: "subcontract" }],
      },
    });
    expect(res).toEqual({ added: 1, skipped: 0, linked: 0 });
    const after = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(after.entries.find((e) => e.id === inv1?.id)?.commitmentId).toBeNull();
    expect(after.commitments.find((c) => c.reference === "PO 1002")?.kind).toBe("subcontract");
  });

  it("shows an order changed in QuickBooks since, and refuses a line not as listed", async () => {
    (await book(orgId)).setLineAmount(po1003, "1", 250_000);
    const r = await call<JobCostQboPoLinesDto>(poUrl(), { as });
    expect(r.lines[2]?.amountCents).toBe(250_000);
    expect(r.lines[2]?.imported?.amountCents).toBe(200_000);
    const res = await api(`${qb()}/purchase-orders/import`, {
      method: "POST",
      as,
      json: {
        ...window,
        lines: [{ source: "forged:PurchaseOrder:1:1", sovLineId: null, category: "material" }],
      },
    });
    expect(res.status).toBe(409);
    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(jc.commitments).toHaveLength(3);
  });

  it("keeps viewers, the Free plan and other companies out", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await api(poUrl(), { as: viewer.id })).status).toBe(403);
    expect(
      (
        await api(`${qb()}/purchase-orders/import`, {
          method: "POST",
          as: viewer.id,
          json: { ...window, lines: [{ source: "x", sovLineId: null, category: "material" }] },
        })
      ).status,
    ).toBe(403);
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    expect((await api(poUrl(), { as: other.userId })).status).toBe(404);
    await grantPlan(orgId, "free", "active");
    expect((await api(poUrl(), { as })).status).toBe(402);
    await grantPlan(orgId, "crew", "active");
  });
});
