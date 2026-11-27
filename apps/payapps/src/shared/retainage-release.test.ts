import { describe, expect, it } from "vitest";
import { type ContinuationLine, computeApplications, type SovLineInput } from "./payapp-math";
import {
  allocateProRata,
  heldBeforeRelease,
  lineIsComplete,
  planRetainageRelease,
} from "./retainage-release";

const cl = (
  id: string,
  scheduled: number,
  workToDate: number,
  retainage: number,
  releasedNow = 0,
): ContinuationLine => ({
  sovLineId: id,
  itemNumber: id,
  description: `Line ${id}`,
  scheduledValueCents: scheduled,
  fromPreviousCents: workToDate,
  thisPeriodCents: 0,
  storedMaterialsCents: 0,
  completedAndStoredCents: workToDate,
  percentCompleteBps: null,
  balanceToFinishCents: scheduled - workToDate,
  retainageCents: retainage,
  retainageReleasedThisPeriodCents: releasedNow,
  retainageRateBps: null,
});

describe("allocateProRata", () => {
  it("adds up to the total exactly and never exceeds a weight", () => {
    expect(allocateProRata(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProRata(3, [1, 1, 1])).toEqual([1, 1, 1]);
    expect(allocateProRata(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProRata(10, [0, 0])).toEqual([0, 0]);
    for (let total = 0; total <= 1_000; total += 37) {
      const w = [333, 1, 0, 666];
      const out = allocateProRata(total, w);
      expect(out.reduce((s, x) => s + x, 0)).toBe(total);
      out.forEach((x, i) => {
        expect(x).toBeLessThanOrEqual(w[i] ?? 0);
      });
    }
  });

  it("stays exact on large contracts (BigInt products)", () => {
    const w = [9_000_000_000_01, 4_500_000_000_03, 7];
    const total = 9_000_000_000_00;
    const out = allocateProRata(total, w);
    expect(out.reduce((s, x) => s + x, 0)).toBe(total);
  });
});

describe("planRetainageRelease", () => {
  // 10% retainage: L1 complete (held $6,000), L2 half done ($2,000), L3 nothing billed.
  const lines = [
    cl("L1", 6_000_000, 6_000_000, 600_000),
    cl("L2", 4_000_000, 2_000_000, 200_000),
    cl("L3", 1_000_000, 0, 0),
  ];

  it("releases a percentage of everything held, split by what each line holds", () => {
    const p = planRetainageRelease(lines, { kind: "all" }, { kind: "percent", bps: 5_000 });
    expect(p.issues).toEqual([]);
    expect(p.heldCents).toBe(800_000);
    expect(p.releaseCents).toBe(400_000);
    expect(p.lines.map((l) => [l.sovLineId, l.releaseCents, l.heldAfterCents])).toEqual([
      ["L1", 300_000, 300_000],
      ["L2", 100_000, 100_000],
    ]);
    expect(p.changeCents).toBe(400_000);
  });

  it("releases all retainage on complete lines only", () => {
    const p = planRetainageRelease(lines, { kind: "complete" }, { kind: "percent", bps: 10_000 });
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]).toMatchObject({ sovLineId: "L1", releaseCents: 600_000, heldAfterCents: 0 });
    expect(lineIsComplete(lines[1] as ContinuationLine)).toBe(false);
  });

  it("splits a dollar amount to the cent across selected lines", () => {
    const p = planRetainageRelease(
      lines,
      { kind: "selected", sovLineIds: ["L1", "L2"] },
      { kind: "amount", cents: 100_001 },
    );
    expect(p.issues).toEqual([]);
    expect(p.releaseCents).toBe(100_001);
    expect(p.lines.map((l) => l.releaseCents)).toEqual([75_001, 25_000]);
  });

  it("replaces this application's existing release instead of adding to it", () => {
    // L1 already releases $1,000 this period, so column I shows $5,000; held before is $6,000.
    const withRelease = [cl("L1", 6_000_000, 6_000_000, 500_000, 100_000)];
    expect(heldBeforeRelease(withRelease[0] as ContinuationLine)).toBe(600_000);
    const p = planRetainageRelease(withRelease, { kind: "all" }, { kind: "percent", bps: 2_500 });
    expect(p.lines[0]).toMatchObject({ currentReleaseCents: 100_000, releaseCents: 150_000 });
    expect(p.changeCents).toBe(50_000);
  });

  it("refuses an amount above what is held, and says how much is held", () => {
    const p = planRetainageRelease(lines, { kind: "all" }, { kind: "amount", cents: 800_001 });
    expect(p.issues.map((i) => i.code)).toEqual(["amount_exceeds_held"]);
    expect(p.issues[0]?.message).toContain("$8,000.00");
    expect(p.releaseCents).toBe(0);
  });

  it("says when nothing is complete, nothing is held, or a line is unknown", () => {
    const none = [cl("L3", 1_000_000, 0, 0)];
    expect(
      planRetainageRelease(none, { kind: "complete" }, { kind: "percent", bps: 10_000 }).issues[0]
        ?.code,
    ).toBe("nothing_in_scope");
    expect(
      planRetainageRelease(none, { kind: "all" }, { kind: "percent", bps: 10_000 }).issues[0]?.code,
    ).toBe("nothing_held");
    expect(
      planRetainageRelease(
        lines,
        { kind: "selected", sovLineIds: ["nope"] },
        { kind: "percent", bps: 10_000 },
      ).issues.map((i) => i.code),
    ).toEqual(["unknown_line", "nothing_in_scope"]);
    expect(
      planRetainageRelease(lines, { kind: "all" }, { kind: "percent", bps: 0 }).issues[0]?.code,
    ).toBe("invalid_amount");
  });

  it("applied to the math, raises line 8 by exactly the release and clears column I", () => {
    const sov: SovLineInput[] = [
      {
        id: "L1",
        itemNumber: "1",
        description: "Rough-in",
        originalCents: 6_000_000,
        sortOrder: 1,
      },
      { id: "L2", itemNumber: "2", description: "Trim", originalCents: 3_333_333, sortOrder: 2 },
    ];
    const project = { originalContractSumCents: 9_333_333 };
    const p1 = {
      id: "A1",
      number: 1,
      periodTo: "2026-01-31",
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
      lines: {
        L1: { workThisPeriodCents: 6_000_000, storedMaterialsCents: 0, retainageReleasedCents: 0 },
        L2: { workThisPeriodCents: 3_333_333, storedMaterialsCents: 0, retainageReleasedCents: 0 },
      },
    };
    const p2 = { ...p1, id: "A2", number: 2, periodTo: "2026-02-28", lines: {} };
    const before = computeApplications(project, sov, [], [p1, p2])[1];
    if (!before) throw new Error("no application");
    const plan = planRetainageRelease(
      before.lines,
      { kind: "all" },
      { kind: "percent", bps: 10_000 },
    );
    expect(plan.releaseCents).toBe(before.summary.totalRetainageCents);
    const released = Object.fromEntries(
      plan.lines.map((l) => [
        l.sovLineId,
        { workThisPeriodCents: 0, storedMaterialsCents: 0, retainageReleasedCents: l.releaseCents },
      ]),
    );
    const after = computeApplications(project, sov, [], [p1, { ...p2, lines: released }])[1];
    expect(after?.summary.totalRetainageCents).toBe(0);
    expect(after?.summary.currentPaymentDueCents).toBe(
      before.summary.currentPaymentDueCents + plan.releaseCents,
    );
    expect(after?.warnings.filter((w) => w.code === "retainage_release_exceeds_held")).toEqual([]);
  });
});
