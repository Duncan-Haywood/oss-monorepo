// Job costs from QuickBooks (docs/QUICKBOOKS.md, "Job costs from QuickBooks"): link a job to the
// QuickBooks customer or job its expenses are tagged to, list those bills, checks, card charges
// and vendor credits, and import the chosen ones as costs, never twice, with the amounts re-read
// from QuickBooks. Plans, roles, the sample job and other companies are kept out.

import { fakeCosts } from "@qbo-sync";
import type {
  JobCostDto,
  JobCostQboCustomerDto,
  JobCostQboLinesDto,
  JobCostQuickBooksDto,
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
let projectId: string;
let base: string;
let lineId: string;
let jobCustomerId: string;
let gcCustomerId: string;
let billId: string;

const window = { from: "2026-09-01", to: "2026-11-30" };
const qb = () => `${base}/job-cost/quickbooks`;
const linesUrl = () => `${qb()}/lines?from=${window.from}&to=${window.to}`;

async function connect(org: string, user: string) {
  const { url } = await call<{ url: string }>(`/api/orgs/${org}/quickbooks/connect`, {
    method: "POST",
    as: user,
  });
  const u = new URL(url);
  await api(`${u.pathname}${u.search}`, { as: user, redirect: "manual" });
}

async function costBook(org: string) {
  const row = await testDb()
    .select()
    .from(qboConnections)
    .where(eq(qboConnections.orgId, org))
    .get();
  return fakeCosts(fakeQuickBooks.books(row?.realmId ?? ""));
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
      number: "26-014",
      gcName: "Acme General",
      originalContractSumCents: 10_000_000,
    },
  });
  projectId = p.id;
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Branch wiring", originalCents: 10_000_000 }] },
  });
  lineId = d.sovLines[0]?.id ?? "";
  await connect(orgId, as);
  const book = await costBook(orgId);
  const gc = book.addCustomer("Acme General");
  gcCustomerId = gc.id;
  jobCustomerId = book.addCustomer("Riverside Clinic", gc.id).id;
  billId = book.addExpense({
    txnType: "Bill",
    txnDate: "2026-10-03",
    docNumber: "INV-7781",
    vendorName: "Graybar Electric",
    lines: [
      {
        customerId: jobCustomerId,
        accountName: "Job Materials",
        description: "Wire, 500 ft THHN",
        amountCents: 125_040,
      },
      { customerId: gcCustomerId, accountName: "Job Materials", amountCents: 9_900 },
    ],
  });
  book.addExpense({
    txnType: "Purchase",
    paymentType: "CreditCard",
    txnDate: "2026-10-10",
    vendorName: "Sunbelt Rentals",
    lines: [{ customerId: jobCustomerId, accountName: "Equipment Rental", amountCents: 48_000 }],
  });
  book.addExpense({
    txnType: "VendorCredit",
    txnDate: "2026-10-20",
    docNumber: "CM-12",
    vendorName: "Graybar Electric",
    lines: [{ customerId: jobCustomerId, accountName: "Job Materials", amountCents: 5_000 }],
  });
  book.addExpense({
    txnType: "Purchase",
    paymentType: "Check",
    txnDate: "2026-08-15",
    vendorName: "Before the window",
    lines: [{ customerId: jobCustomerId, accountName: "Job Materials", amountCents: 100 }],
  });
});

