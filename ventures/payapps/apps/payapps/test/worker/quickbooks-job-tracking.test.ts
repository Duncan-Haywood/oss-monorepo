// QuickBooks, class and location per job (docs/QUICKBOOKS.md, "Class and location per job"): an
// admin gives a job the company's QuickBooks class and location (QuickBooks Plus and Advanced);
// the invoice carries the class on every line or on the invoice, as the company tracks it, and the
// location on the invoice; the credit memo for a balance closed short does the same. A choice made
// inactive stops that job's send; a kind the company stopped tracking is left off; null clears;
// another QuickBooks company ignores it; the sample job, other companies' jobs and non-admins are
// refused.

import type {
  PayAppDetailDto,
  PayAppQuickBooksDto,
  ProjectDetailDto,
  ProjectDto,
  QuickBooksTrackingDto,
} from "@shared/api/types";
import { qboConnections } from "@worker/db/schema";
import { fakeQuickBooks } from "@worker/ports/accounting";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

let as: string;
let orgId: string;
let newWork: { id: string; name: string; fullName: string };
let ti: { id: string; name: string; fullName: string };
let denver: { id: string; name: string; fullName: string };
type Job = { id: string; base: string; apps: string[] };
let library: Job;
let clinic: Job;

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

const trackingUrl = () => `/api/orgs/${orgId}/quickbooks/tracking`;
const jobUrl = (projectId: string) => `/api/orgs/${orgId}/quickbooks/tracking/${projectId}`;

// Three submitted applications of $10,000 work each, 10% retainage: line 8 is $9,000 each.
async function makeJob(name: string, number: string): Promise<Job> {
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name,
      number,
      gcName: "Saguaro General",
      originalContractSumCents: 8_000_000,
      retainagePctBps: 1000,
    },
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
    ["2026-08-01", "2026-08-31"],
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

const send = (job: Job, n: number) =>
  api(`${job.base}/pay-apps/${job.apps[n]}/quickbooks`, { method: "POST", as });

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { message: string } }).error.message;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  await grantPlan(orgId, "crew", "active");
  library = await makeJob("Desert View Library", "25-031");
  clinic = await makeJob("Mesa Clinic", "25-040");
  await connect(orgId, as);
  const b = await books();
  newWork = b.addClass("New work");
  ti = b.addClass("Tenant improvements", newWork);
  denver = b.addLocation("Denver");
});

