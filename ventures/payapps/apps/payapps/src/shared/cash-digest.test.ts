import { describe, expect, it } from "vitest";
import {
  cashDigest,
  digestCertificateText,
  digestCutoff,
  digestDocumentText,
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
import type { CompanyDocumentInput } from "./company-documents";
import type { CompanyDailyReportJob } from "./daily-reports";
import type { CertificateInput } from "./insurance";
import type { CompanyLowerTierInput } from "./lower-tier-waivers";
import type { CompanyRfiInput } from "./rfi";
import type { CompanySubmittalInput } from "./submittals";
import type { CompanyTmTicketInput } from "./tm-tickets";

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

describe("cashDigest: insurance certificates", () => {
  const cert = (over: Partial<CertificateInput>): CertificateInput => ({
    id: "c",
    kind: "general_liability",
    label: null,
    carrier: null,
    policyNumber: null,
    expiresOn: "2027-06-30",
    archived: false,
    ...over,
  });

  it("is still null when every active certificate is current and nothing else is due", () => {
    expect(
      cashDigest(report([]), undefined, [
        cert({ expiresOn: "2026-12-24" }), // 31 days after 2026-11-23
        cert({ id: "old", expiresOn: "2026-11-01", archived: true }),
      ]),
    ).toBeNull();
  });

  it("sends for a lapsed certificate alone, soonest first, archived ones left out", () => {
    const d = cashDigest(report([]), undefined, [
      cert({ id: "auto", kind: "auto", expiresOn: "2026-12-10" }),
      cert({ id: "gl", carrier: "Acme Mutual", expiresOn: "2026-11-20" }),
      cert({ id: "wc", kind: "workers_comp", expiresOn: "2026-11-23" }),
      cert({ id: "old", kind: "umbrella", expiresOn: "2026-11-01", archived: true }),
    ]);
    expect(d?.jobs).toEqual([]);
    expect(d?.certificates).toEqual([
      {
        id: "gl",
        name: "General liability (Acme Mutual)",
        expiresOn: "2026-11-20",
        status: "expired",
        daysLeft: -3,
        holders: [],
      },
      {
        id: "wc",
        name: "Workers' compensation",
        expiresOn: "2026-11-23",
        status: "expired",
        daysLeft: 0,
        holders: [],
      },
      {
        id: "auto",
        name: "Commercial auto",
        expiresOn: "2026-12-10",
        status: "expiring",
        daysLeft: 17,
        holders: [],
      },
    ]);
    expect(d?.summary).toEqual(["Insurance certificates to renew: 3, of which 2 have expired."]);
    expect(d?.certificates.map(digestCertificateText)).toEqual([
      "General liability (Acme Mutual): expired 2026-11-20. Send your GCs the renewal certificate, then enter it in PayApps.",
      "Workers' compensation: expires today, 2026-11-23. Send your GCs the renewal certificate.",
      "Commercial auto: expires 2026-12-10, in 17 days. Ask your insurer or agent for the renewal certificate.",
    ]);
  });

  it("names the GCs holding a certificate: who gets the renewal", () => {
    const base = { id: "c", name: "General liability", expiresOn: "2026-11-20" };
    expect(
      digestCertificateText({
        ...base,
        status: "expired",
        daysLeft: -3,
        holders: ["Peak GC", "Sierra Builders"],
      }),
    ).toBe(
      "General liability: expired 2026-11-20. Send the renewal certificate to Peak GC and Sierra Builders, then enter it in PayApps.",
    );
    expect(
      digestCertificateText({ ...base, status: "expired", daysLeft: 0, holders: ["Peak GC"] }),
    ).toBe(
      "General liability: expires today, 2026-11-20. Send the renewal certificate to Peak GC.",
    );
    expect(
      digestCertificateText({ ...base, status: "expiring", daysLeft: 1, holders: ["Peak GC"] }),
    ).toBe(
      "General liability: expires 2026-11-20, in 1 day. Ask your insurer or agent for the renewal certificate. Held by Peak GC.",
    );
  });

  it("counts only expiring ones in the summary when none has lapsed, and caps the list", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      cert({ id: `c${i}`, kind: "other", label: `Policy ${i}`, expiresOn: "2026-12-01" }),
    );
    const d = cashDigest(report([job({ actions: ["x"] })]), undefined, many);
    expect(d?.jobs).toHaveLength(1);
    expect(d?.certificates).toHaveLength(10);
    expect(d?.moreCertificates).toBe(2);
    expect(d?.summary).toEqual(["Insurance certificates expiring within 30 days: 12."]);
  });

  it("lists none and counts none without certificates", () => {
    const d = cashDigest(report([job({ actions: ["x"] })]));
    expect(d?.certificates).toEqual([]);
    expect(d?.moreCertificates).toBe(0);
  });
});

