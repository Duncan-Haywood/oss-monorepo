import { describe, expect, it } from "vitest";
import {
  daysBetween,
  dueLabel,
  firstFollowUpOn,
  followUpDigestEmail,
  isFollowUpDue,
  isShopDayString,
  MAX_FOLLOW_UPS_LISTED,
  nextFollowUpError,
  nextWeekday,
} from "./follow-up";

describe("follow-up dates", () => {
  it("puts the first follow-up the shop's days after the send day, none at 0", () => {
    expect(firstFollowUpOn("2031-04-28", 3)).toBe("2031-05-01");
    expect(firstFollowUpOn("2031-12-30", 3)).toBe("2032-01-02");
    expect(firstFollowUpOn("2031-04-28", 0)).toBeNull();
    expect(firstFollowUpOn("2031-04-28", -2)).toBeNull();
    expect(firstFollowUpOn("2031-04-28", 2.5)).toBeNull();
  });

  it("moves a first follow-up that lands on a weekend to the Monday", () => {
    // 2026-11-26 is a Thursday: +2 is Saturday, +3 Sunday, both Monday 2026-11-30.
    expect(firstFollowUpOn("2026-11-26", 2)).toBe("2026-11-30");
    expect(firstFollowUpOn("2026-11-26", 3)).toBe("2026-11-30");
    expect(firstFollowUpOn("2026-11-26", 1)).toBe("2026-11-27");
    expect(nextWeekday("2026-11-28")).toBe("2026-11-30");
    expect(nextWeekday("2026-11-29")).toBe("2026-11-30");
    expect(nextWeekday("2026-11-30")).toBe("2026-11-30");
  });

  it("is due only while sent and once its day has come", () => {
    expect(isFollowUpDue({ status: "sent", followUpOn: "2031-05-01" }, "2031-05-01")).toBe(true);
    expect(isFollowUpDue({ status: "sent", followUpOn: "2031-04-20" }, "2031-05-01")).toBe(true);
    expect(isFollowUpDue({ status: "sent", followUpOn: "2031-05-02" }, "2031-05-01")).toBe(false);
    expect(isFollowUpDue({ status: "sent", followUpOn: null }, "2031-05-01")).toBe(false);
    for (const status of ["draft", "won", "lost", "expired", "superseded"]) {
      expect(isFollowUpDue({ status, followUpOn: "2031-04-20" }, "2031-05-01")).toBe(false);
    }
  });

  it("checks the next day: real, after today, within 180 days, or null", () => {
    const today = "2031-05-01";
    expect(nextFollowUpError(null, today)).toBeNull();
    expect(nextFollowUpError("2031-05-02", today)).toBeNull();
    expect(nextFollowUpError("2031-10-28", today)).toBeNull(); // 180 days
    expect(nextFollowUpError("2031-10-29", today)).toMatch(/within 180/);
    expect(nextFollowUpError("2031-05-01", today)).toMatch(/after today/);
    expect(nextFollowUpError("2031-04-30", today)).toMatch(/after today/);
    expect(nextFollowUpError("2031-02-30", today)).toMatch(/as a date/);
    expect(nextFollowUpError("5/2/2031", today)).toMatch(/as a date/);
  });

  it("reads calendar days and counts days between them", () => {
    expect(isShopDayString("2032-02-29")).toBe(true);
    expect(isShopDayString("2031-02-29")).toBe(false);
    expect(isShopDayString("2031-5-1")).toBe(false);
    expect(daysBetween("2031-04-28", "2031-05-01")).toBe(3);
    expect(daysBetween("2031-05-01", "2031-04-28")).toBe(-3);
    // Across a DST change (US, 2031-03-09) days are still whole.
    expect(daysBetween("2031-03-08", "2031-03-10")).toBe(2);
    expect(dueLabel("2031-05-01", "2031-05-01")).toBe("due today");
    expect(dueLabel("2031-04-30", "2031-05-01")).toBe("1 day overdue");
    expect(dueLabel("2031-04-27", "2031-05-01")).toBe("4 days overdue");
  });
});

describe("follow-up email", () => {
  const base = {
    id: "quo_1",
    quoteNumber: 1001,
    revNumber: 1,
    customerCompany: "Acme",
    customerContact: "Sam Lee",
    customerEmail: "sam@acme.example",
    headlineTotalCents: 123456,
    sentDay: "2031-04-28",
    followUpOn: "2031-05-01",
    lastNote: null,
    lastDay: null,
  };

  it("names one quote in the subject, with sent day, due label, total and link", () => {
    const m = followUpDigestEmail({
      appUrl: "https://app.example/",
      orgId: "org_1",
      shopName: "Precision Parts",
      today: "2031-05-01",
      quotes: [base],
    });
    expect(m.subject).toBe("Follow up on Q-1001 for Acme");
    expect(m.text).toContain("A quote you sent from Precision Parts is due for a follow-up:");
    expect(m.text).toContain(
      "- Q-1001 for Acme (Sam Lee, sam@acme.example), $1,234.56: sent 2031-04-28 (3 days ago), due today",
    );
    expect(m.text).toContain("https://app.example/app/org_1/quotes/quo_1");
    expect(m.text).toContain(
      "Turn these emails off on the quote log:\nhttps://app.example/app/org_1",
    );
  });

  it("lists the longest overdue first, carries the last note, and caps the list", () => {
    const m = followUpDigestEmail({
      appUrl: "https://app.example",
      orgId: "org_1",
      shopName: "Shop",
      today: "2031-05-10",
      currency: "EUR",
      quotes: [
        { ...base, id: "a", quoteNumber: 1002, followUpOn: "2031-05-10" },
        {
          ...base,
          id: "b",
          quoteNumber: 1003,
          revNumber: 2,
          followUpOn: "2031-05-06",
          lastNote: "Left a voicemail\nwith the buyer",
          lastDay: "2031-05-03",
        },
      ],
    });
    expect(m.subject).toBe("2 quotes to follow up on");
    const first = m.text.indexOf("Q-1003 Rev 2");
    const second = m.text.indexOf("Q-1002");
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(m.text).toContain("4 days overdue");
    expect(m.text).toContain("Last note (2031-05-03): Left a voicemail with the buyer");
    expect(m.text).toContain("€1,234.56");

    const many = Array.from({ length: MAX_FOLLOW_UPS_LISTED + 4 }, (_, i) => ({
      ...base,
      id: `q${i}`,
      quoteNumber: 2000 + i,
    }));
    const capped = followUpDigestEmail({
      appUrl: "https://app.example",
      orgId: "org_1",
      shopName: "Shop",
      today: "2031-05-01",
      quotes: many,
    });
    expect(capped.text).toContain("- and 4 more on the quote log");
    expect(capped.text).not.toContain(`Q-${2000 + MAX_FOLLOW_UPS_LISTED}`);
  });

  it("keeps customer text on one line so it cannot add lines or headers", () => {
    const m = followUpDigestEmail({
      appUrl: "https://app.example",
      orgId: "org_1",
      shopName: "Shop\r\nBcc: x@evil.example",
      today: "2031-05-01",
      quotes: [{ ...base, customerCompany: "Acme\r\nSubject: hi" }],
    });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text).not.toContain("\nBcc:");
    expect(m.text).not.toContain("\nSubject:");
  });
});
