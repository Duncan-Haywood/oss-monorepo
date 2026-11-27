// Job costs from QuickBooks for a company that tracks jobs by class instead of by customer
// (docs/QUICKBOOKS.md, "Job costs from QuickBooks"): the job is linked to a class, and the bills,
// checks, journal entries and purchase orders whose lines carry that class are listed and imported
// like a customer's. Only the exact class is read; other companies' jobs and classes stay out.

import { fakeCosts } from "@qbo-sync";
import type {
  JobCostDto,
  JobCostQboClassDto,
  JobCostQboLinesDto,
  JobCostQboPoLinesDto,
  JobCostQuickBooksDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { jobCostQboLinks, qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { api, call, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let projectId: string;
let base: string;
let lineId: string;
let jobClassId: string;
let parentClassId: string;
let inactiveClassId: string;

const window = { from: "2026-11-01", to: "2026-11-30" };
const qb = () => `${base}/job-cost/quickbooks`;
const q = new URLSearchParams(window).toString();

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Mesa Clinic", gcName: "Acme General", originalContractSumCents: 5_000_000 },
  });
  projectId = p.id;
  base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 5_000_000 }] },
  });
  lineId = d.sovLines[0]?.id ?? "";
  const { url } = await call<{ url: string }>(`/api/orgs/${orgId}/quickbooks/connect`, {
    method: "POST",
    as,
  });
  const u = new URL(url);
  await api(`${u.pathname}${u.search}`, { as, redirect: "manual" });
  const row = await testDb()
    .select()
    .from(qboConnections)
    .where(eq(qboConnections.orgId, orgId))
    .get();
  const books = fakeQuickBooks.books(row?.realmId ?? "");
  books.trackingPrefs = { classTracking: "per-line", locationTracking: false, locationLabel: null };
  const jobs = books.addClass("Jobs");
  parentClassId = jobs.id;
  jobClassId = books.addClass("Mesa Clinic", jobs).id;
  const other = books.addClass("Overhead");
  inactiveClassId = books.addClass("Old job").id;
  books.inactiveTracking.add(inactiveClassId);
  // The job's invoices carry the class (QuickBooks page, "Class and location").
  await call(`/api/orgs/${orgId}/quickbooks/tracking/${p.id}`, {
    method: "PUT",
    as,
    json: { classId: jobClassId },
  });

  const book = fakeCosts(books);
  book.addExpense({
    txnType: "Bill",
    txnDate: "2026-11-03",
    docNumber: "INV-1",
    vendorName: "Graybar Electric",
    lines: [
      { classId: jobClassId, accountName: "Job Materials", amountCents: 81_240 },
      { classId: other.id, accountName: "Office Supplies", amountCents: 9_900 },
      { classId: parentClassId, accountName: "Job Materials", amountCents: 1_000 },
    ],
  });
  book.addExpense({
    txnType: "Purchase",
    paymentType: "CreditCard",
    txnDate: "2026-11-05",
    vendorName: "Sunbelt Rentals",
    lines: [{ classId: jobClassId, accountName: "Equipment Rental", amountCents: 48_000 }],
  });
  book.addJournalEntry({
    txnDate: "2026-11-14",
    docNumber: "PR-1114",
    lines: [
      {
        postingType: "Debit",
        accountName: "Direct Labor",
        classId: jobClassId,
        amountCents: 420_000,
      },
      {
        postingType: "Credit",
        accountName: "Payroll Clearing",
        classification: "Liability",
        classId: jobClassId,
        amountCents: 420_000,
      },
    ],
  });
  book.addPurchaseOrder({
    txnDate: "2026-11-02",
    docNumber: "PO-7",
    vendorName: "Graybar Electric",
    classId: jobClassId,
    lines: [{ accountName: "Job Materials", amountCents: 300_000 }],
  });
});

describe("job costs from QuickBooks, by class", () => {
  it("lists the company's classes with the job's invoice class marked", async () => {
    const r = await call<{ classes: JobCostQboClassDto[]; jobClassId: string | null }>(
      `${qb()}/classes`,
      { as },
    );
    expect(r.classes.map((c) => c.name)).toEqual(["Jobs", "Jobs:Mesa Clinic", "Overhead"]);
    expect(r.jobClassId).toBe(jobClassId);
  });

  it("refuses a class that is not active in the company", async () => {
    const bad = await api(`${qb()}/link`, {
      method: "PUT",
      as,
      json: { classId: inactiveClassId },
    });
    expect(bad.status).toBe(400);
    const both = await api(`${qb()}/link`, {
      method: "PUT",
      as,
      json: { classId: jobClassId, customerId: "c1" },
    });
    expect(both.status).toBe(400);
  });

  it("links the job to a class and lists only that class's cost lines", async () => {
    const s = await call<JobCostQuickBooksDto>(`${qb()}/link`, {
      method: "PUT",
      as,
      json: { classId: jobClassId },
    });
    expect(s.link).toEqual({ by: "class", id: jobClassId, name: "Jobs:Mesa Clinic" });
    const row = await testDb()
      .select()
      .from(jobCostQboLinks)
      .where(eq(jobCostQboLinks.projectId, projectId))
      .get();
    expect(row?.matchBy).toBe("class");

    const r = await call<JobCostQboLinesDto>(`${qb()}/lines?${q}`, { as });
    expect(r.link).toEqual({ by: "class", id: jobClassId, name: "Jobs:Mesa Clinic" });
    // The parent class's line and the overhead line are left out; so is the payroll clearing side.
    expect(r.lines.map((l) => [l.label, l.amountCents, l.suggestedCategory])).toEqual([
      ["Bill", 81_240, "material"],
      ["Card", 48_000, "equipment"],
      ["Journal entry", 420_000, "labor"],
    ]);

    const po = await call<JobCostQboPoLinesDto>(`${qb()}/purchase-orders?${q}`, { as });
    expect(po.lines.map((l) => [l.docNumber, l.amountCents])).toEqual([["PO-7", 300_000]]);
  });

  it("imports class lines as costs, once", async () => {
    const r = await call<JobCostQboLinesDto>(`${qb()}/lines?${q}`, { as });
    const body = {
      ...window,
      lines: r.lines.map((l) => ({
        source: l.source,
        sovLineId: lineId,
        category: l.suggestedCategory,
      })),
    };
    const first = await call<{ added: number; skipped: number }>(`${qb()}/import`, {
      method: "POST",
      as,
      json: body,
    });
    expect(first).toMatchObject({ added: 3, skipped: 0 });
    const again = await call<{ added: number; skipped: number }>(`${qb()}/import`, {
      method: "POST",
      as,
      json: body,
    });
    expect(again).toMatchObject({ added: 0, skipped: 3 });
    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(jc.entries.reduce((a, e) => a + e.amountCents, 0)).toBe(81_240 + 48_000 + 420_000);
  });

  it("switching back to a customer link reads by customer again", async () => {
    const s = await call<JobCostQuickBooksDto>(`${qb()}/link`, {
      method: "PUT",
      as,
      json: { customerId: null },
    });
    expect(s.link).toBeNull();
    expect((await api(`${qb()}/lines?${q}`, { as })).status).toBe(409);
  });

  it("keeps other companies out", async () => {
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    expect((await api(`${qb()}/classes`, { as: other.userId })).status).toBe(404);
    const otherJob = `/api/orgs/${other.orgId}/projects/${projectId}/job-cost/quickbooks`;
    expect(
      (
        await api(`${otherJob}/link`, {
          method: "PUT",
          as: other.userId,
          json: { classId: jobClassId },
        })
      ).status,
    ).toBe(404);
  });
});