describe("cashDigest: company documents", () => {
  const doc = (over: Partial<CompanyDocumentInput>): CompanyDocumentInput => ({
    id: "d",
    kind: "contractor_license",
    label: null,
    issuer: null,
    jurisdiction: null,
    classification: null,
    number: null,
    effectiveOn: null,
    expiresOn: "2027-06-30",
    archived: false,
    ...over,
  });
  const only = (docs: CompanyDocumentInput[]) =>
    cashDigest(report([]), undefined, [], [], [], [], [], docs);

  it("is still null for current, undated and archived documents with nothing else due", () => {
    expect(
      only([
        doc({ expiresOn: "2026-12-24" }), // 31 days after 2026-11-23
        doc({ id: "w9", kind: "w9", expiresOn: null }),
        doc({ id: "old", expiresOn: "2026-11-01", archived: true }),
      ]),
    ).toBeNull();
  });

  it("sends for a lapsed license alone, soonest first, with the summary and the sentences", () => {
    const d = only([
      doc({ id: "bond", kind: "bonding_letter", issuer: "Surety Co", expiresOn: "2026-12-10" }),
      doc({ id: "ca", jurisdiction: "CA", expiresOn: "2026-11-20" }),
      doc({ id: "emr", kind: "emr_letter", expiresOn: "2026-11-23" }),
      doc({ id: "w9", kind: "w9", expiresOn: null }),
    ]);
    expect(d?.jobs).toEqual([]);
    expect(d?.certificates).toEqual([]);
    expect(d?.documents).toEqual([
      {
        id: "ca",
        name: "Contractor's license (CA)",
        expiresOn: "2026-11-20",
        status: "expired",
        daysLeft: -3,
      },
      { id: "emr", name: "EMR letter", expiresOn: "2026-11-23", status: "expired", daysLeft: 0 },
      {
        id: "bond",
        name: "Bonding letter",
        expiresOn: "2026-12-10",
        status: "expiring",
        daysLeft: 17,
      },
    ]);
    expect(d?.moreDocuments).toBe(0);
    expect(d?.summary).toEqual([
      "Licenses and company documents to renew: 3, of which 2 have expired.",
    ]);
    expect(d?.documents.map(digestDocumentText)).toEqual([
      "Contractor's license (CA): expired 2026-11-20. Renew it, send any GC who keeps a copy on file the new one, then enter it in PayApps.",
      "EMR letter: expires today, 2026-11-23. Renew it and send any GC who keeps a copy on file the new one.",
      "Bonding letter: expires 2026-12-10, in 17 days. Start the renewal and send your GCs the new copy when it comes.",
    ]);
  });

  it("counts only expiring ones in the summary when none has lapsed, and caps the list", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      doc({ id: `d${i}`, kind: "other", label: `Paper ${i}`, expiresOn: "2026-12-01" }),
    );
    const d = only(many);
    expect(d?.documents).toHaveLength(10);
    expect(d?.moreDocuments).toBe(2);
    expect(d?.summary).toEqual(["Licenses and company documents expiring within 30 days: 12."]);
    const first = d?.documents[0];
    expect(first && digestDocumentText({ ...first, daysLeft: 1 })).toContain("in 1 day.");
  });

  it("lists none and counts none without documents", () => {
    const d = cashDigest(report([job({ actions: ["x"] })]));
    expect(d?.documents).toEqual([]);
    expect(d?.moreDocuments).toBe(0);
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

describe("cashDigest with overdue RFIs", () => {
  const rfi = (n: number, due: string): CompanyRfiInput => ({
    id: `r${n}`,
    projectId: "p",
    projectName: "Clinic TI",
    projectNumber: null,
    gcName: "Harbor Builders",
    number: n,
    subject: `Question ${n}`,
    sentOn: "2026-10-01",
    responseDueOn: due,
    answeredOn: null,
  });

  it("sends for an overdue RFI alone, with a summary line, and nothing for one not yet due", () => {
    expect(cashDigest(report([]), undefined, [], [rfi(1, "2026-11-23")])).toBeNull();
    const d = cashDigest(report([]), undefined, [], [rfi(1, "2026-11-20")]);
    expect(d?.summary).toEqual(["RFIs past the response date with no answer: 1."]);
    expect(d?.rfis.map((r) => r.daysOverdue)).toEqual([3]);
    expect(d?.moreRfis).toBe(0);
  });

  it("caps the list, most days overdue first, and counts the rest", () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      rfi(i + 1, `2026-11-${String(i + 1).padStart(2, "0")}`),
    );
    const d = cashDigest(report([]), undefined, [], many);
    expect(d?.rfis).toHaveLength(10);
    expect(d?.rfis[0]?.number).toBe(1);
    expect(d?.moreRfis).toBe(3);
    expect(d?.summary).toEqual(["RFIs past the response date with no answer: 13."]);
  });
});

