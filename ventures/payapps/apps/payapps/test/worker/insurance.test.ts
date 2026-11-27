// Insurance certificates (/api/orgs/:orgId/insurance): added, listed with today's status, edited,
// archived and deleted by editors; read-only for viewers; validated; and never reachable from
// another company, even with a valid certificate id.
import type { InsuranceCertificateDto, InsuranceListDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const DAY_MS = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);

async function company() {
  const t = await setupTenant("owner");
  const base = `/api/orgs/${t.orgId}/insurance`;
  const add = (json: Record<string, unknown>) =>
    call<InsuranceCertificateDto>(base, { method: "POST", as: t.userId, expect: 201, json });
  return { ...t, base, add };
}

describe("insurance certificates", () => {
  it("adds certificates and lists active ones by expiry with today's status", async () => {
    const { base, userId, add } = await company();
    const empty = await call<InsuranceListDto>(base, { as: userId });
    expect(empty.items).toEqual([]);

    const gl = await add({
      kind: "general_liability",
      carrier: "Acme Mutual",
      policyNumber: "GL-123",
      effectiveOn: inDays(-300),
      expiresOn: inDays(65),
    });
    expect(gl).toMatchObject({
      name: "General liability (Acme Mutual)",
      status: "current",
      daysLeft: 65,
      archived: false,
      label: null,
    });
    await add({ kind: "auto", expiresOn: inDays(10) });
    await add({ kind: "workers_comp", expiresOn: inDays(0) });

    const list = await call<InsuranceListDto>(base, { as: userId });
    expect(list.today).toBe(inDays(0));
    expect(list.items.map((c) => [c.kind, c.status, c.daysLeft])).toEqual([
      ["workers_comp", "expired", 0],
      ["auto", "expiring", 10],
      ["general_liability", "current", 65],
    ]);
  });

  it("edits, archives (listed last) and deletes a certificate", async () => {
    const { base, userId, add } = await company();
    const old = await add({ kind: "general_liability", expiresOn: inDays(-5) });
    await add({ kind: "general_liability", label: "Renewal", expiresOn: inDays(360) });

    const edited = await call<InsuranceCertificateDto>(`${base}/${old.id}`, {
      method: "PATCH",
      as: userId,
      json: { carrier: "Harbor Insurance", notes: "On file with Harbor Builders" },
    });
    expect(edited).toMatchObject({
      carrier: "Harbor Insurance",
      notes: "On file with Harbor Builders",
      expiresOn: inDays(-5), // a PATCH changes only what it sends
      status: "expired",
    });
    const cleared = await call<InsuranceCertificateDto>(`${base}/${old.id}`, {
      method: "PATCH",
      as: userId,
      json: { carrier: "" },
    });
    expect(cleared.carrier).toBeNull();

    await call(`${base}/${old.id}`, { method: "PATCH", as: userId, json: { archived: true } });
    const list = await call<InsuranceListDto>(base, { as: userId });
    expect(list.items.map((c) => [c.name, c.archived])).toEqual([
      ["General liability: Renewal", false],
      ["General liability", true],
    ]);

    await call(`${base}/${old.id}`, { method: "DELETE", as: userId });
    const after = await call<InsuranceListDto>(base, { as: userId });
    expect(after.items).toHaveLength(1);
    expect((await api(`${base}/${old.id}`, { method: "DELETE", as: userId })).status).toBe(404);
  });

  it("rejects bad dates, unknown kinds and unknown fields", async () => {
    const { base, userId, add } = await company();
    const bad = async (json: Record<string, unknown>) =>
      (await api(base, { method: "POST", as: userId, json })).status;
    expect(await bad({ kind: "general_liability" })).toBe(400);
    expect(await bad({ kind: "general_liability", expiresOn: "12/31/2027" })).toBe(400);
    expect(await bad({ kind: "flood", expiresOn: "2027-12-31" })).toBe(400);
    expect(await bad({ kind: "auto", expiresOn: "2027-12-31", orgId: "org_x" })).toBe(400);
    expect(await bad({ kind: "auto", effectiveOn: "2027-12-31", expiresOn: "2027-12-31" })).toBe(
      400,
    );
    // The same check on an edit that moves the expiry before the effective date.
    const c = await add({ kind: "auto", effectiveOn: "2027-01-01", expiresOn: "2027-12-31" });
    const res = await api(`${base}/${c.id}`, {
      method: "PATCH",
      as: userId,
      json: { expiresOn: "2026-12-31" },
    });
    expect(res.status).toBe(400);
  });

  it("lets a viewer read but not change certificates", async () => {
    const { orgId, base, add } = await company();
    const c = await add({ kind: "auto", expiresOn: inDays(100) });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const list = await call<InsuranceListDto>(base, { as: viewer.id });
    expect(list.items).toHaveLength(1);
    const post = await api(base, {
      method: "POST",
      as: viewer.id,
      json: { kind: "auto", expiresOn: inDays(10) },
    });
    expect(post.status).toBe(403);
    const patch = await api(`${base}/${c.id}`, {
      method: "PATCH",
      as: viewer.id,
      json: { archived: true },
    });
    expect(patch.status).toBe(403);
    expect((await api(`${base}/${c.id}`, { method: "DELETE", as: viewer.id })).status).toBe(403);
  });

  it("keeps each company's certificates to itself", async () => {
    const a = await company();
    const b = await company();
    const c = await a.add({ kind: "general_liability", expiresOn: inDays(30) });
    // B cannot use A's org path at all.
    expect((await api(a.base, { as: b.userId })).status).toBe(404);
    // Nor reach A's certificate through B's own org path.
    const via = `${b.base}/${c.id}`;
    const patch = await api(via, { method: "PATCH", as: b.userId, json: { archived: true } });
    expect(patch.status).toBe(404);
    expect((await api(via, { method: "DELETE", as: b.userId })).status).toBe(404);
    const bList = await call<InsuranceListDto>(b.base, { as: b.userId });
    expect(bList.items).toEqual([]);
    const aList = await call<InsuranceListDto>(a.base, { as: a.userId });
    expect(aList.items[0]?.archived).toBe(false);
  });
});
