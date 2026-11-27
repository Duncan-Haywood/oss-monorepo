// QuickBooks, an item per job (docs/QUICKBOOKS.md, "An item per job"): an admin bills one job's
// work lines with a different item from the company's; the preview and the send use it, a job's
// item made inactive stops that job's send only, null goes back to the company's item, another
// QuickBooks company ignores it, and the sample job and other companies' jobs are refused.

import type {
  PayAppDetailDto,
  PayAppQuickBooksDto,
  ProjectDetailDto,
  ProjectDto,
  QuickBooksItemsDto,
} from "@shared/api/types";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let laborId: string;
let serviceId: string;
let retainageId: string;
const jobs: Record<"library" | "clinic", { id: string; base: string; apps: string[] }> = {
  library: { id: "", base: "", apps: [] },
  clinic: { id: "", base: "", apps: [] },
};

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

const itemsUrl = () => `/api/orgs/${orgId}/quickbooks/items`;
const jobUrl = (projectId: string) => `/api/orgs/${orgId}/quickbooks/job-items/${projectId}`;

async function makeJob(name: string, number: string) {
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name, number, gcName: "Saguaro General", originalContractSumCents: 8_000_000 },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Branch wiring", originalCents: 8_000_000 }] },
  });
  const sovLineId = d.sovLines[0]?.id;
  const apps: string[] = [];
  for (const [from, to] of [
    ["2026-09-01", "2026-09-30"],
    ["2026-10-01", "2026-10-31"],
  ] as const) {
    const a = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: from, periodTo: to, applicationDate: to },
    });
    await call(`${base}/pay-apps/${a.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          {
            sovLineId,
            workThisPeriodCents: 1_000_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    await call(`${base}/pay-apps/${a.id}/submit`, { method: "POST", as });
    apps.push(a.id);
  }
  return { id: p.id, base, apps };
}

const workItemIds = async (docNumber: string) => {
  const invoice = await (await books()).findInvoiceByDocNumber(docNumber);
  return [...new Set(invoice?.lines.filter((l) => l.itemId !== retainageId).map((l) => l.itemId))];
};

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  await grantPlan(orgId, "crew", "active");
  jobs.library = await makeJob("Desert View Library", "25-031");
  jobs.clinic = await makeJob("Mesa Clinic Service", "25-040");
  await connect(orgId, as);
  const b = await books();
  const construction = await b.ensureAccount({
    name: "Construction Income",
    accountType: "Income",
  });
  const service = await b.ensureAccount({ name: "Service Income", accountType: "Income" });
  laborId = (
    await b.ensureItem({
      name: "Electrical Labor",
      type: "Service",
      incomeAccountId: construction.id,
    })
  ).id;
  serviceId = (
    await b.ensureItem({ name: "Service Calls", type: "Service", incomeAccountId: service.id })
  ).id;
  retainageId = (await b.ensureRetainageSetup()).item.id;
  await call(`/api/orgs/${orgId}/quickbooks/invoice-item`, {
    method: "PUT",
    as,
    json: { itemId: laborId },
  });
});

describe("QuickBooks item per job", () => {
  it("lists every job on the company's item, the sample job left out", async () => {
    const sample = await call<ProjectDto>(`/api/orgs/${orgId}/projects/sample`, {
      method: "POST",
      as,
      expect: 201,
    });
    const refused = await api(jobUrl(sample.id), { method: "PUT", as, json: { itemId: laborId } });
    expect(refused.status).toBe(409);
    const list = await call<QuickBooksItemsDto>(itemsUrl(), { as });
    expect(list.jobs.map((j) => j.name).sort()).toEqual([
      "Desert View Library",
      "Mesa Clinic Service",
    ]);
    expect(list.jobs.every((j) => j.item === null)).toBe(true);
  });

  it("is for admins only, and refuses the retainage item, unknown items and bad ids", async () => {
    const editor = await createTestUser();
    await addToOrg(orgId, editor.id, "editor");
    const r0 = await api(jobUrl(jobs.clinic.id), {
      method: "PUT",
      as: editor.id,
      json: { itemId: serviceId },
    });
    expect(r0.status).toBe(403);
    const r1 = await api(jobUrl(jobs.clinic.id), {
      method: "PUT",
      as,
      json: { itemId: retainageId },
    });
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { error: { message: string } }).error.message).toMatch(
      /retainage item/,
    );
    expect(
      (await api(jobUrl(jobs.clinic.id), { method: "PUT", as, json: { itemId: "99999" } })).status,
    ).toBe(400);
    expect(
      (await api(jobUrl(jobs.clinic.id), { method: "PUT", as, json: { itemId: "1 OR 1=1" } }))
        .status,
    ).toBe(400);
    expect(
      (await api(jobUrl("prj_missing"), { method: "PUT", as, json: { itemId: null } })).status,
    ).toBe(404);
    const list = await call<QuickBooksItemsDto>(itemsUrl(), { as });
    expect(list.jobs.every((j) => j.item === null)).toBe(true);
  });

  it("bills that job with its own item and the others with the company's", async () => {
    const set = await call<QuickBooksItemsDto>(jobUrl(jobs.clinic.id), {
      method: "PUT",
      as,
      json: { itemId: serviceId },
    });
    expect(set.jobs.find((j) => j.projectId === jobs.clinic.id)?.item).toEqual({
      id: serviceId,
      name: "Service Calls",
    });
    expect(set.current).toEqual({ id: laborId, name: "Electrical Labor" });
    const q = await call<PayAppQuickBooksDto>(
      `${jobs.clinic.base}/pay-apps/${jobs.clinic.apps[0]}/quickbooks`,
      { as },
    );
    expect(q.preview?.workItemName).toBe("Service Calls");
    const ql = await call<PayAppQuickBooksDto>(
      `${jobs.library.base}/pay-apps/${jobs.library.apps[0]}/quickbooks`,
      { as },
    );
    expect(ql.preview?.workItemName).toBe("Electrical Labor");

    await call(`${jobs.clinic.base}/pay-apps/${jobs.clinic.apps[0]}/quickbooks`, {
      method: "POST",
      as,
    });
    await call(`${jobs.library.base}/pay-apps/${jobs.library.apps[0]}/quickbooks`, {
      method: "POST",
      as,
    });
    expect(await workItemIds("PA25-040-01")).toEqual([serviceId]);
    expect(await workItemIds("PA25-031-01")).toEqual([laborId]);
  });

  it("stops only that job's send when its item was made inactive", async () => {
    (await books()).inactiveItems.add(serviceId);
    const res = await api(`${jobs.clinic.base}/pay-apps/${jobs.clinic.apps[1]}/quickbooks`, {
      method: "POST",
      as,
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(
      /job Mesa Clinic Service \("Service Calls"\) is no longer active.*nothing was sent/,
    );
    expect(await (await books()).findInvoiceByDocNumber("PA25-040-02")).toBeNull();
    const ok = await call<PayAppQuickBooksDto>(
      `${jobs.library.base}/pay-apps/${jobs.library.apps[1]}/quickbooks`,
      {
        method: "POST",
        as,
      },
    );
    expect(ok.sent?.docNumber).toBe("PA25-031-02");
  });

  it("goes back to the company's item on null", async () => {
    const reset = await call<QuickBooksItemsDto>(jobUrl(jobs.clinic.id), {
      method: "PUT",
      as,
      json: { itemId: null },
    });
    expect(reset.jobs.find((j) => j.projectId === jobs.clinic.id)?.item).toBeNull();
    await call(`${jobs.clinic.base}/pay-apps/${jobs.clinic.apps[1]}/quickbooks`, {
      method: "POST",
      as,
    });
    expect(await workItemIds("PA25-040-02")).toEqual([laborId]);
  });

  it("another company cannot set this company's jobs, nor its own on this company's job", async () => {
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    const res = await api(jobUrl(jobs.clinic.id), {
      method: "PUT",
      as: other.userId,
      json: { itemId: null },
    });
    expect(res.status).toBe(404);
    await connect(other.orgId, other.userId);
    const cross = await api(`/api/orgs/${other.orgId}/quickbooks/job-items/${jobs.clinic.id}`, {
      method: "PUT",
      as: other.userId,
      json: { itemId: null },
    });
    expect(cross.status).toBe(404);
  });

  it("a different QuickBooks company ignores the job's item", async () => {
    (await books()).inactiveItems.delete(serviceId);
    await call(jobUrl(jobs.clinic.id), { method: "PUT", as, json: { itemId: serviceId } });
    await connect(orgId, as); // the fake gateway gives every connection a new company
    const list = await call<QuickBooksItemsDto>(itemsUrl(), { as });
    expect(list.jobs.every((j) => j.item === null)).toBe(true);
  });
});
