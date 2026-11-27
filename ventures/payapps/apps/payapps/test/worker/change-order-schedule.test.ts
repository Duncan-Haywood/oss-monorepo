// The contract time a change order asks for: recorded on create, changed while pending, printed on
// the change order request PDF.
import type { ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

let as: string;
let orgId: string;
let base: string;
let project: ProjectDetailDto;

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  orgId = t.orgId;
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Example Clinic TI",
      number: "P-101",
      gcName: "Example Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
    },
  });
  base = `/api/orgs/${orgId}/projects/${created.id}`;
  project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 10_000_000 }] },
  });
});

const pdfText = async (coId: string | undefined, user = as) =>
  new TextDecoder().decode(
    await (await api(`${base}/change-orders/${coId}/request.pdf`, { as: user })).arrayBuffer(),
  );

describe("change order contract time", () => {
  it("records it on create, prints it, and changes it while pending", async () => {
    project = await call<ProjectDetailDto>(`${base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        number: "CO-1",
        description: "Add two exhaust fans per RFI 12",
        scheduleDays: 3,
        items: [{ sovLineId: project.sovLines[0]?.id, amountCents: 250_000 }],
      },
    });
    const co = project.changeOrders.find((c) => c.number === "CO-1");
    expect(co?.scheduleDays).toBe(3);
    expect(await pdfText(co?.id)).toContain("an extension of 3 calendar days is requested");

    project = await call<ProjectDetailDto>(`${base}/change-orders/${co?.id}/schedule`, {
      method: "PUT",
      as,
      json: { scheduleDays: 0 },
    });
    expect(project.changeOrders[0]?.scheduleDays).toBe(0);
    expect(await pdfText(co?.id)).toContain("Contract time: no change requested.");

    for (const bad of [-1, 2.5, 5000, "3"]) {
      const res = await api(`${base}/change-orders/${co?.id}/schedule`, {
        method: "PUT",
        as,
        json: { scheduleDays: bad },
      });
      expect(res.status, String(bad)).toBe(400);
    }
  });

  it("is not stated when left out", async () => {
    const p = await call<ProjectDetailDto>(`${base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        number: "CO-2",
        description: "Credit",
        items: [{ sovLineId: project.sovLines[0]?.id, amountCents: -100_000 }],
      },
    });
    const co = p.changeOrders.find((c) => c.number === "CO-2");
    expect(co?.scheduleDays).toBeNull();
    expect(await pdfText(co?.id)).toContain("not stated in this request");
  });

  it("viewers cannot change it, and it is fixed once approved", async () => {
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const co = project.changeOrders.find((c) => c.number === "CO-1");
    const denied = await api(`${base}/change-orders/${co?.id}/schedule`, {
      method: "PUT",
      as: viewer.id,
      json: { scheduleDays: 9 },
    });
    expect(denied.status).toBe(403);
    await call(`${base}/change-orders/${co?.id}/approve`, {
      method: "POST",
      as,
      json: { approvedOn: "2026-11-01" },
    });
    const locked = await api(`${base}/change-orders/${co?.id}/schedule`, {
      method: "PUT",
      as,
      json: { scheduleDays: 9 },
    });
    expect(locked.status).toBe(409);
  });
});
