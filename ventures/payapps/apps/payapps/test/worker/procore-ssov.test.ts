// The Procore SOV placement saved with a job (PUT/DELETE /projects/:id/procore-ssov): editor-only,
// validated against the job's own base-contract lines, returned on the job, recorded in the history,
// and invisible to another company.

import type { JobEventDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, setupTenant } from "./helpers";

async function job() {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "County Library",
      gcName: "Harbor Builders",
      originalContractSumCents: 6_000_000,
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  const p = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      lines: [
        { itemNumber: "1", description: "Rough-in", originalCents: 5_000_000 },
        { itemNumber: "2", description: "Trim", originalCents: 1_000_000 },
      ],
    },
  });
  const [a, b] = p.sovLines.map((l) => l.id);
  return { ...t, as, base, a: a ?? "", b: b ?? "" };
}

const positions = [
  { position: "1", description: "Electrical", amountCents: 6_000_000 },
  { position: "2", description: "Fire alarm", amountCents: null },
];

describe("Procore SOV placement", () => {
  it("is saved, returned on the job, kept in the history and forgotten", async () => {
    const { base, as, a, b } = await job();
    expect((await call<ProjectDetailDto>(base, { as })).procoreSsov).toBeNull();
    const saved = await call<ProjectDetailDto>(`${base}/procore-ssov`, {
      method: "PUT",
      as,
      json: { positions, placed: { [a]: "1", [b]: "1" } },
    });
    expect(saved.procoreSsov?.positions).toEqual(positions);
    expect(saved.procoreSsov?.placed).toEqual({ [a]: "1", [b]: "1" });
    expect(saved.procoreSsov?.savedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await call<ProjectDetailDto>(base, { as })).procoreSsov?.placed[a]).toBe("1");
    // A PATCH of other job terms leaves it alone.
    await call(base, { method: "PATCH", as, json: { billingDay: 25 } });
    expect((await call<ProjectDetailDto>(base, { as })).procoreSsov).not.toBeNull();

    const cleared = await call<ProjectDetailDto>(`${base}/procore-ssov`, {
      method: "DELETE",
      as,
    });
    expect(cleared.procoreSsov).toBeNull();
    const history = await call<{ items: JobEventDto[] }>(`${base}/history`, { as });
    expect(history.items.filter((e) => e.text.includes("Procore SOV positions"))).toHaveLength(2);
  });

  it("refuses lines from another job, unknown or repeated positions, and bad shapes", async () => {
    const { base, as, a } = await job();
    const other = await job();
    const bad = [
      { positions, placed: { [other.a]: "1" } },
      { positions, placed: { [a]: "9" } },
      { positions: [...positions, positions[0]], placed: {} },
      { positions: [], placed: {} },
      { positions: [{ position: "", description: "", amountCents: null }], placed: {} },
      { positions: [{ position: "1", description: "", amountCents: 1.5 }], placed: {} },
      { positions },
    ];
    for (const json of bad) {
      const res = await api(`${base}/procore-ssov`, { as, method: "PUT", json });
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
    expect((await call<ProjectDetailDto>(base, { as })).procoreSsov).toBeNull();
  });

  it("is editor-only and not reachable from another company", async () => {
    const { base, as, orgId, a } = await job();
    const json = { positions, placed: { [a]: "1" } };
    const viewer = await setupTenant("owner");
    await addToOrg(orgId, viewer.userId, "viewer");
    const res = await api(`${base}/procore-ssov`, { as: viewer.userId, method: "PUT", json });
    expect(res.status).toBe(403);
    const stranger = await setupTenant("owner");
    for (const method of ["PUT", "DELETE"] as const) {
      const r = await api(`${base}/procore-ssov`, { as: stranger.userId, method, json });
      expect([403, 404]).toContain(r.status);
    }
    expect((await call<ProjectDetailDto>(base, { as })).procoreSsov).toBeNull();
  });
});
