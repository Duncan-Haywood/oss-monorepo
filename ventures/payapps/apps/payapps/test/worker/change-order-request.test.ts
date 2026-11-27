// Change order request PDF: through the HTTP API on a real local D1, plus roles and tenancy.
import type { ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

async function jobWithChangeOrder() {
  const t = await setupTenant();
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Riverside Clinic",
      number: "RC-12",
      gcName: "Harbor Builders",
      originalContractSumCents: 5_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  let project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 5_000_000 }] },
  });
  project = await call<ProjectDetailDto>(`${base}/change-orders`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      number: "7",
      description: "Two EV chargers in the garage",
      submittedOn: "2026-10-02",
      items: [
        { sovLineId: project.sovLines[0]?.id, amountCents: -100_000 },
        { newLine: { itemNumber: "CO7-1", description: "EV chargers" }, amountCents: 900_000 },
      ],
    },
  });
  const co = project.changeOrders[0];
  if (!co) throw new Error("no change order");
  return { ...t, base, coId: co.id };
}

describe("change order request PDF", () => {
  it("downloads the request with its lines and the contract sum after it", async () => {
    const { base, coId, userId } = await jobWithChangeOrder();
    const res = await api(`${base}/change-orders/${coId}/request.pdf`, { as: userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="co-7-rc-12.pdf"');
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text).toContain("(Change Order Request 7) Tj");
    expect(text).toContain("(Two EV chargers in the garage) Tj");
    expect(text).toContain("(2026-10-02) Tj");
    expect(text).toContain("($8,000.00) Tj");
    expect(text).toContain("($58,000.00) Tj");
    expect(text).toContain("(Harbor Builders) Tj");
    expect(text).toContain("(Test Mechanical) Tj");
  });

  it("is readable by a viewer; another org and an unknown change order get a 404", async () => {
    const { base, coId, orgId } = await jobWithChangeOrder();
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await api(`${base}/change-orders/${coId}/request.pdf`, { as: viewer.id })).status).toBe(
      200,
    );
    const other = await setupTenant();
    expect(
      (await api(`${base}/change-orders/${coId}/request.pdf`, { as: other.userId })).status,
    ).toBe(404);
    // Another org's change order through this org's job.
    const theirs = await jobWithChangeOrder();
    expect(
      (await api(`${base}/change-orders/${theirs.coId}/request.pdf`, { as: viewer.id })).status,
    ).toBe(404);
  });
});
