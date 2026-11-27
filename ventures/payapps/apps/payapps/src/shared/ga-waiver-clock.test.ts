import { gaNinetyDays } from "@lien-waivers";
import { describe, expect, it } from "vitest";
import { type CashReportProjectInput, cashReport } from "./cash-report";
import {
  type GaClockWaiver,
  gaClockNeedsAction,
  gaClockText,
  gaWaiverClocks,
} from "./ga-waiver-clock";
import { computeApplications } from "./payapp-math";

const app = { id: "P1", number: 1 };
const sent = (over: Partial<GaClockWaiver> = {}): GaClockWaiver => ({
  id: "w1",
  kind: "conditional-progress",
  status: "sent",
  state: "GA",
  amountCents: 2_700_000,
  sentOn: "2026-02-05",
  ...over,
});

describe("Georgia's 90 days on a sent waiver", () => {
  it("counts 90 calendar days from the day it was marked sent, as the package does", () => {
    const [c] = gaWaiverClocks(app, 1_000_000, [sent()], "2026-04-20");
    expect(c).toEqual({
      state: "GA",
      waiverId: "w1",
      payAppId: "P1",
      number: 1,
      signedOn: "2026-02-05",
      endsOn: "2026-05-06",
      daysLeft: 16,
      unpaidCents: 1_700_000,
      waiverAmountCents: 2_700_000,
      stage: "running",
    });
    for (const [from, today] of [
      ["2026-02-05", "2026-04-20"],
      ["2028-01-15", "2028-03-01"],
      ["2026-12-20", "2027-04-01"],
    ] as const) {
      const [x] = gaWaiverClocks(app, 0, [sent({ sentOn: from })], today);
      const pkg = gaNinetyDays(from, today);
      expect([x?.endsOn, x?.daysLeft]).toEqual([pkg.endsOn, pkg.daysLeft]);
    }
  });

  it("is silent once the money covers the waiver, for a draft, outside Georgia, or with no date", () => {
    expect(gaWaiverClocks(app, 2_700_000, [sent()], "2026-04-20")).toEqual([]);
    expect(gaWaiverClocks(app, 0, [sent({ status: "draft" })], "2026-04-20")).toEqual([]);
    expect(gaWaiverClocks(app, 0, [sent({ state: "AZ" })], "2026-04-20")).toEqual([]);
    expect(gaWaiverClocks(app, 0, [sent({ sentOn: undefined })], "2026-04-20")).toEqual([]);
  });

  it("measures each waiver against the money in: a later waiver for the partial check is covered", () => {
    const clocks = gaWaiverClocks(
      app,
      1_000_000,
      [sent(), sent({ id: "w2", kind: "unconditional-progress", amountCents: 1_000_000 })],
      "2026-04-20",
    );
    expect(clocks.map((c) => c.waiverId)).toEqual(["w1"]);
  });

  it("says what to do before the end, on the last day, and after it", () => {
    const [before] = gaWaiverClocks(app, 0, [sent()], "2026-04-20");
    const [last] = gaWaiverClocks(app, 0, [sent()], "2026-05-06");
    const [after] = gaWaiverClocks(app, 0, [sent()], "2026-05-07");
    if (!before || !last || !after) throw new Error("fixture");
    expect(gaClockText(before)).toMatch(
      /the 90 days end on 2026-05-06, in 16 days\. .*affidavit of nonpayment in the property's county first/,
    );
    expect(gaClockText(last)).toMatch(/today is the last of the 90 days/);
    expect(gaClockText(after)).toMatch(/ended on 2026-05-06 .*conclusively effective/);
  });
});

