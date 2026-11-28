import { describe, expect, it } from "vitest";
import {
  addMonths,
  businessDayOnOrBefore,
  day15MonthsAfter,
  LIEN_DEADLINE_RULES,
  LIEN_DEADLINE_STATES,
  type LienDeadline,
  lastFurnishedFloor,
  lienDateFields,
  lienDeadline,
  lienDeadlineText,
  monthEnd,
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
  it("moves a federal holiday back to the business day before, and a weekend past one", () => {
    expect(businessDayOnOrBefore("2026-11-26")).toBe("2026-11-25"); // Thanksgiving Day
    expect(businessDayOnOrBefore("2026-07-04")).toBe("2026-07-02"); // Saturday; Friday 3 July observed
    expect(businessDayOnOrBefore("2026-09-07")).toBe("2026-09-04"); // Labor Day Monday: back past the weekend
    expect(businessDayOnOrBefore("2026-11-27")).toBe("2026-11-27"); // the day after Thanksgiving is not federal
  });
});

describe("the act-by date on a federal holiday", () => {
  it("Washington: 90 days after 28 August 2026 is Thanksgiving, so the lien is due the Wednesday", () => {
    const d = deadline({ state: "WA", lastFurnishedOn: "2026-08-28" });
    expect(d.statutoryOn).toBe("2026-11-26");
    expect(d.dueOn).toBe("2026-11-25");
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
  it("a completion date entered before last furnishing is used: the earlier date is the safe one", () => {
    // Completion (owner acceptance, say) can come before a sub's punch work; the statute still
    // counts from completion, as the free calculator does (ventures/mechanics-lien-deadline-calculator).
    const d = deadline({ state: "CA", lastFurnishedOn: "2026-09-01", completedOn: "2026-08-01" });
    expect(d.statutoryOn).toBe("2026-10-30");
    expect(d.usedLastFurnishingAsCompletion).toBe(false);
    expect(d.rule).not.toContain("cannot be later than completion");
    const az = deadline({ state: "AZ", lastFurnishedOn: "2026-09-01", completedOn: "2026-08-01" });
    expect(az.statutoryOn).toBe("2026-11-29"); // 120 days after 08-01
    const ut = deadline({ state: "UT", lastFurnishedOn: "2026-09-01", completedOn: "2026-08-01" });
    expect(ut.statutoryOn).toBe("2027-01-28"); // 180 days after 08-01
  });
  it("Nevada counts from the later of completion and your last day, so an earlier completion is not used", () => {
    const d = deadline({ state: "NV", lastFurnishedOn: "2026-09-01", completedOn: "2026-08-01" });
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

describe("lienDeadline: Alabama, Alaska, Maine, Rhode Island and Wyoming (read 2026-11-28)", () => {
  // 2026-09-01 is a Tuesday. +4 months = 2027-01-01 (Fri, New Year's Day, so the act-by date is
  // Thu 2026-12-31), +120 = 2026-12-30 (Wed), +200 = 2027-03-20 (Sat, so Fri 2027-03-19).
  const cases: [string, string, string, string][] = [
    ["AL", "2027-01-01", "2026-12-31", "Ala. Code § 35-11-215"],
    ["AK", "2026-12-30", "2026-12-30", "Alaska Stat. § 34.35.068"],
    ["ME", "2026-12-30", "2026-12-30", "Me. Rev. Stat. tit. 10, § 3255(1)"],
    ["RI", "2027-03-20", "2027-03-19", "R.I. Gen. Laws § 34-28-4(a)"],
    ["WY", "2026-12-30", "2026-12-30", "Wyo. Stat. § 29-2-106(a)"],
  ];
  for (const [state, statutoryOn, dueOn, citation] of cases) {
    it(`${state}: counted from the last day furnished`, () => {
      const d = deadline({ state, lastFurnishedOn: "2026-09-01" });
      expect(d.statutoryOn).toBe(statutoryOn);
      expect(d.dueOn).toBe(dueOn);
      expect(d.citation).toBe(citation);
    });
  }
  it("only Wyoming asks for a completion date, and none asks for a notice of completion", () => {
    for (const [state] of cases) {
      expect(lienDateFields(state)).toEqual({
        completion: state === "WY",
        noticeOfCompletion: false,
      });
    }
  });
  it("Wyoming: substantial completion before the last day moves the date earlier, after it does not", () => {
    const early = deadline({
      state: "WY",
      lastFurnishedOn: "2026-09-01",
      completedOn: "2026-08-01",
    });
    expect(early.statutoryOn).toBe("2026-11-29");
    expect(early.dueOn).toBe("2026-11-27");
    expect(
      deadline({ state: "WY", lastFurnishedOn: "2026-09-01", completedOn: "2026-10-01" })
        .statutoryOn,
    ).toBe("2026-12-30");
  });
  it("Rhode Island's note says the lien covers only the last 200 days of work", () => {
    expect(LIEN_DEADLINE_RULES.RI.notes.join(" ")).toMatch(/200 days before the filing/);
  });
});

describe("lienDeadline: the nine states added 2026-11-28 (statute text read that day)", () => {
  // 2026-09-01 is a Tuesday. +90 = 2026-11-30 (Mon), +120 = 2026-12-30 (Wed), +180 = 2027-02-28
  // (Sun, so the act-by date is Fri 2027-02-26), +3 months = 2026-12-01 (Tue).
  const cases: [string, string, string, string][] = [
    ["DE", "2026-12-30", "2026-12-30", "Del. Code tit. 25, § 2711(b)"],
    ["ID", "2026-11-30", "2026-11-30", "Idaho Code § 45-507(2)"],
    ["KS", "2026-12-01", "2026-12-01", "Kan. Stat. §§ 60-1102, 60-1103(a)"],
    ["MD", "2027-02-28", "2027-02-26", "Md. Code, Real Prop. §§ 9-104, 9-105(a)"],
    ["MT", "2026-11-30", "2026-11-30", "Mont. Code § 71-3-535(1)"],
    ["NE", "2026-12-30", "2026-12-30", "Neb. Rev. Stat. § 52-137(1)"],
    ["ND", "2026-11-30", "2026-11-30", "N.D. Cent. Code § 35-27-13"],
    ["SC", "2026-11-30", "2026-11-30", "S.C. Code § 29-5-90"],
    ["SD", "2026-12-30", "2026-12-30", "S.D. Codified Laws § 44-9-15"],
  ];
  for (const [state, statutoryOn, dueOn, citation] of cases) {
    it(`${state}: counted from the last day furnished`, () => {
      const d = deadline({ state, lastFurnishedOn: "2026-09-01" });
      expect(d.statutoryOn).toBe(statutoryOn);
      expect(d.dueOn).toBe(dueOn);
      expect(d.citation).toBe(citation);
    });
  }
  it("none of them asks for a completion date, and a residential job keeps the same clock", () => {
    for (const [state] of cases) {
      expect(lienDateFields(state)).toEqual({ completion: false, noticeOfCompletion: false });
      expect(
        deadline({ state, lastFurnishedOn: "2026-09-01", residential: true }).statutoryOn,
      ).toBe(deadline({ state, lastFurnishedOn: "2026-09-01" }).statutoryOn);
    }
  });
  it("Kansas counts calendar months, clamped at a short month", () => {
    expect(deadline({ state: "KS", lastFurnishedOn: "2026-11-30" }).statutoryOn).toBe("2027-02-28");
  });
  it("Maryland names the 120-day notice of intention before the 180-day petition", () => {
    const d = deadline({ state: "MD", lastFurnishedOn: "2026-09-01" });
    expect(d.notes.join(" ")).toMatch(/within 120 days/);
  });
  it("Iowa is still not carried", () => {
    expect(lienDeadline({ state: "IA", lastFurnishedOn: "2026-09-01" }).kind).toBe("unsupported");
  });
});

describe("lienDeadline: the states added 2026-11-27 (statute text read that day)", () => {
  it("Michigan 90 days and Minnesota 120 days after last furnishing", () => {
    const mi = deadline({ state: "MI", lastFurnishedOn: "2026-09-01" });
    expect(mi.statutoryOn).toBe("2026-11-30");
    expect(mi.citation).toBe("Mich. Comp. Laws § 570.1111(1)");
    expect(deadline({ state: "MN", lastFurnishedOn: "2026-09-01" }).statutoryOn).toBe("2026-12-30");
  });
  it("Nevada: 90 days after the latest of completion and your last day, 40 after a notice", () => {
    expect(deadline({ state: "NV", lastFurnishedOn: "2026-09-01" }).statutoryOn).toBe("2026-11-30");
    expect(
      deadline({ state: "NV", lastFurnishedOn: "2026-09-01", completedOn: "2026-09-15" })
        .statutoryOn,
    ).toBe("2026-12-14");
    // 2026-09-10 + 40 = 2026-10-20, earlier than 90 days after 09-01.
    expect(
      deadline({ state: "NV", lastFurnishedOn: "2026-09-01", noticeOfCompletionOn: "2026-09-10" })
        .statutoryOn,
    ).toBe("2026-10-20");
  });
  it("Utah: 180 days after final completion, 90 after a notice of completion", () => {
    const d = deadline({ state: "UT", lastFurnishedOn: "2026-09-01" });
    expect(d.statutoryOn).toBe("2027-02-28"); // 180 days, a Sunday
    expect(d.dueOn).toBe("2027-02-26");
    expect(d.rule).toContain("final completion of the original contract");
    expect(
      deadline({ state: "UT", lastFurnishedOn: "2026-09-01", noticeOfCompletionOn: "2026-10-01" })
        .statutoryOn,
    ).toBe("2026-12-30");
  });
  it("Oregon: 75 days after your last day or after completion, whichever is earlier", () => {
    const d = deadline({ state: "OR", lastFurnishedOn: "2026-09-01" });
    expect(d.statutoryOn).toBe("2026-11-15"); // a Sunday
    expect(d.dueOn).toBe("2026-11-13");
    expect(d.notes[0]).toContain("enter its date");
    // Completion before the sub's last day (punch work after it): the earlier count wins.
    const early = deadline({
      state: "OR",
      lastFurnishedOn: "2026-09-01",
      completedOn: "2026-08-20",
    });
    expect(early.statutoryOn).toBe("2026-11-03");
    expect(early.rule).toContain("completion of construction");
    // A later completion does not move it later.
    expect(
      deadline({ state: "OR", lastFurnishedOn: "2026-09-01", completedOn: "2026-10-01" })
        .statutoryOn,
    ).toBe("2026-11-15");
  });
  it("Virginia: 90 days from the end of the month, never later than 90 after completion", () => {
    expect(monthEnd("2026-09-10")).toBe("2026-09-30");
    expect(monthEnd("2028-02-03")).toBe("2028-02-29");
    // No completion entered: completion is on or after 09-10, so 90 days after 09-10 is the floor.
    const none = deadline({ state: "VA", lastFurnishedOn: "2026-09-10" });
    expect(none.statutoryOn).toBe("2026-12-09");
    expect(none.usedLastFurnishingAsCompletion).toBe(true);
    // Completed 10-15: 90 days after it is 2027-01-13, later than 09-30 + 90 = 12-29.
    const late = deadline({
      state: "VA",
      lastFurnishedOn: "2026-09-10",
      completedOn: "2026-10-15",
    });
    expect(late.statutoryOn).toBe("2026-12-29");
    expect(late.rule).toContain("last day of the month");
    // Completed 09-20: 12-19 (a Saturday) is earlier than 12-29.
    const soon = deadline({
      state: "VA",
      lastFurnishedOn: "2026-09-10",
      completedOn: "2026-09-20",
    });
    expect(soon.statutoryOn).toBe("2026-12-19");
    expect(soon.dueOn).toBe("2026-12-18");
    expect(soon.rule).toContain("completion of the building");
  });
  it("asks for the completion dates only where the state counts from them", () => {
    expect(lienDateFields("CA")).toEqual({ completion: true, noticeOfCompletion: true });
    expect(lienDateFields("ut")).toEqual({ completion: true, noticeOfCompletion: true });
    expect(lienDateFields("VA")).toEqual({ completion: true, noticeOfCompletion: false });
    expect(lienDateFields("OR")).toEqual({ completion: true, noticeOfCompletion: false });
    expect(lienDateFields("MI")).toEqual({ completion: false, noticeOfCompletion: false });
    expect(lienDateFields("MO")).toEqual({ completion: false, noticeOfCompletion: false });
    expect(lienDateFields(null)).toEqual({ completion: false, noticeOfCompletion: false });
  });
  it("names a notice of cessation only in California", () => {
    expect(deadline({ state: "NV", lastFurnishedOn: "2026-09-01" }).notes[0]).not.toContain(
      "cessation",
    );
    expect(deadline({ state: "CA", lastFurnishedOn: "2026-09-01" }).notes[0]).toContain(
      "cessation",
    );
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

describe("lienDeadline: a stored date that is not a calendar day (red team 2026-11-27)", () => {
  // The API used to accept any NNNN-NN-NN, so rows may already hold "2026-13-01". The date math
  // threw RangeError on it, taking down the job page, the cash page and the weekly email.
  it("does not throw on an impossible last-furnished date: it falls back to billing", () => {
    const r = lienDeadline({ state: "FL", lastFurnishedOn: "2026-13-01" });
    expect(r.kind).toBe("no-dates");
    const d = deadline({
      state: "FL",
      lastFurnishedOn: "2026-02-31",
      apps: [
        {
          number: 2,
          status: "sent",
          periodFrom: "2026-09-01",
          periodTo: "2026-09-30",
          workThisPeriodCents: 100,
        },
      ],
    });
    expect(d.basis).toBe("estimated");
    expect(d.fromOn).toBe("2026-09-01");
  });
  it("ignores an impossible completion or notice-of-completion date", () => {
    const d = deadline({
      state: "CA",
      lastFurnishedOn: "2026-09-01",
      completedOn: "2026-00-10",
      noticeOfCompletionOn: "2026-09-99",
    });
    expect(d.statutoryOn).toBe("2026-11-30");
    expect(d.usedLastFurnishingAsCompletion).toBe(true);
    const va = deadline({ state: "VA", lastFurnishedOn: "2026-09-10", completedOn: "2026-13-01" });
    expect(va.usedLastFurnishingAsCompletion).toBe(true);
  });
  it("skips a billing period whose start is not a calendar day", () => {
    const r = lienDeadline({
      state: "FL",
      apps: [
        {
          number: 1,
          status: "sent",
          periodFrom: "2026-14-01",
          periodTo: "2026-14-30",
          workThisPeriodCents: 100,
        },
      ],
    });
    expect(r.kind).toBe("no-dates");
  });
});
