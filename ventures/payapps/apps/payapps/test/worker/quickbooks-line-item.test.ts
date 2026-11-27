// QuickBooks, an item per schedule-of-values line (docs/QUICKBOOKS.md, "An item per line"): an
// admin bills one line's work with its own item; the preview and the send use it while the other
// lines keep the job's or company's item; a line's item made inactive stops only invoices that bill
// that line; null goes back; another QuickBooks company ignores it; and the sample job, other jobs'
// lines and other companies are refused.

import type {
  PayAppDetailDto,
  PayAppQuickBooksDto,
  ProjectDetailDto,
  ProjectDto,
  QuickBooksItemsDto,
  QuickBooksLineItemsDto,
} from "@shared/api/types";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let laborId: string;
let equipmentId: string;
let retainageId: string;
let job: { id: string; base: string; apps: string[]; lines: Record<string, string> };
let other: { id: string; base: string; apps: string[]; lines: Record<string, string> };

async function connect(org: string, user: string) {
  const { url } = await call<{ url: string }>(`/api/orgs/${org}/quickbooks/connect`, {
    method: "POST",
    as: user,
  });
  const u = new URL(url);
  await api(`${u.pathname}${u.search}`, { as: user, redirect: "manual" });
}

async function books() {
  const row = await testDb()
    .select()
    .from(qboConnections)
    .where(eq(qboConnections.orgId, orgId))
    .get();
  return fakeQuickBooks.books(row?.realmId ?? "");
}

const linesUrl = (projectId: string) =>
  `/api/orgs/${orgId}/quickbooks/job-items/${projectId}/lines`;
const lineUrl = (projectId: string, lineId: string) => `${linesUrl(projectId)}/${lineId}`;

/**
 * A job with three lines and three submitted applications. Every application bills the equipment
 * and labor lines; only the first bills the design fee.
 */
