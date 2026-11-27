import { describe, expect, it } from "vitest";
import {
  applyBps,
  BLOCKING_WARNINGS,
  type ChangeOrderInput,
  changeOrderAdjustments,
  computeApplications,
  lineRatesNote,
  type PeriodInput,
  type SovLineInput,
  summarizeChangeOrders,
  uncountedChangesOnLine,
} from "./payapp-math";

const sov: SovLineInput[] = [
  { id: "L1", itemNumber: "1", description: "Rough-in", originalCents: 6_000_000, sortOrder: 1 },
  { id: "L2", itemNumber: "2", description: "Fixtures", originalCents: 4_000_000, sortOrder: 2 },
  { id: "L3", itemNumber: "3", description: "CO1 extra", originalCents: 0, sortOrder: 3 },
];
const project = { originalContractSumCents: 10_000_000 };
const co1: ChangeOrderInput = {
  id: "CO1",
  number: "1",
  status: "approved",
  approvedOn: "2026-02-10",
  items: [
    { sovLineId: "L2", amountCents: 500_000 },
    { sovLineId: "L3", amountCents: 200_000 },
  ],
};
const line = (work: number, stored = 0, released = 0) => ({
  workThisPeriodCents: work,
  storedMaterialsCents: stored,
  retainageReleasedCents: released,
});
const p1: PeriodInput = {
  id: "P1",
  number: 1,
  periodTo: "2026-01-31",
  retainagePctBps: 1000,
  storedRetainagePctBps: 1000,
  lines: { L1: line(2_000_000), L2: line(0, 500_000) },
};
const p2: PeriodInput = {
  id: "P2",
  number: 2,
  periodTo: "2026-02-28",
  retainagePctBps: 1000,
  storedRetainagePctBps: 1000,
  lines: { L1: line(1_000_000), L2: line(1_500_000, 0), L3: line(200_000) },
};
const p3: PeriodInput = {
  id: "P3",
  number: 3,
  periodTo: "2026-03-31",
  retainagePctBps: 500,
  storedRetainagePctBps: 500,
  lines: { L1: line(3_000_000), L3: line(0, 0, 10_000) },
};

describe("applyBps", () => {
  it("rounds half away from zero to whole cents", () => {
    expect(applyBps(333, 1000)).toBe(33);
    expect(applyBps(335, 1000)).toBe(34);
    expect(applyBps(-335, 1000)).toBe(-34);
    expect(applyBps(1_000_000, 0)).toBe(0);
    expect(applyBps(1_000_000, 10_000)).toBe(1_000_000);
  });
});

