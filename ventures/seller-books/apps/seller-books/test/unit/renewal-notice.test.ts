import {
  addMonths,
  RENEWAL_NOTICE_MAX_DAYS,
  RENEWAL_NOTICE_MIN_DAYS,
  type RenewalSubscription,
  renewalCycle,
  renewalNoticeDue,
  renewalTerms,
} from "@shared/renewal-notice";
import { describe, expect, it } from "vitest";

const d = (iso: string) => new Date(`${iso}T09:30:00Z`);
const yearly = (over: Partial<RenewalSubscription> = {}): RenewalSubscription => ({
  planKey: "side",
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodStart: d("2026-01-15"),
  currentPeriodEnd: d("2027-01-15"),
  billingInterval: "year",
  billingFrequency: 1,
  startedAt: d("2026-01-15"),
  ...over,
});
const monthly = (over: Partial<RenewalSubscription> = {}): RenewalSubscription =>
  yearly({
    billingInterval: "month",
    currentPeriodStart: d("2026-11-15"),
    currentPeriodEnd: d("2026-12-15"),
    startedAt: d("2026-01-15"),
    ...over,
  });

describe("addMonths", () => {
  it("clamps to the month's last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-01-31", 13)).toBe("2028-02-29");
    expect(addMonths("2026-03-15", 12)).toBe("2027-03-15");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("renewalCycle", () => {
  it("reads the billed price, else the period's length", () => {
    expect(renewalCycle(yearly())).toBe("year");
    expect(renewalCycle(monthly())).toBe("month");
    expect(renewalCycle(yearly({ billingInterval: "month", billingFrequency: 12 }))).toBe("year");
    expect(renewalCycle(yearly({ billingInterval: null, billingFrequency: null }))).toBe("year");
    expect(renewalCycle(monthly({ billingInterval: null, billingFrequency: null }))).toBe("month");
    expect(
      renewalCycle(
        yearly({ billingInterval: null, currentPeriodStart: null, billingFrequency: null }),
      ),
    ).toBe("month");
  });
});

describe("renewalNoticeDue, a yearly plan", () => {
  it("is due 26 to 39 days before the renewal, inside Colorado's 25 to 40", () => {
    expect(RENEWAL_NOTICE_MIN_DAYS).toBeGreaterThan(25);
    expect(RENEWAL_NOTICE_MAX_DAYS).toBeLessThan(40);
    expect(renewalNoticeDue(yearly(), "2026-12-06")).toBeNull(); // 40 days
    const first = renewalNoticeDue(yearly(), "2026-12-07"); // 39 days
    expect(first).toEqual({
      key: "2027-01-15",
      cycle: "year",
      nextCharge: "2027-01-15",
      daysLeft: 39,
      late: false,
      yearNumber: null,
    });
    expect(renewalNoticeDue(yearly(), "2026-12-20")?.late).toBe(false); // 26 days
  });

  it("sends late rather than never, down to the day before", () => {
    expect(renewalNoticeDue(yearly(), "2026-12-21")).toMatchObject({ daysLeft: 25, late: true });
    expect(renewalNoticeDue(yearly(), "2027-01-14")).toMatchObject({ daysLeft: 1, late: true });
    expect(renewalNoticeDue(yearly(), "2027-01-15")).toBeNull();
  });

  it("says nothing for a plan that will not renew", () => {
    const today = "2026-12-10";
    expect(renewalNoticeDue(yearly({ cancelAtPeriodEnd: true }), today)).toBeNull();
    for (const status of ["canceled", "paused", "past_due", "comp", "none"]) {
      expect(renewalNoticeDue(yearly({ status }), today)).toBeNull();
    }
    expect(renewalNoticeDue(yearly({ planKey: "comp" }), today)).toBeNull();
    expect(renewalNoticeDue(yearly({ planKey: "free" }), today)).toBeNull();
    expect(renewalNoticeDue(yearly({ currentPeriodEnd: null }), today)).toBeNull();
    expect(renewalNoticeDue(yearly({ status: "trialing" }), today)).not.toBeNull();
  });
});

describe("renewalNoticeDue, a monthly plan", () => {
  it("is due once a year, before the twelve-month mark", () => {
    // Started 2026-01-15: the mark is 2027-01-15, the 13th monthly charge.
    const s = monthly({ currentPeriodStart: d("2026-12-15"), currentPeriodEnd: d("2027-01-15") });
    expect(renewalNoticeDue(s, "2026-12-06")).toBeNull();
    expect(renewalNoticeDue(s, "2026-12-07")).toEqual({
      key: "2027-01-15",
      cycle: "month",
      nextCharge: "2027-01-15",
      daysLeft: 39,
      late: false,
      yearNumber: 2,
    });
  });

  it("names the mark while the next charge is the month before it", () => {
    // 39 days before 2027-01-15 the current period still ends 2026-12-15.
    expect(renewalNoticeDue(monthly(), "2026-12-07")).toMatchObject({
      key: "2027-01-15",
      nextCharge: "2026-12-15",
    });
  });

  it("is quiet the rest of the year and counts the years", () => {
    expect(renewalNoticeDue(monthly(), "2026-06-01")).toBeNull();
    const third = monthly({
      currentPeriodStart: d("2027-12-15"),
      currentPeriodEnd: d("2028-01-15"),
    });
    expect(renewalNoticeDue(third, "2027-12-20")).toMatchObject({
      key: "2028-01-15",
      yearNumber: 3,
    });
  });

  it("falls back to the period start when no start was stamped", () => {
    const s = monthly({ startedAt: null, currentPeriodStart: d("2025-12-31") });
    // 2025-12-31 + 12 months = 2026-12-31.
    expect(renewalNoticeDue(s, "2026-12-01")).toMatchObject({ key: "2026-12-31", daysLeft: 30 });
  });
});

describe("renewalTerms", () => {
  it("names the cycle, the price, the one-step cancel and the reminder", () => {
    const t = renewalTerms("$150.00", "year");
    expect(t).toContain("every year at $150.00 plus any sales tax");
    expect(t).toContain("until you cancel");
    expect(t).toContain("in one step");
    expect(t).toContain("26 to 39 days before each yearly renewal");
    expect(renewalTerms("$15.00", "month")).toContain("every month at $15.00");
  });
});
