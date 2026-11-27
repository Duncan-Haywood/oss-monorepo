// Which due date the 1040-ES reminder is for on a given day (src/shared/estimate-reminder.ts).
import {
  longDate,
  nextDueDate,
  paymentName,
  REMINDER_LEAD_DAYS,
  reminderTarget,
  whenText,
} from "@shared/estimate-reminder";
import { describe, expect, it } from "vitest";

describe("reminderTarget", () => {
  it("names the next due date from seven days before it through the day itself", () => {
    expect(REMINDER_LEAD_DAYS).toBe(7);
    // 2026: April 15 (Wed), June 15 (Mon), September 15 (Tue), January 15, 2027 (Fri).
    expect(reminderTarget("2026-04-07")).toBeNull();
    expect(reminderTarget("2026-04-08")).toEqual({
      due: "2026-04-15",
      year: 2026,
      quarter: 0,
      daysLeft: 7,
    });
    expect(reminderTarget("2026-04-15")).toMatchObject({ due: "2026-04-15", daysLeft: 0 });
    expect(reminderTarget("2026-04-16")).toBeNull();
    expect(reminderTarget("2026-06-10")).toMatchObject({ due: "2026-06-15", quarter: 1 });
    expect(reminderTarget("2026-09-08")).toMatchObject({ due: "2026-09-15", quarter: 2 });
  });

  it("gives January's date to the tax year before", () => {
    // January 15, 2026 is a Thursday; January 15, 2027 a Friday.
    expect(reminderTarget("2026-01-09")).toEqual({
      due: "2026-01-15",
      year: 2025,
      quarter: 3,
      daysLeft: 6,
    });
    expect(reminderTarget("2027-01-08")).toMatchObject({ due: "2027-01-15", year: 2026, quarter: 3 });
    expect(reminderTarget("2026-12-31")).toBeNull();
  });

  it("follows a date moved off a weekend or holiday", () => {
    // June 15, 2025 was a Sunday: the date is Monday the 16th, so the 9th is the first reminder day.
    expect(nextDueDate("2025-06-01")).toMatchObject({ due: "2025-06-16", quarter: 1 });
    expect(reminderTarget("2025-06-08")).toBeNull();
    expect(reminderTarget("2025-06-09")).toMatchObject({ due: "2025-06-16", daysLeft: 7 });
    // Emancipation Day: April 15, 2028 is a Saturday, the 16th a Sunday (observed Monday the 17th),
    // so the date is Tuesday the 18th.
    expect(nextDueDate("2028-04-01").due).toBe("2028-04-18");
  });

  it("refuses a malformed day", () => {
    expect(reminderTarget("2026-6-10")).toBeNull();
    expect(reminderTarget("")).toBeNull();
  });
});

describe("wording", () => {
  it("dates, names and counts", () => {
    expect(longDate("2027-01-15")).toBe("January 15, 2027");
    expect(paymentName({ year: 2026, quarter: 1 })).toBe("the second 2026 estimated payment");
    expect(whenText(0)).toBe("today");
    expect(whenText(1)).toBe("tomorrow");
    expect(whenText(7)).toBe("in 7 days");
  });
});