describe("computeApplications", () => {
  const [a1, a2, a3] = computeApplications(project, sov, [co1], [p1, p2, p3]);

  it("application 1: work, stored materials and retainage", () => {
    expect(a1).toBeDefined();
    if (!a1) return;
    // L3 has no value or activity before its change order is approved: hidden.
    expect(a1.lines.map((l) => l.sovLineId)).toEqual(["L1", "L2"]);
    expect(a1.lines[0]).toMatchObject({
      scheduledValueCents: 6_000_000,
      fromPreviousCents: 0,
      thisPeriodCents: 2_000_000,
      storedMaterialsCents: 0,
      completedAndStoredCents: 2_000_000,
      percentCompleteBps: 3333,
      balanceToFinishCents: 4_000_000,
      retainageCents: 200_000,
    });
    expect(a1.lines[1]).toMatchObject({
      storedMaterialsCents: 500_000,
      completedAndStoredCents: 500_000,
      percentCompleteBps: 1250,
      retainageCents: 50_000,
    });
    expect(a1.summary).toMatchObject({
      originalContractSumCents: 10_000_000,
      netChangeByChangeOrdersCents: 0,
      contractSumToDateCents: 10_000_000,
      totalCompletedAndStoredCents: 2_500_000,
      retainageOnCompletedWorkCents: 200_000,
      retainageOnStoredMaterialsCents: 50_000,
      totalRetainageCents: 250_000,
      totalEarnedLessRetainageCents: 2_250_000,
      lessPreviousCertificatesCents: 0,
      currentPaymentDueCents: 2_250_000,
      balanceToFinishIncludingRetainageCents: 7_750_000,
    });
    expect(a1.totals.retainageCents).toBe(a1.summary.totalRetainageCents);
    expect(a1.warnings).toEqual([]);
  });

  it("application 2: previous application carried, stored materials installed, change order", () => {
    expect(a2).toBeDefined();
    if (!a2) return;
    expect(a2.lines.map((l) => l.sovLineId)).toEqual(["L1", "L2", "L3"]);
    expect(a2.lines[0]).toMatchObject({
      fromPreviousCents: 2_000_000,
      thisPeriodCents: 1_000_000,
      completedAndStoredCents: 3_000_000,
      retainageCents: 300_000,
    });
    // Stored materials from period 1 are not "previous work": they were installed this period.
    expect(a2.lines[1]).toMatchObject({
      scheduledValueCents: 4_500_000,
      fromPreviousCents: 0,
      thisPeriodCents: 1_500_000,
      storedMaterialsCents: 0,
      completedAndStoredCents: 1_500_000,
      balanceToFinishCents: 3_000_000,
      retainageCents: 150_000,
    });
    expect(a2.lines[2]).toMatchObject({ scheduledValueCents: 200_000, percentCompleteBps: 10_000 });
    expect(a2.summary).toMatchObject({
      netChangeByChangeOrdersCents: 700_000,
      contractSumToDateCents: 10_700_000,
      totalCompletedAndStoredCents: 4_700_000,
      totalRetainageCents: 470_000,
      totalEarnedLessRetainageCents: 4_230_000,
      lessPreviousCertificatesCents: 2_250_000,
      currentPaymentDueCents: 1_980_000,
      balanceToFinishIncludingRetainageCents: 6_470_000,
    });
    expect(a2.summary.changeOrders).toEqual({
      previousAdditionsCents: 0,
      previousDeductionsCents: 0,
      thisPeriodAdditionsCents: 700_000,
      thisPeriodDeductionsCents: 0,
      netChangeCents: 700_000,
    });
    expect(a2.totals.scheduledValueCents).toBe(a2.summary.contractSumToDateCents);
  });

  it("application 3: reduced retainage rate and a retainage release", () => {
    expect(a3).toBeDefined();
    if (!a3) return;
    const byId = Object.fromEntries(a3.lines.map((l) => [l.sovLineId, l]));
    expect(byId.L1).toMatchObject({
      fromPreviousCents: 3_000_000,
      completedAndStoredCents: 6_000_000,
      balanceToFinishCents: 0,
      percentCompleteBps: 10_000,
      retainageCents: 300_000,
    });
    expect(byId.L2).toMatchObject({ thisPeriodCents: 0, retainageCents: 75_000 });
    expect(byId.L3).toMatchObject({ retainageCents: 0, retainageReleasedThisPeriodCents: 10_000 });
    expect(a3.summary).toMatchObject({
      retainagePctBps: 500,
      totalCompletedAndStoredCents: 7_700_000,
      totalRetainageCents: 375_000,
      totalEarnedLessRetainageCents: 7_325_000,
      lessPreviousCertificatesCents: 4_230_000,
      currentPaymentDueCents: 3_095_000,
      balanceToFinishIncludingRetainageCents: 10_700_000 - 7_325_000,
    });
    expect(a3.summary.changeOrders.previousAdditionsCents).toBe(700_000);
    expect(a3.summary.changeOrders.thisPeriodAdditionsCents).toBe(0);
    expect(a3.totals.retainageCents).toBe(a3.summary.totalRetainageCents);
  });

  it("sum of current payments due equals total earned less retainage", () => {
    const all = computeApplications(project, sov, [co1], [p1, p2, p3]);
    const paid = all.reduce((s, a) => s + a.summary.currentPaymentDueCents, 0);
    expect(paid).toBe(all.at(-1)?.summary.totalEarnedLessRetainageCents);
  });

  it("final application releasing all retainage pays the contract sum in full", () => {
    const p4: PeriodInput = {
      id: "P4",
      number: 4,
      periodTo: "2026-04-30",
      retainagePctBps: 500,
      storedRetainagePctBps: 500,
      lines: { L2: line(3_000_000, 0, 225_000), L1: line(0, 0, 300_000) },
    };
    const all = computeApplications(project, sov, [co1], [p1, p2, p3, p4]);
    const last = all.at(-1);
    expect(last?.summary.totalRetainageCents).toBe(0);
    expect(last?.summary.totalEarnedLessRetainageCents).toBe(10_700_000);
    expect(last?.summary.balanceToFinishIncludingRetainageCents).toBe(0);
    expect(last?.warnings).toEqual([]);
  });

  it("ignores pending, rejected and later-approved change orders", () => {
    const cos: ChangeOrderInput[] = [
      { ...co1, id: "A", status: "pending", approvedOn: null },
      { ...co1, id: "B", status: "rejected", approvedOn: "2026-01-01" },
      { ...co1, id: "C", approvedOn: "2026-03-01" },
    ];
    const [r] = computeApplications(project, sov, cos, [{ ...p2, number: 1 }]);
    expect(r?.summary.netChangeByChangeOrdersCents).toBe(0);
    expect(r?.lines.find((l) => l.sovLineId === "L2")?.scheduledValueCents).toBe(4_000_000);
  });

  it("counts deductive change orders as deductions", () => {
    const deduct: ChangeOrderInput = {
      id: "D",
      number: "2",
      status: "approved",
      approvedOn: "2026-01-15",
      items: [{ sovLineId: "L1", amountCents: -250_000 }],
    };
    const [r] = computeApplications(project, sov, [deduct], [p1]);
    expect(r?.summary.changeOrders.thisPeriodDeductionsCents).toBe(250_000);
    expect(r?.summary.contractSumToDateCents).toBe(9_750_000);
    expect(r?.lines[0]?.scheduledValueCents).toBe(5_750_000);
  });

  it("warns on overbilling, over-release, negative values and SOV mismatch", () => {
    const bad: PeriodInput = {
      ...p1,
      lines: { L1: line(7_000_000, 0, 1_000_000), L2: line(-5, -1), GONE: line(1) },
    };
    const [r] = computeApplications({ originalContractSumCents: 1 }, sov, [], [bad]);
    const codes = [...new Set(r?.warnings.map((w) => w.code))].sort();
    expect(codes).toEqual([
      "negative_stored",
      "negative_to_date",
      "overbilled_line",
      "retainage_release_exceeds_held",
      "sov_does_not_match_contract",
      "unknown_line",
    ]);
  });

  it("returns an empty list for a project without pay applications", () => {
    expect(computeApplications(project, sov, [], [])).toEqual([]);
  });
});

