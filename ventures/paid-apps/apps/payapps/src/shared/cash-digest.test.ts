import { describe, expect, it } from "vitest";
import {
  cashDigest,
  digestCutoff,
  digestDraftText,
  digestDue,
  digestDueDay,
  digestFollowUpText,
  digestJobHeading,
  followUpAnchor,
  isTimeZone,
  localClock,
  nextDigestDay,
  weekdayOf,
} from "./cash-digest";
import { type CashReport, type CashReportProject, cashReport } from "./cash-report";

const job = (over: Partial<CashReportProject>): CashReportProject =>
  ({
    id: "p",
    name: "Job",
    number: null,
    gcName: "Harbor Builders",
    outstandingCents: 0,
    retainageHeldCents: 0,
    actions: [],
    outstanding: [],
    payTermsDays: 30,
    payTermsBasis: "application_date",
    ...over,
  }) as CashReportProject;

const report = (projects: CashReportProject[], totals: Partial<CashReport["totals"]> = {}) => {
  const r = cashReport([], "2026-11-23");
  return { ...r, projects, totals: { ...r.totals, ...totals } };
};

describe("cashDigest", () => {
  it("is null when no job has a next step", () => {
    expect(
      cashDigest(report([job({ outstandingCents: 5_000 })], { outstandingCents: 5_000 })),
    ).toBeNull();
    expect(cashDigest(report([]))).toBeNull();
  });

  it("lists only jobs with next steps, in report order, with non-zero totals", () => {
    const d = cashDigest(
      report(
        [
          job({ id: "a", name: "Clinic TI", number: "2207", actions: ["Application #1 is late."] }),
          job({ id: "b", name: "Quiet job" }),
          job({ id: "c", name: "Warehouse", actions: ["Bill the retainage.", "Send the waiver."] }),
        ],
        {
          outstandingCents: 360_000,
          pastDueCents: 120_000,
          retainageOnCompleteJobsCents: 50_000,
          waiversToSend: 1,
          pendingChangeOrdersOverdue: 0,
        },
      ),
    );
    expect(d?.jobs.map((j) => j.id)).toEqual(["a", "c"]);
    expect(d?.moreJobs).toBe(0);
    expect(d?.summary).toEqual([
      "Owed on sent applications: $3,600.00, of which $1,200.00 is past due.",
      "Retainage on finished work, ready to bill: $500.00.",
      "Unconditional lien waivers to send: 1.",
    ]);
    expect(d && digestJobHeading(d.jobs[0] as never)).toBe("Clinic TI (#2207), Harbor Builders");
  });

  it("says how much is waiting on the owner's payment on pay-when-paid jobs", () => {
    const d = cashDigest(
      report([job({ id: "a", actions: ["Ask the GC."] })], {
        outstandingCents: 450_000,
        awaitingOwnerCents: 270_000,
      }),
    );
    expect(d?.summary).toEqual([
      "Owed on sent applications: $4,500.00.",
      "Waiting on the owner's payment to the GC (pay-when-paid, no due date yet): $2,700.00.",
    ]);
  });

  it("caps the jobs and counts the rest", () => {
    const jobs = Array.from({ length: 5 }, (_, i) => job({ id: `j${i}`, actions: ["x"] }));
    const d = cashDigest(report(jobs), 2);
    expect(d?.jobs).toHaveLength(2);
    expect(d?.moreJobs).toBe(3);
  });
});

describe("digestDue", () => {
  it("is due when never sent or sent 6 or more days ago", () => {
    expect(digestDue(null, "2026-11-23")).toBe(true);
    expect(digestDue("2026-11-16", "2026-11-23")).toBe(true);
    expect(digestDue("2026-11-17", "2026-11-23")).toBe(true);
    expect(digestDue("2026-11-18", "2026-11-23")).toBe(false);
    expect(digestDue("2026-11-23", "2026-11-23")).toBe(false);
    expect(digestCutoff("2026-11-23")).toBe("2026-11-17");
  });
});

describe("follow-up drafts in the digest", () => {
  const unpaid = (over: Partial<CashReportProject["outstanding"][number]>) => ({
    payAppId: "pa",
    number: 1,
    applicationDate: "2026-10-01",
    periodTo: "2026-09-30",
    amountCents: 100_000,
    expectedCents: 100_000,
    receivedCents: 0,
    lastReceivedOn: null,
    status: "submitted" as const,
    ageDays: 53,
    bucket: "31-60" as const,
    dueOn: "2026-10-31",
    daysPastDue: 23,
    ownerPaidOn: null,
    awaitingOwner: false,
    dueByOuterLimit: false,
    ...over,
  });

  it("counts past-due and paid-short applications across every job, not those not yet due", () => {
    const d = cashDigest(
      report(
        [
          job({
            id: "a",
            actions: ["chase"],
            outstanding: [
              unpaid({}),
              unpaid({ payAppId: "b", daysPastDue: 0, dueOn: "2026-12-01" }),
            ],
          }),
          // No next step of its own, but a paid-short application still has a draft.
          job({
            id: "c",
            outstanding: [unpaid({ payAppId: "c", receivedCents: 50_000, daysPastDue: 0 })],
          }),
        ],
        { outstandingCents: 300_000 },
      ),
      1,
    );
    expect(d?.followUps).toBe(2);
    // The listed job carries its own draft, by application, for a link straight to it.
    expect(d?.jobs[0]?.drafts).toEqual([{ payAppId: "pa", number: 1, kind: "reminder" }]);
    expect(digestFollowUpText({ followUps: 2 })).toContain("drafted for the 2 applications");
  });

  it("names each draft's kind and anchors it by application", () => {
    expect(digestDraftText({ payAppId: "x", number: 3, kind: "second" })).toBe(
      "Draft email for application #3 (second request)",
    );
    expect(digestDraftText({ payAppId: "x", number: 2, kind: "balance" })).toBe(
      "Draft email for application #2 (question about the balance)",
    );
    expect(followUpAnchor("pa_1")).toBe("follow-up-pa_1");
    expect(followUpAnchor('a"b#c')).toBe("follow-up-a%22b%23c");
  });

  it("says nothing with no drafts, and the singular for one", () => {
    expect(digestFollowUpText({ followUps: 0 })).toBeNull();
    expect(digestFollowUpText({ followUps: 1 })).toContain("for the 1 application past due");
  });
});