describe("QuickBooks class and location per job", () => {
  it("offers nothing while the company tracks neither, and refuses a choice", async () => {
    const t = await call<QuickBooksTrackingDto>(trackingUrl(), { as });
    expect(t).toMatchObject({
      classTracking: "off",
      locationTracking: false,
      locationLabel: "Location",
      classes: [],
      locations: [],
    });
    expect(t.jobs.map((j) => j.name)).toEqual(["Desert View Library", "Mesa Clinic"]);
    const res = await api(jobUrl(clinic.id), { method: "PUT", as, json: { classId: ti.id } });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/does not track classes/);
    const loc = await api(jobUrl(clinic.id), {
      method: "PUT",
      as,
      json: { locationId: denver.id },
    });
    expect(loc.status).toBe(400);
  });

  it("lists classes (sub-classes by full name) and locations under the company's own word", async () => {
    (await books()).trackingPrefs = {
      classTracking: "per-line",
      locationTracking: true,
      locationLabel: "Division",
    };
    const t = await call<QuickBooksTrackingDto>(trackingUrl(), { as });
    expect(t.classes.map((c) => c.fullName)).toEqual(["New work", "New work:Tenant improvements"]);
    expect(t.locations.map((l) => l.name)).toEqual(["Denver"]);
    expect(t.locationLabel).toBe("Division");
  });

  it("is for admins only, and refuses unknown or malformed ids, empty bodies and the sample job", async () => {
    const editor = await createTestUser();
    await addToOrg(orgId, editor.id, "editor");
    expect((await api(trackingUrl(), { as: editor.id })).status).toBe(403);
    expect(
      (await api(jobUrl(clinic.id), { method: "PUT", as: editor.id, json: { classId: ti.id } }))
        .status,
    ).toBe(403);
    expect(
      (await api(jobUrl(clinic.id), { method: "PUT", as, json: { classId: "99999" } })).status,
    ).toBe(400);
    expect(
      (await api(jobUrl(clinic.id), { method: "PUT", as, json: { classId: "1' OR '1'='1" } }))
        .status,
    ).toBe(400);
    expect((await api(jobUrl(clinic.id), { method: "PUT", as, json: {} })).status).toBe(400);
    expect(
      (await api(jobUrl(clinic.id), { method: "PUT", as, json: { classId: ti.id, other: 1 } }))
        .status,
    ).toBe(400);
    expect(
      (await api(jobUrl("prj_missing"), { method: "PUT", as, json: { classId: null } })).status,
    ).toBe(404);
    const sample = await call<ProjectDto>(`/api/orgs/${orgId}/projects/sample`, {
      method: "POST",
      as,
      expect: 201,
    });
    expect(
      (await api(jobUrl(sample.id), { method: "PUT", as, json: { classId: ti.id } })).status,
    ).toBe(409);
    const t = await call<QuickBooksTrackingDto>(trackingUrl(), { as });
    expect(t.jobs.map((j) => j.name)).not.toContain(sample.name);
    expect(t.jobs.every((j) => j.class === null && j.location === null)).toBe(true);
  });

  it("puts the class on every line and the location on the invoice (class per line)", async () => {
    const set = await call<QuickBooksTrackingDto>(jobUrl(clinic.id), {
      method: "PUT",
      as,
      json: { classId: ti.id, locationId: denver.id },
    });
    expect(set.jobs.find((j) => j.projectId === clinic.id)).toMatchObject({
      class: { id: ti.id, name: "New work:Tenant improvements" },
      location: { id: denver.id, name: "Denver" },
    });
    const q = await call<PayAppQuickBooksDto>(
      `${clinic.base}/pay-apps/${clinic.apps[0]}/quickbooks`,
      {
        as,
      },
    );
    expect(q.preview).toMatchObject({
      className: "New work:Tenant improvements",
      locationName: "Denver",
    });
    expect((await send(clinic, 0)).status).toBe(200);
    expect((await send(library, 0)).status).toBe(200);
    const inv = await (await books()).findInvoiceByDocNumber("PA25-040-01");
    expect(inv?.locationId).toBe(denver.id);
    expect(inv?.classId).toBeUndefined();
    expect(inv?.lines).toHaveLength(2); // work and retainage held
    expect(inv?.lines.every((l) => l.classId === ti.id)).toBe(true);
    const other = await (await books()).findInvoiceByDocNumber("PA25-031-01");
    expect(other?.locationId).toBeUndefined();
    expect(other?.lines.every((l) => l.classId === undefined)).toBe(true);
  });

  it("puts the class on the invoice when the company tracks one class per transaction", async () => {
    (await books()).trackingPrefs = {
      classTracking: "per-transaction",
      locationTracking: true,
      locationLabel: null,
    };
    expect((await send(clinic, 1)).status).toBe(200);
    const inv = await (await books()).findInvoiceByDocNumber("PA25-040-02");
    expect(inv?.classId).toBe(ti.id);
    expect(inv?.locationId).toBe(denver.id);
    expect(inv?.lines.every((l) => l.classId === undefined)).toBe(true);
  });

  it("stops only that job's send when its class or location was made inactive", async () => {
    const b = await books();
    b.inactiveTracking.add(ti.id);
    const res = await send(clinic, 2);
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatch(
      /class chosen for the job Mesa Clinic \("New work:Tenant improvements"\) is no longer active.*nothing was sent/,
    );
    b.inactiveTracking.delete(ti.id);
    b.inactiveTracking.add(denver.id);
    const loc = await send(clinic, 2);
    expect(loc.status).toBe(409);
    expect(await errorOf(loc)).toMatch(/location chosen for the job Mesa Clinic \("Denver"\)/);
    b.inactiveTracking.delete(denver.id);
    expect(await b.findInvoiceByDocNumber("PA25-040-03")).toBeNull();
    expect((await send(library, 1)).status).toBe(200);
  });

  it("leaves off a kind the company stopped tracking", async () => {
    (await books()).trackingPrefs = {
      classTracking: "off",
      locationTracking: true,
      locationLabel: null,
    };
    expect((await send(clinic, 2)).status).toBe(200);
    const inv = await (await books()).findInvoiceByDocNumber("PA25-040-03");
    expect(inv?.classId).toBeUndefined();
    expect(inv?.lines.every((l) => l.classId === undefined)).toBe(true);
    expect(inv?.locationId).toBe(denver.id);
  });

  it("clears one with null and keeps the other", async () => {
    (await books()).trackingPrefs = {
      classTracking: "per-line",
      locationTracking: true,
      locationLabel: null,
    };
    const out = await call<QuickBooksTrackingDto>(jobUrl(clinic.id), {
      method: "PUT",
      as,
      json: { locationId: null },
    });
    expect(out.jobs.find((j) => j.projectId === clinic.id)).toMatchObject({
      class: { id: ti.id },
      location: null,
    });
    const both = await call<QuickBooksTrackingDto>(jobUrl(clinic.id), {
      method: "PUT",
      as,
      json: { classId: null },
    });
    expect(both.jobs.find((j) => j.projectId === clinic.id)).toMatchObject({
      class: null,
      location: null,
    });
  });

  it("another company cannot read or set this company's jobs", async () => {
    const other = await setupTenant("owner");
    await grantPlan(other.orgId, "crew", "active");
    await connect(other.orgId, other.userId);
    const cross = await api(`/api/orgs/${other.orgId}/quickbooks/tracking/${clinic.id}`, {
      method: "PUT",
      as: other.userId,
      json: { classId: null },
    });
    expect(cross.status).toBe(404);
    expect(
      (await api(jobUrl(clinic.id), { method: "PUT", as: other.userId, json: { classId: null } }))
        .status,
    ).toBe(404);
  });

  it("a different QuickBooks company ignores the job's choice", async () => {
    await call(jobUrl(library.id), { method: "PUT", as, json: { classId: newWork.id } });
    await connect(orgId, as); // the fake gateway gives every connection a new company
    const t = await call<QuickBooksTrackingDto>(trackingUrl(), { as });
    expect(t.jobs.every((j) => j.class === null && j.location === null)).toBe(true);
  });
});