describe("mid-job start (opening application)", () => {
  const full = computeApplications(project, sov, [co1], [p1, p2, p3]);
  const first = full[0] as (typeof full)[number];
  // Work to date (D + E, not stored materials) on #1, as read off its continuation sheet.
  const openedSov: SovLineInput[] = sov.map((l) => {
    const c = first.lines.find((x) => x.sovLineId === l.id);
    return { ...l, openingCompletedCents: c ? c.fromPreviousCents + c.thisPeriodCents : 0 };
  });
  const opening = {
    appNumber: 1,
    periodTo: p1.periodTo,
    previousCertificatesCents: first.summary.totalEarnedLessRetainageCents,
    retainageHeldCents: first.summary.retainageOnCompletedWorkCents,
  };

  it("billing #2 and #3 here after #1 elsewhere gives the same applications as billing all three here", () => {
    const moved = computeApplications({ ...project, opening }, openedSov, [co1], [p2, p3]);
    expect(moved).toEqual(full.slice(1));
  });

  it("carries work to date into column D and line 6 into line 7", () => {
    const [a2] = computeApplications({ ...project, opening }, openedSov, [co1], [p2]);
    const l1 = a2?.lines.find((l) => l.sovLineId === "L1");
    expect(l1?.fromPreviousCents).toBe(2_000_000);
    expect(a2?.summary.lessPreviousCertificatesCents).toBe(
      first.summary.totalEarnedLessRetainageCents,
    );
  });

  it("counts change orders approved by the opening period as previous", () => {
    const early = { ...co1, approvedOn: "2026-01-15" };
    const [a2] = computeApplications({ ...project, opening }, openedSov, [early], [p2]);
    expect(a2?.summary.changeOrders.previousAdditionsCents).toBe(700_000);
    expect(a2?.summary.changeOrders.thisPeriodAdditionsCents).toBe(0);
  });

  it("warns (without blocking) when the retainage held elsewhere differs from the recomputed figure", () => {
    const lower = { ...opening, retainageHeldCents: 150_000 };
    const [a2] = computeApplications({ ...project, opening: lower }, openedSov, [co1], [p2]);
    const w = a2?.warnings.find((x) => x.code === "opening_retainage_differs");
    expect(w?.message).toContain("$1500.00");
    expect(w?.message).toContain("$2000.00");
    expect(w?.message).toContain("10%");
    expect(w?.message).toContain("If retainage of $500.00 was released before the move");
    expect(w?.message).toContain("Retainage released before the move");
    expect(BLOCKING_WARNINGS.has("opening_retainage_differs")).toBe(false);
    // Only the first application here is checked.
    const [, a3] = computeApplications({ ...project, opening: lower }, openedSov, [co1], [p2, p3]);
    expect(a3?.warnings.some((x) => x.code === "opening_retainage_differs")).toBe(false);
  });

  it("does not check retainage when the old figure was not given", () => {
    const [a2] = computeApplications(
      { ...project, opening: { ...opening, retainageHeldCents: null } },
      openedSov,
      [co1],
      [p2],
    );
    expect(a2?.warnings.some((x) => x.code === "opening_retainage_differs")).toBe(false);
  });

  describe("retainage released on a line before the move", () => {
    // #1 and #2 elsewhere, #2 releasing $1,000 of item 1's retainage; #3 here at the same rate.
    const p2r: PeriodInput = { ...p2, lines: { ...p2.lines, L1: line(1_000_000, 0, 100_000) } };
    const p3r: PeriodInput = { ...p3, retainagePctBps: 1000, storedRetainagePctBps: 1000 };
    const all = computeApplications(project, sov, [co1], [p1, p2r, p3r]);
    const second = all[1] as (typeof all)[number];
    const moved: SovLineInput[] = sov.map((l) => {
      const c = second.lines.find((x) => x.sovLineId === l.id);
      return {
        ...l,
        openingCompletedCents: c ? c.fromPreviousCents + c.thisPeriodCents : 0,
        openingReleasedCents: l.id === "L1" ? 100_000 : 0,
      };
    });
    const opening2 = {
      appNumber: 2,
      periodTo: p2r.periodTo,
      previousCertificatesCents: second.summary.totalEarnedLessRetainageCents,
      retainageHeldCents: second.summary.retainageOnCompletedWorkCents,
    };

    it("gives the same application as billing every one here", () => {
      const [a3] = computeApplications({ ...project, opening: opening2 }, moved, [co1], [p3r]);
      expect(a3).toEqual(all[2]);
      expect(a3?.warnings.some((w) => w.code === "opening_retainage_differs")).toBe(false);
      // Item 1: 10% of $60,000 is $6,000, less the $1,000 released before the move.
      expect(a3?.lines.find((l) => l.sovLineId === "L1")?.retainageCents).toBe(500_000);
      expect(a3?.lines.find((l) => l.sovLineId === "L1")?.retainageReleasedThisPeriodCents).toBe(0);
    });

    it("without the release, the first application here holds too much and says where to enter it", () => {
      const unreleased = moved.map((l) => ({ ...l, openingReleasedCents: 0 }));
      const [a3] = computeApplications({ ...project, opening: opening2 }, unreleased, [co1], [p3r]);
      expect(a3?.summary.totalEarnedLessRetainageCents).toBe(
        (all[2]?.summary.totalEarnedLessRetainageCents ?? 0) - 100_000,
      );
      const w = a3?.warnings.find((x) => x.code === "opening_retainage_differs");
      expect(w?.message).toContain("If retainage of $1000.00 was released before the move");
    });

    it("names the release in the warning when the figures still differ", () => {
      const off = { ...opening2, retainageHeldCents: opening2.retainageHeldCents - 50_000 };
      const [a3] = computeApplications({ ...project, opening: off }, moved, [co1], [p3r]);
      const w = a3?.warnings.find((x) => x.code === "opening_retainage_differs");
      expect(w?.message).toContain("less $1000.00 released before the move");
    });

    it("a release above what the line held is flagged", () => {
      const tooMuch = moved.map((l) =>
        l.id === "L2" ? { ...l, openingReleasedCents: 99_999_900 } : l,
      );
      const [a3] = computeApplications({ ...project, opening: opening2 }, tooMuch, [co1], [p3r]);
      expect(
        a3?.warnings.some(
          (w) => w.code === "retainage_release_exceeds_held" && w.sovLineId === "L2",
        ),
      ).toBe(true);
    });
  });

  it("flags carried-over work above a line's scheduled value", () => {
    const over = openedSov.map((l) =>
      l.id === "L1" ? { ...l, openingCompletedCents: 6_500_000 } : l,
    );
    const [a2] = computeApplications({ ...project, opening }, over, [co1], [p2]);
    expect(a2?.warnings.some((x) => x.code === "overbilled_line" && x.sovLineId === "L1")).toBe(
      true,
    );
  });
});