describe("an affidavit of nonpayment recorded as filed (§ 44-14-366(g)(2), (3), (5))", () => {
  const filed = (over: Partial<NonNullable<GaClockWaiver["gaAffidavit"]>> = {}) =>
    sent({ gaAffidavit: { filedOn: "2026-04-28", county: "Fulton", ...over } });

  it("stops the 90 days and counts 7 days for the owner's copy", () => {
    const [c] = gaWaiverClocks(app, 1_000_000, [filed()], "2026-05-01");
    expect(c?.stage).toBe("filed");
    expect(c?.filing).toEqual({
      filedOn: "2026-04-28",
      county: "Fulton",
      late: false,
      copyDueOn: "2026-05-05",
      copyDaysLeft: 4,
    });
    if (!c) throw new Error("fixture");
    expect(gaClockNeedsAction(c)).toBe(true);
    const text = gaClockText(c);
    expect(text).toMatch(/filed in Fulton County on 2026-04-28/);
    expect(text).toMatch(/registered or certified mail or statutory overnight delivery/);
    expect(text).toMatch(/by 2026-05-05, in 4 days/);
    expect(text).not.toMatch(/90 days end/);
    // Past the 90 days with the filing in time: no "conclusively effective" warning.
    const [later] = gaWaiverClocks(app, 1_000_000, [filed()], "2026-05-20");
    if (!later) throw new Error("fixture");
    expect(gaClockText(later)).toMatch(/by 2026-05-05, 15 days ago/);
    expect(gaClockText(later)).not.toMatch(/conclusively effective/);
  });

  it("once the copy is sent and no contractor's copy is owed, says the waiver is suspended and leaves the cash report", () => {
    const [c] = gaWaiverClocks(
      app,
      1_000_000,
      [filed({ copySentOn: "2026-04-30", contractorCopy: "not-owed" })],
      "2026-05-20",
    );
    if (!c) throw new Error("fixture");
    expect(c.stage).toBe("filed");
    expect(gaClockNeedsAction(c)).toBe(false);
    expect(gaClockText(c)).toMatch(/suspended until payment in full is received .*\(g\)\(5\)/);
    expect(gaClockText(c)).toMatch(/\$17,000\.00 of the \$27,000\.00/);
  });

  it("a filing after the 90 days ended says so", () => {
    const [c] = gaWaiverClocks(app, 0, [filed({ filedOn: "2026-05-08" })], "2026-05-09");
    if (!c) throw new Error("fixture");
    expect(c.filing?.late).toBe(true);
    expect(gaClockText(c)).toMatch(/after the 90 days ended on 2026-05-06.*ask counsel/);
  });

  it("the contractor's copy (notice of commencement): asked once, then recorded apart from the owner's", () => {
    // Owner's copy sent, contractor's not answered: still named, with the question.
    const [ask] = gaWaiverClocks(
      app,
      1_000_000,
      [filed({ copySentOn: "2026-04-30" })],
      "2026-05-02",
    );
    if (!ask) throw new Error("fixture");
    expect(gaClockNeedsAction(ask)).toBe(true);
    expect(gaClockText(ask)).toMatch(
      /copy to the owner was sent 2026-04-30\. If you have no contract with the owner and a notice of commencement was filed .*record whether one is owed.* to 2026-05-05/,
    );
    // Owed and not sent: named, without the question.
    const [owed] = gaWaiverClocks(
      app,
      1_000_000,
      [filed({ copySentOn: "2026-04-30", contractorCopy: "owed" })],
      "2026-05-02",
    );
    if (!owed) throw new Error("fixture");
    expect(gaClockNeedsAction(owed)).toBe(true);
    expect(gaClockText(owed)).toMatch(
      /copy to the contractor at the address on the notice of commencement is not recorded as sent/,
    );
    expect(gaClockText(owed)).not.toMatch(/record whether one is owed/);
    // Owed and sent: suspended, both copies named.
    const [both] = gaWaiverClocks(
      app,
      1_000_000,
      [
        filed({
          copySentOn: "2026-04-30",
          contractorCopy: "owed",
          contractorCopySentOn: "2026-05-01",
        }),
      ],
      "2026-05-20",
    );
    if (!both) throw new Error("fixture");
    expect(gaClockNeedsAction(both)).toBe(false);
    expect(gaClockText(both)).toMatch(
      /sent 2026-04-30 and to the contractor 2026-05-01\. The waiver is suspended/,
    );
    // Neither copy sent yet, contractor's owed: one sentence asks for both.
    const [none] = gaWaiverClocks(
      app,
      1_000_000,
      [filed({ contractorCopy: "owed" })],
      "2026-05-01",
    );
    if (!none) throw new Error("fixture");
    expect(gaClockText(none)).toMatch(
      /to the property's owner by 2026-05-05.*Send one to the contractor at the address on the notice of commencement too/,
    );
    // The contractor's copy recorded first: the owner's is still asked for.
    const [early] = gaWaiverClocks(
      app,
      1_000_000,
      [filed({ contractorCopy: "owed", contractorCopySentOn: "2026-04-29" })],
      "2026-05-01",
    );
    if (!early) throw new Error("fixture");
    expect(gaClockNeedsAction(early)).toBe(true);
    expect(gaClockText(early)).toMatch(
      /to the property's owner by 2026-05-05.*copy to the contractor was sent 2026-04-29/,
    );
  });

  it("(g)(3): a signed affidavit of payment is named until recorded, then the filing reads void", () => {
    const paid = (over: Partial<NonNullable<GaClockWaiver["gaAffidavit"]>>) =>
      gaWaiverClocks(
        app,
        2_700_000,
        [filed({ copySentOn: "2026-04-30", ...over })],
        "2026-06-03",
      )[0];
    const signed = paid({ paidAffidavitSignedOn: "2026-06-02" });
    if (!signed) throw new Error("fixture");
    expect(signed.stage).toBe("paid-after-filing");
    expect(gaClockNeedsAction(signed)).toBe(true);
    expect(gaClockText(signed)).toMatch(
      /was signed 2026-06-02\. Record it in Fulton County.*\(g\)\(3\)/,
    );
    const recorded = paid({
      paidAffidavitSignedOn: "2026-06-02",
      paidAffidavitRecordedOn: "2026-06-03",
    });
    if (!recorded) throw new Error("fixture");
    expect(recorded.stage).toBe("released");
    expect(gaClockNeedsAction(recorded)).toBe(false);
    expect(gaClockText(recorded)).toMatch(
      /recorded in Fulton County on 2026-06-03, so the affidavit of nonpayment filed 2026-04-28 is void/,
    );
    // A recording without the money covering the waiver does not release it: still filed.
    const [short] = gaWaiverClocks(
      app,
      1_000_000,
      [
        filed({
          copySentOn: "2026-04-30",
          contractorCopy: "not-owed",
          paidAffidavitRecordedOn: "2026-06-03",
        }),
      ],
      "2026-06-03",
    );
    expect(short?.stage).toBe("filed");
  });

  it("paid in full after filing: points at (g)(3) and needs no action in the cash report", () => {
    const [c] = gaWaiverClocks(app, 2_700_000, [filed({ copySentOn: "2026-04-30" })], "2026-06-01");
    if (!c) throw new Error("fixture");
    expect(c.stage).toBe("paid-after-filing");
    expect(c.unpaidCents).toBe(0);
    expect(gaClockNeedsAction(c)).toBe(false);
    expect(gaClockText(c)).toMatch(/affidavit that payment in full was received.*\(g\)\(3\)/);
    // Without a filing, a covered waiver has no clock at all (as before).
    expect(gaWaiverClocks(app, 2_700_000, [sent()], "2026-06-01")).toEqual([]);
  });
});

