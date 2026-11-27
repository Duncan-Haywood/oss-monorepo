// Journal entries from QuickBooks as job costs (docs/QUICKBOOKS.md, "Job costs from QuickBooks"):
// an outside payroll service posts each payroll as a journal entry split by job. The job's lines
// on cost accounts are listed with the other QuickBooks costs, and import once like a bill; the
// cash and liability sides, and an A/R write-off that names the job, are not costs.

import { fakeCosts } from "@qbo-sync";
import type {
  JobCostDto,
  JobCostQboLinesDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { api, call, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let lineId: string;
let jeId: string;

const window = { from: "2026-11-01", to: "2026-11-30" };
const qb = () => `${base}/job-cost/quickbooks`;
const linesUrl = () => `${qb()}/lines?from=${window.from}&to=${window.to}`;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Riverside Clinic", gcName: "Acme General", originalContractSumCents: 5_000_000 },
  });
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
  const book = fakeCosts(fakeQuickBooks.books(row?.realmId ?? ""));
  const job = book.addCustomer("Riverside Clinic");
  const other = book.addCustomer("Harbor Lofts");
  await call(`${qb()}/link`, { method: "PUT", as, json: { customerId: job.id } });
  jeId = book.addJournalEntry({
    txnDate: "2026-11-14",
    docNumber: "PR-1114",
    lines: [
      {
        postingType: "Debit",
        accountName: "Direct Labor",
        customerId: job.id,
        description: "Field wages, week ending 11/14",
        amountCents: 420_000,
      },
      {
        postingType: "Debit",
        accountName: "Payroll Taxes - Field",
        customerId: job.id,
        amountCents: 32_130,
      },
      {
        postingType: "Debit",
        accountName: "Direct Labor",
        customerId: other.id,
        amountCents: 1_800,
      },
      {
        postingType: "Credit",
        accountName: "Checking",
        classification: "Asset",
        amountCents: 454_930,
      },
    ],
  });
  book.addJournalEntry({
    txnDate: "2026-11-20",
    lines: [
      {
        postingType: "Credit",
        accountName: "Direct Labor",
        customerId: job.id,
        description: "Reclass to Harbor Lofts",
        amountCents: 15_000,
      },
      {
        postingType: "Debit",
        accountName: "Direct Labor",
        customerId: other.id,
        amountCents: 15_000,
      },
      {
        postingType: "Credit",
        accountName: "Accounts Receivable",
        classification: "Asset",
        customerId: job.id,
        amountCents: 9_900,
      },
      { postingType: "Debit", accountName: "Bad Debts", amountCents: 9_900 },
    ],
  });
});

describe("journal entries from QuickBooks", () => {
  it("lists the job's lines on cost accounts, debits as costs and credits negative", async () => {
    const r = await call<JobCostQboLinesDto>(linesUrl(), { as });
    expect(
      r.lines.map((l) => [
        l.label,
        l.txnType,
        l.txnDate,
        l.account,
        l.amountCents,
        l.suggestedCategory,
      ]),
    ).toEqual([
      ["Journal entry", "JournalEntry", "2026-11-14", "Direct Labor", 420_000, "labor"],
      ["Journal entry", "JournalEntry", "2026-11-14", "Payroll Taxes - Field", 32_130, "labor"],
      ["Journal entry", "JournalEntry", "2026-11-20", "Direct Labor", -15_000, "labor"],
    ]);
    expect(r.lines.every((l) => l.vendor === null && !l.fromPurchaseOrder)).toBe(true);
  });

  it("imports the chosen lines once, with QuickBooks' amounts and the entry's number", async () => {
    const r = await call<JobCostQboLinesDto>(linesUrl(), { as });
    const body = {
      ...window,
      lines: r.lines.map((l) => ({ source: l.source, sovLineId: lineId, category: "labor" })),
    };
    const first = await call(`${qb()}/import`, { method: "POST", as, json: body });
    expect(first).toEqual({ added: 3, skipped: 0, linked: 0 });
    const again = await call(`${qb()}/import`, { method: "POST", as, json: body });
    expect(again).toEqual({ added: 0, skipped: 3, linked: 0 });
    const jc = await call<JobCostDto>(`${base}/job-cost`, { as });
    expect(
      jc.entries.map((e) => [e.incurredOn, e.amountCents, e.category, e.reference, e.description]),
    ).toEqual([
      ["2026-11-14", 420_000, "labor", "Journal entry PR-1114", "Field wages, week ending 11/14"],
      ["2026-11-14", 32_130, "labor", "Journal entry PR-1114", "Payroll Taxes - Field"],
      ["2026-11-20", -15_000, "labor", "Journal entry", "Reclass to Harbor Lofts"],
    ]);
    expect(r.lines[0]?.source).toMatch(new RegExp(`:JournalEntry:${jeId}:0$`));
  });
});
