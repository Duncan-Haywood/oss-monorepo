// Insurance certificates, part 4, through the HTTP API on a local D1: a job's insurance requirements
// (coverages, minimum limits, endorsements) replaced as a list and checked against the certificates
// on file with their limits and endorsements; gone with the job; the role gate; tenant isolation.
import type {
  InsuranceCertificateDto,
  JobInsuranceRequirementsDto,
  ProjectDto,
} from "@shared/api/types";
import { beforeEach, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

const M = 100_000_000; // $1,000,000 in cents

async function company() {
  const { orgId, userId: as } = await setupTenant("owner");
  await grantPlan(orgId);
  const job = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Clinic TI", gcName: "Sierra Builders", originalContractSumCents: 1_000_000 },
  });
  return { orgId, as, job, path: `/api/orgs/${orgId}/insurance/requirements/${job.id}` };
}

const addCert = (orgId: string, as: string, json: Record<string, unknown>) =>
  call<InsuranceCertificateDto>(`/api/orgs/${orgId}/insurance`, {
    method: "POST",
    as,
    expect: 201,
    json,
  });

describe("insurance requirements per job", () => {
  let t: Awaited<ReturnType<typeof company>>;
  beforeEach(async () => {
    t = await company();
  });

  it("keeps a certificate's limits and endorsements, and changes them", async () => {
    const c = await addCert(t.orgId, t.as, {
      kind: "general_liability",
      expiresOn: "2099-01-01",
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
      additionalInsured: true,
    });
    expect(c).toMatchObject({
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
      additionalInsured: true,
      waiverOfSubrogation: false,
      primaryNoncontributory: false,
    });
    const u = await call<InsuranceCertificateDto>(`/api/orgs/${t.orgId}/insurance/${c.id}`, {
      method: "PATCH",
      as: t.as,
      json: { aggregateCents: null, waiverOfSubrogation: true },
    });
    expect(u).toMatchObject({
      eachOccurrenceCents: M,
      aggregateCents: null,
      waiverOfSubrogation: true,
    });
    // A plain edit leaves them alone.
    const n = await call<InsuranceCertificateDto>(`/api/orgs/${t.orgId}/insurance/${c.id}`, {
      method: "PATCH",
      as: t.as,
      json: { notes: "renewed" },
    });
    expect(n).toMatchObject({
      eachOccurrenceCents: M,
      additionalInsured: true,
      waiverOfSubrogation: true,
    });
    const neg = await api(`/api/orgs/${t.orgId}/insurance/${c.id}`, {
      method: "PATCH",
      as: t.as,
      json: { eachOccurrenceCents: -1 },
    });
    expect(neg.status).toBe(400);
  });

  it("saves a job's requirements and checks them against the certificates on file", async () => {
    await addCert(t.orgId, t.as, {
      kind: "general_liability",
      carrier: "Acme Mutual",
      expiresOn: "2099-01-01",
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
      additionalInsured: true,
    });
    await addCert(t.orgId, t.as, {
      kind: "umbrella",
      expiresOn: "2099-01-01",
      eachOccurrenceCents: 4 * M,
      aggregateCents: 4 * M,
    });
    const empty = await call<JobInsuranceRequirementsDto>(t.path, { as: t.as });
    expect(empty.requirements).toEqual([]);
    expect(empty.checks).toEqual([]);

    const r = await call<JobInsuranceRequirementsDto>(t.path, {
      method: "PUT",
      as: t.as,
      json: {
        requirements: [
          { kind: "workers_comp" },
          {
            kind: "general_liability",
            eachOccurrenceCents: 2 * M,
            aggregateCents: 2 * M,
            additionalInsured: true,
            waiverOfSubrogation: true,
            umbrellaCounts: true,
          },
        ],
      },
    });
    // Coverage order, not the order sent.
    expect(r.requirements.map((x) => x.kind)).toEqual(["general_liability", "workers_comp"]);
    expect(r.requirements[1]).toEqual({
      kind: "workers_comp",
      eachOccurrenceCents: null,
      aggregateCents: null,
      additionalInsured: false,
      waiverOfSubrogation: false,
      primaryNoncontributory: false,
      umbrellaCounts: false,
    });
    const [gl, wc] = r.checks;
    expect(gl).toMatchObject({
      met: false,
      usedUmbrella: true,
      certificateName: "General liability (Acme Mutual)",
    });
    expect(gl?.gaps.map((g) => g.kind)).toEqual(["endorsement"]);
    expect(wc?.gaps).toEqual([
      {
        kind: "missing",
        message: "Workers' compensation: no certificate on file, and the job asks for it.",
      },
    ]);

    // Replacing the list replaces it.
    const r2 = await call<JobInsuranceRequirementsDto>(t.path, {
      method: "PUT",
      as: t.as,
      json: { requirements: [{ kind: "general_liability", eachOccurrenceCents: M }] },
    });
    expect(r2.checks).toMatchObject([{ kind: "general_liability", met: true }]);
    await call(t.path, { method: "PUT", as: t.as, json: { requirements: [] } });
    expect((await call<JobInsuranceRequirementsDto>(t.path, { as: t.as })).requirements).toEqual(
      [],
    );
  });

  it("refuses a coverage listed twice and a bad limit", async () => {
    const twice = await api(t.path, {
      method: "PUT",
      as: t.as,
      json: { requirements: [{ kind: "auto" }, { kind: "auto" }] },
    });
    expect(twice.status).toBe(400);
    const bad = await api(t.path, {
      method: "PUT",
      as: t.as,
      json: { requirements: [{ kind: "auto", eachOccurrenceCents: 1.5 }] },
    });
    expect(bad.status).toBe(400);
  });

  it("goes with the job", async () => {
    await call(t.path, { method: "PUT", as: t.as, json: { requirements: [{ kind: "auto" }] } });
    await call(`/api/orgs/${t.orgId}/projects/${t.job.id}`, { method: "DELETE", as: t.as });
    expect((await api(t.path, { as: t.as })).status).toBe(404);
  });

  it("lets viewers read the requirements and only editors change them", async () => {
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    const r = await api(t.path, {
      method: "PUT",
      as: viewer.id,
      json: { requirements: [{ kind: "auto" }] },
    });
    expect(r.status).toBe(403);
    await call(t.path, { method: "PUT", as: t.as, json: { requirements: [{ kind: "auto" }] } });
    expect(
      (await call<JobInsuranceRequirementsDto>(t.path, { as: viewer.id })).requirements,
    ).toHaveLength(1);
  });

  it("never reads or writes another company's job, nor checks against its certificates", async () => {
    const other = await company();
    await addCert(other.orgId, other.as, { kind: "auto", expiresOn: "2099-01-01" });
    // Their job through my company's path: not found, both ways.
    const theirs = `/api/orgs/${t.orgId}/insurance/requirements/${other.job.id}`;
    expect((await api(theirs, { as: t.as })).status).toBe(404);
    expect(
      (await api(theirs, { method: "PUT", as: t.as, json: { requirements: [{ kind: "auto" }] } }))
        .status,
    ).toBe(404);
    expect(
      (await call<JobInsuranceRequirementsDto>(other.path, { as: other.as })).requirements,
    ).toEqual([]);
    // Their path as me: not a member.
    expect([403, 404]).toContain((await api(other.path, { as: t.as })).status);
    // My job's auto requirement is not met by their auto certificate.
    const mine = await call<JobInsuranceRequirementsDto>(t.path, {
      method: "PUT",
      as: t.as,
      json: { requirements: [{ kind: "auto" }] },
    });
    expect(mine.checks[0]?.gaps[0]?.kind).toBe("missing");
  });
});
