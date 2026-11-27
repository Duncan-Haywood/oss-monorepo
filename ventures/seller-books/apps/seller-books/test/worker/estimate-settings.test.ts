// The estimated-tax page's own figures saved per shop and tax year: owner and admins only (wages and last
// year's tax are the taxpayer's), this shop's rows only, dollars in and out with cents stored, and part of
// the shop's JSON export.
import { member } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { describe, expect, it } from "vitest";
import { api, createTestUser, json, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, year = 2026) =>
  `/api/orgs/${t.orgId}/reports/estimated-tax/settings/${year}`;

interface Saved {
  year: number;
  settings: {
    filing: string;
    wages: number;
    otherIncome: number;
    withholding: number;
    priorYearTax: number | null;
    priorAgiOver150k: boolean;
    mileageRate: number | null;
    paid: number[];
    updatedAt: string;
  } | null;
}

const FIGURES = {
  filing: "mfj",
  wages: 52000.5,
  otherIncome: -310.25,
  withholding: 4100,
  priorYearTax: 6800.1,
  priorAgiOver150k: false,
  mileageRate: 70,
  paid: [1200, 1200.33, 0, 0],
};

async function addMember(t: Tenant, role: "viewer" | "editor" | "admin") {
  const u = await createTestUser();
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: t.orgId, userId: u.id, role });
  return u.id;
}

describe("saved estimated-tax figures", () => {
  it("saves, reads back to the cent, replaces and deletes one year's figures", async () => {
    const t = await setupTenant();
    const empty = await json<Saved>(await api(path(t), { as: t.userId }));
    expect(empty).toEqual({ year: 2026, settings: null });

    const put = await api(path(t), { method: "PUT", as: t.userId, json: FIGURES });
    expect(put.status).toBe(200);
    const saved = await json<Saved>(put);
    const { updatedAt, ...rest } = saved.settings ?? { updatedAt: "" };
    expect(rest).toEqual(FIGURES);
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Another year is its own row.
    expect((await json<Saved>(await api(path(t, 2025), { as: t.userId }))).settings).toBeNull();

    // A second save replaces the first: still one row for the year.
    const again = await api(path(t), {
      method: "PUT",
      as: t.userId,
      json: { ...FIGURES, priorYearTax: null, mileageRate: null, paid: [1500, 1500, 1500, 0] },
    });
    expect(again.status).toBe(200);
    const read = await json<Saved>(await api(path(t), { as: t.userId }));
    expect(read.settings?.priorYearTax).toBeNull();
    expect(read.settings?.mileageRate).toBeNull();
    expect(read.settings?.paid).toEqual([1500, 1500, 1500, 0]);

    // The export carries the year's row, in cents, without the org id.
    const exp = await json<{
      counts: Record<string, number>;
      records: Record<string, Record<string, unknown>[]>;
    }>(await api(`/api/orgs/${t.orgId}/export`, { as: t.userId }));
    expect(exp.counts.estimateSettings).toBe(1);
    expect(exp.records.estimateSettings?.[0]).toMatchObject({
      year: 2026,
      wagesCents: 5200050,
      paidQ3Cents: 150000,
    });
    expect(exp.records.estimateSettings?.[0]).not.toHaveProperty("orgId");

    expect((await api(path(t), { method: "DELETE", as: t.userId })).status).toBe(200);
    expect((await json<Saved>(await api(path(t), { as: t.userId }))).settings).toBeNull();
    expect((await api(path(t), { method: "DELETE", as: t.userId })).status).toBe(404);
  });

  it("refuses bad figures", async () => {
    const t = await setupTenant();
    for (const bad of [
      { ...FIGURES, paid: [1, 2, 3] },
      { ...FIGURES, wages: -1 },
      { ...FIGURES, filing: "mfs" },
      { ...FIGURES, mileageRate: 900 },
      { ...FIGURES, withholding: undefined },
    ]) {
      const res = await api(path(t), { method: "PUT", as: t.userId, json: bad });
      expect(res.status).toBe(400);
    }
    expect((await api(path(t, 1999), { as: t.userId })).status).toBe(400);
  });

  it("owner and admins only; another shop sees nothing", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    await api(path(t), { method: "PUT", as: t.userId, json: FIGURES });

    const admin = await addMember(t, "admin");
    expect((await json<Saved>(await api(path(t), { as: admin }))).settings?.wages).toBe(52000.5);

    for (const role of ["editor", "viewer"] as const) {
      const id = await addMember(t, role);
      expect((await api(path(t), { as: id })).status).toBe(403);
      expect((await api(path(t), { method: "PUT", as: id, json: FIGURES })).status).toBe(403);
      expect((await api(path(t), { method: "DELETE", as: id })).status).toBe(403);
    }

    // A member of another shop gets 404 for this one, and its own shop has no figures.
    expect((await api(path(t), { as: other.userId })).status).toBe(404);
    expect((await json<Saved>(await api(path(other), { as: other.userId }))).settings).toBeNull();
  });
});
