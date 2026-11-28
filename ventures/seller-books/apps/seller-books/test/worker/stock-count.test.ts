// Stock count (src/shared/stock-count.ts, routes/org/inventory.ts): the items a count expects, the ones
// not found taken out on the count's date and out of that year's line 41, undo, and the checks that make
// a count all or nothing; editors only, and another shop's items are never touched.

import { member } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { describe, expect, it } from "vitest";
import { api, createTestUser, json, setupTenant, testDb } from "./helpers";

type Line = { line: string; amountCents: number | null };
type Ws = { partIII: Line[] };
type CountItem = {
  id: string;
  title: string;
  sku: string | null;
  lotName: string | null;
  source: string | null;
};

const add = async (as: string, orgId: string, body: Record<string, unknown>) =>
  json<{ id: string }>(
    await api(`/api/orgs/${orgId}/inventory/items`, { method: "POST", as, json: body }),
  );
const line = async (as: string, orgId: string, year: number, n: string) =>
  (
    await json<Ws>(await api(`/api/orgs/${orgId}/reports/schedule-c?year=${year}`, { as }))
  ).partIII.find((l) => l.line === n)?.amountCents;

describe("stock count", () => {
  it("lists what the count expects, takes the missing out of line 41 and undoes it", async () => {
    const { userId: as, orgId } = await setupTenant();
    const base = `/api/orgs/${orgId}/inventory`;
    const coat = await add(as, orgId, {
      title: "Wool coat",
      sku: "COAT-1",
      acquiredDate: "2026-02-01",
      costCents: 3500,
    });
    const lamp = await add(as, orgId, {
      title: "Lamp",
      acquiredDate: "2026-03-01",
      costCents: 1200,
    });
    const mug = await add(as, orgId, { title: "Mug", acquiredDate: "2026-04-01", costCents: 300 });
    await add(as, orgId, {
      title: "Bought in January",
      acquiredDate: "2027-01-05",
      costCents: 999,
    });
    const lot = await json<{ id: string }>(
      await api(`${base}/lots`, {
        method: "POST",
        as,
        json: {
          name: "Estate haul",
          acquiredDate: "2026-05-01",
          vendor: "Elm St",
          totalCostCents: 800,
          items: [{ title: "Clock" }],
        },
      }),
    );
    expect(lot.id).toBeTruthy();
    // Gone before the count: not expected.
    await api(`${base}/items/${mug.id}`, {
      method: "PATCH",
      as,
      json: { status: "written_off", disposedDate: "2026-06-01" },
    });

    const listed = await json<{ items: CountItem[]; truncated: boolean }>(
      await api(`${base}/count?asOf=2026-12-31`, { as }),
    );
    expect(listed.truncated).toBe(false);
    expect(listed.items.map((i) => i.title)).toEqual(["Wool coat", "Lamp", "Clock"]);
    expect(listed.items.find((i) => i.title === "Clock")).toMatchObject({
      lotName: "Estate haul",
      source: "Elm St",
    });

    expect(await line(as, orgId, 2026, "41")).toBe(3500 + 1200 + 800);

    const applied = await api(`${base}/count`, {
      method: "POST",
      as,
      json: { asOf: "2026-12-31", outcome: "written_off", missing: [lamp.id, coat.id] },
    });
    expect(applied.status).toBe(200);
    expect(await json(applied)).toEqual({
      updated: 2,
      costCents: 4700,
      asOf: "2026-12-31",
      outcome: "written_off",
    });
    expect(await line(as, orgId, 2026, "41")).toBe(800);
    const after = await json<{ items: CountItem[] }>(
      await api(`${base}/count?asOf=2026-12-31`, { as }),
    );
    expect(after.items.map((i) => i.title)).toEqual(["Clock"]);

    // Applying again: they are no longer in stock, so nothing is written.
    const twice = await api(`${base}/count`, {
      method: "POST",
      as,
      json: { asOf: "2026-12-31", outcome: "written_off", missing: [coat.id] },
    });
    expect(twice.status).toBe(400);

    const undone = await api(`${base}/count/undo`, {
      method: "POST",
      as,
      json: { ids: [lamp.id, coat.id] },
    });
    expect(await json(undone)).toEqual({ updated: 2 });
    expect(await line(as, orgId, 2026, "41")).toBe(5500);
  });

  it("personal use comes off purchases too", async () => {
    const { userId: as, orgId } = await setupTenant();
    const base = `/api/orgs/${orgId}/inventory`;
    const kept = await add(as, orgId, {
      title: "Jacket",
      acquiredDate: "2026-02-01",
      costCents: 2000,
    });
    await add(as, orgId, { title: "Boots", acquiredDate: "2026-02-01", costCents: 1000 });
    expect(await line(as, orgId, 2026, "36")).toBe(3000);
    await api(`${base}/count`, {
      method: "POST",
      as,
      json: { asOf: "2026-12-31", outcome: "personal_use", missing: [kept.id] },
    });
    expect(await line(as, orgId, 2026, "36")).toBe(1000);
    expect(await line(as, orgId, 2026, "41")).toBe(1000);
  });

  it("is all or nothing: an item bought after the date or a sold one refuses the whole count", async () => {
    const { userId: as, orgId } = await setupTenant();
    const base = `/api/orgs/${orgId}/inventory`;
    const early = await add(as, orgId, {
      title: "Early",
      acquiredDate: "2026-02-01",
      costCents: 100,
    });
    const late = await add(as, orgId, {
      title: "Late",
      acquiredDate: "2027-01-02",
      costCents: 100,
    });
    const res = await api(`${base}/count`, {
      method: "POST",
      as,
      json: { asOf: "2026-12-31", outcome: "written_off", missing: [early.id, late.id] },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/bought after 2026-12-31/);
    const still = await json<{ items: CountItem[] }>(
      await api(`${base}/count?asOf=2026-12-31`, { as }),
    );
    expect(still.items.map((i) => i.title)).toEqual(["Early"]);
  });

  it("never touches another shop's items, and viewers cannot apply a count", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const theirs = await add(b.userId, b.orgId, {
      title: "Theirs",
      acquiredDate: "2026-02-01",
      costCents: 100,
    });
    const res = await api(`/api/orgs/${a.orgId}/inventory/count`, {
      method: "POST",
      as: a.userId,
      json: { asOf: "2026-12-31", outcome: "written_off", missing: [theirs.id] },
    });
    expect(res.status).toBe(404);
    const undo = await api(`/api/orgs/${a.orgId}/inventory/count/undo`, {
      method: "POST",
      as: a.userId,
      json: { ids: [theirs.id] },
    });
    expect(await json(undo)).toEqual({ updated: 0 });
    const list = await json<{ items: CountItem[] }>(
      await api(`/api/orgs/${b.orgId}/inventory/count?asOf=2026-12-31`, { as: b.userId }),
    );
    expect(list.items.map((i) => i.title)).toEqual(["Theirs"]);
    // Not a member of b: 404 on b's count.
    expect(
      (await api(`/api/orgs/${b.orgId}/inventory/count?asOf=2026-12-31`, { as: a.userId })).status,
    ).toBe(404);

    const viewer = await createTestUser();
    await testDb()
      .insert(member)
      .values({ id: newId("mem"), organizationId: b.orgId, userId: viewer.id, role: "viewer" });
    const denied = await api(`/api/orgs/${b.orgId}/inventory/count`, {
      method: "POST",
      as: viewer.id,
      json: { asOf: "2026-12-31", outcome: "written_off", missing: [theirs.id] },
    });
    expect(denied.status).toBe(403);
  });

  it("handles a count larger than D1's bound-parameter limit", async () => {
    const { userId: as, orgId } = await setupTenant();
    const base = `/api/orgs/${orgId}/inventory`;
    const lot = await json<{ id: string }>(
      await api(`${base}/lots`, {
        method: "POST",
        as,
        json: {
          name: "Pallet",
          acquiredDate: "2026-03-01",
          totalCostCents: 25000,
          items: Array.from({ length: 250 }, (_, n) => ({ title: `Piece ${n}` })),
        },
      }),
    );
    expect(lot.id).toBeTruthy();
    const listed = await json<{ items: CountItem[] }>(
      await api(`${base}/count?asOf=2026-12-31`, { as }),
    );
    expect(listed.items).toHaveLength(250);
    const missing = listed.items.slice(0, 230).map((i) => i.id);
    const res = await api(`${base}/count`, {
      method: "POST",
      as,
      json: { asOf: "2026-12-31", outcome: "written_off", missing },
    });
    expect(await json(res)).toMatchObject({ updated: 230, costCents: 23000 });
    expect(await line(as, orgId, 2026, "41")).toBe(2000);
    expect(
      await json(await api(`${base}/count/undo`, { method: "POST", as, json: { ids: missing } })),
    ).toEqual({ updated: 230 });
  });
});
