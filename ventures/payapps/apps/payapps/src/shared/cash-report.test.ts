import { describe, expect, it } from "vitest";
import {
  addDays,
  bucketFor,
  type CashReportAppInput,
  type CashReportChangeOrderInput,
  type CashReportProjectInput,
  cashReport,
  daysBetween,
  outerLimitOn,
  PENDING_CHANGE_FOLLOW_UP_DAYS,
  parseOuterLimitDays,
  parsePayTermsDays,
  payDueOn,
  pendingChanges,
  projectCash,
  termsPhrase,
} from "./cash-report";
import type { PayAppStatus } from "./enums";
import { computeApplications, type PeriodInput, type SovLineInput } from "./payapp-math";

// A $100,000 job, 10% retainage, two lines.
const sov: SovLineInput[] = [
  { id: "L1", itemNumber: "1", description: "Rough-in", originalCents: 6_000_000, sortOrder: 1 },
  { id: "L2", itemNumber: "2", description: "Trim", originalCents: 4_000_000, sortOrder: 2 },
];
const line = (work: number, released = 0) => ({
  workThisPeriodCents: work,
  storedMaterialsCents: 0,
  retainageReleasedCents: released,
});
const period = (n: number, periodTo: string, lines: PeriodInput["lines"]): PeriodInput => ({
  id: `P${n}`,
  number: n,
  periodTo,
  retainagePctBps: 1000,
  storedRetainagePctBps: 1000,
  lines,
});

function job(
  periods: PeriodInput[],
  meta: {
    status: PayAppStatus;
    applicationDate: string;
    certified?: number;
    payments?: { amountCents: number; receivedOn: string }[];
  }[],
  over: Partial<CashReportProjectInput> = {},
): CashReportProjectInput {
  const computed = computeApplications({ originalContractSumCents: 10_000_000 }, sov, [], periods);
  const apps: CashReportAppInput[] = periods.map((p, i) => {
    const c = computed[i];
    const m = meta[i];
    if (!c || !m) throw new Error("fixture");
    return {
      id: p.id,
      number: p.number,
      status: m.status,
      applicationDate: m.applicationDate,
      periodTo: p.periodTo,
      certifiedAmountCents: m.certified ?? null,
      summary: c.summary,
      totals: c.totals,
      payments: m.payments,
    };
  });
  return {
    id: "prj_1",
    name: "Elm St clinic",
    number: "24-118",
    gcName: "Harbor Builders",
    status: "active",
    originalContractSumCents: 10_000_000,
    contractSumToDateCents: 10_000_000,
    apps,
    ...over,
  };
}

describe("daysBetween / bucketFor", () => {
  it("counts whole UTC days and never goes negative", () => {
    expect(daysBetween("2026-01-31", "2026-03-02")).toBe(30);
    expect(daysBetween("2026-03-10", "2026-03-01")).toBe(0);
    expect(daysBetween("nope", "2026-03-01")).toBe(0);
  });
  it("buckets at 30/60/90", () => {
    expect([0, 30, 31, 60, 61, 90, 91].map(bucketFor)).toEqual([
      "0-30",
      "0-30",
      "31-60",
      "31-60",
      "61-90",
      "61-90",
      "90+",
    ]);
  });
});

