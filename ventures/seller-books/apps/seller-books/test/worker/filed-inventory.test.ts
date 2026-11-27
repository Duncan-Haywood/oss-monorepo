// Line 41 as filed for one year, saved per shop: the next year's worksheet uses it as line 35 and its CSV
// carries the note and the warning; editors only, and invisible to other shops.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Line = { line: string; amountCents: number | null; note?: string };
type Ws = {
  partIII: Line[];
  warnings: string[];
  openingInventory: { booksCents: number; filedCents: number | null };
};

const put = (as: string, orgId: string, year: number, body: unknown) =>
  api(`/api/orgs/${orgId}/reports/filed-inventory/${year}`, { method: "PUT", as, json: body });
const worksheet = async (as: string, orgId: string, year: number) =>
  json<Ws>(await api(`/api/orgs/${orgId}/reports/schedule-c?year=${year}`, { as }));

describe("filed inventory (last year's line 41 as line 35)", () => {
  it("saves the figure, and the next year's worksheet and CSV use it", async () => {
    const { userId, orgId } = await setupTenant();
    const item = await api(`/api/orgs/${orgId}/inventory/items`, {
      method: "POST",
      as: userId,
      json: { title: "Wool coat", acquiredDate: "2025-11-02", costCents: 3500 },
    });
    expect(item.status).toBe(201);

    const empty = await json<{ closing: number | null }>(
      await api(`/api/orgs/${orgId}/reports/filed-inventory/2025`, { as: userId }),
    );
    expect(empty.closing).toBeNull();
    let ws = await worksheet(userId, orgId, 2026);
    expect(ws.partIII.find((l) => l.line === "35")?.amountCents).toBe(3500);
    expect(ws.openingInventory).toEqual({ booksCents: 3500, filedCents: null });

    const saved = await put(userId, orgId, 2025, { closing: 1234.56 });
    expect(saved.status).toBe(200);
    expect(await json(saved)).toEqual({ year: 2025, closing: 1234.56 });

    ws = await worksheet(userId, orgId, 2026);
    expect(ws.partIII.find((l) => l.line === "35")?.amountCents).toBe(123456);
    expect(ws.openingInventory).toEqual({ booksCents: 3500, filedCents: 123456 });
    expect(ws.warnings.join(" ")).toMatch(/\$1199\.56 more on the return/);
    // The 2025 worksheet itself is unchanged: the figure is that year's closing, not its opening.
    const own = await worksheet(userId, orgId, 2025);
    expect(own.openingInventory.filedCents).toBeNull();

    const csv = await (
      await api(`/api/orgs/${orgId}/reports/schedule-c.csv?year=2026`, { as: userId })
    ).text();
    expect(csv).toMatch(/Inventory at beginning of year,1234\.56,"Line 41 of your 2025 return/);
    expect(csv).toMatch(/Line 35 uses the \$1234\.56/);

    await put(userId, orgId, 2025, { closing: 35 });
    ws = await worksheet(userId, orgId, 2026);
    expect(ws.warnings.join(" ")).not.toMatch(/Line 35/);

    const del = await api(`/api/orgs/${orgId}/reports/filed-inventory/2025`, {
      method: "DELETE",
      as: userId,
    });
    expect(del.status).toBe(200);
    expect(
      (
        await api(`/api/orgs/${orgId}/reports/filed-inventory/2025`, {
          method: "DELETE",
          as: userId,
        })
      ).status,
    ).toBe(404);
    expect((await worksheet(userId, orgId, 2026)).openingInventory.filedCents).toBeNull();
  });

  it("refuses a negative or missing figure and a bad year", async () => {
    const { userId, orgId } = await setupTenant();
    expect((await put(userId, orgId, 2025, { closing: -1 })).status).toBe(400);
    expect((await put(userId, orgId, 2025, {})).status).toBe(400);
    expect((await put(userId, orgId, 2025, { closing: "12" })).status).toBe(400);
    expect((await put(userId, orgId, 1999, { closing: 1 })).status).toBe(400);
  });

  it("viewers can read but not save; another shop sees nothing", async () => {
    const viewer = await setupTenant("viewer");
    expect((await put(viewer.userId, viewer.orgId, 2025, { closing: 1 })).status).toBe(403);
    expect(
      (await api(`/api/orgs/${viewer.orgId}/reports/filed-inventory/2025`, { as: viewer.userId }))
        .status,
    ).toBe(200);

    const a = await setupTenant();
    const b = await setupTenant();
    await put(a.userId, a.orgId, 2025, { closing: 500 });
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const res = await api(`/api/orgs/${a.orgId}/reports/filed-inventory/2025`, {
        method,
        as: b.userId,
        ...(method === "PUT" ? { json: { closing: 1 } } : {}),
      });
      expect(res.status, method).toBe(404);
    }
    expect((await worksheet(b.userId, b.orgId, 2026)).openingInventory.filedCents).toBeNull();
    expect((await worksheet(a.userId, a.orgId, 2026)).openingInventory.filedCents).toBe(50000);
  });
});
