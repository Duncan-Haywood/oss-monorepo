import { asOfKey, checkInDue, factStaleness } from "@shared/fact-staleness";
import { describe, expect, it } from "vitest";
import { findSupersedeCandidate } from "../knowledge/supersede";
import { buildUpdateAgenda, UPDATE_AGENDA_SIZE } from "./agenda";
import { dashboardCheckInNudge, digestCheckInNudge, isFirstDigestOfMonth } from "./nudges";

const NOW = new Date("2026-11-19T12:00:00Z");

describe("factStaleness", () => {
  it("flags last year's dated facts until confirmed still true", () => {
    const f = { category: "metric", status: "confirmed", asOf: "2024" } as const;
    expect(factStaleness(f, NOW)?.label).toBe("as of 2024 — may be outdated");
    expect(factStaleness({ ...f, asOf: "2026" }, NOW)).toBeNull();
    expect(factStaleness({ ...f, category: "history" }, NOW)).toBeNull();
    expect(factStaleness({ ...f, lastConfirmedAt: "2026-10-01T00:00:00Z" }, NOW)).toBeNull();
    expect(factStaleness({ ...f, status: "superseded" }, NOW)).toBeNull();
  });

  it("flags undated confirmed facts nobody vouched for in a year", () => {
    const f = { category: "staff", status: "confirmed", asOf: null } as const;
    expect(factStaleness({ ...f, confirmedAt: "2025-03-02T00:00:00Z" }, NOW)?.label).toBe(
      "last confirmed Mar 2025 — may be outdated",
    );
    expect(factStaleness({ ...f, confirmedAt: "2026-03-02T00:00:00Z" }, NOW)).toBeNull();
  });

  it("orders asOf values and computes the check-in nudge", () => {
    expect(String(asOfKey("2025")) > String(asOfKey("2025-06-30"))).toBe(true);
    expect(String(asOfKey("FY2026")) > String(asOfKey("2025"))).toBe(true);
    expect(checkInDue(null, NOW)).toBe(true);
    expect(checkInDue("2026-11-01T00:00:00Z", NOW)).toBe(false);
    expect(checkInDue("2026-10-01T00:00:00Z", NOW)).toBe(true);
  });
});

describe("buildUpdateAgenda", () => {
  it("puts dated themes first, then stale, and keeps it short", () => {
    const agenda = buildUpdateAgenda(
      [
        { id: "a", category: "financial", status: "confirmed", asOf: "2025", confirmedAt: NOW },
        { id: "b", category: "program", status: "confirmed", asOf: null, confirmedAt: NOW },
        { id: "c", category: "partner", status: "confirmed", asOf: null, confirmedAt: NOW },
      ],
      NOW,
      new Date("2026-09-03T00:00:00Z"),
    );
    expect(agenda).toHaveLength(UPDATE_AGENDA_SIZE);
    expect(agenda[0]?.key).toBe("update_budget");
    expect(agenda[0]?.question).toContain("from 2025");
    // 1 dated + 4 stale themes, then the first fresh one (programs); partners (fresh) is dropped.
    expect(agenda.map((a) => a.key)).not.toContain("update_partners");
    expect(agenda.find((a) => a.key === "update_awards")?.question).toContain("September 2026");
  });
});

describe("findSupersedeCandidate", () => {
  const old = {
    id: "fct_old",
    category: "population_served",
    statement: "Test Org served 320 students in 2025.",
    asOf: "2025",
    status: "confirmed",
    projectId: null,
  } as const;
  it("matches the same claim with a newer asOf", () => {
    const f = {
      category: "population_served",
      statement: "Test Org served 412 students in 2026.",
      asOf: "2026",
    } as const;
    expect(findSupersedeCandidate(f, [old])?.id).toBe("fct_old");
    expect(findSupersedeCandidate({ ...f, asOf: "2024" }, [old])).toBeNull();
    expect(findSupersedeCandidate({ ...f, asOf: null }, [old])).toBeNull();
    expect(findSupersedeCandidate({ ...f, category: "metric" }, [old])).toBeNull();
    expect(findSupersedeCandidate({ ...f, projectId: "prj_1" }, [old])).toBeNull();
    expect(
      findSupersedeCandidate(
        { ...f, statement: "Test Org hired a new executive director in 2026." },
        [old],
      ),
    ).toBeNull();
  });
});

describe("nudges", () => {
  it("prompts in the first digest of the month and on a stale dashboard", () => {
    expect(isFirstDigestOfMonth(new Date("2026-12-07T13:00:00Z"))).toBe(true);
    expect(digestCheckInNudge(new Date("2026-11-16T13:00:00Z"))).toBeNull();
    expect(digestCheckInNudge(new Date("2026-12-07T13:00:00Z"))?.title).toBe("What's new?");
    expect(dashboardCheckInNudge("2026-11-10T00:00:00Z", NOW)).toBeNull();
    expect(dashboardCheckInNudge("2026-09-10T00:00:00Z", NOW)?.cta).toBe("Share an update");
  });
});