describe("projectCash", () => {
  const p1 = period(1, "2026-01-31", { L1: line(3_000_000) });
  const p2 = period(2, "2026-02-28", { L1: line(3_000_000), L2: line(1_000_000) });
  const p3 = period(3, "2026-03-31", { L2: line(500_000) });

  it("splits applied into paid and outstanding, using the certified amount when the GC cut it", () => {
    const r = projectCash(
      job(
        [p1, p2, p3],
        [
          { status: "paid", applicationDate: "2026-01-31" },
          { status: "certified", applicationDate: "2026-02-28", certified: 3_500_000 },
          { status: "draft", applicationDate: "2026-03-31" },
        ],
      ),
      "2026-04-15",
    );
    // #1 due 27,000.00 (30,000 less 10%); #2 due 36,000.00 (40,000 less 10%); the draft is ignored.
    expect(r.appliedCents).toBe(2_700_000 + 3_600_000);
    expect(r.paidCents).toBe(2_700_000);
    expect(r.outstandingCents).toBe(3_500_000);
    expect(r.outstanding).toEqual([
      expect.objectContaining({ number: 2, amountCents: 3_500_000, ageDays: 46, bucket: "31-60" }),
    ]);
    expect(r.retainageHeldCents).toBe(700_000);
    expect(r.retainageAgeDays).toBe(daysBetween("2026-01-31", "2026-04-15"));
    expect(r.completedToDateCents).toBe(7_000_000);
    expect(r.percentComplete).toBe(70);
    expect(r.workComplete).toBe(false);
    expect(r.lastApplication).toEqual({ number: 2, periodTo: "2026-02-28", status: "certified" });
    expect(r.actions.join(" ")).toMatch(/#2 has been unpaid for 46 days: follow up with Harbor/);
  });

  it("counts a partial payment as paid and ages only the balance still owed", () => {
    const r = projectCash(
      job(
        [p1, p2],
        [
          { status: "paid", applicationDate: "2026-01-31" },
          {
            status: "certified",
            applicationDate: "2026-02-28",
            certified: 3_500_000,
            payments: [
              { amountCents: 2_000_000, receivedOn: "2026-03-20" },
              { amountCents: 1_000_000, receivedOn: "2026-03-27" },
            ],
          },
        ],
      ),
      "2026-04-15",
    );
    expect(r.paidCents).toBe(2_700_000 + 3_000_000);
    expect(r.outstandingCents).toBe(500_000);
    expect(r.outstanding).toEqual([
      expect.objectContaining({
        number: 2,
        amountCents: 500_000,
        expectedCents: 3_500_000,
        receivedCents: 3_000_000,
        lastReceivedOn: "2026-03-27",
        bucket: "31-60",
      }),
    ]);
    expect(r.actions.join(" ")).toMatch(
      /#2 was paid short .* \$5,000\.00 of \$35,000\.00 is still owed/,
    );
  });

  it("an application marked paid counts in full even with only part recorded", () => {
    const r = projectCash(
      job(
        [p1],
        [
          {
            status: "paid",
            applicationDate: "2026-01-31",
            payments: [{ amountCents: 1_000_000, receivedOn: "2026-02-15" }],
          },
        ],
      ),
      "2026-04-15",
    );
    expect(r.paidCents).toBe(2_700_000);
    expect(r.outstandingCents).toBe(0);
  });

  it("flags a finished job whose retainage is still held", () => {
    const done = period(3, "2026-03-31", { L2: line(3_000_000) });
    const r = projectCash(
      job(
        [p1, p2, done],
        [
          { status: "paid", applicationDate: "2026-01-31" },
          { status: "paid", applicationDate: "2026-02-28" },
          { status: "paid", applicationDate: "2026-03-31" },
        ],
      ),
      "2026-04-10",
    );
    expect(r.workComplete).toBe(true);
    expect(r.outstandingCents).toBe(0);
    expect(r.retainageHeldCents).toBe(1_000_000);
    expect(r.actions[0]).toMatch(/bill the retainage/);
  });

  it("stops counting retainage once a final application releases it", () => {
    const done = period(3, "2026-03-31", { L2: line(3_000_000) });
    const release = period(4, "2026-04-30", { L1: line(0, 600_000), L2: line(0, 400_000) });
    const r = projectCash(
      job(
        [p1, p2, done, release],
        [
          { status: "paid", applicationDate: "2026-01-31" },
          { status: "paid", applicationDate: "2026-02-28" },
          { status: "paid", applicationDate: "2026-03-31" },
          { status: "submitted", applicationDate: "2026-04-30" },
        ],
      ),
      "2026-05-05",
    );
    expect(r.retainageHeldCents).toBe(0);
    expect(r.retainageAgeDays).toBeNull();
    expect(r.outstandingCents).toBe(1_000_000); // the release is billed on #4
    expect(r.appliedCents).toBe(10_000_000); // the whole contract, retainage included
    expect(r.actions).toEqual([]);
  });

  it("a job with no application yet shows its contract and nothing owed", () => {
    const r = projectCash(job([], [], { contractSumToDateCents: 10_500_000 }), "2026-04-01");
    expect(r).toMatchObject({
      contractSumToDateCents: 10_500_000,
      appliedCents: 0,
      outstandingCents: 0,
      retainageHeldCents: 0,
      workComplete: false,
      lastApplication: null,
    });
  });

  it("says when a closed job still has money owed", () => {
    const r = projectCash(
      job([p1], [{ status: "paid", applicationDate: "2026-01-31" }], { status: "closed" }),
      "2026-02-10",
    );
    expect(r.actions.join(" ")).toMatch(/closed but money is still owed/);
  });
});

describe("cashReport", () => {
  it("totals across jobs, ages what is owed, and sorts the most money first", () => {
    const small = job(
      [period(1, "2026-03-31", { L1: line(1_000_000) })],
      [{ status: "submitted", applicationDate: "2026-03-31" }],
      { id: "prj_small", name: "A small job" },
    );
    const big = job(
      [period(1, "2026-01-31", { L1: line(6_000_000) })],
      [{ status: "submitted", applicationDate: "2026-01-02" }],
      { id: "prj_big", name: "Z big job" },
    );
    const r = cashReport([small, big], "2026-04-10");
    expect(r.projects.map((p) => p.id)).toEqual(["prj_big", "prj_small"]);
    expect(r.totals.outstandingCents).toBe(900_000 + 5_400_000);
    expect(r.totals.retainageHeldCents).toBe(100_000 + 600_000);
    expect(r.totals.aging).toEqual({ "0-30": 900_000, "31-60": 0, "61-90": 0, "90+": 5_400_000 });
    expect(r.totals.retainageOnCompleteJobsCents).toBe(0);
  });
});

describe("pay terms: due dates, past due and the 30-day forecast", () => {
  const p1 = period(1, "2026-01-31", { L1: line(3_000_000) });
  const p2 = period(2, "2026-02-28", { L1: line(3_000_000), L2: line(1_000_000) });
  const p3 = period(3, "2026-03-31", { L2: line(500_000) });
  const sent = (dates: string[]) =>
    job(
      [p1, p2, p3].slice(0, dates.length),
      dates.map((applicationDate) => ({ status: "submitted" as const, applicationDate })),
      { payTermsDays: 45 },
    );

  it("adds calendar days across month ends", () => {
    expect(addDays("2026-01-31", 30)).toBe("2026-03-02");
    expect(addDays("2026-02-28", 45)).toBe("2026-04-14");
    expect(addDays("nope", 3)).toBe("nope");
  });

  it("dates each unpaid application and splits past due from due soon", () => {
    // #1 (27,000) due 03-17, #2 (36,000) due 04-14, #3 (4,500) due 05-15; report on 04-20.
    const r = projectCash(sent(["2026-01-31", "2026-02-28", "2026-03-31"]), "2026-04-20");
    expect(r.payTermsDays).toBe(45);
    expect(r.outstanding.map((o) => [o.number, o.dueOn, o.daysPastDue])).toEqual([
      [1, "2026-03-17", 34],
      [2, "2026-04-14", 6],
      [3, "2026-05-15", 0],
    ]);
    expect(r.pastDueCents).toBe(2_700_000 + 3_600_000);
    expect(r.dueNext30Cents).toBe(450_000);
    expect(r.actions.join(" ")).toMatch(
      /#1 was due on 2026-03-17 \(45 days\) and is 34 days late: follow up with Harbor Builders.* 1 more past due/,
    );
  });

  it("counts from the period end when the subcontract says so", () => {
    // Period ends 01-31, the application is dated 02-05: 30 days from the period end is 03-02,
    // from the application date 03-07.
    const app = { status: "submitted" as const, applicationDate: "2026-02-05" };
    const fromApp = projectCash(job([p1], [app], { payTermsDays: 30 }), "2026-03-04");
    const fromEnd = projectCash(
      job([p1], [app], { payTermsDays: 30, payTermsBasis: "period_end" }),
      "2026-03-04",
    );
    expect(fromApp.payTermsBasis).toBe("application_date");
    expect(fromApp.outstanding[0]).toMatchObject({ dueOn: "2026-03-07", daysPastDue: 0 });
    expect(fromApp.pastDueCents).toBe(0);
    expect(fromEnd.payTermsBasis).toBe("period_end");
    expect(fromEnd.outstanding[0]).toMatchObject({ dueOn: "2026-03-02", daysPastDue: 2 });
    expect(fromEnd.pastDueCents).toBe(2_700_000);
    expect(fromEnd.actions.join(" ")).toMatch(
      /#1 was due on 2026-03-02 \(30 days after the period end\) and is 2 days late/,
    );
    // Aging still counts from the application date, whatever the terms count from.
    expect(fromEnd.outstanding[0]?.ageDays).toBe(27);
  });

  it("payDueOn and termsPhrase", () => {
    const app = { applicationDate: "2026-02-05", periodTo: "2026-01-31" };
    expect(payDueOn(null, "period_end", app)).toBeNull();
    expect(payDueOn(0, "application_date", app)).toBe("2026-02-05");
    expect(payDueOn(10, "period_end", app)).toBe("2026-02-10");
    expect(termsPhrase(30, "application_date")).toBe("30 days");
    expect(termsPhrase(1, "period_end")).toBe("1 day after the period end");
  });

  it("is not late on its due date, and due-soon stops at 30 days out", () => {
    const onDue = projectCash(sent(["2026-02-28"]), "2026-04-14");
    expect(onDue.pastDueCents).toBe(0);
    expect(onDue.dueNext30Cents).toBe(2_700_000);
    expect(onDue.actions).toEqual([]);
    // Due 04-14, report 03-14: exactly 31 days out, so not in the window.
    expect(projectCash(sent(["2026-02-28"]), "2026-03-14").dueNext30Cents).toBe(0);
    expect(projectCash(sent(["2026-02-28"]), "2026-03-15").dueNext30Cents).toBe(2_700_000);
  });

  it("with terms longer than 30 days, an old application that is not yet due asks for nothing", () => {
    const r = projectCash(sent(["2026-01-31"]), "2026-03-10"); // 38 days old, due 03-17
    expect(r.outstanding[0]?.ageDays).toBe(38);
    expect(r.actions).toEqual([]);
  });

  it("names a short payment on a late application", () => {
    const r = projectCash(
      job(
        [p1],
        [
          {
            status: "certified",
            applicationDate: "2026-01-31",
            certified: 2_700_000,
            payments: [{ amountCents: 2_000_000, receivedOn: "2026-03-01" }],
          },
        ],
        { payTermsDays: 30 },
      ),
      "2026-03-12",
    );
    expect(r.pastDueCents).toBe(700_000);
    expect(r.actions.join(" ")).toMatch(
      /due on 2026-03-02 \(30 days\) and is 10 days late, paid short: \$7,000\.00 of \$27,000\.00/,
    );
  });

  it("totals across jobs and keeps jobs without terms out of the forecast", () => {
    const withTerms = sent(["2026-01-31", "2026-02-28", "2026-03-31"]);
    const without = job([p1], [{ status: "submitted", applicationDate: "2026-01-31" }], {
      id: "prj_2",
      name: "Oak Ave school",
    });
    const r = cashReport([withTerms, without], "2026-04-20");
    expect(r.totals.pastDueCents).toBe(6_300_000);
    expect(r.totals.dueNext30Cents).toBe(450_000);
    expect(r.totals.noTermsOutstandingCents).toBe(2_700_000);
    const oak = r.projects.find((p) => p.id === "prj_2");
    expect(oak?.payTermsDays).toBeNull();
    expect(oak?.outstanding[0]).toMatchObject({ dueOn: null, daysPastDue: 0 });
    expect(oak?.actions.join(" ")).toMatch(/has been unpaid for 79 days/);
  });
});

describe("parsePayTermsDays", () => {
  it("reads what people type and refuses the rest", () => {
    expect(
      ["", " ", "30", "net 30", "Net30", "45 days", "0", "365"].map(parsePayTermsDays),
    ).toEqual([null, null, 30, 30, 30, 45, 0, 365]);
    expect(["366", "-5", "30.5", "thirty", "1000"].map(parsePayTermsDays)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe("unconditional lien waivers owed", () => {
  it("names each paid application whose conditional waiver went out, and counts them", () => {
    const j = job(
      [
        period(1, "2026-01-31", { L1: line(3_000_000) }),
        period(2, "2026-02-28", { L1: line(1_000_000) }),
      ],
      [
        { status: "paid", applicationDate: "2026-01-31" },
        { status: "submitted", applicationDate: "2026-02-28" },
      ],
    );
    const [a1, a2] = j.apps;
    if (!a1 || !a2) throw new Error("fixture");
    a1.waivers = [{ kind: "conditional-progress", status: "sent", state: "AZ" }];
    // Not paid yet: nothing owed on #2 though its conditional waiver went out.
    a2.waivers = [{ kind: "conditional-progress", status: "sent", state: "AZ" }];
    const r = cashReport([j], "2026-03-10");
    const p = r.projects[0];
    expect(p?.waiversToSend).toEqual([
      { payAppId: "P1", number: 1, scope: "progress", state: "AZ", reason: "missing" },
    ]);
    expect(p?.actions.join(" ")).toMatch(
      /Application #1 is paid and you sent a conditional progress waiver for it: the unconditional progress waiver/,
    );
    expect(r.totals.waiversToSend).toBe(1);
  });

  it("asks for the partial check's unconditional progress waiver, for the money received only", () => {
    // Application #1: line 8 is $27,000; the GC paid $10,000 so far.
    const j = job(
      [period(1, "2026-01-31", { L1: line(3_000_000) })],
      [
        {
          status: "submitted",
          applicationDate: "2026-01-31",
          payments: [{ amountCents: 1_000_000, receivedOn: "2026-02-20" }],
        },
      ],
    );
    const [a1] = j.apps;
    if (!a1) throw new Error("fixture");
    a1.waivers = [
      { kind: "conditional-progress", status: "sent", state: "AZ", amountCents: 2_700_000 },
      { kind: "conditional-final", status: "sent", state: "AZ", amountCents: 2_700_000 },
    ];
    const r = cashReport([j], "2026-03-10");
    const p = r.projects[0];
    expect(p?.waiversToSend).toEqual([
      {
        payAppId: "P1",
        number: 1,
        scope: "progress",
        state: "AZ",
        reason: "missing",
        remainingCents: 1_000_000,
        partial: true,
      },
    ]);
    expect(p?.actions.join(" ")).toContain(
      "the unconditional progress waiver for the $10,000.00 received",
    );
    expect(r.totals.waiversToSend).toBe(1);
    // Its waiver sent: nothing more until the next check.
    a1.waivers.push({
      kind: "unconditional-progress",
      status: "sent",
      state: "AZ",
      amountCents: 1_000_000,
    });
    expect(cashReport([j], "2026-03-10").totals.waiversToSend).toBe(0);
  });

  it("a job without waivers owes none", () => {
    const r = cashReport(
      [
        job(
          [period(1, "2026-01-31", { L1: line(3_000_000) })],
          [{ status: "paid", applicationDate: "2026-01-31" }],
        ),
      ],
      "2026-03-10",
    );
    expect(r.projects[0]?.waiversToSend).toEqual([]);
    expect(r.totals.waiversToSend).toBe(0);
  });
});

describe("change orders waiting for approval", () => {
  const co = (
    over: Partial<CashReportChangeOrderInput> & Pick<CashReportChangeOrderInput, "number">,
  ): CashReportChangeOrderInput => ({
    id: `co_${over.number}`,
    description: "Extra outlets in exam rooms",
    status: "pending",
    amountCents: 1_250_000,
    submittedOn: null,
    createdOn: "2026-05-01",
    ...over,
  });

  it("lists only pending ones, oldest first, aged from the date sent else the date entered", () => {
    const list = pendingChanges(
      [
        co({ number: "3", createdOn: "2026-05-20" }),
        co({ number: "1", status: "approved" }),
        co({ number: "2", submittedOn: "2026-04-01", createdOn: "2026-05-15" }),
        co({ number: "4", status: "rejected" }),
      ],
      "2026-06-01",
    );
    expect(list.map((c) => [c.number, c.ageDays, c.agedFrom])).toEqual([
      ["2", 61, "sent"],
      ["3", 12, "entered"],
    ]);
  });

  it("totals the additions, lists deductions, and asks for the oldest one past the threshold", () => {
    const p = projectCash(
      job([], [], {
        changeOrders: [
          co({ number: "7", submittedOn: "2026-04-01", amountCents: 1_250_000 }),
          co({ number: "8", submittedOn: "2026-04-20", amountCents: 300_000 }),
          co({ number: "9", submittedOn: "2026-03-01", amountCents: -200_000 }),
          co({ number: "10", submittedOn: "2026-05-25", amountCents: 900_000 }),
        ],
      }),
      "2026-06-01",
    );
    expect(p.pendingChanges.map((c) => c.number)).toEqual(["9", "7", "8", "10"]);
    expect(p.pendingChangeCents).toBe(1_250_000 + 300_000 + 900_000);
    const text = p.actions.find((a) => a.startsWith("Change order"));
    // The deduction (#9) is older but is not money waiting to be billed.
    expect(text).toBe(
      "Change order 7 (Extra outlets in exam rooms, $12,500.00) has waited 61 days for approval since it went to Harbor Builders on 2026-04-01. It cannot be billed until it is approved: ask Harbor Builders for the signed change order, then mark it approved or rejected here. 1 more pending over 30 days on this job ($3,000.00).",
    );
  });

  it("is quiet at the threshold, and says when no date sent was recorded", () => {
    const at = projectCash(
      job([], [], { changeOrders: [co({ number: "1", createdOn: "2026-05-02" })] }),
      "2026-06-01",
    );
    expect(at.pendingChanges[0]?.ageDays).toBe(PENDING_CHANGE_FOLLOW_UP_DAYS);
    expect(at.actions).toEqual([]);
    const after = projectCash(
      job([], [], { changeOrders: [co({ number: "1", createdOn: "2026-05-01" })] }),
      "2026-06-01",
    );
    expect(after.actions[0]).toContain("since it was entered here (no date sent recorded)");
  });

  it("names the last follow-up emailed after the date sent, and asks for a date sent after a drafted request", () => {
    const text = (over: Partial<CashReportChangeOrderInput>) =>
      projectCash(job([], [], { changeOrders: [co({ number: "7", ...over })] }), "2026-06-01")
        .actions[0];
    const chased = text({ submittedOn: "2026-04-01", lastEmailedOn: "2026-05-27" });
    expect(chased).toBe(
      "Change order 7 (Extra outlets in exam rooms, $12,500.00) has waited 61 days for approval since it went to Harbor Builders on 2026-04-01. Last follow-up emailed from here on 2026-05-27 (5 days ago). It cannot be billed until it is approved: ask Harbor Builders for the signed change order, then mark it approved or rejected here.",
    );
    expect(text({ submittedOn: "2026-04-01", lastEmailedOn: "2026-06-01" })).toContain(
      "on 2026-06-01 (today).",
    );
    expect(text({ submittedOn: "2026-04-01", lastEmailedOn: "2026-05-31" })).toContain(
      "(yesterday).",
    );
    // The email on (or before) the date sent was the request itself: nothing more to say.
    for (const lastEmailedOn of ["2026-04-01", "2026-03-30", null]) {
      expect(text({ submittedOn: "2026-04-01", lastEmailedOn }), String(lastEmailedOn)).not.toMatch(
        /Last follow-up|drafted here/,
      );
    }
    expect(text({ createdOn: "2026-04-01", lastEmailedOn: "2026-04-02" })).toContain(
      "Its request email was drafted here on 2026-04-02 (60 days ago), but no date sent is recorded: if it went out, record the date sent so it is aged from that day.",
    );
    const [listed] = pendingChanges(
      [co({ number: "7", submittedOn: "2026-04-01", lastEmailedOn: "2026-05-27" })],
      "2026-06-01",
    );
    expect([listed?.lastEmailedOn, listed?.lastEmailedDays]).toEqual(["2026-05-27", 5]);
    const [never] = pendingChanges([co({ number: "8" })], "2026-06-01");
    expect([never?.lastEmailedOn, never?.lastEmailedDays]).toEqual([null, null]);
  });

  it("totals across jobs", () => {
    const r = cashReport(
      [
        job([], [], { id: "a", changeOrders: [co({ number: "1", amountCents: 100_000 })] }),
        job([], [], {
          id: "b",
          name: "B",
          changeOrders: [
            co({ number: "1", amountCents: 50_000, createdOn: "2026-05-30" }),
            co({ number: "2", amountCents: -10_000 }),
          ],
        }),
        job([], []),
      ],
      "2026-06-01",
    );
    expect(r.totals.pendingChangeCents).toBe(150_000);
    expect(r.totals.pendingChangeOrders).toBe(3);
    expect(r.totals.pendingChangeOrdersOverdue).toBe(1);
  });
});

describe("balances closed short (backcharged, disputed, written off)", () => {
  // #1 due 27,000.00; the GC paid 25,000.00 and backcharged 2,000.00 for cleanup.
  // #2 due 9,000.00; paid 6,000.00, the 3,000.00 balance is disputed.
  const twoApps = () => {
    const j = job(
      [
        period(1, "2026-01-31", { L1: line(3_000_000) }),
        period(2, "2026-02-28", { L1: line(1_000_000) }),
      ],
      [
        {
          status: "paid",
          applicationDate: "2026-01-31",
          payments: [{ amountCents: 2_500_000, receivedOn: "2026-03-05" }],
        },
        {
          status: "paid",
          applicationDate: "2026-02-28",
          payments: [{ amountCents: 600_000, receivedOn: "2026-03-30" }],
        },
      ],
    );
    const [a1, a2] = j.apps;
    if (!a1 || !a2) throw new Error("fixture");
    a1.shortClose = {
      cents: 200_000,
      reason: "backcharge",
      note: "Cleanup",
      closedOn: "2026-03-06",
    };
    a2.shortClose = { cents: 300_000, reason: "disputed", note: null, closedOn: "2026-04-01" };
    return { j, a1, a2 };
  };

  it("counts only the money received as paid, and the rest under its reason, never as owed", () => {
    const { j } = twoApps();
    const r = cashReport([j], "2026-04-10");
    const p = r.projects[0];
    expect(p?.paidCents).toBe(2_500_000 + 600_000);
    expect(p?.outstandingCents).toBe(0);
    expect(p?.backchargedCents).toBe(200_000);
    expect(p?.disputedCents).toBe(300_000);
    expect(p?.writtenOffCents).toBe(0);
    expect(p?.closedShort).toEqual([
      {
        payAppId: "P1",
        number: 1,
        cents: 200_000,
        reason: "backcharge",
        note: "Cleanup",
        closedOn: "2026-03-06",
      },
      {
        payAppId: "P2",
        number: 2,
        cents: 300_000,
        reason: "disputed",
        note: null,
        closedOn: "2026-04-01",
      },
    ]);
    expect(r.totals.backchargedCents).toBe(200_000);
    expect(r.totals.disputedCents).toBe(300_000);
    expect(r.totals.paidCents + r.totals.outstandingCents).toBe(
      r.totals.appliedCents - 200_000 - 300_000,
    );
  });

  it("gives a next step for a disputed balance only", () => {
    const { j } = twoApps();
    const actions = projectCash(j, "2026-04-10").actions.join(" ");
    expect(actions).toMatch(/Application #2: \$3,000\.00 was closed as disputed on 2026-04-01/);
    expect(actions).not.toMatch(/#1: .*closed as/);
  });

  it("asks for the unconditional waiver for the money received, not the amount applied for", () => {
    const { j, a1 } = twoApps();
    a1.waivers = [
      { kind: "conditional-progress", status: "sent", state: "AZ", amountCents: 2_700_000 },
      { kind: "unconditional-progress", status: "sent", state: "AZ", amountCents: 2_500_000 },
    ];
    // 25,000.00 received and waived: nothing more owed, though 27,000.00 was applied for.
    expect(projectCash(j, "2026-04-10").waiversToSend).toEqual([]);
  });

  it("ignores a short close on an application that is not paid (reopened)", () => {
    const { j, a1 } = twoApps();
    a1.status = "certified";
    const p = projectCash(j, "2026-04-10");
    expect(p.backchargedCents).toBe(0);
    expect(p.outstandingCents).toBe(200_000);
  });
});

describe("pay-when-paid terms (counted from the owner's payment to the GC)", () => {
  // Two applications of $27,000 and $18,000 line 8 (10% retainage), 7 days after the owner pays.
  const pa = period(1, "2026-01-31", { L1: line(3_000_000) });
  const pb = period(2, "2026-02-28", { L2: line(2_000_000) });
  const wpw = (ownerPaid: (string | null)[]) => {
    const j = job(
      [pa, pb],
      [
        { status: "submitted", applicationDate: "2026-01-31" },
        { status: "submitted", applicationDate: "2026-02-28" },
      ],
      { payTermsDays: 7, payTermsBasis: "owner_paid" },
    );
    j.apps.forEach((a, i) => {
      a.ownerPaidOn = ownerPaid[i] ?? null;
    });
    return j;
  };

  it("has no due date until the owner's payment is recorded, and never guesses one", () => {
    const r = projectCash(wpw([null, null]), "2026-03-10");
    expect(r.outstanding.map((o) => [o.number, o.dueOn, o.awaitingOwner])).toEqual([
      [1, null, true],
      [2, null, true],
    ]);
    expect(r.pastDueCents).toBe(0);
    expect(r.dueNext30Cents).toBe(0);
    expect(r.awaitingOwnerCents).toBe(2_700_000 + 1_800_000);
    // #1 is 38 days old with no owner payment recorded: ask the GC. #2 (10 days) is not named.
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatch(
      /^Application #1 went out 38 days ago and no payment from the owner to Harbor Builders is recorded for it \(pay terms: 7 days after the owner pays the GC\)\. Ask Harbor Builders whether the owner has paid/,
    );
    expect(r.actions[0]).not.toMatch(/more on this job/);
  });

  it("counts the days from the owner's payment once it is recorded", () => {
    // Owner paid the GC for #1 on 03-01: due 03-08, 2 days late on 03-10. #2 still waiting.
    const r = projectCash(wpw(["2026-03-01", null]), "2026-03-10");
    expect(r.outstanding[0]).toMatchObject({
      ownerPaidOn: "2026-03-01",
      dueOn: "2026-03-08",
      daysPastDue: 2,
      awaitingOwner: false,
    });
    expect(r.pastDueCents).toBe(2_700_000);
    expect(r.awaitingOwnerCents).toBe(1_800_000);
    expect(r.actions.join(" ")).toMatch(
      /#1 was due on 2026-03-08 \(7 days after the owner pays the GC\) and is 2 days late/,
    );
    // Recorded and not yet due: in the 30-day forecast.
    const soon = projectCash(wpw(["2026-03-09", null]), "2026-03-10");
    expect(soon.pastDueCents).toBe(0);
    expect(soon.dueNext30Cents).toBe(2_700_000);
  });

  it("names the count of other applications still waiting past 30 days", () => {
    const r = projectCash(wpw([null, null]), "2026-04-15");
    expect(r.actions[0]).toMatch(/#1 went out 74 days ago.* 1 more on this job/);
  });

  it("is reported apart in the totals, like a job with no terms", () => {
    const r = cashReport([wpw([null, "2026-03-05"])], "2026-03-10");
    expect(r.totals.awaitingOwnerCents).toBe(2_700_000);
    expect(r.totals.noTermsOutstandingCents).toBe(0);
    expect(r.totals.dueNext30Cents).toBe(1_800_000);
  });

  it("ignores a recorded owner payment on a job whose terms count from elsewhere", () => {
    const j = wpw(["2026-03-01", null]);
    j.payTermsBasis = "application_date";
    const r = projectCash(j, "2026-03-10");
    expect(r.outstanding.map((o) => [o.dueOn, o.awaitingOwner])).toEqual([
      ["2026-02-07", false],
      ["2026-03-07", false],
    ]);
    expect(r.awaitingOwnerCents).toBe(0);
  });

  it("payDueOn and termsPhrase", () => {
    const app = { applicationDate: "2026-02-05", periodTo: "2026-01-31" };
    expect(payDueOn(7, "owner_paid", app)).toBeNull();
    expect(payDueOn(7, "owner_paid", { ...app, ownerPaidOn: "2026-03-30" })).toBe("2026-04-06");
    expect(payDueOn(null, "owner_paid", { ...app, ownerPaidOn: "2026-03-30" })).toBeNull();
    expect(termsPhrase(7, "owner_paid")).toBe("7 days after the owner pays the GC");
  });
});

describe('pay-when-paid with an outer limit ("and in any event within N days")', () => {
  // Same two applications, 7 days after the owner pays, in any event within 45 days of the
  // application date: #1 (01-31) by 03-17, #2 (02-28) by 04-14.
  const pa = period(1, "2026-01-31", { L1: line(3_000_000) });
  const pb = period(2, "2026-02-28", { L2: line(2_000_000) });
  const capped = (ownerPaid: (string | null)[], over: Partial<CashReportProjectInput> = {}) => {
    const j = job(
      [pa, pb],
      [
        { status: "submitted", applicationDate: "2026-01-31" },
        { status: "submitted", applicationDate: "2026-02-28" },
      ],
      { payTermsDays: 7, payTermsBasis: "owner_paid", payTermsOuterDays: 45, ...over },
    );
    j.apps.forEach((a, i) => {
      a.ownerPaidOn = ownerPaid[i] ?? null;
    });
    return j;
  };

  it("dates an application by the outer limit while the owner's payment is unknown", () => {
    const r = projectCash(capped([null, null]), "2026-03-10");
    expect(r.payTermsOuterDays).toBe(45);
    expect(
      r.outstanding.map((o) => [o.number, o.dueOn, o.awaitingOwner, o.dueByOuterLimit]),
    ).toEqual([
      [1, "2026-03-17", false, true],
      [2, "2026-04-14", false, true],
    ]);
    // Nothing waits undated, #1 falls in the 30-day forecast, #2 (04-14) past its horizon (04-09).
    expect(r.awaitingOwnerCents).toBe(0);
    expect(r.pastDueCents).toBe(0);
    expect(r.dueNext30Cents).toBe(2_700_000);
    // #1 is 38 days old with no owner payment: still worth asking, since it could be due sooner.
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toContain(
      "(pay terms: 7 days after the owner pays the GC, and in any event within 45 days of the application date)",
    );
    expect(r.actions[0]).toContain(
      "Whatever the owner does, it is due by 2026-03-17 under the outer limit.",
    );
  });

  it("is past due after the outer date even if the owner never paid", () => {
    const r = projectCash(capped([null, null]), "2026-03-20");
    expect(r.outstanding[0]).toMatchObject({ dueOn: "2026-03-17", daysPastDue: 3 });
    expect(r.pastDueCents).toBe(2_700_000);
    expect(r.actions[0]).toMatch(
      /^Application #1 was due on 2026-03-17 \(7 days after the owner pays the GC, and in any event within 45 days of the application date\) and is 3 days late/,
    );
    // Past due: no second "has the owner paid?" step for #1; #2 is 20 days old, not asked yet.
    expect(r.actions.join(" ")).not.toMatch(/no payment from the owner/);
  });

  it("takes the earlier date: the owner's payment plus the days, or the outer limit", () => {
    const early = projectCash(capped(["2026-03-01", null]), "2026-03-10");
    expect(early.outstanding[0]).toMatchObject({ dueOn: "2026-03-08", dueByOuterLimit: false });
    const late = projectCash(capped(["2026-03-15", null]), "2026-03-16");
    expect(late.outstanding[0]).toMatchObject({ dueOn: "2026-03-17", dueByOuterLimit: true });
    // On the same day either way: counted as the owner's terms.
    const same = projectCash(capped(["2026-03-10", null]), "2026-03-11");
    expect(same.outstanding[0]).toMatchObject({ dueOn: "2026-03-17", dueByOuterLimit: false });
  });

  it("is ignored under any other basis, and without pay terms", () => {
    const r = projectCash(
      capped([null, null], { payTermsBasis: "application_date" }),
      "2026-03-10",
    );
    expect(r.payTermsOuterDays).toBeNull();
    expect(r.outstanding.map((o) => [o.dueOn, o.dueByOuterLimit])).toEqual([
      ["2026-02-07", false],
      ["2026-03-07", false],
    ]);
    const none = projectCash(capped([null, null], { payTermsDays: null }), "2026-03-10");
    expect(none.outstanding.map((o) => o.dueOn)).toEqual([null, null]);
    expect(none.awaitingOwnerCents).toBe(0);
  });

  it("payDueOn, outerLimitOn, termsPhrase and parseOuterLimitDays", () => {
    const app = { applicationDate: "2026-02-05", periodTo: "2026-01-31" };
    expect(payDueOn(7, "owner_paid", app, 90)).toBe("2026-05-06");
    expect(payDueOn(7, "owner_paid", { ...app, ownerPaidOn: "2026-03-30" }, 90)).toBe("2026-04-06");
    expect(payDueOn(7, "owner_paid", { ...app, ownerPaidOn: "2026-05-01" }, 90)).toBe("2026-05-06");
    expect(payDueOn(7, "period_end", app, 90)).toBe("2026-02-07");
    expect(outerLimitOn("2026-02-05", null)).toBeNull();
    expect(termsPhrase(7, "owner_paid", 1)).toBe(
      "7 days after the owner pays the GC, and in any event within 1 day of the application date",
    );
    expect(termsPhrase(30, "period_end", 90)).toBe("30 days after the period end");
    expect(parseOuterLimitDays("90 days")).toBe(90);
    expect(parseOuterLimitDays("")).toBeNull();
    expect(parseOuterLimitDays("0")).toBeUndefined();
    expect(parseOuterLimitDays("400")).toBeUndefined();
  });
});