describe("change order helpers", () => {
  it("adjustments only include approvals on/before the date", () => {
    expect(changeOrderAdjustments([co1], "2026-02-09").size).toBe(0);
    expect(Object.fromEntries(changeOrderAdjustments([co1], "2026-02-10"))).toEqual({
      L2: 500_000,
      L3: 200_000,
    });
  });
  it("splits previous and this-period change orders", () => {
    expect(summarizeChangeOrders([co1], "2026-03-31", "2026-02-28").previousAdditionsCents).toBe(
      700_000,
    );
    expect(summarizeChangeOrders([co1], "2026-02-28", "2026-01-31").thisPeriodAdditionsCents).toBe(
      700_000,
    );
  });
});

describe("per-line retainage rates", () => {
  // Item 1 is a bond line billed with no retainage; item 3 (from CO1) is held at 5%.
  const own: SovLineInput[] = sov.map((l) =>
    l.id === "L1"
      ? { ...l, retainagePctBps: 0 }
      : l.id === "L3"
        ? { ...l, retainagePctBps: 500 }
        : l,
  );
  const all = computeApplications(project, own, [co1], [p1, p2, p3]);

  it("holds a line's own rate on its work and stored materials", () => {
    const [a1, a2] = all;
    const l1 = a1?.lines.find((l) => l.sovLineId === "L1");
    expect(l1).toMatchObject({ retainageCents: 0, retainageRateBps: 0 });
    // Item 2 follows the application: 10% of $5,000 stored.
    expect(a1?.summary.retainageOnStoredMaterialsCents).toBe(50_000);
    expect(a1?.summary.retainageOnCompletedWorkCents).toBe(0);
    expect(a1?.summary.currentPaymentDueCents).toBe(2_000_000 + 500_000 - 50_000);
    // Application 2: item 2 at 10% of $15,000, item 3 at 5% of $2,000.
    expect(a2?.summary.retainageOnCompletedWorkCents).toBe(150_000 + 10_000);
    expect(a2?.lines.find((l) => l.sovLineId === "L2")?.retainageRateBps).toBeNull();
  });

  it("keeps the line's rate when the application's rate changes", () => {
    const a3 = all[2];
    // Application 3 drops to 5%: item 2 at 5% of $15,000; item 3 at 5% of $2,000 less $100 released.
    const byId = Object.fromEntries((a3?.lines ?? []).map((l) => [l.sovLineId, l]));
    expect(byId.L1?.retainageCents).toBe(0);
    expect(byId.L2?.retainageCents).toBe(75_000);
    expect(byId.L3?.retainageCents).toBe(10_000 - 10_000);
  });

  it("lists the lines at their own rate and keeps the payment identity", () => {
    expect(all[0]?.summary.lineRates).toEqual([
      { sovLineId: "L1", itemNumber: "1", retainagePctBps: 0 },
    ]);
    expect(all[1]?.summary.lineRates.map((l) => l.itemNumber)).toEqual(["1", "3"]);
    const paid = all.reduce((s, a) => s + a.summary.currentPaymentDueCents, 0);
    expect(paid).toBe(all.at(-1)?.summary.totalEarnedLessRetainageCents);
    for (const a of all) expect(a.totals.retainageCents).toBe(a.summary.totalRetainageCents);
  });

  it("a line at the application's own rate gives the same figures as no override", () => {
    const same = sov.map((l) => (l.id === "L2" ? { ...l, retainagePctBps: 1000 } : l));
    const a = computeApplications(project, same, [co1], [p1, p2]);
    const b = computeApplications(project, sov, [co1], [p1, p2]);
    expect(a.map((x) => x.summary.totalRetainageCents)).toEqual(
      b.map((x) => x.summary.totalRetainageCents),
    );
  });

  it("uses the line's rate when checking an opening balance", () => {
    const opening = {
      appNumber: 1,
      periodTo: "2026-01-31",
      previousCertificatesCents: 3_000_000,
      retainageHeldCents: 100_000,
    };
    const lines: SovLineInput[] = [
      { ...sov[0], id: "L1", openingCompletedCents: 2_000_000, retainagePctBps: 0 } as SovLineInput,
      { ...sov[1], id: "L2", openingCompletedCents: 1_000_000 } as SovLineInput,
    ];
    const first: PeriodInput = { ...p2, lines: {} };
    const [a] = computeApplications(
      { originalContractSumCents: 10_000_000, opening },
      lines,
      [],
      [first],
    );
    // 0% of $20,000 + 10% of $10,000 = $1,000 held, the same as the old application: no warning.
    expect(a?.warnings.map((w) => w.code)).not.toContain("opening_retainage_differs");
  });
});

