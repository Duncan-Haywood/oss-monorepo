// The quarterly estimates take Schedule C line 30 (home office, simplified method) off each period's profit,
// counting only the months used by that period's end and holding it to that period's own line 29.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Est = {
  rows: { profitToDate: number | null; homeOfficeToDate: number | null; status: string }[];
  homeOffice: unknown;
  warnings: string[];
};

const estimate = async (as: string, orgId: string, asOf: string) =>
  json<Est>(
    await api(`/api/orgs/${orgId}/reports/estimated-tax`, {
      method: "POST",
      as,
      json: { year: 2026, asOf },
    }),
  );

describe("quarterly estimates with a home office", () => {
  it("line 31 by the months used to each period end", async () => {
    const { userId, orgId } = await setupTenant();
    // One $1,000 sale in February, no costs: line 29 is $1,000 at every period end.
    const sale = await api(`/api/orgs/${orgId}/sales`, {
      method: "POST",
      as: userId,
      json: { date: "2026-02-10", title: "Leather sofa, local pickup", itemCents: 100000 },
    });
    expect(sale.status).toBe(201);

    const before = await estimate(userId, orgId, "2026-12-31");
    expect(before.rows.map((r) => r.profitToDate)).toEqual([100000, 100000, 100000, 100000]);
    expect(before.rows.map((r) => r.homeOfficeToDate)).toEqual([null, null, null, null]);
    expect(before.homeOffice).toBeNull();
    expect(before.warnings.join(" ")).toMatch(/home office \(line 30: save the space/);

    // 300 sq ft all year: $5 × 300 / 12 = $125 a month, $1,500 for the year.
    const put = await api(`/api/orgs/${orgId}/reports/home-office/2026`, {
      method: "PUT",
      as: userId,
      json: { officeSqft: 300, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    });
    expect(put.status).toBe(200);

    const after = await estimate(userId, orgId, "2026-12-31");
    // Mar 31: 3 months ($375); May 31: 5 ($625); Aug 31: 8 ($1,000); Dec 31: $1,500 held to $1,000.
    expect(after.rows.map((r) => r.homeOfficeToDate)).toEqual([37500, 62500, 100000, 100000]);
    expect(after.rows.map((r) => r.profitToDate)).toEqual([62500, 37500, 0, 0]);
    // The year's line 31 agrees with the Schedule C page.
    const ws = await json<{ lines: { line: string; amountCents: number | null }[] }>(
      await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026`, { as: userId }),
    );
    expect(ws.lines.find((l) => l.line === "31")?.amountCents).toBe(after.rows[3]?.profitToDate);
    // A period's own line 29 limit is not repeated as a year-end warning; the method is named instead.
    expect(after.warnings.join(" ")).not.toMatch(/limited to line 29/);
    expect(after.warnings.join(" ")).toMatch(
      /Home office \(line 30, simplified method\) is taken off/,
    );
    expect(after.warnings.join(" ")).not.toMatch(/home office \(line 30: save the space/);

    // April 10: April has not reached its 15th day, so the period in progress counts January to March.
    const mid = await estimate(userId, orgId, "2026-04-10");
    expect(mid.rows.map((r) => r.status)).toEqual([
      "complete",
      "in-progress",
      "not-started",
      "not-started",
    ]);
    expect(mid.rows.map((r) => r.homeOfficeToDate)).toEqual([37500, 37500, null, null]);
    expect(mid.rows.map((r) => r.profitToDate)).toEqual([62500, 62500, null, null]);

    // Another shop's home office never reaches this shop's estimate.
    const other = await setupTenant();
    const theirs = await estimate(other.userId, other.orgId, "2026-12-31");
    expect(theirs.homeOffice).toBeNull();
  });
});