describe("cash report: Georgia waivers near or past their 90 days", () => {
  const computed = computeApplications(
    { originalContractSumCents: 10_000_000 },
    [
      {
        id: "L1",
        itemNumber: "1",
        description: "Rough-in",
        originalCents: 10_000_000,
        sortOrder: 1,
      },
    ],
    [],
    [
      {
        id: "P1",
        number: 1,
        periodTo: "2026-01-31",
        retainagePctBps: 1000,
        storedRetainagePctBps: 1000,
        lines: {
          L1: {
            workThisPeriodCents: 3_000_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        },
      },
    ],
  );
  const c = computed[0];
  if (!c) throw new Error("fixture");
  const project = (): CashReportProjectInput => ({
    id: "prj_1",
    name: "Midtown Clinic",
    number: "26-04",
    gcName: "Peachtree Builders",
    status: "active",
    originalContractSumCents: 10_000_000,
    contractSumToDateCents: 10_000_000,
    apps: [
      {
        id: "P1",
        number: 1,
        status: "submitted",
        applicationDate: "2026-01-31",
        periodTo: "2026-01-31",
        certifiedAmountCents: null,
        summary: c.summary,
        totals: c.totals,
        payments: [{ amountCents: 1_000_000, receivedOn: "2026-03-01" }],
        waivers: [
          {
            kind: "conditional-progress",
            status: "sent",
            state: "GA",
            amountCents: 2_700_000,
            sentOn: "2026-02-05",
          },
        ],
      },
    ],
  });

  it("names the deadline within 30 days of it, with the unpaid amount", () => {
    const p = cashReport([project()], "2026-04-20").projects[0];
    expect(p?.gaWaiverDeadlines.map((d) => [d.number, d.endsOn, d.unpaidCents])).toEqual([
      [1, "2026-05-06", 1_700_000],
    ]);
    expect(p?.actions.join(" ")).toMatch(
      /Georgia: the lien waiver for application #1 was marked sent 2026-02-05 and \$17,000\.00 of the \$27,000\.00/,
    );
  });

  it("stays quiet earlier, and once paid", () => {
    expect(cashReport([project()], "2026-03-10").projects[0]?.gaWaiverDeadlines).toEqual([]);
    const paid = project();
    const a = paid.apps[0];
    if (!a) throw new Error("fixture");
    a.payments = [{ amountCents: 2_700_000, receivedOn: "2026-03-01" }];
    a.status = "paid";
    expect(cashReport([paid], "2026-04-20").projects[0]?.gaWaiverDeadlines).toEqual([]);
  });

  it("names a filed affidavit until its copy to the owner is recorded, then drops it", () => {
    const p = project();
    const w = p.apps[0]?.waivers?.[0];
    if (!w) throw new Error("fixture");
    // Filed 50 days before the 90 end: outside the 30-day window, still named for the copy.
    w.gaAffidavit = { filedOn: "2026-03-15", county: "Fulton" };
    let r = cashReport([p], "2026-03-17").projects[0];
    expect(r?.gaWaiverDeadlines.map((d) => [d.stage, d.filing?.copyDueOn])).toEqual([
      ["filed", "2026-03-22"],
    ]);
    expect(r?.actions.join(" ")).toMatch(/Send a copy .* by 2026-03-22, in 5 days/);
    w.gaAffidavit = { filedOn: "2026-03-15", county: "Fulton", copySentOn: "2026-03-16" };
    r = cashReport([p], "2026-04-20").projects[0];
    // The contractor's copy is not answered yet: still named.
    expect(r?.actions.join(" ")).toMatch(/record whether one is owed/);
    w.gaAffidavit = {
      filedOn: "2026-03-15",
      county: "Fulton",
      copySentOn: "2026-03-16",
      contractorCopy: "not-owed",
    };
    r = cashReport([p], "2026-04-20").projects[0];
    expect(r?.gaWaiverDeadlines).toEqual([]);
    expect(r?.actions.join(" ")).not.toMatch(/Georgia/);
  });
});