describe("cashDigest with submittals to chase", () => {
  const sub = (n: number, over: Partial<CompanySubmittalInput> = {}): CompanySubmittalInput => ({
    id: `s${n}`,
    projectId: "p",
    projectName: "Clinic TI",
    projectNumber: null,
    gcName: "Harbor Builders",
    number: n,
    revision: 0,
    specSection: null,
    title: `Submittal ${n}`,
    type: "shop_drawings",
    submittedOn: "2026-11-01",
    requiredBy: `2026-11-${String(n).padStart(2, "0")}`,
    returnedOn: null,
    action: null,
    neededOnSite: null,
    leadTimeDays: null,
    reviewDays: null,
    ...over,
  });

  it("sends for a submittal alone and says how many put delivery at risk", () => {
    expect(cashDigest(report([]), undefined, [], [], [sub(23)])).toBeNull();
    const d = cashDigest(report([]), undefined, [], [], [sub(20)]);
    expect(d?.summary).toEqual([
      "Submittals to chase (overdue back, late to send or to resubmit): 1.",
    ]);
    expect(d?.submittals.map((s) => s.days)).toEqual([3]);
    const risky = cashDigest(
      report([]),
      undefined,
      [],
      [],
      [sub(20, { neededOnSite: "2026-12-01", leadTimeDays: 21 })],
    );
    expect(risky?.summary).toEqual([
      "Submittals to chase: 1, of which 1 puts delivery on site at risk.",
    ]);
  });

  it("caps the list and counts the rest", () => {
    const many = Array.from({ length: 12 }, (_, i) => sub(i + 1));
    const d = cashDigest(report([]), undefined, [], [], many);
    expect(d?.submittals).toHaveLength(10);
    expect(d?.submittals[0]?.number).toBe(1);
    expect(d?.moreSubmittals).toBe(2);
  });
});

