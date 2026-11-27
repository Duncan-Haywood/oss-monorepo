import { describe, expect, it } from "vitest";
import {
  LATE_INTEREST_PRESETS,
  type LateInterestTerms,
  lateInterest,
  lateInterestTermsOf,
  parseRatePct,
  rateLabel,
} from "./late-interest";

const tx: LateInterestTerms = { bps: 150, per: "month", method: "prorata", source: null };

describe("lateInterest", () => {
  it("matches the free guide's Texas example: $40,000, 45 days late at 1.5% a month is $900", () => {
    // ventures/pay-app-guides/prompt-pay.test.mjs: 4,000,000 x 0.015 x 45/30 = 90,000 cents.
    expect(lateInterest(tx, "2026-03-08", 4_000_000, [], "2026-04-22")).toEqual({
      interestCents: 90_000,
      daysLate: 45,
    });
  });

  it("owes nothing before or on the due date, and is null without a rate or a due date", () => {
    expect(lateInterest(tx, "2026-03-08", 4_000_000, [], "2026-03-08")).toEqual({
      interestCents: 0,
      daysLate: 0,
    });
    expect(lateInterest(tx, "2026-03-08", 4_000_000, [], "2026-03-01")?.interestCents).toBe(0);
    expect(lateInterest(null, "2026-03-08", 4_000_000, [], "2026-04-22")).toBeNull();
    expect(lateInterest(tx, null, 4_000_000, [], "2026-04-22")).toBeNull();
  });

  it("a payment after the due date lowers the balance from the day it came in", () => {
    // $10,000 due 2026-01-01; $6,000 in on day 30; asOf day 60.
    // 1,000,000 x 0.015 x 30/30 + 400,000 x 0.015 x 30/30 = 15,000 + 6,000.
    const r = lateInterest(
      tx,
      "2026-01-01",
      1_000_000,
      [{ amountCents: 600_000, receivedOn: "2026-01-31" }],
      "2026-03-02",
    );
    expect(r).toEqual({ interestCents: 21_000, daysLate: 60 });
  });

  it("payments on or before the due date come off before anything accrues", () => {
    const r = lateInterest(
      tx,
      "2026-01-01",
      1_000_000,
      [{ amountCents: 400_000, receivedOn: "2025-12-20" }],
      "2026-01-31",
    );
    // 600,000 x 0.015 x 30/30.
    expect(r?.interestCents).toBe(9_000);
  });

  it("payments are read in date order whatever order they are stored in", () => {
    const pays = [
      { amountCents: 200_000, receivedOn: "2026-02-15" },
      { amountCents: 300_000, receivedOn: "2026-01-16" },
    ];
    const a = lateInterest(tx, "2026-01-01", 1_000_000, pays, "2026-03-02");
    const b = lateInterest(tx, "2026-01-01", 1_000_000, [...pays].reverse(), "2026-03-02");
    expect(a).toEqual(b);
    // 1,000,000 x 15 + 700,000 x 30 + 500,000 x 15, all x 0.015 / 30.
    expect(a?.interestCents).toBe(Math.round((15_000_000 + 21_000_000 + 7_500_000) * 0.0005));
  });

  it("a per-year rate prorates by 365 days (Illinois 10%)", () => {
    // $36,500, 73 days late at 10% a year = $730.
    const il: LateInterestTerms = { bps: 1000, per: "year", method: "prorata", source: null };
    expect(lateInterest(il, "2026-05-16", 3_650_000, [], "2026-07-28")?.interestCents).toBe(73_000);
  });

  it("North Carolina's month-or-part counts a started month in full, on its highest balance", () => {
    const nc: LateInterestTerms = { bps: 100, per: "month", method: "fraction", source: null };
    // 31 days late on $10,000 = two months at 1%.
    expect(lateInterest(nc, "2026-01-08", 1_000_000, [], "2026-02-08")?.interestCents).toBe(20_000);
    // Half paid on day 10: month 1 on $10,000, month 2 on $5,000.
    expect(
      lateInterest(
        nc,
        "2026-01-08",
        1_000_000,
        [{ amountCents: 500_000, receivedOn: "2026-01-18" }],
        "2026-02-08",
      )?.interestCents,
    ).toBe(15_000);
  });
});

describe("parseRatePct and rateLabel", () => {
  it("reads a percent and refuses typos", () => {
    expect(parseRatePct("1.5", "month")).toBe(150);
    expect(parseRatePct(" 1.5% ", "month")).toBe(150);
    expect(parseRatePct("", "month")).toBeNull();
    expect(parseRatePct("15", "month")).toBeUndefined(); // 15% a month is a typo
    expect(parseRatePct("15", "year")).toBe(1500);
    expect(parseRatePct("1e1", "year")).toBeUndefined();
    expect(parseRatePct("0", "month")).toBeUndefined();
    expect(parseRatePct("1.555", "month")).toBeUndefined();
  });

  it("says the rate in words", () => {
    expect(rateLabel(tx)).toBe("1.5% a month");
    expect(rateLabel({ bps: 1000, per: "year", method: "prorata" })).toBe("10% a year");
    expect(rateLabel({ bps: 100, per: "month", method: "fraction" })).toBe(
      "1% a month or part of a month",
    );
  });

  it("a yearly rate is never counted by the month-or-part rule", () => {
    expect(
      lateInterestTermsOf({
        lateInterestBps: 900,
        lateInterestPer: "year",
        lateInterestMethod: "fraction",
      }),
    ).toEqual({ bps: 900, per: "year", method: "prorata", source: null });
    expect(lateInterestTermsOf({ lateInterestBps: null })).toBeNull();
  });
});

describe("presets", () => {
  it("each links the legislature's own site and stays under the typo cap", () => {
    for (const p of LATE_INTEREST_PRESETS) {
      expect(p.url).toMatch(
        /^https:\/\/(statutes\.capitol\.texas\.gov|www\.ilga\.gov|www\.ncleg\.gov|law\.lis\.virginia\.gov)\//,
      );
      expect(parseRatePct(String(p.bps / 100), p.per)).toBe(p.bps);
    }
  });
});
