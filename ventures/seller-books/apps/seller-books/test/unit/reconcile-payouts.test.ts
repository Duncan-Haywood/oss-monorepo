// Bank deposits checked against the payouts the books expect: every expected figure is worked by hand beside it.
import { PLATFORM_LABELS, PLATFORMS } from "@shared/enums";
import {
  gapThreshold,
  matchPlatform,
  monthsBetween,
  type PayoutBooksCell,
  type PayoutDeposit,
  reconcilePayouts,
} from "@shared/reconcile-payouts";
import { describe, expect, it } from "vitest";

const cell = (
  platform: string,
  month: string,
  orders: number,
  revenue: number,
  fees = 0,
  postage = 0,
): PayoutBooksCell => ({
  platform,
  month,
  orders,
  revenueCents: revenue,
  feesCents: fees,
  postageCents: postage,
});

let line = 1;
const dep = (date: string, description: string, amountCents: number): PayoutDeposit => ({
  line: ++line,
  date,
  description,
  amountCents,
});

const run = (
  deposits: PayoutDeposit[],
  books: PayoutBooksCell[],
  from = "2026-01-02",
  to = "2026-03-30",
  exclude?: number[],
) =>
  reconcilePayouts({
    from,
    to,
    deposits,
    books,
    exclude,
    platforms: PLATFORMS,
    labels: PLATFORM_LABELS,
  });

describe("matchPlatform", () => {
  it("matches a word that starts with the platform's name", () => {
    expect(matchPlatform("EBAY COMMERCE PAYOUT", PLATFORMS)).toBe("ebay");
    expect(matchPlatform("Etsy, Inc. DEPOSIT", PLATFORMS)).toBe("etsy");
    expect(matchPlatform("AMAZON.COM SERVICES", PLATFORMS)).toBe("amazon");
    expect(matchPlatform("TikTokShop settlement", PLATFORMS)).toBe("tiktok");
    expect(matchPlatform("ACH CREDIT POSHMARK INC", PLATFORMS)).toBe("poshmark");
  });
  it("does not match a name inside another word, or two platforms on one line", () => {
    expect(matchPlatform("Zelle from BETSY SMITH", PLATFORMS)).toBeNull();
    expect(matchPlatform("PAYPAL TRANSFER EBAY", PLATFORMS)).toBeNull();
    expect(matchPlatform("PAYROLL ACME CO", PLATFORMS)).toBeNull();
  });
});

describe("monthsBetween and gapThreshold", () => {
  it("lists every month, across a year end", () => {
    expect(monthsBetween("2025-11-15", "2026-02-01")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
  it("is $25 or 15% of the expected payouts, whichever is larger", () => {
    expect(gapThreshold(10000)).toBe(2500); // 15% of $100 is $15 < $25
    expect(gapThreshold(100000)).toBe(15000); // 15% of $1,000
  });
});

describe("reconcilePayouts", () => {
  it("matches when deposits equal revenue less fees and postage", () => {
    // January: $500 revenue - $60 fees - $40 postage = $400 expected; deposited $250 + $150.
    const r = run(
      [dep("2026-01-10", "EBAY COMMERCE", 25000), dep("2026-01-24", "EBAY COMMERCE", 15000)],
      [cell("ebay", "2026-01", 5, 50000, 6000, 4000)],
      "2026-01-02",
      "2026-01-30",
    );
    expect(r.platforms).toHaveLength(1);
    expect(r.platforms[0]).toMatchObject({
      platform: "ebay",
      expectedCents: 40000,
      depositsCents: 40000,
      depositCount: 2,
      gapCents: 0,
      status: "matches",
    });
    expect(r.findings[0]).toMatch(/^eBay: deposits of \$400\.00 are within \$60\.00/);
  });

  it("names a month with deposits and no sales imported in it or the month before", () => {
    // Mercari: January imported ($300 expected, $300 deposited); February and March not imported, $200 and $180
    // deposited. Gap: 300 - (300 + 200 + 180) = -380, past the $45 threshold.
    const r = run(
      [
        dep("2026-01-20", "MERCARI INC", 30000),
        dep("2026-02-15", "MERCARI INC", 20000),
        dep("2026-03-15", "MERCARI INC", 18000),
      ],
      [cell("mercari", "2026-01", 3, 30000)],
    );
    const m = r.platforms[0];
    expect(m?.status).toBe("deposits_ahead");
    expect(m?.gapCents).toBe(-38000);
    expect(m?.months.map((x) => x.runningGapCents)).toEqual([0, -20000, -38000]);
    // February has January's sales before it, so only March is named.
    expect(r.findings.filter((f) => f.startsWith("Mercari, 2026-"))).toEqual([
      "Mercari, 2026-03: $180.00 deposited and no Mercari sales in the books that month or the month before. Import that month's report.",
    ]);
    expect(r.findings.some((f) => f.startsWith("Mercari: $380.00 more deposited"))).toBe(true);
  });

  it("says when the books expect payouts that never reached this account", () => {
    const r = run(
      [dep("2026-01-05", "PAYROLL ACME", 100000)],
      [cell("poshmark", "2026-02", 4, 20000, 4000)],
    );
    expect(r.platforms[0]).toMatchObject({
      platform: "poshmark",
      status: "no_deposits",
      expectedCents: 16000,
    });
    expect(r.findings[0]).toMatch(/^Poshmark: the books expect \$160\.00 in payouts/);
    // The payroll deposit names no platform and is reported as other money in.
    expect(r.otherDepositsCents).toBe(100000);
    expect(r.findings.at(-1)).toMatch(/^\$1,000\.00 of other money in names no platform/);
  });

  it("reports deposits from a platform with no sales imported", () => {
    const r = run([dep("2026-02-03", "WHATNOT INC", 9000)], []);
    expect(r.platforms[0]).toMatchObject({
      platform: "whatnot",
      status: "no_books",
      depositCount: 1,
    });
    expect(r.findings[0]).toMatch(/^Whatnot: 1 deposit\(s\) of \$90\.00 and no Whatnot sales/);
  });

  it("drops an excluded line and warns where a name is also used for refunds", () => {
    const refund = dep("2026-01-12", "AMAZON.COM REFUND", 4599);
    const payout = dep("2026-01-15", "AMAZON PAYMENTS", 20000);
    const books = [cell("amazon", "2026-01", 2, 30000, 10000)]; // $200 expected
    const before = run([refund, payout], books, "2026-01-01", "2026-01-31");
    expect(before.platforms[0]?.depositsCents).toBe(24599);
    expect(
      before.findings.some((f) => f.includes("a refund of something you bought on Amazon")),
    ).toBe(true);
    const after = run([refund, payout], books, "2026-01-01", "2026-01-31", [refund.line]);
    expect(after.platforms[0]).toMatchObject({
      depositsCents: 20000,
      gapCents: 0,
      status: "matches",
    });
    expect(after.deposits.find((d) => d.line === refund.line)?.excluded).toBe(true);
    expect(after.otherDepositsCents).toBe(0);
  });

  it("leaves out books outside the statement's months and says so when nothing matches", () => {
    const r = run([], [cell("ebay", "2025-12", 3, 9000)]);
    expect(r.platforms).toEqual([]);
    expect(r.findings[0]).toMatch(/^No deposit names a platform/);
  });
});
