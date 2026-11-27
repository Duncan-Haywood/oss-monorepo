import { describe, expect, it } from "vitest";
import { TX_MAX_REMINDERS, type TxAppBalance, txNoticeTexts, txUnpaidMonths } from "./tx-notices";

const app = (
  n: number,
  from: string,
  to: string,
  remaining: number,
  sent = true,
): TxAppBalance => ({
  number: n,
  sent,
  periodFrom: from,
  periodTo: to,
  remainingCents: remaining,
});

describe("Texas unpaid months from pay apps", () => {
  it("lists each month a sent pay app with a balance covers, oldest first", () => {
    const months = txUnpaidMonths(
      [
        app(1, "2026-08-01", "2026-08-31", 0), // paid
        app(2, "2026-09-25", "2026-10-24", 1_200_000), // straddles September and October
        app(3, "2026-10-25", "2026-11-24", 800_000),
        app(4, "2026-11-25", "2026-12-24", 500_000, false), // draft
      ],
      [],
      false,
    );
    expect(months.map((m) => [m.workMonth, m.payAppNumbers, m.unpaidCents])).toEqual([
      ["2026-09", [2], 1_200_000],
      ["2026-10", [2, 3], 2_000_000],
      ["2026-11", [3], 800_000],
    ]);
    // November 2026: 15 February 2027 is Presidents' Day, so the 16th (§ 53.003(e)).
    expect(months[2]).toMatchObject({
      statutory: "2027-02-15",
      dueOn: "2027-02-16",
      holidays: ["Presidents' Day"],
    });
    expect(months[0]?.missing).toEqual(["owner", "original-contractor"]);
  });

  it("a recorded notice clears its recipient for its month only; retainage notices do not count", () => {
    const months = txUnpaidMonths(
      [app(2, "2026-09-01", "2026-10-31", 1_000)],
      [
        { kind: "labor-materials", workMonth: "2026-09", recipient: "owner" },
        { kind: "labor-materials", workMonth: "2026-10", recipient: "owner" },
        { kind: "labor-materials", workMonth: "2026-10", recipient: "original-contractor" },
        { kind: "retainage", workMonth: null, recipient: "original-contractor" },
      ],
      true,
    );
    expect(months.map((m) => m.missing)).toEqual([["original-contractor"], []]);
    // Residential: the 15th of the second month (§ 53.056(a-1)(2)).
    expect(months[0]?.dueOn).toBe("2026-11-16"); // 15 November 2026 is a Sunday
  });
});

describe("Texas notice reminders", () => {
  const months = txUnpaidMonths([app(5, "2026-09-01", "2026-09-30", 1_234_500)], [], false);
  // September 2026 work: due 15 December 2026 (a Tuesday).

  it("starts 30 days before, counts down, and names who still needs one", () => {
    expect(txNoticeTexts(months, "2026-11-14")).toEqual([]);
    const [t] = txNoticeTexts(months, "2026-11-15");
    expect(t).toBe(
      "Texas notice of claim for September 2026 work (pay app 5, $12,345.00 unpaid) is due in 30 days, by 2026-12-15, and none is recorded for the owner and the original contractor. Mailed by certified mail, it complies the day it is deposited (Tex. Prop. Code § 53.003(c)); without it the lien for that month's work is not valid (§ 53.056(a)).",
    );
    expect(txNoticeTexts(months, "2026-12-14")[0]).toContain("is due tomorrow, by 2026-12-15");
    expect(txNoticeTexts(months, "2026-12-15")[0]).toContain("is due today");
  });

  it("says when one was missed, for 30 days, then drops it", () => {
    expect(txNoticeTexts(months, "2026-12-16")[0]).toMatch(
      /^Texas notice of claim for September 2026 work .* was due 2026-12-15 and none is recorded/,
    );
    expect(txNoticeTexts(months, "2027-01-14")).toHaveLength(1);
    expect(txNoticeTexts(months, "2027-01-15")).toEqual([]);
  });

  it("says nothing once both are recorded, names the holiday a date rolled past, and caps the list", () => {
    const done = txUnpaidMonths(
      [app(5, "2026-09-01", "2026-09-30", 100)],
      [
        { kind: "labor-materials", workMonth: "2026-09", recipient: "owner" },
        { kind: "labor-materials", workMonth: "2026-09", recipient: "original-contractor" },
      ],
      false,
    );
    expect(txNoticeTexts(done, "2026-12-01")).toEqual([]);
    const nov = txUnpaidMonths([app(6, "2026-11-01", "2026-11-30", 100)], [], false);
    expect(txNoticeTexts(nov, "2027-02-01")[0]).toContain(
      "by 2027-02-16, moved past Presidents' Day",
    );
    const many = txUnpaidMonths([app(7, "2026-06-01", "2026-11-30", 100)], [], true);
    expect(many).toHaveLength(6);
    expect(txNoticeTexts(many, "2026-12-20").length).toBeLessThanOrEqual(TX_MAX_REMINDERS);
  });
});
