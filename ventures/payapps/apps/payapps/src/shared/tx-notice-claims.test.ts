import { describe, expect, it } from "vitest";
import {
  monthName,
  TX_REMIND_DAYS,
  type TxClaimAppInput,
  txNoticeClaims,
  txNoticeText,
} from "./tx-notice-claims";

const app = (over: Partial<TxClaimAppInput> = {}): TxClaimAppInput => ({
  payAppId: "a1",
  number: 1,
  periodFrom: "2026-10-26",
  periodTo: "2026-11-25",
  unpaidCents: 1_824_000,
  txNoticeSentOn: null,
  txNoticeMethod: null,
  ...over,
});

describe("Texas notice of claim dates", () => {
  it("takes the period's first month: October work, commercial, by 2027-01-15", () => {
    const [c] = txNoticeClaims([app()], "commercial", "2026-12-20");
    expect(c).toMatchObject({
      month: "2026-10",
      dueOn: "2027-01-15",
      weekendExtendedTo: null,
      daysLeft: 26,
      status: "open",
    });
  });

  it("residential is one month earlier", () => {
    expect(txNoticeClaims([app()], "residential", "2026-12-01")[0]?.dueOn).toBe("2026-12-15");
  });

  it("leaves out paid applications and sorts by date", () => {
    const claims = txNoticeClaims(
      [
        app({ payAppId: "a2", number: 2, periodFrom: "2026-11-26", periodTo: "2026-12-25" }),
        app(),
        app({ payAppId: "a3", number: 3, unpaidCents: 0 }),
      ],
      "commercial",
      "2026-12-20",
    );
    expect(claims.map((c) => c.number)).toEqual([1, 2]);
    expect(claims[1]?.dueOn).toBe("2027-02-15");
  });

  it("is late only after the weekend move: 2026-11-15 is a Sunday, so the 16th still counts", () => {
    const a = app({ periodFrom: "2026-08-01", periodTo: "2026-08-31" });
    expect(txNoticeClaims([a], "commercial", "2026-11-16")[0]).toMatchObject({
      dueOn: "2026-11-15",
      weekendExtendedTo: "2026-11-16",
      status: "open",
    });
    expect(txNoticeClaims([a], "commercial", "2026-11-17")[0]?.status).toBe("late");
  });

  it("a recorded notice is sent, whatever the date", () => {
    const [c] = txNoticeClaims(
      [app({ txNoticeSentOn: "2026-12-01", txNoticeMethod: "certified-mail" })],
      "commercial",
      "2027-03-01",
    );
    expect(c?.status).toBe("sent");
  });
});

describe("Texas notice of claim reminder", () => {
  it("says nothing more than TX_REMIND_DAYS ahead", () => {
    const claims = txNoticeClaims([app()], "commercial", "2026-12-01");
    expect(claims[0]?.daysLeft).toBeGreaterThan(TX_REMIND_DAYS);
    expect(txNoticeText(claims, "Hill Country Builders", "commercial")).toBeNull();
  });

  it("within the window: the date, the rule and how many more", () => {
    const claims = txNoticeClaims(
      [app(), app({ payAppId: "a2", number: 2, periodFrom: "2026-10-01", periodTo: "2026-10-25" })],
      "commercial",
      "2026-12-20",
    );
    expect(txNoticeText(claims, "Hill Country Builders", "commercial")).toBe(
      "Texas notice of claim: if application #1 ($18,240.00 unpaid, work from October 2026) is still unpaid, send the notice to the owner and Hill Country Builders within 26 days, by 2027-01-15: the 15th of the third month after the work (Tex. Prop. Code § 53.056(a-1)). Print it on the job's notice panel and record it there. 1 more unpaid application on this job needs one too.",
    );
  });

  it("names a weekend date's Monday, and today", () => {
    const a = app({ periodFrom: "2026-08-01", periodTo: "2026-08-31" });
    const text = txNoticeText(txNoticeClaims([a], "commercial", "2026-11-15"), "GC", "commercial");
    expect(text).toContain(
      "today, by 2026-11-15 (a weekend day, so the statute allows 2026-11-16, § 53.003(e))",
    );
  });

  it("once late: what the statute says, never a guess", () => {
    const text = txNoticeText(
      txNoticeClaims([app()], "residential", "2026-12-16"),
      "GC",
      "residential",
    );
    expect(text).toContain("was due 2026-12-15 and none is recorded");
    expect(text).toContain(
      "the lien for that month's work is not valid (Tex. Prop. Code § 53.056(a))",
    );
  });

  it("nothing once every application has a notice", () => {
    const claims = txNoticeClaims(
      [app({ txNoticeSentOn: "2026-12-01", txNoticeMethod: "in-person" })],
      "commercial",
      "2026-12-20",
    );
    expect(txNoticeText(claims, "GC", "commercial")).toBeNull();
  });

  it("monthName", () => {
    expect(monthName("2026-01")).toBe("January 2026");
  });
});