describe("job costs from QuickBooks", () => {
  it("needs a link to a customer or job before reading lines", async () => {
    const s = await call<JobCostQuickBooksDto>(qb(), { as });
    expect(s).toEqual({ available: true, reason: null, link: null });
    expect((await api(linesUrl(), { as })).status).toBe(409);
  });

  it("lists the company's customers and jobs and links one", async () => {
    const { customers } = await call<{ customers: JobCostQboCustomerDto[] }>(`${qb()}/customers`, {
      as,
    });
    expect(customers.map((c) => c.name)).toEqual(["Acme General", "Acme General:Riverside Clinic"]);
    const bad = await api(`${qb()}/link`, { method: "PUT", as, json: { customerId: "nope" } });
    expect(bad.status).toBe(400);
    const s = await call<JobCostQuickBooksDto>(`${qb()}/link`, {
      method: "PUT",
      as,
      json: { customerId: jobCustomerId },
    });
    expect(s.link).toEqual({
      by: "customer",
      id: jobCustomerId,
      name: "Acme General:Riverside Clinic",
    });
  });

  it("lists the job's lines in the window, signed, with a suggested category", async () => {
    const r = await call<JobCostQboLinesDto>(linesUrl(), { as });
    expect(r.link).toEqual({
      by: "customer",
      id: jobCustomerId,
      name: "Acme General:Riverside Clinic",
    });
    expect(r.truncated).toBe(false);
    expect(
      r.lines.map((l) => [l.label, l.txnDate, l.vendor, l.amountCents, l.suggestedCategory]),
    ).toEqual([
      ["Bill", "2026-10-03", "Graybar Electric", 125_040, "material"],
      ["Card", "2026-10-10", "Sunbelt Rentals", 48_000, "equipment"],
      ["Vendor credit", "2026-10-20", "Graybar Electric", -5_000, "material"],
    ]);
    expect(r.lines.every((l) => l.imported === null)).toBe(true);
    const wide = await api(`${qb()}/lines?from=2023-01-01&to=2026-11-30`, { as });
    expect(wide.status).toBe(400);
  });

  it("imports the chosen lines as costs, with QuickBooks' own amounts, once", async () => {
    const r = await call<JobCostQboLinesDto>(linesUrl(), { as });
    const [bill, card] = r.lines;
    const body = {
      ...window,
      lines: [
        { source: bill?.source, sovLineId: lineId, category: "material" },
        { source: card?.source, sovLineId: null, category: "equipment" },
      ],
    };
    const first = await call<{ added: number; skipped: number }>(`${qb()}/import`, {
      method: "POST",
      as,
      json: body,
    });
    expect(first).toEqual({ added: 2, skipped: 0, linked: 0 });
    const again = await call<{ added: number; skipped: number }>(`${qb()}/import`, {
      method: "POST",
      as,
      json: body,
    });
    expect(again).toEqual({ added: 0, skipped: 2, linked: 0 });

    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(
      jc.entries.map((e) => [
        e.incurredOn,
        e.amountCents,
        e.category,
        e.sovLineId,
        e.vendor,
        e.reference,
        e.description,
        e.fromQuickBooks,
      ]),
    ).toEqual([
      [
        "2026-10-03",
        125_040,
        "material",
        lineId,
        "Graybar Electric",
        "Bill INV-7781",
        "Wire, 500 ft THHN",
        true,
      ],
      [
        "2026-10-10",
        48_000,
        "equipment",
        null,
        "Sunbelt Rentals",
        "Card",
        "Equipment Rental",
        true,
      ],
    ]);
    const listed = await call<JobCostQboLinesDto>(linesUrl(), { as });
    expect(listed.lines.map((l) => l.imported?.thisJob ?? null)).toEqual([true, true, null]);
  });

  it("shows when a bill changed in QuickBooks after it was imported", async () => {
    (await costBook(orgId)).setLineAmount(billId, "1", 130_000);
    const r = await call<JobCostQboLinesDto>(linesUrl(), { as });
    expect(r.lines[0]?.amountCents).toBe(130_000);
    expect(r.lines[0]?.imported?.amountCents).toBe(125_040);
  });

  it("refuses a line that is not in QuickBooks as listed, and nothing lands", async () => {
    const r = await call<JobCostQboLinesDto>(linesUrl(), { as });
    const credit = r.lines[2];
    const res = await api(`${qb()}/import`, {
      method: "POST",
      as,
      json: {
        ...window,
        lines: [
          { source: credit?.source, sovLineId: null, category: "material" },
          { source: "forged:Bill:1:1", sovLineId: null, category: "material" },
        ],
      },
    });
    expect(res.status).toBe(409);
    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(jc.entries).toHaveLength(2);
  });

  it("keeps viewers, the Free plan, the sample job and other companies out", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    await call(qb(), { as: viewer.id });
    expect((await api(linesUrl(), { as: viewer.id })).status).toBe(403);
    expect(
      (await api(`${qb()}/link`, { method: "PUT", as: viewer.id, json: { customerId: null } }))
        .status,
    ).toBe(403);

    const sample = await call<ProjectDto>(`/api/orgs/${orgId}/projects/sample`, {
      method: "POST",
      as,
      expect: 201,
    });
    const sampleQb = `/api/orgs/${orgId}/projects/${sample.id}/job-cost/quickbooks`;
    expect((await call<JobCostQuickBooksDto>(sampleQb, { as })).available).toBe(false);
    expect(
      (await api(`${sampleQb}/link`, { method: "PUT", as, json: { customerId: jobCustomerId } }))
        .status,
    ).toBe(409);

    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    expect((await api(linesUrl(), { as: other.userId })).status).toBe(404);
    const otherJob = `/api/orgs/${other.orgId}/projects/${projectId}/job-cost/quickbooks`;
    expect((await api(otherJob, { as: other.userId })).status).toBe(404);

    await grantPlan(orgId, "free", "active");
    const s = await call<JobCostQuickBooksDto>(qb(), { as });
    expect(s.available).toBe(false);
    expect((await api(linesUrl(), { as })).status).toBe(402);
    await grantPlan(orgId, "crew", "active");
  });

  it("unlinks, and a different company ignores the old link", async () => {
    const s = await call<JobCostQuickBooksDto>(`${qb()}/link`, {
      method: "PUT",
      as,
      json: { customerId: null },
    });
    expect(s.link).toBeNull();
    await call(`${qb()}/link`, { method: "PUT", as, json: { customerId: jobCustomerId } });
    await testDb()
      .update(qboConnections)
      .set({ realmId: "9130999" })
      .where(eq(qboConnections.orgId, orgId));
    expect((await call<JobCostQuickBooksDto>(qb(), { as })).link).toBeNull();
  });
});