describe("lineRatesNote", () => {
  it("groups items by rate, lowest first", () => {
    expect(
      lineRatesNote([
        { sovLineId: "a", itemNumber: "7", retainagePctBps: 500 },
        { sovLineId: "b", itemNumber: "1", retainagePctBps: 0 },
        { sovLineId: "c", itemNumber: "2", retainagePctBps: 0 },
        { sovLineId: "d", itemNumber: "9", retainagePctBps: 250 },
      ]),
    ).toBe("items 1, 2 at 0%; item 9 at 2.5%; item 7 at 5%");
    expect(lineRatesNote([])).toBe("");
  });
});

describe("work billed against a change order not yet approved", () => {
  // L3 exists only through CO1; bill $1,500 of it in January (period ends 2026-01-31).
  const billed: PeriodInput = { ...p1, lines: { L3: line(150_000) } };
  const lineWarning = (cos: ChangeOrderInput[], period = billed) =>
    computeApplications(project, sov, cos, [period])[0]?.warnings.filter(
      (w) => w.sovLineId === "L3",
    ) ?? [];

  it("names a pending change order instead of the plain overbilling warning", () => {
    const [w, ...rest] = lineWarning([{ ...co1, status: "pending", approvedOn: null }]);
    expect(rest).toEqual([]);
    expect(w?.code).toBe("billed_on_unapproved_change_order");
    expect(w?.message).toBe(
      "Item 3: completed and stored ($1500.00) is $1500.00 over the approved scheduled value ($0.00), and change order 1 ($2000.00) is still pending. GCs do not certify work on a change order before it is approved: hold the $1500.00 until it is signed, or mark it approved with the date the GC signed.",
    );
    expect(BLOCKING_WARNINGS.has("billed_on_unapproved_change_order")).toBe(false);
  });

  it("names a change order approved after the period end and when it counts", () => {
    const [w] = lineWarning([co1]); // approved 2026-02-10, period ends 2026-01-31
    expect(w?.code).toBe("billed_on_unapproved_change_order");
    expect(w?.message).toContain(
      "change order 1 ($2000.00, approved 2026-02-10) was approved after this period ends (2026-01-31)",
    );
    expect(w?.message).toContain("It counts from the first application ending on or after");
  });

  it("is silent once the change order counts and the work fits", () => {
    expect(lineWarning([co1], { ...billed, periodTo: "2026-02-28" })).toEqual([]);
  });

  it("says when the line would still be over with the change order approved", () => {
    const big: PeriodInput = { ...p1, lines: { L3: line(250_000) } };
    const [w] = lineWarning([{ ...co1, status: "pending", approvedOn: null }], big);
    expect(w?.code).toBe("billed_on_unapproved_change_order");
    expect(w?.message).toContain("Even with it counted, the line is $500.00 over.");
  });

  it("keeps the plain warning for a rejected change order and says it was rejected", () => {
    const [w] = lineWarning([{ ...co1, status: "rejected", approvedOn: null }]);
    expect(w?.code).toBe("overbilled_line");
    expect(w?.message).toContain("Change order 1 for this line was rejected and adds nothing.");
  });

  it("lists several waiting change orders on one line in number order", () => {
    const cos: ChangeOrderInput[] = [
      {
        id: "B",
        number: "10",
        status: "pending",
        approvedOn: null,
        items: [{ sovLineId: "L3", amountCents: 50_000 }],
      },
      {
        id: "A",
        number: "2",
        status: "pending",
        approvedOn: null,
        items: [{ sovLineId: "L3", amountCents: 100_000 }],
      },
    ];
    const [w] = lineWarning(cos);
    expect(w?.message).toContain("change orders 2 ($1000.00) and 10 ($500.00) are still pending");
    expect(w?.message).not.toContain("Even with");
  });

  it("ignores deductions and other lines when finding the change orders", () => {
    const cos: ChangeOrderInput[] = [
      { ...co1, status: "pending", approvedOn: null },
      {
        id: "D",
        number: "3",
        status: "pending",
        approvedOn: null,
        items: [{ sovLineId: "L3", amountCents: -20_000 }],
      },
    ];
    expect(uncountedChangesOnLine(cos, "L3", "2026-01-31").map((c) => c.number)).toEqual(["1"]);
    expect(uncountedChangesOnLine(cos, "L1", "2026-01-31")).toEqual([]);
    // An overbilled line with no change order behind it keeps the plain warning.
    const plain = computeApplications(project, sov, cos, [
      { ...p1, lines: { L1: line(6_100_000) } },
    ])[0]?.warnings.find((w) => w.sovLineId === "L1");
    expect(plain?.code).toBe("overbilled_line");
  });
});
