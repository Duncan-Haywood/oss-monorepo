import { describe, expect, it } from "vitest";
import {
  type BillingCutoffAppInput,
  billingCutoff,
  billingCutoffStatus,
  billingCutoffText,
  billingDayPhrase,
  cutoffInMonth,
  cutoffsAround,
  parseBillingDay,
} from "./billing-cutoff";

const app = (over: Partial<BillingCutoffAppInput> = {}): BillingCutoffAppInput => ({
  number: 1,
  status: "submitted",
  applicationDate: "2026-10-24",
  submittedOn: "2026-10-24",
  ...over,
});

describe("cutoff dates", () => {
  it("falls on the month's last day when the month is shorter", () => {
    expect(cutoffInMonth(2026, 2, 31)).toBe("2026-02-28");
    expect(cutoffInMonth(2028, 2, 30)).toBe("2028-02-29");
    expect(cutoffInMonth(2026, 4, 31)).toBe("2026-04-30");
    expect(cutoffInMonth(2026, 11, 25)).toBe("2026-11-25");
  });

  it("is this month's cutoff until it passes, then next month's", () => {
    expect(cutoffsAround("2026-11-20", 25)).toEqual({
      dueOn: "2026-11-25",
      previousOn: "2026-10-25",
      beforeOn: "2026-09-25",
    });
    expect(cutoffsAround("2026-11-25", 25).dueOn).toBe("2026-11-25");
    expect(cutoffsAround("2026-11-26", 25)).toEqual({
      dueOn: "2026-12-25",
      previousOn: "2026-11-25",
      beforeOn: "2026-10-25",
    });
  });

  it("crosses the year in both directions", () => {
    expect(cutoffsAround("2026-12-28", 25)).toEqual({
      dueOn: "2027-01-25",
      previousOn: "2026-12-25",
      beforeOn: "2026-11-25",
    });
    expect(cutoffsAround("2027-01-03", 5)).toEqual({
      dueOn: "2027-01-05",
      previousOn: "2026-12-05",
      beforeOn: "2026-11-05",
    });
  });

  it("treats 31 as the last day of every month", () => {
    expect(cutoffsAround("2026-03-01", 31)).toEqual({
      dueOn: "2026-03-31",
      previousOn: "2026-02-28",
      beforeOn: "2026-01-31",
    });
    expect(billingDayPhrase(31)).toBe("the last day");
  });
});

describe("parseBillingDay and billingDayPhrase", () => {
  it("parses 1-31, blank clears, anything else is invalid", () => {
    expect(parseBillingDay(" 25 ")).toBe(25);
    expect(parseBillingDay("")).toBeNull();
    expect(parseBillingDay("0")).toBeUndefined();
    expect(parseBillingDay("32")).toBeUndefined();
    expect(parseBillingDay("25th")).toBeUndefined();
    expect(parseBillingDay("2.5")).toBeUndefined();
  });

  it("writes ordinals", () => {
    expect(
      ["1", "2", "3", "4", "11", "12", "13", "21", "22", "23", "25"].map((d) =>
        billingDayPhrase(Number(d)),
      ),
    ).toEqual([
      "the 1st",
      "the 2nd",
      "the 3rd",
      "the 4th",
      "the 11th",
      "the 12th",
      "the 13th",
      "the 21st",
      "the 22nd",
      "the 23rd",
      "the 25th",
    ]);
  });
});