describe("cashDigest T&M tickets", () => {
  const tm = (number: number, projectId = "p1"): CompanyTmTicketInput => ({
    projectId,
    projectName: `Job ${projectId}`,
    projectNumber: null,
    gcName: "Harbor Builders",
    number,
    workDate: "2026-11-10",
    signed: true,
    onChangeOrder: false,
    labor: [{ trade: "Laborer", workers: 1, hoursEach: 1, rateCents: number === 2 ? null : 5000 }],
    material: [],
    equipment: [],
    laborMarkupBps: 0,
    materialMarkupBps: 0,
    equipmentMarkupBps: 0,
  });

  it("sends for signed tickets alone and totals them", () => {
    expect(cashDigest(report([]), undefined, [], [], [], [{ ...tm(1), signed: false }])).toBeNull();
    const d = cashDigest(report([]), undefined, [], [], [], [tm(1), tm(2), tm(3, "p2")]);
    expect(d?.summary).toEqual([
      "Signed T&M tickets not on a change order: 3 on 2 jobs, $100.00 priced, 1 not priced yet.",
    ]);
    expect(d?.tmJobs.map((j) => j.tickets)).toEqual([[1, 2], [3]]);
    expect(d?.moreTmJobs).toBe(0);
  });

  it("caps the jobs and counts the rest", () => {
    const many = Array.from({ length: 12 }, (_, i) => tm(1, `p${String(i).padStart(2, "0")}`));
    const d = cashDigest(report([]), undefined, [], [], [], many);
    expect(d?.tmJobs).toHaveLength(10);
    expect(d?.moreTmJobs).toBe(2);
  });
});

describe("cashDigest: lower-tier waivers still out", () => {
  const lt = (o: Partial<CompanyLowerTierInput>): CompanyLowerTierInput => ({
    id: "w1",
    projectId: "p1",
    projectName: "Clinic TI",
    projectNumber: null,
    gcName: "Harbor Builders",
    payAppId: "a1",
    payAppNumber: 4,
    party: "ABC Supply",
    requestedOn: "2026-11-10",
    receivedOn: null,
    ...o,
  });

  it("sends for waivers still out alone, not for received ones, and caps the list", () => {
    const r = report([]);
    expect(cashDigest(r, undefined, [], [], [], [], [lt({ receivedOn: "2026-11-12" })])).toBeNull();
    const d = cashDigest(
      r,
      undefined,
      [],
      [],
      [],
      [],
      [lt({}), lt({ id: "w2", party: "Ferguson" })],
    );
    expect(d?.summary).toEqual(["Lower-tier lien waivers still out: 2 on 1 pay application."]);
    expect(d?.lowerTier.map((a) => a.parties)).toEqual([["ABC Supply", "Ferguson"]]);
    const many = Array.from({ length: 12 }, (_, i) => lt({ id: `w${i}`, payAppId: `a${i}` }));
    const capped = cashDigest(r, undefined, [], [], [], [], many);
    expect(capped?.lowerTier).toHaveLength(10);
    expect(capped?.moreLowerTier).toBe(2);
  });
});

describe("cashDigest: weekdays without a daily report", () => {
  const log = (projectId: string, reportDates: string[]): CompanyDailyReportJob => ({
    projectId,
    projectName: `Job ${projectId}`,
    projectNumber: null,
    gcName: "Harbor Builders",
    firstReportDate: "2026-11-02",
    reportDates,
  });
  const due = job({ actions: ["Application #3 is 12 days past due."], outstandingCents: 5_000 });

  it("never sends for gaps alone, and lists them when the email goes out anyway", () => {
    const gaps = [log("p1", ["2026-11-16", "2026-11-17"]), log("p2", ["2026-11-16"])];
    expect(cashDigest(report([]), undefined, [], [], [], [], [], [], gaps)).toBeNull();
    const d = cashDigest(
      report([due], { outstandingCents: 5_000 }),
      undefined,
      [],
      [],
      [],
      [],
      [],
      [],
      gaps,
    );
    expect(d?.summary).toContain("Weekdays without a daily report last week: 7 on 2 jobs.");
    expect(d?.dailyGaps.map((g) => g.projectId)).toEqual(["p2", "p1"]);
    expect(d?.moreDailyGaps).toBe(0);
    // A full week, or no log at all, adds nothing.
    const none = cashDigest(report([due], { outstandingCents: 5_000 }));
    expect(none?.dailyGaps).toEqual([]);
    expect(none?.summary.some((s) => s.includes("daily report"))).toBe(false);
  });

  it("caps the jobs and counts the rest", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      log(`p${String(i).padStart(2, "0")}`, ["2026-11-16"]),
    );
    const d = cashDigest(report([due]), undefined, [], [], [], [], [], [], many);
    expect(d?.dailyGaps).toHaveLength(10);
    expect(d?.moreDailyGaps).toBe(2);
  });
});
