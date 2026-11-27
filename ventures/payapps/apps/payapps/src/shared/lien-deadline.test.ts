import { describe, expect, it } from "vitest";
import {
  addMonths,
  businessDayOnOrBefore,
  day15MonthsAfter,
  LIEN_DEADLINE_RULES,
  LIEN_DEADLINE_STATES,
  type LienDeadline,
  lastFurnishedFloor,
  lienDeadline,
  lienDeadlineText,
} from "./lien-deadline";

const deadline = (input: Parameters<typeof lienDeadline>[0]): LienDeadline => {
  const r = lienDeadline(input);
  if (r.kind !== "deadline") throw new Error(`expected a deadline, got ${r.kind}`);
  return r.deadline;
};

describe("date helpers", () => {
  it("adds months and clamps to the month's last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-31", 4)).toBe("2027-02-28");
    expect(addMonths("2026-03-15", 8)).toBe("2026-11-15");
  });
  it("finds the 15th of the Nth month after", () => {
    expect(day15MonthsAfter("2026-10-31", 4)).toBe("2027-02-15");
    expect(day15MonthsAfter("2026-11-01", 3)).toBe("2027-02-15");
  });
  it("moves a weekend back to Friday", () => {
    expect(businessDayOnOrBefore("2026-11-28")).toBe("2026-11-27"); // Saturday
    expect(businessDayOnOrBefore("2026-11-29")).toBe("2026-11-27"); // Sunday
    expect(businessDayOnOrBefore("2026-11-30")).toBe("2026-11-30"); // Monday
  });
});

describe("lienDeadline: each state's clock, worked by hand", () => {
  it("Florida: 90 days after last furnishing (2026-09-01 + 90 = 2026-11-30, a Monday)", () => {
    const d = deadline({ state: "FL", lastFurnishedOn: "2026-09-01" });
    expect(d.statutoryOn).toBe("2026-11-30");
    expect(d.dueOn).toBe("2026-11-30");
    expect(d.basis).toBe("entered");
    expect(d.citation).toBe("Fla. Stat. § 713.08(5)");
  });
  it("Georgia and Washington: 90 days; North Carolina 120", () => {
    expect(deadline({ state: "GA", lastFurnishedOn: "2026-09-01" }).statutoryOn).toBe("2026-11-30");
    expect(deadline({ state: "WA", lastFurnishedOn: "2026-09-01" }).statutoryOn).toBe("2026-11-30");
    expect(deadline({ state: "NC", lastFurnishedOn: "2026-09-01" }).statutoryOn).toBe("2026-12-30");
  });
  it("Ohio: 75 days, 60 on a one- or two-family home", () => {
    expect(deadline({ state: "OH", lastFurnishedOn: "2026-09-01" }).statutoryOn).toBe("2026-11-15");
    const home = deadline({ state: "OH", lastFurnishedOn: "2026-09-01", residential: true });
    expect(home.statutoryOn).toBe("2026-10-31");
    expect(home.dueOn).toBe("2026-10-30"); // Saturday back to Friday
    expect(home.residentialRule).toBe(true);
  });
  it("New York: 8 months, 4 on a single family dwelling", () => {
    expect(deadline({ state: "NY", lastFurnishedOn: "2026-03-15" }).statutoryOn).toBe("2026-11-15");
    expect(
      deadline({ state: "NY", lastFurnishedOn: "2026-03-15", residential: true }).statutoryOn,
    ).toBe("2026-07-15");
  });
  it("Colorado: 4 months after last furnishing, clamped at month end", () => {
    expect(deadline({ state: "CO", lastFurnishedOn: "2026-10-31" }).statutoryOn).toBe("2027-02-28");
  });
  it("Texas: 15th of the 4th month (3rd residential) after the month of last furnishing", () => {
    expect(deadline({ state: "TX", lastFurnishedOn: "2026-10-31" }).statutoryOn).toBe("2027-02-15");
    expect(
      deadline({ state: "TX", lastFurnishedOn: "2026-10-01", residential: true }).statutoryOn,
    ).toBe("2027-01-15");
  });
  it("a state without a residential rule ignores the flag", () => {
    const d = deadline({ state: "FL", lastFurnishedOn: "2026-09-01", residential: true });
    expect(d.residentialRule).toBe(false);
    expect(d.statutoryOn).toBe("2026-11-30");
  });
  it("names the shorter residential clock when the job is not marked residential", () => {
    const d = deadline({ state: "TX", lastFurnishedOn: "2026-10-31" });
    expect(d.notes.join(" ")).toContain("residential construction project");
  });
});

describe("lienDeadline: completion states (California, Arizona)", () => {
  it("counts from last furnishing when no completion date is entered, and says so", () => {
    const d = deadline({ state: "CA", lastFurnishedOn: "2026-09-01" });
    expect(d.statutoryOn).toBe("2026-11-30");
    expect(d.usedLastFurnishingAsCompletion).toBe(true);
    expect(d.rule).toContain("cannot be later than completion");
    expect(d.notes[0]).toContain("notice of completion");
  });
  it("counts from completion when entered", () => {
    const d = deadline({ state: "CA", lastFurnishedOn: "2026-09-01", completedOn: "2026-09-15" });
    expect(d.statutoryOn).toBe("2026-12-14");
    expect(d.usedLastFurnishingAsCompletion).toBe(false);
  });
  it("a completion date before last furnishing is not used (it cannot be)", () => {
    const d = deadline({ state: "CA", lastFurnishedOn: "2026-09-01", completedOn: "2026-08-01" });
    expect(d.statutoryOn).toBe("2026-11-30");
    expect(d.usedLastFurnishingAsCompletion).toBe(true);
  });
  it("a recorded notice of completion shortens it to 30 days (California), 60 (Arizona)", () => {
    const ca = deadline({
      state: "CA",
      lastFurnishedOn: "2026-09-01",
      noticeOfCompletionOn: "2026-09-10",
    });
    expect(ca.statutoryOn).toBe("2026-10-10");
    expect(ca.dueOn).toBe("2026-10-09");
    expect(ca.rule).toContain("notice of completion");
    const az = deadline({
      state: "AZ",
      lastFurnishedOn: "2026-09-01",
      noticeOfCompletionOn: "2026-09-10",
    });
    expect(az.statutoryOn).toBe("2026-11-09"); // 60 days, earlier than 120 after 09-01 (12-30)
  });
  it("a notice of completion that would give a later date does not move it later", () => {
    const d = deadline({
      state: "CA",
      lastFurnishedOn: "2026-09-01",
      noticeOfCompletionOn: "2026-11-20",
    });
    expect(d.statutoryOn).toBe("2026-11-30");
  });
});