describe("weekday choice", () => {
  it("reads the UTC weekday of a day", () => {
    expect(weekdayOf("2026-11-23")).toBe(1); // Monday
    expect(weekdayOf("2026-11-29")).toBe(0); // Sunday
  });

  it("finds the next chosen weekday, today only before the 13:00 UTC run", () => {
    const wedMorning = new Date("2026-11-25T09:00:00Z");
    const wedAfternoon = new Date("2026-11-25T15:00:00Z");
    expect(nextDigestDay(3, null, wedMorning)).toBe("2026-11-25");
    // Past 13:00 but not yet sent: the next hourly run sends it today, so today is next.
    expect(nextDigestDay(3, null, wedAfternoon)).toBe("2026-11-25");
    expect(
      digestDueDay({ weekday: 3, hour: 13, timeZone: "UTC", lastSentOn: null }, wedAfternoon),
    ).toBe("2026-11-25");
    expect(nextDigestDay(4, null, wedAfternoon)).toBe("2026-11-26");
    expect(nextDigestDay(1, null, wedMorning)).toBe("2026-11-30");
  });

  it("never lands inside 6 days of the last email", () => {
    // Mailed Thursday the 26th, moved to Friday: not the 27th but the 4th.
    expect(nextDigestDay(5, "2026-11-26", new Date("2026-11-26T15:00:00Z"))).toBe("2026-12-04");
    // Already mailed this morning: today is not next.
    expect(nextDigestDay(3, "2026-11-25", new Date("2026-11-25T09:00:00Z"))).toBe("2026-12-02");
  });
});

describe("the member's own hour and time zone", () => {
  it("knows IANA zone names and refuses the rest", () => {
    expect(isTimeZone("America/Chicago")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone("x".repeat(65))).toBe(false);
  });

  it("reads the local day and hour, across midnight and daylight saving", () => {
    // 03:30 UTC Wednesday is still Tuesday evening in Chicago (CST, UTC-6).
    expect(localClock(new Date("2026-11-25T03:30:00Z"), "America/Chicago")).toEqual({
      day: "2026-11-24",
      hour: 21,
    });
    // In July Chicago is UTC-5.
    expect(localClock(new Date("2026-07-01T12:00:00Z"), "America/Chicago").hour).toBe(7);
    // Midnight is hour 0, not 24.
    expect(localClock(new Date("2026-11-25T06:00:00Z"), "America/Chicago")).toEqual({
      day: "2026-11-25",
      hour: 0,
    });
    // An unknown zone reads as UTC rather than throwing in the cron.
    expect(localClock(new Date("2026-11-25T09:00:00Z"), "Nowhere/None")).toEqual({
      day: "2026-11-25",
      hour: 9,
    });
  });

  it("is due on the local weekday from the chosen hour, and not before", () => {
    const s = { weekday: 3, hour: 7, timeZone: "America/Los_Angeles", lastSentOn: null };
    // Wednesday 06:00 in Los Angeles (14:00 UTC): too early.
    expect(digestDueDay(s, new Date("2026-11-25T14:00:00Z"))).toBeNull();
    // Wednesday 07:00 in Los Angeles (15:00 UTC): due, on the local day.
    expect(digestDueDay(s, new Date("2026-11-25T15:00:00Z"))).toBe("2026-11-25");
    // A missed run still sends later that day.
    expect(digestDueDay(s, new Date("2026-11-25T22:00:00Z"))).toBe("2026-11-25");
    // Thursday 07:00 UTC is still Wednesday 23:00 there: due.
    expect(digestDueDay(s, new Date("2026-11-26T07:00:00Z"))).toBe("2026-11-25");
    // Thursday 08:00 UTC is Thursday there: not their day.
    expect(digestDueDay(s, new Date("2026-11-26T08:00:00Z"))).toBeNull();
    // Mailed this Wednesday already: not again.
    expect(
      digestDueDay({ ...s, lastSentOn: "2026-11-25" }, new Date("2026-11-25T20:00:00Z")),
    ).toBeNull();
  });

  it("finds the next day on the member's own calendar", () => {
    const la = { hour: 7, timeZone: "America/Los_Angeles" };
    // Tuesday 22:00 there (Wednesday 06:00 UTC): Wednesday is next, not "today" in UTC terms.
    expect(nextDigestDay(3, null, new Date("2026-11-25T06:00:00Z"), la)).toBe("2026-11-25");
    // Wednesday 08:00 there, hour passed but nothing sent yet: the cron sends on its next run, so
    // the page says today (it used to say next week while the email went out within the hour).
    const wed8 = new Date("2026-11-25T16:00:00Z");
    expect(nextDigestDay(3, null, wed8, la)).toBe("2026-11-25");
    expect(digestDueDay({ weekday: 3, ...la, lastSentOn: null }, wed8)).toBe("2026-11-25");
    // Sent earlier today: next week.
    expect(nextDigestDay(3, "2026-11-25", wed8, la)).toBe("2026-12-02");
    // Without an hour or zone it is the old 13:00 UTC.
    expect(nextDigestDay(3, null, new Date("2026-11-25T12:00:00Z"))).toBe("2026-11-25");
  });
});
