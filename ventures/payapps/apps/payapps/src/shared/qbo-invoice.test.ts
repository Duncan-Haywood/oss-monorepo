import { describe, expect, it } from "vitest";
import { computeApplications, type PeriodInput, type SovLineInput } from "./payapp-math";
import {
  planQboInvoice,
  QBO_DOC_NUMBER_MAX,
  QboInvoicePlanError,
  qboDocNumber,
} from "./qbo-invoice";

const sov: SovLineInput[] = [
  { id: "L1", itemNumber: "1", description: "Rough-in", originalCents: 6_000_000, sortOrder: 1 },
  { id: "L2", itemNumber: "2", description: "Fixtures", originalCents: 4_000_000, sortOrder: 2 },
];
const line = (work: number, stored = 0, released = 0) => ({
  workThisPeriodCents: work,
  storedMaterialsCents: stored,
  retainageReleasedCents: released,
});
const period = (n: number, lines: PeriodInput["lines"], bps = 1000): PeriodInput => ({
  id: `P${n}`,
  number: n,
  periodTo: `2026-0${n}-28`,
  retainagePctBps: bps,
  storedRetainagePctBps: bps,
  lines,
});
const sum = (xs: { amountCents: number }[]) => xs.reduce((s, x) => s + x.amountCents, 0);

describe("planQboInvoice", () => {
  const periods = [
    period(1, { L1: line(2_000_000), L2: line(0, 500_000) }),
    // Stored materials on L2 get installed: work 500k, stored back to 0, so column G grows by 0 there.
    period(2, { L1: line(1_000_000), L2: line(500_000, 0) }),
    // Rate cut to 5%: retainage released on the work already billed.
    period(3, { L1: line(3_000_000), L2: line(3_500_000) }, 500),
  ];
  const apps = computeApplications({ originalContractSumCents: 10_000_000 }, sov, [], periods);

  it("bills line 8 of every application, with retainage held as a negative line", () => {
    const [a1] = apps;
    if (!a1) throw new Error("no app");
    const plan = planQboInvoice(a1, null);
    expect(plan.totalCents).toBe(a1.summary.currentPaymentDueCents);
    expect(sum(plan.lines)).toBe(plan.totalCents);
    expect(plan.lines.map((l) => [l.kind, l.sovLineId, l.amountCents])).toEqual([
      ["work", "L1", 2_000_000],
      ["work", "L2", 500_000],
      ["retainage_held", null, -250_000],
    ]);
    expect(plan.lines[0]?.description).toBe("1 Rough-in");
    expect(plan.retainageCheckCents).toBeNull();
  });

  it("counts installed stored materials once (column G change, not work this period)", () => {
    const [a1, a2] = apps;
    if (!a1 || !a2) throw new Error("no app");
    const plan = planQboInvoice(a2, a1);
    expect(
      plan.lines.filter((l) => l.kind === "work").map((l) => [l.sovLineId, l.amountCents]),
    ).toEqual([["L1", 1_000_000]]);
    expect(plan.retainageCents).toBe(-100_000);
    expect(plan.retainageCheckCents).toBe(0);
    expect(sum(plan.lines)).toBe(a2.summary.currentPaymentDueCents);
  });

  it("nets a rate cut against new retainage and still matches the change in line 5", () => {
    const [, a2, a3] = apps;
    if (!a2 || !a3) throw new Error("no app");
    const plan = planQboInvoice(a3, a2);
    expect(sum(plan.lines)).toBe(a3.summary.currentPaymentDueCents);
    expect(plan.retainageCheckCents).toBe(0);
    expect(plan.retainageCents).toBe(
      -(a3.summary.totalRetainageCents - a2.summary.totalRetainageCents),
    );
  });

  it("over the whole job, the invoices sum to everything earned less retainage still held", () => {
    let total = 0;
    apps.forEach((a, i) => {
      total += planQboInvoice(a, apps[i - 1] ?? null).totalCents;
    });
    const last = apps[apps.length - 1];
    expect(total).toBe(last?.summary.totalEarnedLessRetainageCents);
  });

  it("releases retainage as a positive line on a release-only application", () => {
    const withRelease = computeApplications(
      { originalContractSumCents: 10_000_000 },
      sov,
      [],
      [
        period(1, { L1: line(6_000_000), L2: line(4_000_000) }),
        period(2, { L1: line(0, 0, 600_000), L2: line(0, 0, 400_000) }),
      ],
    );
    const [b1, b2] = withRelease;
    if (!b1 || !b2) throw new Error("no app");
    const plan = planQboInvoice(b2, b1);
    expect(plan.lines).toEqual([
      {
        kind: "retainage_released",
        sovLineId: null,
        description: "Retainage released, pay application #2",
        amountCents: 1_000_000,
      },
    ]);
    expect(plan.totalCents).toBe(1_000_000);
  });

  it("starts a mid-job first application from the opening balance", () => {
    const [m1] = computeApplications(
      {
        originalContractSumCents: 10_000_000,
        opening: {
          appNumber: 4,
          periodTo: "2026-01-31",
          previousCertificatesCents: 2_700_000,
          retainageHeldCents: 300_000,
        },
      },
      sov.map((l) => ({ ...l, openingCompletedCents: l.id === "L1" ? 3_000_000 : 0 })),
      [],
      [{ ...period(1, { L1: line(1_000_000) }), number: 5 }],
    );
    if (!m1) throw new Error("no app");
    const plan = planQboInvoice(m1, null);
    expect(plan.lines.filter((l) => l.kind === "work").map((l) => l.amountCents)).toEqual([
      1_000_000,
    ]);
    expect(plan.totalCents).toBe(m1.summary.currentPaymentDueCents);
    expect(sum(plan.lines)).toBe(plan.totalCents);
  });

  it("refuses a negative line 8 and an application that bills nothing", () => {
    const zero = computeApplications(
      { originalContractSumCents: 10_000_000 },
      sov,
      [],
      [period(1, {})],
    );
    const [z1] = zero;
    if (!z1) throw new Error("no app");
    expect(() => planQboInvoice(z1, null)).toThrow(QboInvoicePlanError);
    const neg = { ...z1, summary: { ...z1.summary, currentPaymentDueCents: -5 } };
    expect(() => planQboInvoice(neg, null)).toThrow(/negative/);
  });
});

describe("qboDocNumber", () => {
  it("uses the job number and the application number, within QuickBooks' 21 characters", () => {
    expect(qboDocNumber({ id: "prj_abc", number: "24-117" }, 3)).toBe("PA24-117-03");
    expect(qboDocNumber({ id: "prj_k3x9q2zz", number: null }, 12)).toBe("PAk3x9q2-12");
    expect(qboDocNumber({ id: "prj_k3x9q2zz", number: " / " }, 1)).toBe("PAk3x9q2-01");
    const long = qboDocNumber({ id: "prj_x", number: "CONTRACT-2026-000123456789" }, 104);
    expect(long.length).toBeLessThanOrEqual(QBO_DOC_NUMBER_MAX);
    expect(long.endsWith("-104")).toBe(true);
  });
});