describe("lienDeadline: no date, no state, other states", () => {
  it("no state", () => expect(lienDeadline({ state: null }).kind).toBe("no-state"));
  it("a state PayApps does not carry", () => {
    expect(lienDeadline({ state: "IL", lastFurnishedOn: "2026-09-01" })).toEqual({
      kind: "unsupported",
      state: "IL",
    });
  });
  it("a carried state with nothing to count from", () => {
    expect(lienDeadline({ state: "fl" }).kind).toBe("no-dates");
  });
  it("every carried state has a rule, a citation and something to do", () => {
    for (const s of LIEN_DEADLINE_STATES) {
      const r = LIEN_DEADLINE_RULES[s];
      expect(r.citation).toMatch(/§/);
      expect(r.act.length).toBeGreaterThan(5);
    }
  });
});

describe("lastFurnishedFloor and the estimated date", () => {
  const apps = [
    {
      number: 1,
      status: "paid",
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      workThisPeriodCents: 500_00,
    },
    {
      number: 2,
      status: "submitted",
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      workThisPeriodCents: 300_00,
    },
    // Retainage-only billing: no work this period, so it says nothing about the last day of work.
    {
      number: 3,
      status: "submitted",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      workThisPeriodCents: 0,
    },
  ];
  it("takes the start of the latest period that billed work", () => {
    expect(lastFurnishedFloor(apps)).toEqual({ on: "2026-09-01", payAppNumber: 2 });
    expect(lastFurnishedFloor([])).toBeNull();
  });
  it("dates the lien from it when no last-furnished date is entered", () => {
    const d = deadline({ state: "FL", apps });
    expect(d.basis).toBe("estimated");
    expect(d.fromOn).toBe("2026-09-01");
    expect(d.fromPayAppNumber).toBe(2);
    expect(d.statutoryOn).toBe("2026-11-30");
  });
  it("an entered date wins over the estimate", () => {
    const d = deadline({ state: "FL", apps, lastFurnishedOn: "2026-09-20" });
    expect(d.basis).toBe("entered");
    expect(d.statutoryOn).toBe("2026-12-19");
    expect(d.dueOn).toBe("2026-12-18");
  });
});

describe("lienDeadlineText (cash page and weekly email)", () => {
  const fl = deadline({ state: "FL", lastFurnishedOn: "2026-09-01" }); // due 2026-11-30
  const owed = { outstandingCents: 12_500_00, retainageHeldCents: 0, workComplete: false };
  it("names the date, the statute and the money owed inside the window", () => {
    const t = lienDeadlineText(fl, owed, "2026-11-27");
    expect(t).toContain("Florida lien deadline in 3 days");
    expect(t).toContain("record a claim of lien by 2026-11-30");
    expect(t).toContain("Fla. Stat. § 713.08(5)");
    expect(t).toContain("$12,500.00 is still owed");
  });
  it("today and tomorrow", () => {
    expect(lienDeadlineText(fl, owed, "2026-11-30")).toContain("deadline today");
    expect(lienDeadlineText(fl, owed, "2026-11-29")).toContain("deadline tomorrow");
  });
  it("silent outside the window and when nothing is owed", () => {
    expect(lienDeadlineText(fl, owed, "2026-10-15")).toBeNull(); // 46 days out
    expect(lienDeadlineText(fl, owed, "2026-10-16")).not.toBeNull(); // 45
    expect(lienDeadlineText(fl, { ...owed, outstandingCents: 0 }, "2026-11-27")).toBeNull();
    expect(lienDeadlineText(fl, owed, "2027-01-01")).toBeNull(); // 32 days after
    expect(lienDeadlineText(null, owed, "2026-11-27")).toBeNull();
  });
  it("after the date, says what may be left instead of urging a lien", () => {
    const t = lienDeadlineText(fl, owed, "2026-12-05");
    expect(t).toContain("passed on 2026-11-30");
    expect(t).toContain("payment bond claim");
  });
  it("counts retainage as money owed", () => {
    const t = lienDeadlineText(
      fl,
      { outstandingCents: 0, retainageHeldCents: 4_000_00, workComplete: true },
      "2026-11-27",
    );
    expect(t).toContain("$4,000.00 of retainage is still held");
  });
  it("an estimated date speaks only once the work is complete, and says how it was dated", () => {
    const est = deadline({
      state: "FL",
      apps: [
        {
          number: 4,
          status: "submitted",
          periodFrom: "2026-09-01",
          periodTo: "2026-09-30",
          workThisPeriodCents: 1,
        },
      ],
    });
    expect(lienDeadlineText(est, owed, "2026-11-27")).toBeNull();
    const t = lienDeadlineText(est, { ...owed, workComplete: true }, "2026-11-27");
    expect(t).toContain("start of Pay App #4's period (2026-09-01)");
    expect(t).toContain("enter your last day on the job");
  });
});
