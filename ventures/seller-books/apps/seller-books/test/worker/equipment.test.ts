// Equipment through the real routes: saved as an expense, split on the worksheet at the de minimis limit
// (line 27a at $2,500 or less, Form 4562 / line 13 over it) and named that way in the year-end expense list.
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
    expect(l13?.amountCents).toBeNull();
    expect(l13?.note).toMatch(/\$2899\.00 of cost, go on Form 4562/);
    expect(ws.lines.find((l) => l.line === "28")?.amountCents).toBe(12_999);
    expect(ws.warnings.join(" ")).toMatch(
      /Section 1\.263\(a\)-1\(f\) de minimis safe harbor election/,
    );

    const csv = await (
      await api(`/api/orgs/${orgId}/reports/expenses.csv?year=2026`, { as: userId })
    ).text();
    expect(csv).toMatch(/Laptop,Equipment,13 \(Form 4562\),2899\.00/);
    expect(csv).toMatch(/Label printer,Equipment,27a,129\.99/);
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
