// The GC project manager on a job: who change order requests go to. Saved through the project API,
// validated like the billing contact, printed as the "Attn" line on the change order request PDF
// (never the billing contact there), and editor-only.
import type { ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, setupTenant } from "./helpers";

async function jobWithChangeOrder(extra: Record<string, unknown> = {}) {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Riverside Clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 5_000_000,
      gcBillingName: "Accounts Payable",
      gcBillingEmail: "ap@harbor.example",
      ...extra,
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
      items: [{ sovLineId: project.sovLines[0]?.id, amountCents: 900_000 }],
    },
  });
  const coId = project.changeOrders[0]?.id;
  if (!coId) throw new Error("no change order");
  const pdf = async () =>
    new TextDecoder().decode(
      await (await api(`${base}/change-orders/${coId}/request.pdf`, { as })).arrayBuffer(),
    );
  return { ...t, created, base, pdf };
}

describe("GC project manager", () => {
  it("is set on the new-job form, printed on the request PDF, changed and cleared", async () => {
    const {
      created,
      base,
      userId: as,
      pdf,
    } = await jobWithChangeOrder({
      gcPmName: "Dana Ruiz",
      gcPmEmail: "dana@harbor.example",
    });
    expect(created.gcPmName).toBe("Dana Ruiz");
    expect(created.gcPmEmail).toBe("dana@harbor.example");
    let text = await pdf();
    expect(text).toContain("(Attn: Dana Ruiz, dana@harbor.example) Tj");
    // The billing contact handles pay applications, not change orders.
    expect(text).not.toContain("ap@harbor.example");

    const changed = await call<ProjectDto>(base, {
      method: "PATCH",
      as,
      json: { gcPmName: null, gcPmEmail: " sam@harbor.example " },
    });
    expect(changed.gcPmName).toBeNull();
    expect(changed.gcPmEmail).toBe("sam@harbor.example");
    // The billing contact is untouched by a PM change.
    expect(changed.gcBillingEmail).toBe("ap@harbor.example");
    expect(await pdf()).toContain("(Attn: sam@harbor.example) Tj");

    const cleared = await call<ProjectDto>(base, { method: "PATCH", as, json: { gcPmEmail: "" } });
    expect(cleared.gcPmEmail).toBeNull();
    text = await pdf();
    expect(text).not.toContain("Attn:");
  });

  it("refuses an address that is not one, including one that would add a recipient", async () => {
    const { base, userId: as } = await jobWithChangeOrder();
    for (const bad of ["not an email", "a@b.com,c@d.com", "a@b.com\nBcc: x@y.com"]) {
      const res = await api(base, { as, method: "PATCH", json: { gcPmEmail: bad } });
      expect(res.status, bad).toBe(400);
    }
  });

  it("only editors change it, and only in their own company", async () => {
    const { orgId, base, userId } = await jobWithChangeOrder();
    const viewer = await setupTenant("owner");
    await addToOrg(orgId, viewer.userId, "viewer");
    const outsider = await setupTenant("owner");
    const patch = (as: string) =>
      api(base, { as, method: "PATCH", json: { gcPmEmail: "x@y.com" } }).then((r) => r.status);
    expect(await patch(viewer.userId)).toBe(403);
    expect(await patch(outsider.userId)).toBe(404);
    const still = await call<ProjectDto>(base, { as: userId });
    expect(still.gcPmEmail).toBeNull();
  });
});
