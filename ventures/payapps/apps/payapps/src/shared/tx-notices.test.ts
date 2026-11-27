import { describe, expect, it } from "vitest";
import {
  TX_MAX_REMINDERS,
  type TxAppBalance,
  type TxRetainageDates,
  txNoticeTexts,
  txRetainageDeadlines,
  txRetainageTexts,
  txUnpaidMonths,
} from "./tx-notices";

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

// Weekdays checked by hand from 1 January 2027, a Friday.
const dates = (d: Partial<TxRetainageDates>): TxRetainageDates => ({
  contractEndedOn: null,
  originalEndedOn: null,
  originalEndedHow: null,
  ...d,
});
const RET = (recipient: "owner" | "original-contractor") => ({
  kind: "retainage" as const,
  workMonth: null,
  recipient,
});

describe("Texas retainage deadlines (§§ 53.057(a-1), 53.052(d))", () => {
  it("nothing until a date that starts the clock is saved", () => {
    expect(txRetainageDeadlines(dates({}), [])).toEqual({ notice: null, affidavit: null });
    // A completed original contract gives the affidavit date but does not start the notice.
    const d = txRetainageDeadlines(
      dates({ originalEndedOn: "2027-03-01", originalEndedHow: "completed" }),
      [],
    );
    expect(d.notice).toBeNull();
    expect(d.affidavit?.due).toBe("2027-06-15");
  });

  it("30 days after this company's contract ended (Friday 9 April 2027)", () => {
    const d = txRetainageDeadlines(dates({ contractEndedOn: "2027-03-10" }), []);
    expect(d.notice).toMatchObject({
      statutory: "2027-04-09",
      due: "2027-04-09",
      basis: "claimant",
      missing: ["owner", "original-contractor"],
    });
    expect(d.affidavit).toBeNull();
  });

  it("an earlier terminated or abandoned original contract wins; a completed one does not", () => {
    for (const how of ["terminated", "abandoned"] as const) {
      const d = txRetainageDeadlines(
        dates({
          contractEndedOn: "2027-03-10",
          originalEndedOn: "2027-03-01",
          originalEndedHow: how,
        }),
        [],
      );
      expect(d.notice).toMatchObject({ due: "2027-03-31", basis: "original" });
    }
    const done = txRetainageDeadlines(
      dates({
        contractEndedOn: "2027-03-10",
        originalEndedOn: "2027-03-01",
        originalEndedHow: "completed",
      }),
      [],
    );
    expect(done.notice).toMatchObject({ due: "2027-04-09", basis: "claimant" });
    // A terminated original contract alone starts the notice too.
    const alone = txRetainageDeadlines(
      dates({ originalEndedOn: "2027-03-01", originalEndedHow: "terminated" }),
      [],
    );
    expect(alone.notice).toMatchObject({ due: "2027-03-31", basis: "original" });
    // A later termination does not move the notice past the claimant's own 30 days.
    const later = txRetainageDeadlines(
      dates({
        contractEndedOn: "2027-03-10",
        originalEndedOn: "2027-03-20",
        originalEndedHow: "terminated",
      }),
      [],
    );
    expect(later.notice).toMatchObject({ due: "2027-04-09", basis: "claimant" });
  });

  it("rolls past a legal holiday and a weekend (§ 53.003(e))", () => {
    const n = txRetainageDeadlines(dates({ contractEndedOn: "2027-05-01" }), []).notice;
    expect(n).toMatchObject({
      statutory: "2027-05-31",
      due: "2027-06-01",
      holidays: ["Memorial Day"],
    });
    const a = txRetainageDeadlines(
      dates({ originalEndedOn: "2027-05-20", originalEndedHow: "completed" }),
      [],
    ).affidavit;
    expect(a).toMatchObject({ statutory: "2027-08-15", due: "2027-08-16", holidays: [] });
  });

  it("monthly notices do not count; a retainage notice clears its recipient", () => {
    const d = txRetainageDeadlines(dates({ contractEndedOn: "2027-03-10" }), [
      { kind: "labor-materials", workMonth: "2027-02", recipient: "owner" },
      RET("original-contractor"),
    ]);
    expect(d.notice?.missing).toEqual(["owner"]);
  });

  it("a date that does not parse gives no deadline rather than an error", () => {
    expect(txRetainageDeadlines(dates({ contractEndedOn: "2027-02-30" }), []).notice).toBeNull();
  });
});

describe("Texas retainage reminders", () => {
  const d = txRetainageDeadlines(
    dates({
      contractEndedOn: "2027-03-10",
      originalEndedOn: "2027-03-10",
      originalEndedHow: "completed",
    }),
    [],
  );

  it("say nothing without retainage held", () => {
    expect(txRetainageTexts(d, 0, "2027-04-01")).toEqual([]);
  });

  it("the notice from the day it is saved, then 30 days after a missed date", () => {
    const [t] = txRetainageTexts(d, 1_250_000, "2027-03-12");
    expect(t).toBe(
      "Texas notice of claim for unpaid retainage ($12,500.00 held) is due in 28 days, by 2027-04-09, 30 days after your contract ended, and none is recorded for the owner and the original contractor. Unless the retainage was already claimed in a monthly notice, the retainage lien is not valid without it (Tex. Prop. Code § 53.057(a), (a-1)).",
    );
    expect(txRetainageTexts(d, 100, "2027-04-08")[0]).toContain("is due tomorrow, by 2027-04-09");
    expect(txRetainageTexts(d, 100, "2027-04-09")[0]).toContain("is due today");
    expect(txRetainageTexts(d, 100, "2027-04-10")[0]).toMatch(
      /^Texas notice of claim for unpaid retainage \(\$1\.00 held\) was due 2027-04-09/,
    );
    expect(txRetainageTexts(d, 100, "2027-05-09")).toHaveLength(1);
    expect(txRetainageTexts(d, 100, "2027-05-10")).toEqual([]);
  });

  it("names only who is missing, and stops once both are recorded", () => {
    const one = txRetainageDeadlines(dates({ contractEndedOn: "2027-03-10" }), [RET("owner")]);
    expect(txRetainageTexts(one, 100, "2027-04-01")[0]).toContain(
      "none is recorded for the original contractor.",
    );
    const both = txRetainageDeadlines(dates({ contractEndedOn: "2027-03-10" }), [
      RET("owner"),
      RET("original-contractor"),
    ]);
    expect(txRetainageTexts(both, 100, "2027-04-01")).toEqual([]);
  });

  it("the affidavit in the 30 days up to its date, even after the notices are sent", () => {
    // Original contract completed 10 March 2027: the affidavit is due 15 June 2027 (a Tuesday).
    const sent = txRetainageDeadlines(
      dates({
        contractEndedOn: "2027-03-10",
        originalEndedOn: "2027-03-10",
        originalEndedHow: "completed",
      }),
      [RET("owner"), RET("original-contractor")],
    );
    expect(txRetainageTexts(sent, 100, "2027-05-15")).toEqual([]);
    expect(txRetainageTexts(sent, 100, "2027-05-16")).toEqual([
      "Texas lien affidavit for retainage ($1.00 held): if the retainage is still unpaid, the affidavit must be filed with the county clerk in 30 days, by 2027-06-15 (Tex. Prop. Code § 53.052(d)), and notice of it sent as § 53.055 requires.",
    ]);
    expect(txRetainageTexts(sent, 100, "2027-06-15")[0]).toContain("county clerk today");
    expect(txRetainageTexts(sent, 100, "2027-06-16")).toEqual([]);
  });
});
