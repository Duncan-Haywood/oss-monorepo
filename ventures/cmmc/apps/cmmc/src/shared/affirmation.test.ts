import { describe, expect, it } from "vitest";
import {
  type AffirmationInput,
  type AffirmationLike,
  addDays,
  addYears,
  affirmationSchedule,
  isIsoDate,
  validateAffirmation,
} from "./affirmation";

const rec = (over: Partial<AffirmationLike> = {}): AffirmationLike => ({
  level: 2,
  kind: "assessment",
  cmmcStatus: "final",
  cmmcStatusDate: "2026-03-02",
  affirmedOn: "2026-03-05",
  ...over,
});

const input = (over: Partial<AffirmationInput> = {}): AffirmationInput => ({
  ...rec(),
  officialName: "J. Smith",
  officialTitle: "President",
  officialContact: "jsmith@example.test, 555-0100",
  sprsScore: 104,
  ...over,
});

const due = (s: ReturnType<typeof affirmationSchedule>, key: string) =>
  s.deadlines.find((d) => d.key === key);

describe("dates", () => {
  it("checks real calendar dates", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-01")).toBe(false);
  });
  it("adds years, moving February 29 back to the 28th (a day early, never late)", () => {
    expect(addYears("2026-03-05", 1)).toBe("2027-03-05");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(addYears("2028-02-29", 4)).toBe("2032-02-29");
    expect(addYears("2026-12-31", 3)).toBe("2029-12-31");
  });
  it("adds days across months and years", () => {
    expect(addDays("2026-11-25", 180)).toBe("2027-05-24");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("affirmationSchedule", () => {
  it("has nothing due before anything is recorded", () => {
    expect(affirmationSchedule([], 2, "2026-11-25")).toEqual({
      level: 2,
      last: null,
      deadlines: [],
    });
  });

  it("Level 2 final: annual affirmation a year after the last one, self-assessment 3 years on", () => {
    const s = affirmationSchedule([rec()], 2, "2026-11-25");
    expect(due(s, "annual_affirmation")).toMatchObject({ due: "2027-03-05", state: "ok" });
    expect(due(s, "self_assessment")).toMatchObject({ due: "2029-03-02", state: "ok" });
    expect(due(s, "poam_closeout")).toBeUndefined();
    expect(s.deadlines[0]?.key).toBe("annual_affirmation");
  });

  it("Level 1: the self-assessment is annual too", () => {
    const s = affirmationSchedule([rec({ level: 1 })], 1, "2026-11-25");
    expect(due(s, "self_assessment")?.due).toBe("2027-03-02");
    expect(due(s, "annual_affirmation")?.due).toBe("2027-03-05");
  });

  it("keeps the levels apart", () => {
    const s = affirmationSchedule([rec({ level: 1 })], 2, "2026-11-25");
    expect(s.last).toBeNull();
  });

  it("counts the annual affirmation from the latest affirmation, whatever order they come in", () => {
    const s = affirmationSchedule(
      [rec({ kind: "annual", affirmedOn: "2027-02-20" }), rec()],
      2,
      "2027-06-01",
    );
    expect(s.last?.affirmedOn).toBe("2027-02-20");
    expect(due(s, "annual_affirmation")?.due).toBe("2028-02-20");
    // An annual affirmation keeps the assessment's status date, so the 3-year clock is unchanged.
    expect(due(s, "self_assessment")?.due).toBe("2029-03-02");
  });

  it("flags due soon within 60 days and overdue after the date", () => {
    const soon = affirmationSchedule([rec()], 2, "2027-01-05");
    expect(due(soon, "annual_affirmation")).toMatchObject({ state: "due_soon", daysLeft: 59 });
    const late = affirmationSchedule([rec()], 2, "2027-03-06");
    expect(due(late, "annual_affirmation")).toMatchObject({ state: "overdue", daysLeft: -1 });
    expect(late.deadlines[0]?.key).toBe("annual_affirmation");
  });

  it("Conditional Level 2: the closeout is due 180 days after the status date, first in the list", () => {
    const s = affirmationSchedule([rec({ cmmcStatus: "conditional" })], 2, "2026-04-01");
    expect(due(s, "poam_closeout")).toMatchObject({ due: "2026-08-29", state: "ok" });
    expect(s.deadlines[0]?.key).toBe("poam_closeout");
  });

  it("a closeout with a Final status clears the 180-day deadline but not the 3-year clock", () => {
    const s = affirmationSchedule(
      [
        rec({ cmmcStatus: "conditional" }),
        rec({ kind: "poam_closeout", cmmcStatusDate: "2026-07-10", affirmedOn: "2026-07-12" }),
      ],
      2,
      "2026-08-01",
    );
    expect(due(s, "poam_closeout")).toBeUndefined();
    expect(due(s, "annual_affirmation")?.due).toBe("2027-07-12");
    expect(due(s, "self_assessment")?.due).toBe("2029-03-02");
  });
});

describe("validateAffirmation", () => {
  const today = "2026-11-25";
  it("accepts a complete Level 2 record", () => {
    expect(validateAffirmation(input(), today)).toEqual([]);
  });
  it("requires the official's name, title and contact (32 CFR 170.22(a)(2)(i))", () => {
    const errs = validateAffirmation(
      input({ officialName: " ", officialTitle: "", officialContact: "" }),
      today,
    );
    expect(errs).toHaveLength(3);
    expect(errs.join(" ")).toContain("170.22(a)(2)(i)");
  });
  it("refuses impossible dates and order", () => {
    expect(validateAffirmation(input({ affirmedOn: "2026-02-30" }), today)).toHaveLength(1);
    expect(validateAffirmation(input({ affirmedOn: "2026-11-26" }), today)[0]).toContain("future");
    expect(
      validateAffirmation(input({ cmmcStatusDate: "2026-04-01", affirmedOn: "2026-03-05" }), today),
    ).toEqual(["The CMMC Status Date cannot be after the date affirmed."]);
  });
  it("Level 1 has no score, no conditional status and no closeout", () => {
    expect(validateAffirmation(input({ level: 1, sprsScore: null }), today)).toEqual([]);
    expect(
      validateAffirmation(
        input({ level: 1, sprsScore: 15, cmmcStatus: "conditional", kind: "poam_closeout" }),
        today,
      ),
    ).toHaveLength(4);
  });
  it("keeps a Level 2 score inside 110 to -203", () => {
    expect(validateAffirmation(input({ sprsScore: 111 }), today)).toHaveLength(1);
    expect(validateAffirmation(input({ sprsScore: -204 }), today)).toHaveLength(1);
    expect(validateAffirmation(input({ sprsScore: 88.5 }), today)).toHaveLength(1);
    expect(validateAffirmation(input({ sprsScore: -203 }), today)).toEqual([]);
    expect(validateAffirmation(input({ sprsScore: null }), today)).toEqual([]);
  });
});