async function makeJob(name: string, number: string) {
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name, number, gcName: "Saguaro General", originalContractSumCents: 9_000_000 },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      lines: [
        { itemNumber: "1", description: "Switchgear (equipment)", originalCents: 4_000_000 },
        { itemNumber: "2", description: "Branch wiring labor", originalCents: 4_500_000 },
        { itemNumber: "3", description: "Design fee", originalCents: 500_000 },
      ],
    },
  });
  const lines: Record<string, string> = {};
  for (const l of d.sovLines) lines[l.itemNumber] = l.id;
  const apps: string[] = [];
  for (const [from, to, design] of [
    ["2026-08-01", "2026-08-31", 500_000],
    ["2026-09-01", "2026-09-30", 0],
    ["2026-10-01", "2026-10-31", 0],
  ] as const) {
    const a = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: from, periodTo: to, applicationDate: to },
    });
    const work = (sovLineId: string | undefined, cents: number) => ({
      sovLineId,
      workThisPeriodCents: cents,
      storedMaterialsCents: 0,
      retainageReleasedCents: 0,
    });
    await call(`${base}/pay-apps/${a.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [work(lines["1"], 1_000_000), work(lines["2"], 1_000_000), work(lines["3"], design)],
      },
    });
    await call(`${base}/pay-apps/${a.id}/submit`, { method: "POST", as });
    apps.push(a.id);
  }
  return { id: p.id, base, apps, lines };
}

/** Item id per invoice line description, the retainage line left out. */
const itemsByLine = async (docNumber: string) => {
  const invoice = await (await books()).findInvoiceByDocNumber(docNumber);
  return Object.fromEntries(
    (invoice?.lines ?? [])
      .filter((l) => l.itemId !== retainageId)
      .map((l) => [l.description, l.itemId]),
  );
};

const message = async (res: Response) =>
  ((await res.json()) as { error: { message: string } }).error.message;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  await grantPlan(orgId, "crew", "active");
  job = await makeJob("Desert View Library", "25-031");
  other = await makeJob("Mesa Clinic", "25-040");
  await connect(orgId, as);
  const b = await books();
  const construction = await b.ensureAccount({
    name: "Construction Income",
    accountType: "Income",
  });
  const equipment = await b.ensureAccount({ name: "Equipment Sales", accountType: "Income" });
  laborId = (
    await b.ensureItem({
      name: "Electrical Labor",
      type: "Service",
      incomeAccountId: construction.id,
    })
  ).id;
  equipmentId = (
    await b.ensureItem({ name: "Equipment", type: "NonInventory", incomeAccountId: equipment.id })
  ).id;
  retainageId = (await b.ensureRetainageSetup()).item.id;
  await call(`/api/orgs/${orgId}/quickbooks/invoice-item`, {
    method: "PUT",
    as,
    json: { itemId: laborId },
  });
});

describe("QuickBooks item per schedule-of-values line", () => {
  it("lists the job's lines on the job's item", async () => {
    const d = await call<QuickBooksLineItemsDto>(linesUrl(job.id), { as });
    expect(d.fallbackItemName).toBe("Electrical Labor");
    expect(d.lines.map((l) => [l.itemNumber, l.item])).toEqual([
      ["1", null],
      ["2", null],
      ["3", null],
    ]);
    expect(d.items.map((i) => i.name)).toContain("Equipment");
  });

  it("is for admins only and refuses the retainage item, unknown items, the sample job and other jobs' lines", async () => {
    const editor = await createTestUser();
    await addToOrg(orgId, editor.id, "editor");
    const url = lineUrl(job.id, job.lines["1"] ?? "");
    expect((await api(url, { method: "PUT", as: editor.id, json: { itemId: null } })).status).toBe(
      403,
    );
    expect((await api(linesUrl(job.id), { as: editor.id })).status).toBe(403);
    const r = await api(url, { method: "PUT", as, json: { itemId: retainageId } });
    expect(r.status).toBe(400);
    expect(await message(r)).toMatch(/retainage item/);
    expect((await api(url, { method: "PUT", as, json: { itemId: "99999" } })).status).toBe(400);
    // A line of another job, through this job's path.
    const cross = await api(lineUrl(job.id, other.lines["1"] ?? ""), {
      method: "PUT",
      as,
      json: { itemId: equipmentId },
    });
    expect(cross.status).toBe(404);
    const sample = await call<ProjectDetailDto>(`/api/orgs/${orgId}/projects/sample`, {
      method: "POST",
      as,
      expect: 201,
    });
    expect((await api(linesUrl(sample.id), { as })).status).toBe(409);
    const d = await call<QuickBooksLineItemsDto>(linesUrl(other.id), { as });
    expect(d.lines.every((l) => l.item === null)).toBe(true);
  });

  it("bills that line with its own item and the others with the job's", async () => {
    const set = await call<QuickBooksLineItemsDto>(lineUrl(job.id, job.lines["1"] ?? ""), {
      method: "PUT",
      as,
      json: { itemId: equipmentId },
    });
    expect(set.lines.find((l) => l.itemNumber === "1")?.item).toEqual({
      id: equipmentId,
      name: "Equipment",
    });
    const list = await call<QuickBooksItemsDto>(`/api/orgs/${orgId}/quickbooks/items`, { as });
    expect(list.jobs.find((j) => j.projectId === job.id)?.linesWithOwnItem).toBe(1);
    expect(list.jobs.find((j) => j.projectId === other.id)?.linesWithOwnItem).toBe(0);

    const q = await call<PayAppQuickBooksDto>(`${job.base}/pay-apps/${job.apps[0]}/quickbooks`, {
      as,
    });
    expect(q.preview?.workItemName).toBe("Electrical Labor");
    expect(q.preview?.lines.map((l) => [l.description, l.itemName])).toEqual([
      ["1 Switchgear (equipment)", "Equipment"],
      ["2 Branch wiring labor", "Electrical Labor"],
      ["3 Design fee", "Electrical Labor"],
      ["Retainage held, pay application #1", null],
    ]);

    await call(`${job.base}/pay-apps/${job.apps[0]}/quickbooks`, { method: "POST", as });
    expect(await itemsByLine("PA25-031-01")).toEqual({
      "1 Switchgear (equipment)": equipmentId,
      "2 Branch wiring labor": laborId,
      "3 Design fee": laborId,
    });
    const sent = await (await books()).findInvoiceByDocNumber("PA25-031-01");
    expect(sent?.totalCents).toBe(q.preview?.totalCents);
  });

  it("an inactive line item stops only invoices that bill that line, naming it", async () => {
    await call(lineUrl(job.id, job.lines["1"] ?? ""), {
      method: "PUT",
      as,
      json: { itemId: null },
    });
    const b = await books();
    const designId = (
      await b.ensureItem({
        name: "Design Services",
        type: "Service",
        incomeAccountId: (await b.ensureAccount({ name: "Design", accountType: "Income" })).id,
      })
    ).id;
    await call(lineUrl(job.id, job.lines["3"] ?? ""), {
      method: "PUT",
      as,
      json: { itemId: designId },
    });
    await call(lineUrl(job.id, job.lines["2"] ?? ""), {
      method: "PUT",
      as,
      json: { itemId: designId },
    });
    b.inactiveItems.add(designId);
    const res = await api(`${job.base}/pay-apps/${job.apps[1]}/quickbooks`, {
      method: "POST",
      as,
    });
    expect(res.status).toBe(409);
    expect(await message(res)).toMatch(
      /line 2 Branch wiring labor on the job Desert View Library \("Design Services"\) is no longer active.*nothing was sent/,
    );
    expect(await b.findInvoiceByDocNumber("PA25-031-02")).toBeNull();
    // The other job is not touched.
    const ok = await call<PayAppQuickBooksDto>(
      `${other.base}/pay-apps/${other.apps[0]}/quickbooks`,
      { method: "POST", as },
    );
    expect(ok.sent?.docNumber).toBe("PA25-040-01");
    // Line 2 back on the job's item: application 2 bills nothing on line 3 (the inactive item's
    // other line), so it sends.
    await call(lineUrl(job.id, job.lines["2"] ?? ""), {
      method: "PUT",
      as,
      json: { itemId: null },
    });
    await call(`${job.base}/pay-apps/${job.apps[1]}/quickbooks`, { method: "POST", as });
    expect(await itemsByLine("PA25-031-02")).toEqual({
      "1 Switchgear (equipment)": laborId,
      "2 Branch wiring labor": laborId,
    });
  });

  it("every work line on its own item: the job's item is not needed", async () => {
    await call(lineUrl(job.id, job.lines["1"] ?? ""), {
      method: "PUT",
      as,
      json: { itemId: equipmentId },
    });
    await call(lineUrl(job.id, job.lines["2"] ?? ""), {
      method: "PUT",
      as,
      json: { itemId: equipmentId },
    });
    // Even the company's item made inactive does not stop it.
    (await books()).inactiveItems.add(laborId);
    await call(`${job.base}/pay-apps/${job.apps[2]}/quickbooks`, { method: "POST", as });
    expect(await itemsByLine("PA25-031-03")).toEqual({
      "1 Switchgear (equipment)": equipmentId,
      "2 Branch wiring labor": equipmentId,
    });
    (await books()).inactiveItems.delete(laborId);
  });

  it("another company cannot read or set this company's lines", async () => {
    const o = await setupTenant("owner");
    await grantPlan(o.orgId, "crew", "active");
    await connect(o.orgId, o.userId);
    const read = await api(`/api/orgs/${o.orgId}/quickbooks/job-items/${job.id}/lines`, {
      as: o.userId,
    });
    expect(read.status).toBe(404);
    const write = await api(
      `/api/orgs/${o.orgId}/quickbooks/job-items/${job.id}/lines/${job.lines["1"]}`,
      { method: "PUT", as: o.userId, json: { itemId: null } },
    );
    expect(write.status).toBe(404);
    const direct = await api(lineUrl(job.id, job.lines["1"] ?? ""), {
      method: "PUT",
      as: o.userId,
      json: { itemId: null },
    });
    expect(direct.status).toBe(404); // not a member: the company is not revealed
  });

  it("a different QuickBooks company ignores the lines' items", async () => {
    await connect(orgId, as); // the fake gateway gives every connection a new company
    const d = await call<QuickBooksLineItemsDto>(linesUrl(job.id), { as });
    expect(d.lines.every((l) => l.item === null)).toBe(true);
    const list = await call<QuickBooksItemsDto>(`/api/orgs/${orgId}/quickbooks/items`, { as });
    expect(list.jobs.every((j) => j.linesWithOwnItem === 0)).toBe(true);
  });
});
