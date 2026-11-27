// Oregon certified statement dates and the 25% hold. Each date is worked by hand from a calendar in the
// comment beside it; holidays from ORS 187.010 as read on 2026-11-27.
import { describe, expect, it } from "vitest";
import {
  daysUntil,
  filingDueOn,
  isIsoDate,
  isOregonBusinessDay,
  lateHold,
  nextMonth,
  oregonHolidayOn,
  oregonHolidays,
  releaseBy,
  weekFiling,
} from "./or-pwr";

describe("Oregon legal holidays (ORS 187.010)", () => {
  it("lists the ten weekday holidays of 2027 on the days they are kept", () => {
    expect(oregonHolidays(2027).map((h) => h.on)).toEqual([
      "2027-01-01", // New Year's Day, a Friday
      "2027-01-18", // third Monday in January
      "2027-02-15", // third Monday in February
      "2027-05-31", // last Monday in May
      "2027-06-18", // Juneteenth falls on a Saturday: kept on Friday the 18th
      "2027-07-05", // the 4th is a Sunday: kept on Monday the 5th
      "2027-09-06", // first Monday in September
      "2027-11-11", // Veterans Day, a Thursday
      "2027-11-25", // fourth Thursday in November
      "2027-12-24", // Christmas falls on a Saturday: kept on Friday the 24th
      "2027-12-31", // New Year's Day 2028 is a Saturday: kept on Friday 31 December 2027
    ]);
  });

  it("knows 2026's Thanksgiving and that Christmas 2026 is a Friday", () => {
    expect(oregonHolidayOn("2026-11-26")).toBe("Thanksgiving Day");
    expect(oregonHolidayOn("2026-12-25")).toBe("Christmas Day");
    expect(oregonHolidayOn("2026-11-27")).toBeNull();
  });

  it("does not put New Year's Day 2028 in 2028's own list when it is kept in 2027", () => {
    expect(oregonHolidays(2028).some((h) => h.name === "New Year's Day")).toBe(false);
  });

  it("counts Monday to Friday less holidays as business days", () => {
    expect(isOregonBusinessDay("2026-11-27")).toBe(true); // Friday after Thanksgiving: not on the list
    expect(isOregonBusinessDay("2026-11-26")).toBe(false); // Thanksgiving
    expect(isOregonBusinessDay("2026-11-28")).toBe(false); // Saturday
    expect(isOregonBusinessDay("2026-11-29")).toBe(false); // Sunday
  });
});

describe("the fifth business day of the following month (ORS 279C.845(4))", () => {
  it("November 2026 statements: Tue 1, Wed 2, Thu 3, Fri 4, Mon 7 December", () => {
    expect(filingDueOn("2026-11")).toBe("2026-12-07");
  });
  it("December 2026: New Year's Day (Fri 1) is skipped, Mon 4 to Fri 8 January", () => {
    expect(filingDueOn("2026-12")).toBe("2027-01-08");
  });
  it("January 2027: Mon 1 to Fri 5 February", () => {
    expect(filingDueOn("2027-01")).toBe("2027-02-05");
  });
  it("June 2027: Thu 1, Fri 2, (Mon 5 kept for the 4th), Tue 6, Wed 7, Thu 8 July", () => {
    expect(filingDueOn("2027-06")).toBe("2027-07-08");
  });
  it("August 2027: Wed 1, Thu 2, Fri 3, (Labor Day Mon 6), Tue 7, Wed 8 September", () => {
    expect(filingDueOn("2027-08")).toBe("2027-09-08");
  });
  it("rolls December into January of the next year", () => {
    expect(nextMonth("2027-12")).toBe("2028-01");
  });
});

describe("which month a week is filed with", () => {
  it("a week inside one month has one due date", () => {
    const f = weekFiling("2026-11-15", "2026-11-21");
    expect(f).toMatchObject({
      month: "2026-11",
      dueOn: "2026-12-07",
      alsoMonth: null,
      alsoDueOn: null,
    });
    expect(f.holidaysSkipped).toEqual([]);
  });
  it("a week across two months goes with the earlier month and names the later date", () => {
    const f = weekFiling("2026-11-29", "2026-12-05");
    expect(f).toMatchObject({
      month: "2026-11",
      dueOn: "2026-12-07",
      alsoMonth: "2026-12",
      alsoDueOn: "2027-01-08",
    });
  });
  it("names the holiday that moved the date", () => {
    expect(weekFiling("2026-12-13", "2026-12-19").holidaysSkipped.map((h) => h.name)).toEqual([
      "New Year's Day",
    ]);
  });
});

describe("the 25% hold on a late filing (OAR 839-025-0010(4), (5))", () => {
  it("is the rule's own example: $100,000 earned, $25,000 held", () => {
    expect(lateHold(10_000_000, "first")).toMatchObject({
      holdCents: 2_500_000,
      heldBy: "prime contractor",
    });
    expect(lateHold(10_000_000, "prime")).toMatchObject({
      holdCents: 2_500_000,
      heldBy: "public agency",
    });
  });
  it("rounds half a cent up: 25% of $0.02 is $0.005, held as $0.01", () => {
    expect(lateHold(2, "first").holdCents).toBe(1);
    expect(lateHold(3, "first").holdCents).toBe(1); // 0.75 cent
    expect(lateHold(1, "first").holdCents).toBe(0); // 0.25 cent
  });
  it("names no statutory hold below the first tier", () => {
    expect(lateHold(10_000_000, "lower")).toMatchObject({ holdCents: 0, heldBy: null });
  });
  it("never holds a negative amount", () => {
    expect(lateHold(-500, "prime").holdCents).toBe(0);
  });
  it("is paid within 14 days of filing", () => {
    expect(releaseBy("2026-12-10")).toBe("2026-12-24");
  });
});

describe("helpers", () => {
  it("checks real dates", () => {
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-2-1")).toBe(false);
  });
  it("counts calendar days to a due date", () => {
    expect(daysUntil("2026-11-27", "2026-12-07")).toBe(10);
    expect(daysUntil("2026-12-08", "2026-12-07")).toBe(-1);
  });
});