describe("QuickBooks class and location on a credit memo", () => {
  it("carries the job's class and location on the credit for a balance closed short", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId, "crew", "active");
    const saved = { as, orgId };
    as = t.userId;
    orgId = t.orgId;
    try {
      const job = await makeJob("Elm St clinic", "24-117");
      await connect(orgId, as);
      const b = await books();
      b.trackingPrefs = { classTracking: "per-line", locationTracking: true, locationLabel: null };
      const cls = b.addClass("Service");
      const loc = b.addLocation("Phoenix");
      await call(jobUrl(job.id), {
        method: "PUT",
        as,
        json: { classId: cls.id, locationId: loc.id },
      });
      const appPath = `${job.base}/pay-apps/${job.apps[0]}`;
      expect((await send(job, 0)).status).toBe(200);
      const paid = await call<PayAppDetailDto>(`${appPath}/payments`, {
        method: "POST",
        as,
        expect: 201,
        json: { amountCents: 800_000, receivedOn: "2026-11-18", reference: "CHK-881" },
      });
      await call(`${appPath}/payments/${paid.payments[0]?.id}/quickbooks`, { method: "POST", as });
      await call(`${appPath}/close-short`, {
        method: "POST",
        as,
        json: { reason: "backcharge", closedOn: "2026-11-20", note: "Cleanup" },
      });
      const out = await call<PayAppQuickBooksDto>(`${appPath}/quickbooks/short-credit`, {
        method: "POST",
        as,
      });
      expect(out.shortCredit?.sent?.docNumber).toBe("CR24-117-01");
      const memoCall = b.calls.findLast((c) => c.method === "createCreditMemo");
      expect(memoCall?.input).toMatchObject({
        locationId: loc.id,
        lines: [{ classId: cls.id, amountCents: 100_000 }],
      });
    } finally {
      ({ as, orgId } = saved);
    }
  });
});
