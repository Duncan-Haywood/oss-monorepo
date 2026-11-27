// Company documents (/api/orgs/:orgId/documents): licenses, the W-9, bonding letters and the like,
// added, listed with today's status (or none when they do not expire), edited, archived and deleted
// by editors; read-only for viewers; a W-9 never keeps a number; and never reachable from another
// company, even with a valid document id.
import type { CompanyDocumentDto, CompanyDocumentListDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const DAY_MS = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);

async function company() {
  const t = await setupTenant("owner");
  const base = `/api/orgs/${t.orgId}/documents`;
  const add = (json: Record<string, unknown>) =>
    call<CompanyDocumentDto>(base, { method: "POST", as: t.userId, expect: 201, json });
  return { ...t, base, add };
}

describe("company documents", () => {
  it("adds documents and lists them by expiry, undated ones last", async () => {
    const { base, userId, add } = await company();
    expect((await call<CompanyDocumentListDto>(base, { as: userId })).items).toEqual([]);

    const lic = await add({
      kind: "contractor_license",
      jurisdiction: "CA",
      classification: "C-10 Electrical",
      number: "1234567",
      issuer: "Contractors State License Board",
      expiresOn: inDays(90),
    });
    expect(lic).toMatchObject({
      name: "Contractor's license (CA)",
      status: "current",
      daysLeft: 90,
      archived: false,
      label: null,
    });
    await add({ kind: "w9", effectiveOn: inDays(-20) });
    await add({ kind: "emr_letter", number: "0.82", expiresOn: inDays(12) });
    await add({ kind: "business_license", jurisdiction: "Reno, NV", expiresOn: inDays(0) });

    const list = await call<CompanyDocumentListDto>(base, { as: userId });
    expect(list.today).toBe(inDays(0));
    expect(list.items.map((d) => [d.kind, d.status, d.daysLeft])).toEqual([
      ["business_license", "expired", 0],
      ["emr_letter", "expiring", 12],
      ["contractor_license", "current", 90],
      ["w9", "no_expiry", null],
    ]);
  });

  it("never keeps a W-9's number, on add or on an edit", async () => {
    const { base, userId, add } = await company();
    const post = await api(base, {
      method: "POST",
      as: userId,
      json: { kind: "w9", number: "12-3456789" },
    });
    expect(post.status).toBe(400);
    // Turning a numbered document into a W-9 is refused too, and so is adding a number to one.
    const other = await add({ kind: "other", label: "Union letter", number: "L-55" });
    const toW9 = await api(`${base}/${other.id}`, {
      method: "PATCH",
      as: userId,
      json: { kind: "w9" },
    });
    expect(toW9.status).toBe(400);
    const w9 = await add({ kind: "w9" });
    const numbered = await api(`${base}/${w9.id}`, {
      method: "PATCH",
      as: userId,
      json: { number: "123-45-6789" },
    });
    expect(numbered.status).toBe(400);
    const list = await call<CompanyDocumentListDto>(base, { as: userId });
    expect(list.items.find((d) => d.id === w9.id)?.number).toBeNull();
  });

  it("edits, archives (listed last) and deletes a document", async () => {
    const { base, userId, add } = await company();
    const old = await add({
      kind: "contractor_license",
      jurisdiction: "NV",
      expiresOn: inDays(-3),
    });
    await add({ kind: "contractor_license", jurisdiction: "NV", expiresOn: inDays(700) });

    const edited = await call<CompanyDocumentDto>(`${base}/${old.id}`, {
      method: "PATCH",
      as: userId,
      json: { number: "0081234", notes: "Renewal mailed" },
    });
    expect(edited).toMatchObject({
      number: "0081234",
      notes: "Renewal mailed",
      expiresOn: inDays(-3), // a PATCH changes only what it sends
      status: "expired",
    });
    const cleared = await call<CompanyDocumentDto>(`${base}/${old.id}`, {
      method: "PATCH",
      as: userId,
      json: { expiresOn: null },
    });
    expect(cleared).toMatchObject({ expiresOn: null, status: "no_expiry", daysLeft: null });

    await call(`${base}/${old.id}`, { method: "PATCH", as: userId, json: { archived: true } });
    const list = await call<CompanyDocumentListDto>(base, { as: userId });
    expect(list.items.map((d) => d.archived)).toEqual([false, true]);

    await call(`${base}/${old.id}`, { method: "DELETE", as: userId });
    expect((await call<CompanyDocumentListDto>(base, { as: userId })).items).toHaveLength(1);
    expect((await api(`${base}/${old.id}`, { method: "DELETE", as: userId })).status).toBe(404);
  });

  it("rejects bad dates, unknown kinds and unknown fields", async () => {
    const { base, userId, add } = await company();
    const bad = async (json: Record<string, unknown>) =>
      (await api(base, { method: "POST", as: userId, json })).status;
    expect(await bad({})).toBe(400);
    expect(await bad({ kind: "contractor_license", expiresOn: "06/30/2027" })).toBe(400);
    expect(await bad({ kind: "passport", expiresOn: "2027-06-30" })).toBe(400);
    expect(await bad({ kind: "other", orgId: "org_x" })).toBe(400);
    expect(
      await bad({ kind: "bonding_letter", effectiveOn: "2027-06-30", expiresOn: "2027-06-30" }),
    ).toBe(400);
    const d = await add({ kind: "emr_letter", effectiveOn: "2027-01-01", expiresOn: "2027-12-31" });
    const res = await api(`${base}/${d.id}`, {
      method: "PATCH",
      as: userId,
      json: { expiresOn: "2026-12-31" },
    });
    expect(res.status).toBe(400);
  });

  it("lets a viewer read but not change documents", async () => {
    const { orgId, base, add } = await company();
    const d = await add({ kind: "safety_program" });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await call<CompanyDocumentListDto>(base, { as: viewer.id })).items).toHaveLength(1);
    const post = await api(base, { method: "POST", as: viewer.id, json: { kind: "w9" } });
    expect(post.status).toBe(403);
    const patch = await api(`${base}/${d.id}`, {
      method: "PATCH",
      as: viewer.id,
      json: { archived: true },
    });
    expect(patch.status).toBe(403);
    expect((await api(`${base}/${d.id}`, { method: "DELETE", as: viewer.id })).status).toBe(403);
  });

  it("keeps each company's documents to itself", async () => {
    const a = await company();
    const b = await company();
    const d = await a.add({ kind: "contractor_license", number: "999", expiresOn: inDays(30) });
    expect((await api(a.base, { as: b.userId })).status).toBe(404);
    const via = `${b.base}/${d.id}`;
    const patch = await api(via, { method: "PATCH", as: b.userId, json: { archived: true } });
    expect(patch.status).toBe(404);
    expect((await api(via, { method: "DELETE", as: b.userId })).status).toBe(404);
    expect((await call<CompanyDocumentListDto>(b.base, { as: b.userId })).items).toEqual([]);
    const aList = await call<CompanyDocumentListDto>(a.base, { as: a.userId });
    expect(aList.items[0]).toMatchObject({ archived: false, number: "999" });
  });
});
