// Equipment through the real routes: saved as an expense, split on the worksheet at the de minimis limit
// (line 27a at $2,500 or less, Form 4562 / line 13 over it) and named that way in the year-end expense list;
// the depreciation choice saved per item (PATCH .../depreciation) and line 13 worked out from it.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Line = { line: string; label: string; amountCents: number | null; note?: string };
type Ws = { lines: Line[]; otherExpenses: Line[]; warnings: string[] };

describe("equipment expenses (de minimis safe harbor vs Form 4562)", () => {
  it("splits equipment by price on the worksheet and the expense list", async () => {
    const { userId, orgId } = await setupTenant();
    for (const [amountCents, vendor] of [
      [12_999, "Label printer"],
      [289_900, "Laptop"],
    ] as const) {
      const r = await api(`/api/orgs/${orgId}/expenses`, {
        method: "POST",
        as: userId,
        json: { date: "2026-03-01", category: "equipment", amountCents, vendor },
      });
      expect(r.status).toBe(201);
    }
    const ws = await json<Ws>(
      await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026`, { as: userId }),
    );
    expect(ws.otherExpenses.find((l) => /de minimis/.test(l.label))?.amountCents).toBe(12_999);
    const l13 = ws.lines.find((l) => l.line === "13");
    // Bonus depreciation by default: 100% for equipment bought after January 19, 2025.
    expect(l13?.amountCents).toBe(289_900);
    expect(ws.lines.find((l) => l.line === "28")?.amountCents).toBe(12_999 + 289_900);
    expect(ws.warnings.join(" ")).toMatch(
      /Section 1\.263\(a\)-1\(f\) de minimis safe harbor election/,
    );

    const csv = await (
      await api(`/api/orgs/${orgId}/reports/expenses.csv?year=2026`, { as: userId })
    ).text();
    expect(csv).toMatch(/Laptop,Equipment,13 \(Form 4562\),2899\.00/);
    expect(csv).toMatch(/Label printer,Equipment,27a,129\.99/);
  });

  it("saves the depreciation choice and works line 13 out from it", async () => {
    const { userId, orgId } = await setupTenant();
    const add = async (date: string, amountCents: number, category = "equipment") => {
      const r = await api(`/api/orgs/${orgId}/expenses`, {
        method: "POST",
        as: userId,
        json: { date, category, amountCents, vendor: "Shelving" },
      });
      return (await json<{ id: string }>(r)).id;
    };
    const shelving = await add("2025-01-10", 1_000_000);
    const small = await add("2025-02-01", 20_000);
    const patch = (id: string, body: unknown, as = userId, org = orgId) =>
      api(`/api/orgs/${org}/expenses/${id}/depreciation`, { method: "PATCH", as, json: body });

    // 40% bonus (bought before January 20, 2025), class not chosen: not worked out yet.
    let ws = await json<Ws & { depreciation: { rows: { reason: string | null }[] } }>(
      await api(`/api/orgs/${orgId}/reports/schedule-c?year=2025`, { as: userId }),
    );
    expect(ws.lines.find((l) => l.line === "13")?.amountCents).toBe(0);
    expect(ws.depreciation.rows[0]?.reason).toMatch(/5 years/);

    expect(
      (await patch(shelving, { method: "bonus", recoveryYears: 7, businessUsePct: 100 })).status,
    ).toBe(200);
    ws = await json(await api(`/api/orgs/${orgId}/reports/schedule-c?year=2025`, { as: userId }));
    // 4,000 bonus + 14.29% of the 6,000 left.
    expect(ws.lines.find((l) => l.line === "13")?.amountCents).toBe(400_000 + 85_740);
    ws = await json(await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026`, { as: userId }));
    expect(ws.lines.find((l) => l.line === "13")?.amountCents).toBe(146_940); // 24.49%

    // Only equipment over the limit takes a choice; bad input and other shops are refused.
    expect(
      (await patch(small, { method: "bonus", recoveryYears: 5, businessUsePct: 100 })).status,
    ).toBe(400);
    expect(
      (await patch(shelving, { method: "straight", recoveryYears: 5, businessUsePct: 100 })).status,
    ).toBe(400);
    expect(
      (await patch(shelving, { method: "bonus", recoveryYears: 5, businessUsePct: 0 })).status,
    ).toBe(400);
    const other = await setupTenant();
    expect(
      (
        await patch(
          shelving,
          { method: "section_179", recoveryYears: 5, businessUsePct: 100 },
          other.userId,
          other.orgId,
        )
      ).status,
    ).toBe(404);
  });

  it("refuses an unknown category", async () => {
    const { userId, orgId } = await setupTenant();
    const r = await api(`/api/orgs/${orgId}/expenses`, {
      method: "POST",
      as: userId,
      json: { date: "2026-03-01", category: "depreciation", amountCents: 100 },
    });
    expect(r.status).toBe(400);
  });
});
