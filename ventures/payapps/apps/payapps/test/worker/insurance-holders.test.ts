// Insurance certificates, part 3, through the HTTP API on a local D1: which jobs' GCs hold each
// certificate (the certificate holders), replaced as a list, listed with the certificate, named in
// the weekly email's renewal line, gone with the job; the role gate; tenant isolation by
// certificate and by job.
import { env } from "cloudflare:workers";
import type { InsuranceCertificateDto, InsuranceListDto, ProjectDto } from "@shared/api/types";
import { createAppContext, testFakes } from "@worker/context";
import { sendWeeklyDigests } from "@worker/services/payapps/digest";
import { beforeEach, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

const job = (orgId: string, as: string, name: string, gcName: string) =>
  call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name, gcName, originalContractSumCents: 1_000_000 },
  });

async function company() {
  const { orgId, userId: as, user } = await setupTenant("owner");
  await grantPlan(orgId); // more than the Free plan's one active job
  const cert = await call<InsuranceCertificateDto>(`/api/orgs/${orgId}/insurance`, {
    method: "POST",
    as,
    expect: 201,
    json: { kind: "general_liability", carrier: "Acme Mutual", expiresOn: "2026-12-10" },
  });
  return { orgId, as, user, cert, path: `/api/orgs/${orgId}/insurance/${cert.id}/holders` };
}

const list = (orgId: string, as: string) =>
  call<InsuranceListDto>(`/api/orgs/${orgId}/insurance`, { as });

describe("insurance certificate holders", () => {
  let t: Awaited<ReturnType<typeof company>>;
  beforeEach(async () => {
    t = await company();
  });

  it("records which jobs hold a certificate, listed with it by job name, and replaces the list", async () => {
    const clinic = await job(t.orgId, t.as, "Clinic TI", "Sierra Builders");
    const annex = await job(t.orgId, t.as, "Annex", "Sierra Builders");
    const school = await job(t.orgId, t.as, "School", "Peak GC");
    const r = await call<{ holders: { projectId: string }[] }>(t.path, {
      method: "PUT",
      as: t.as,
      json: {
        holders: [
          { projectId: clinic.id, sentOn: "2026-06-01" },
          { projectId: annex.id },
          { projectId: school.id, sentOn: null },
        ],
      },
    });
    expect(r.holders).toHaveLength(3);
    const c = (await list(t.orgId, t.as)).items[0];
    expect(c?.holders).toEqual([
      { projectId: annex.id, projectName: "Annex", gcName: "Sierra Builders", sentOn: null },
      {
        projectId: clinic.id,
        projectName: "Clinic TI",
        gcName: "Sierra Builders",
        sentOn: "2026-06-01",
      },
      { projectId: school.id, projectName: "School", gcName: "Peak GC", sentOn: null },
    ]);

    await call(t.path, { method: "PUT", as: t.as, json: { holders: [{ projectId: school.id }] } });
    expect((await list(t.orgId, t.as)).items[0]?.holders.map((h) => h.projectName)).toEqual([
      "School",
    ]);
    await call(t.path, { method: "PUT", as: t.as, json: { holders: [] } });
    expect((await list(t.orgId, t.as)).items[0]?.holders).toEqual([]);
  });

  it("refuses a job listed twice and a bad date", async () => {
    const clinic = await job(t.orgId, t.as, "Clinic TI", "Sierra Builders");
    const twice = await api(t.path, {
      method: "PUT",
      as: t.as,
      json: { holders: [{ projectId: clinic.id }, { projectId: clinic.id }] },
    });
    expect(twice.status).toBe(400);
    const badDate = await api(t.path, {
      method: "PUT",
      as: t.as,
      json: { holders: [{ projectId: clinic.id, sentOn: "June 1" }] },
    });
    expect(badDate.status).toBe(400);
  });

  it("goes with the job, and with the certificate", async () => {
    const clinic = await job(t.orgId, t.as, "Clinic TI", "Sierra Builders");
    const school = await job(t.orgId, t.as, "School", "Peak GC");
    await call(t.path, {
      method: "PUT",
      as: t.as,
      json: { holders: [{ projectId: clinic.id }, { projectId: school.id }] },
    });
    await call(`/api/orgs/${t.orgId}/projects/${clinic.id}`, { method: "DELETE", as: t.as });
    expect((await list(t.orgId, t.as)).items[0]?.holders.map((h) => h.projectName)).toEqual([
      "School",
    ]);
    await call(`/api/orgs/${t.orgId}/insurance/${t.cert.id}`, { method: "DELETE", as: t.as });
    expect((await api(t.path, { method: "PUT", as: t.as, json: { holders: [] } })).status).toBe(
      404,
    );
  });

  it("names the GCs holding a certificate in the weekly email's renewal line", async () => {
    const clinic = await job(t.orgId, t.as, "Clinic TI", "Sierra Builders");
    const annex = await job(t.orgId, t.as, "Annex", "Sierra Builders");
    const school = await job(t.orgId, t.as, "School", "Peak GC");
    await call(t.path, {
      method: "PUT",
      as: t.as,
      json: {
        holders: [{ projectId: clinic.id }, { projectId: annex.id }, { projectId: school.id }],
      },
    });
    await call(`/api/orgs/${t.orgId}/digest`, { method: "PUT", as: t.as, json: { enabled: true } });
    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(createAppContext(env, { now: () => new Date("2026-11-23T13:00:00Z") }));
    const mine = testFakes.email.sent.slice(before).filter((m) => m.to.includes(t.user.email));
    expect(mine).toHaveLength(1);
    // Sierra Builders once, though it holds the certificate on two jobs.
    expect(mine[0]?.text).toContain(
      "General liability (Acme Mutual): expires 2026-12-10, in 17 days. Ask your insurer or agent for the renewal certificate. Held by Peak GC and Sierra Builders.",
    );
  });

  it("lets viewers read the holders and only editors change them", async () => {
    const clinic = await job(t.orgId, t.as, "Clinic TI", "Sierra Builders");
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    const r = await api(t.path, {
      method: "PUT",
      as: viewer.id,
      json: { holders: [{ projectId: clinic.id }] },
    });
    expect(r.status).toBe(403);
    await call(t.path, { method: "PUT", as: t.as, json: { holders: [{ projectId: clinic.id }] } });
    expect((await list(t.orgId, viewer.id)).items[0]?.holders).toHaveLength(1);
  });

  it("never links another company's job, or touches another company's certificate", async () => {
    const other = await company();
    const theirJob = await job(other.orgId, other.as, "Their job", "Their GC");
    const mine = await job(t.orgId, t.as, "Clinic TI", "Sierra Builders");
    // Their job on my certificate: not found, and nothing saved.
    const r1 = await api(t.path, {
      method: "PUT",
      as: t.as,
      json: { holders: [{ projectId: mine.id }, { projectId: theirJob.id }] },
    });
    expect(r1.status).toBe(404);
    expect((await list(t.orgId, t.as)).items[0]?.holders).toEqual([]);
    // My job on their certificate, through my company's path: not found.
    const r2 = await api(`/api/orgs/${t.orgId}/insurance/${other.cert.id}/holders`, {
      method: "PUT",
      as: t.as,
      json: { holders: [{ projectId: mine.id }] },
    });
    expect(r2.status).toBe(404);
    // Their path as me: not a member.
    const r3 = await api(other.path, { method: "PUT", as: t.as, json: { holders: [] } });
    expect([403, 404]).toContain(r3.status);
    expect((await list(other.orgId, other.as)).items[0]?.holders).toEqual([]);
  });
});