describe("billingCutoff", () => {
  it("counts an application sent after the previous cutoff for this cycle", () => {
    const c = billingCutoff(
      25,
      [app(), app({ number: 2, applicationDate: "2026-11-20", submittedOn: "2026-11-21" })],
      "2026-11-23",
    );
    expect(c.sent).toEqual({ number: 2, on: "2026-11-21" });
    expect(c.daysLeft).toBe(2);
    expect(billingCutoffText(c, "Acme GC")).toBeNull();
    expect(billingCutoffStatus(c)).toBe(
      "Next cutoff 2026-11-25 (in 2 days): application #2 sent on 2026-11-21.",
    );
  });

  it("sent on the cutoff day itself counts for that cycle", () => {
    const c = billingCutoff(
      25,
      [app({ number: 2, applicationDate: "2026-11-25", submittedOn: "2026-11-25" })],
      "2026-11-25",
    );
    expect(c.sent?.number).toBe(2);
    expect(c.daysLeft).toBe(0);
  });

  it("reminds within a week when a draft is waiting", () => {
    const c = billingCutoff(
      25,
      [
        app(),
        app({ number: 2, status: "draft", applicationDate: "2026-11-20", submittedOn: null }),
      ],
      "2026-11-22",
    );
    expect(c.sent).toBeNull();
    expect(c.missed).toBeNull();
    expect(c.draft).toEqual({ number: 2, applicationDate: "2026-11-20" });
    expect(billingCutoffText(c, "Acme GC")).toBe(
      "Pay application due to Acme GC in 3 days, 2026-11-25 (cutoff the 25th of the month): draft #2 is not submitted yet.",
    );
    expect(billingCutoffStatus(c)).toBe(
      "Next cutoff 2026-11-25 (in 3 days): draft #2 not submitted yet.",
    );
  });

  it("says today and tomorrow", () => {
    expect(billingCutoffText(billingCutoff(25, [app()], "2026-11-25"), "G")).toContain(
      "due to G today, 2026-11-25",
    );
    expect(billingCutoffText(billingCutoff(25, [app()], "2026-11-24"), "G")).toContain(
      "due to G tomorrow, 2026-11-25",
    );
  });

  it("reminds with no draft, without assuming there is work to bill", () => {
    const text = billingCutoffText(billingCutoff(25, [app()], "2026-11-19"), "Acme GC");
    expect(text).toContain("in 6 days, 2026-11-25");
    expect(text).toContain("no draft started yet. If there is work or stored material to bill");
  });

  it("stays quiet more than a week before the cutoff", () => {
    const c = billingCutoff(25, [app()], "2026-11-17");
    expect(c.daysLeft).toBe(8);
    expect(billingCutoffText(c, "Acme GC")).toBeNull();
    expect(billingCutoffStatus(c)).toBe(
      "Next cutoff 2026-11-25 (in 8 days): no draft started yet.",
    );
  });

  it("calls a cutoff missed when a draft dated before it is still unsent", () => {
    const c = billingCutoff(
      25,
      [
        app(),
        app({ number: 2, status: "draft", applicationDate: "2026-11-20", submittedOn: null }),
      ],
      "2026-11-27",
    );
    expect(c.dueOn).toBe("2026-12-25");
    expect(c.missed).toEqual({ number: 2, applicationDate: "2026-11-20", cutoffOn: "2026-11-25" });
    const text = billingCutoffText(c, "Acme GC");
    expect(text).toContain(
      "Application #2 (dated 2026-11-20) was not submitted by the billing cutoff on 2026-11-25 (Acme GC takes applications by the 25th of the month)",
    );
    expect(text).toContain("The next cutoff is 2026-12-25.");
    expect(billingCutoffStatus(c)).toContain("Application #2 missed the 2026-11-25 cutoff");
  });

  it("does not call a cycle missed when nothing was drafted for it", () => {
    const c = billingCutoff(25, [app()], "2026-11-27");
    expect(c.missed).toBeNull();
    expect(billingCutoffText(c, "Acme GC")).toBeNull();
  });

  it("does not call it missed when another application went out in that cycle", () => {
    const c = billingCutoff(
      25,
      [
        app({ number: 2, applicationDate: "2026-11-20", submittedOn: "2026-11-24" }),
        app({ number: 3, status: "draft", applicationDate: "2026-11-24", submittedOn: null }),
      ],
      "2026-11-27",
    );
    expect(c.missed).toBeNull();
  });

  it("clears the missed note once the late application is sent", () => {
    const c = billingCutoff(
      25,
      [app({ number: 2, applicationDate: "2026-11-20", submittedOn: "2026-11-27" })],
      "2026-11-28",
    );
    expect(c.missed).toBeNull();
    expect(c.sent).toEqual({ number: 2, on: "2026-11-27" });
  });

  it("does not call a draft dated after the cutoff missed", () => {
    const c = billingCutoff(
      25,
      [app({ number: 2, status: "draft", applicationDate: "2026-11-26", submittedOn: null })],
      "2026-11-27",
    );
    expect(c.missed).toBeNull();
    expect(c.draft?.number).toBe(2);
  });
});
