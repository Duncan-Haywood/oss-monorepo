// Schedule C line 30 (simplified method): the seller's space saved per shop and tax year, read back into the
// worksheet and its CSV, editors only, and invisible to other shops.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Line = { line: string; amountCents: number | null; note?: string };
type Ws = { lines: Line[]; warnings: string[]; homeOffice: unknown };

const put = (as: string, orgId: string, year: number, body: unknown) =>
  api(`/api/orgs/${orgId}/reports/home-office/${year}`, { method: "PUT", as, json: body });

describe("home office (Schedule C line 30)", () => {
  it("saves the space for a year, and the worksheet and CSV carry line 30", async () => {
    const { userId, orgId } = await setupTenant();
    const empty = await json<{ homeOffice: unknown }>(
      await api(`/api/orgs/${orgId}/reports/home-office/2026`, { as: userId }),
    );
    expect(empty.homeOffice).toBeNull();

    // Six months of a 150 sq ft space: 150 × $5 × 6/12 = $375 before the line 29 limit.
    const saved = await put(userId, orgId, 2026, {
      officeSqft: 150,
      homeSqft: 1200,
      months: [12, 7, 8, 9, 10, 11, 11],
    });
    expect(saved.status).toBe(200);
    expect((await json<{ homeOffice: unknown }>(saved)).homeOffice).toEqual({
      officeSqft: 150,
      homeSqft: 1200,
      months: [7, 8, 9, 10, 11, 12],
    });

    // A shop with no sales has line 29 at zero (or below), so line 30 is held to 0 and the warning says why.
    const ws = await json<Ws>(
      await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026`, { as: userId }),
    );
    const l30 = ws.lines.find((l) => l.line === "30");
    expect(l30?.amountCents).toBe(0);
    expect(l30?.note).toMatch(/150 sq ft × \$5 × 6\/12 months/);
    expect(ws.warnings.join(" ")).toMatch(/limited to line 29: \$375\.00/);
    expect(ws.homeOffice).toEqual({
      officeSqft: 150,
      homeSqft: 1200,
      months: [7, 8, 9, 10, 11, 12],
    });

    // Another year is separate.
    const other = await json<Ws>(
      await api(`/api/orgs/${orgId}/reports/schedule-c?year=2025`, { as: userId }),
    );
    expect(other.lines.find((l) => l.line === "30")?.amountCents).toBeNull();

    const csv = await (
      await api(`/api/orgs/${orgId}/reports/schedule-c.csv?year=2026`, { as: userId })
    ).text();
    expect(csv).toMatch(/Business use of home \(simplified method\)/);
    expect(csv).toMatch(/Net profit or \(loss\)/);

    // Saving again replaces; removing clears it.
    await put(userId, orgId, 2026, { officeSqft: 90, homeSqft: null, months: [1] });
    const replaced = await json<{ homeOffice: unknown }>(
      await api(`/api/orgs/${orgId}/reports/home-office/2026`, { as: userId }),
    );
    expect(replaced.homeOffice).toEqual({ officeSqft: 90, homeSqft: null, months: [1] });
    const del = await api(`/api/orgs/${orgId}/reports/home-office/2026`, {
      method: "DELETE",
      as: userId,
    });
    expect(del.status).toBe(200);
    expect(
      (await api(`/api/orgs/${orgId}/reports/home-office/2026`, { method: "DELETE", as: userId }))
        .status,
    ).toBe(404);
  });

  it("refuses a business area larger than the home, no months, or a bad year", async () => {
    const { userId, orgId } = await setupTenant();
    expect(
      (await put(userId, orgId, 2026, { officeSqft: 500, homeSqft: 400, months: [1] })).status,
    ).toBe(400);
    expect((await put(userId, orgId, 2026, { officeSqft: 100, months: [] })).status).toBe(400);
    expect((await put(userId, orgId, 2026, { officeSqft: 100, months: [13] })).status).toBe(400);
    expect((await put(userId, orgId, 2026, { officeSqft: 0, months: [1] })).status).toBe(400);
    expect((await put(userId, orgId, 1999, { officeSqft: 100, months: [1] })).status).toBe(400);
  });

  it("viewers can read but not save; another shop sees nothing", async () => {
    const viewer = await setupTenant("viewer");
    expect(
      (await put(viewer.userId, viewer.orgId, 2026, { officeSqft: 100, months: [1] })).status,
    ).toBe(403);
    expect(
      (await api(`/api/orgs/${viewer.orgId}/reports/home-office/2026`, { as: viewer.userId }))
        .status,
    ).toBe(200);

    const a = await setupTenant();
    const b = await setupTenant();
    await put(a.userId, a.orgId, 2026, { officeSqft: 100, months: [1, 2] });
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const res = await api(`/api/orgs/${a.orgId}/reports/home-office/2026`, {
        method,
        as: b.userId,
        ...(method === "PUT" ? { json: { officeSqft: 1, months: [1] } } : {}),
      });
      expect(res.status, method).toBe(404);
    }
    const own = await json<{ homeOffice: unknown }>(
      await api(`/api/orgs/${b.orgId}/reports/home-office/2026`, { as: b.userId }),
    );
    expect(own.homeOffice).toBeNull();
    const still = await json<{ homeOffice: unknown }>(
      await api(`/api/orgs/${a.orgId}/reports/home-office/2026`, { as: a.userId }),
    );
    expect(still.homeOffice).toEqual({ officeSqft: 100, homeSqft: null, months: [1, 2] });
  });
});
