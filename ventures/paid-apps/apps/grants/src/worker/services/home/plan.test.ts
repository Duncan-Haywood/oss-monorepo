import { describe, expect, it } from "vitest";
import { computeCoverage } from "../knowledge";
import {
  buildCalendar,
  chooseGap,
  coverageFromCounts,
  DAY_MS,
  dominantFocus,
  dueLabel,
  firstName,
  mentionsFocus,
} from "./plan";

const NOW = new Date("2026-11-19T12:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY_MS);

describe("greeting helpers", () => {
  it("takes the first name and ignores emails", () => {
    expect(firstName("Ana  Begay")).toBe("Ana");
    expect(firstName("ana@example.org")).toBeNull();
    expect(firstName("  ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });

  it("labels due dates", () => {
    expect(dueLabel(12)).toBe("due in 12 days");
    expect(dueLabel(1)).toBe("due tomorrow");
    expect(dueLabel(0)).toBe("due today");
    expect(dueLabel(-2)).toBe("overdue by 2 days");
  });
});

describe("focus matching", () => {
  it("matches phrases, plurals and every-word mentions, not single shared words", () => {
    expect(mentionsFocus("workforce development", "Workforce Development Pathways")).toBe(true);
    expect(mentionsFocus("construction trade", "Construction Trades Apprenticeship")).toBe(true);
    expect(mentionsFocus("construction trades", "Trades training for construction jobs")).toBe(
      true,
    );
    expect(mentionsFocus("workforce development", "Community development block grant")).toBe(false);
  });

  it("picks the focus most new grants mention", () => {
    const texts = [
      "Construction trades academy",
      "Workforce development fund",
      "Construction trades",
    ];
    expect(dominantFocus(["workforce development", "construction trades"], texts)).toEqual({
      focus: "construction trades",
      count: 2,
    });
    expect(dominantFocus(["housing"], texts)).toBeNull();
  });
});

describe("coverage gaps", () => {
  it("grouped counts give the same coverage as one row per fact", () => {
    const rows = [
      { category: "outcome" as const, status: "confirmed" as const, hasProject: false, n: 2 },
      { category: "program" as const, status: "proposed" as const, hasProject: true, n: 3 },
    ];
    const expanded = [
      ...Array.from({ length: 2 }, () => ({
        category: "outcome" as const,
        status: "confirmed" as const,
      })),
      ...Array.from({ length: 3 }, () => ({
        category: "program" as const,
        status: "proposed" as const,
        projectId: "p",
      })),
    ];
    expect(coverageFromCounts(rows)).toEqual(computeCoverage(expanded));
  });

  it("prefers the gap open drafts point at, then missing topics funders weigh most", () => {
    const coverage = coverageFromCounts([
      { category: "outcome", status: "confirmed", hasProject: false, n: 1 },
      { category: "financial", status: "confirmed", hasProject: false, n: 1 },
    ]);
    expect(chooseGap(coverage, [])?.topic.topic).toBe("population_served");
    const flags = [
      { applicationId: "a1", text: "budget narrative: no audit on file" },
      { applicationId: "a2", text: "What was the annual budget?" },
      { applicationId: "a2", text: "Operating revenue" },
    ];
    expect(chooseGap(coverage, flags)).toMatchObject({ topic: { topic: "financials" }, drafts: 2 });
  });
});

describe("buildCalendar", () => {
  it("covers every month in the window and drops past, far and already-drafted deadlines", () => {
    const cal = buildCalendar(
      "org_1",
      [
        { id: "a1", title: "Draft", status: "drafting", funderName: "F", deadline: inDays(5) },
        { id: "a2", title: "Past", status: "drafting", funderName: "F", deadline: inDays(-1) },
      ],
      [
        {
          id: "m1",
          opportunityId: "o1",
          title: "Match",
          funderName: "G",
          status: "new",
          closeDate: inDays(40),
        },
        {
          id: "m2",
          opportunityId: "o2",
          title: "Drafted",
          funderName: "G",
          status: "new",
          closeDate: inDays(6),
        },
        {
          id: "m3",
          opportunityId: "o3",
          title: "Far",
          funderName: "G",
          status: "new",
          closeDate: inDays(91),
        },
      ],
      new Set(["o2"]),
      NOW,
    );
    expect(cal.months.map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(cal.total).toBe(2);
    expect(cal.months[0]?.entries.map((e) => e.id)).toEqual(["app:a1"]);
    expect(cal.months[1]?.entries[0]).toMatchObject({
      id: "match:m1",
      daysLeft: 40,
      href: "/orgs/org_1/opportunities/o1",
    });
  });
});
