// Mississippi's sixty days (Miss. Code Ann. § 85-7-419(5)(b)) run on the same clock as Georgia's
// ninety (ga-waiver-clock.ts), with Mississippi's numbers, citations and no contractor's copy.
import { msAffidavitCopyDueOn, msSixtyDays } from "@lien-waivers";
import { describe, expect, it } from "vitest";
import { type CashReportProjectInput, cashReport } from "./cash-report";
import {
  type GaClockWaiver,
  gaClockNeedsAction,
  gaClockText,
  gaContractorCopyPending,
  gaWaiverClocks,
  nonpaymentRule,
} from "./ga-waiver-clock";
import { computeApplications } from "./payapp-math";

const app = { id: "P1", number: 3 };
const sent = (over: Partial<GaClockWaiver> = {}): GaClockWaiver => ({
  id: "w1",
  kind: "conditional-progress",
  status: "sent",
  state: "MS",
  amountCents: 4_500_000,
  sentOn: "2026-03-02",
  ...over,
});
const one = (...args: Parameters<typeof gaWaiverClocks>) => {
  const [c] = gaWaiverClocks(...args);
  if (!c) throw new Error("expected a clock");
  return c;
};

describe("Mississippi's 60 days on a sent waiver", () => {
  it("counts 60 calendar days from the day it was marked sent, as the package does", () => {
    expect(one(app, 1_500_000, [sent()], "2026-04-20")).toEqual({
      state: "MS",
      waiverId: "w1",
      payAppId: "P1",
      number: 3,
      signedOn: "2026-03-02",
      endsOn: "2026-05-01",
      daysLeft: 11,
      unpaidCents: 3_000_000,
      waiverAmountCents: 4_500_000,
      stage: "running",
    });
    for (const [from, today] of [
      ["2026-03-02", "2026-04-20"],
      ["2028-01-15", "2028-03-01"],
      ["2026-12-20", "2027-03-01"],
      ["2028-02-28", "2028-02-29"],
    ] as const) {
      const x = one(app, 0, [sent({ sentOn: from })], today);
      const pkg = msSixtyDays(from, today);
      expect([x.endsOn, x.daysLeft, x.daysLeft < 0]).toEqual([pkg.endsOn, pkg.daysLeft, pkg.ended]);
    }
  });

  it("is silent once the money covers the waiver, for a draft, or with no date", () => {
    expect(gaWaiverClocks(app, 4_500_000, [sent()], "2026-04-20")).toEqual([]);
    expect(gaWaiverClocks(app, 0, [sent({ status: "draft" })], "2026-04-20")).toEqual([]);
    expect(gaWaiverClocks(app, 0, [sent({ sentOn: undefined })], "2026-04-20")).toEqual([]);
  });

  it("runs for either form: Mississippi's waivers are neither conditional nor unconditional", () => {
    for (const kind of [
      "unconditional-progress",
      "conditional-final",
      "unconditional-final",
    ] as const) {
      expect(one(app, 0, [sent({ kind })], "2026-04-20").endsOn).toBe("2026-05-01");
    }
  });

  it("says what to do before the end, on the last day, and after it, in Mississippi's words", () => {
    const before = gaClockText(one(app, 0, [sent()], "2026-04-20"));
    expect(before).toMatch(/^Mississippi: the lien waiver for application #3 was marked sent/);
    expect(before).toMatch(/the 60 days end on 2026-05-01, in 11 days/);
    expect(before).toMatch(/deemed paid in full anyway .* send the owner a copy/);
    expect(before).toMatch(/Miss\. Code Ann\. § 85-7-419\(5\)\(b\)/);
    expect(before).not.toMatch(/Georgia|O\.C\.G\.A\.|90/);
    expect(gaClockText(one(app, 0, [sent()], "2026-05-01"))).toMatch(
      /today is the last of the 60 days/,
    );
    const after = gaClockText(one(app, 0, [sent()], "2026-05-02"));
    expect(after).toMatch(/ended on 2026-05-01 .*deemed paid in full \(Miss\. Code/);
  });

  it("is named in the cash report from 30 days before the end to 30 days after", () => {
    expect(gaClockNeedsAction(one(app, 0, [sent()], "2026-03-31"))).toBe(false);
    expect(gaClockNeedsAction(one(app, 0, [sent()], "2026-04-01"))).toBe(true);
    expect(gaClockNeedsAction(one(app, 0, [sent()], "2026-05-31"))).toBe(true);
    expect(gaClockNeedsAction(one(app, 0, [sent()], "2026-06-01"))).toBe(false);
  });
});

describe("Mississippi's affidavit of nonpayment recorded as filed (§ 85-7-419(5)(b), (c), (e))", () => {
  const filed = (over: Partial<NonNullable<GaClockWaiver["gaAffidavit"]>> = {}) =>
    sent({ gaAffidavit: { filedOn: "2026-04-27", county: "Hinds", ...over } });

  it("stops the 60 days and counts 2 days for the owner's copy, as the package does", () => {
    const c = one(app, 0, [filed()], "2026-04-28");
    expect(c.stage).toBe("filed");
    expect(c.filing).toEqual({
      filedOn: "2026-04-27",
      county: "Hinds",
      late: false,
      copyDueOn: "2026-04-29",
      copyDaysLeft: 1,
    });
    expect(c.filing?.copyDueOn).toBe(msAffidavitCopyDueOn("2026-04-27"));
    expect(gaClockNeedsAction(c)).toBe(true);
    const text = gaClockText(c);
    expect(text).toMatch(/^Mississippi: the affidavit of nonpayment .* Hinds County on 2026-04-27/);
    expect(text).toMatch(/by 2026-04-29, in 1 day \(Miss\. Code Ann\. § 85-7-419\(5\)\(b\)\)/);
    expect(text).not.toMatch(/contractor|notice of commencement/);
  });

  it("asks no contractor's copy: once the owner's copy is sent, the waiver is suspended", () => {
    const c = one(app, 1_000_000, [filed({ copySentOn: "2026-04-28" })], "2026-05-10");
    expect(c.stage).toBe("filed");
    expect(c.filing && gaContractorCopyPending(c.filing, "MS")).toBe(false);
    expect(gaClockNeedsAction(c)).toBe(false);
    expect(gaClockText(c)).toMatch(
      /suspended until payment in full is received \(Miss\. Code Ann\. § 85-7-419\(5\)\(e\)\); \$35,000\.00 of the \$45,000\.00/,
    );
  });

  it("a filing after the 60 days ended says so", () => {
    const c = one(app, 0, [filed({ filedOn: "2026-05-04" })], "2026-05-05");
    expect(c.filing?.late).toBe(true);
    expect(gaClockText(c)).toMatch(/after the 60 days ended on 2026-05-01.*ask counsel/);
  });

  it("(5)(c): paid in full after filing, then the affidavit of payment signed and recorded", () => {
    const paid = one(app, 4_500_000, [filed({ copySentOn: "2026-04-28" })], "2026-05-20");
    expect(paid.stage).toBe("paid-after-filing");
    expect(gaClockNeedsAction(paid)).toBe(false);
    expect(gaClockText(paid)).toMatch(/affidavit that payment in full was received.*\(5\)\(c\)/);
    const signed = one(
      app,
      4_500_000,
      [filed({ copySentOn: "2026-04-28", paidAffidavitSignedOn: "2026-05-21" })],
      "2026-05-22",
    );
    expect(gaClockNeedsAction(signed)).toBe(true);
    expect(gaClockText(signed)).toMatch(/Record it in Hinds County/);
    const released = one(
      app,
      4_500_000,
      [
        filed({
          copySentOn: "2026-04-28",
          paidAffidavitSignedOn: "2026-05-21",
          paidAffidavitRecordedOn: "2026-05-22",
        }),
      ],
      "2026-05-23",
    );
    expect(released.stage).toBe("released");
    expect(gaClockText(released)).toMatch(/is void \(Miss\. Code Ann\. § 85-7-419\(5\)\(c\)\)/);
  });
});

describe("nonpaymentRule", () => {
  it("knows Georgia and Mississippi only", () => {
    expect(nonpaymentRule("GA")?.days).toBe(90);
    expect(nonpaymentRule("MS")?.days).toBe(60);
    expect(nonpaymentRule("MS")?.contractorCopy).toBe(false);
    expect(nonpaymentRule("AZ")).toBeNull();
  });
});

describe("cash report: a Mississippi waiver near its 60 days", () => {
  const [c] = computeApplications(
    { originalContractSumCents: 10_000_000 },
    [{ id: "L1", itemNumber: "1", description: "Slab", originalCents: 10_000_000, sortOrder: 1 }],
    [],
    [
      {
        id: "P1",
        number: 1,
        periodTo: "2026-02-28",
        retainagePctBps: 1000,
        storedRetainagePctBps: 1000,
        lines: {
          L1: {
            workThisPeriodCents: 5_000_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        },
      },
    ],
  );
  if (!c) throw new Error("fixture");
  const project: CashReportProjectInput = {
    id: "prj_ms",
    name: "Jackson Warehouse",
    number: "26-09",
    gcName: "Magnolia Builders",
    status: "active",
    originalContractSumCents: 10_000_000,
    contractSumToDateCents: 10_000_000,
    apps: [
      {
        id: "P1",
        number: 1,
        status: "submitted",
        applicationDate: "2026-02-28",
        periodTo: "2026-02-28",
        certifiedAmountCents: null,
        summary: c.summary,
        totals: c.totals,
        payments: [],
        waivers: [
          {
            kind: "conditional-progress",
            status: "sent",
            state: "MS",
            amountCents: 4_500_000,
            sentOn: "2026-03-02",
          },
        ],
      },
    ],
  };

  it("names the 60 days with the unpaid amount", () => {
    const p = cashReport([project], "2026-04-20").projects[0];
    expect(p?.gaWaiverDeadlines.map((d) => [d.state, d.endsOn, d.unpaidCents])).toEqual([
      ["MS", "2026-05-01", 4_500_000],
    ]);
    expect(p?.actions.join(" ")).toMatch(/Mississippi: the lien waiver for application #1/);
    expect(cashReport([project], "2026-03-20").projects[0]?.gaWaiverDeadlines).toEqual([]);
  });
});
