// The job's notary block setting: off on a new job, set on the new-job form or the job page, printed
// on the application summary PDF (jurat and seal box) only when on, recorded in the job history,
// and editor-only.
import type { JobEventDto, PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, setupTenant } from "./helpers";

async function jobWithPayApp(extra: Record<string, unknown> = {}) {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "County Library",
      gcName: "Harbor Builders",
      originalContractSumCents: 1_000_000,
      ...extra,
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 1_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
  });
  const pdf = async () => {
    const res = await api(`${base}/pay-apps/${app.id}/application.pdf`, { as });
    expect(res.status).toBe(200);
    return new TextDecoder().decode(await res.arrayBuffer());
  };
  return { ...t, created, base, pdf };
}

describe("notary block", () => {
  it("is off on a new job and printed only once turned on", async () => {
    const { created, base, userId: as, pdf } = await jobWithPayApp();
    expect(created.notaryBlock).toBe(false);
    expect(await pdf()).not.toContain("Subscribed and sworn");

    const on = await call<ProjectDto>(base, { method: "PATCH", as, json: { notaryBlock: true } });
    expect(on.notaryBlock).toBe(true);
    const text = await pdf();
    expect(text).toContain("(Subscribed and sworn to \\(or affirmed\\) before me on");
    expect(text).toContain("(Seal) Tj");

    const off = await call<ProjectDto>(base, { method: "PATCH", as, json: { notaryBlock: false } });
    expect(off.notaryBlock).toBe(false);
    expect(await pdf()).not.toContain("Subscribed and sworn");

    const history = await call<{ items: JobEventDto[] }>(`${base}/history`, { as });
    expect(
      history.items.filter((e) => e.text.includes("notary block on the application")),
    ).toHaveLength(2);
  });

  it("can be set on the new-job form", async () => {
    const { created, pdf } = await jobWithPayApp({ notaryBlock: true });
    expect(created.notaryBlock).toBe(true);
    expect(await pdf()).toContain("(Seal) Tj");
  });

  it("refuses a non-boolean and a viewer's change", async () => {
    const { base, orgId, userId: as } = await jobWithPayApp();
    const bad = await api(base, { as, method: "PATCH", json: { notaryBlock: "yes" } });
    expect(bad.status).toBe(400);
    const viewer = await setupTenant("owner");
    await addToOrg(orgId, viewer.userId, "viewer");
    const res = await api(base, {
      as: viewer.userId,
      method: "PATCH",
      json: { notaryBlock: true },
    });
    expect(res.status).toBe(403);
    const after = await call<ProjectDto>(base, { as });
    expect(after.notaryBlock).toBe(false);
  });
});
