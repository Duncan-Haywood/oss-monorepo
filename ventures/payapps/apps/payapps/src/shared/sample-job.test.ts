import { describe, expect, it } from "vitest";
import { sampleJobPlan } from "./sample-job";

const days = ["2026-01-01", "2026-03-01", "2026-03-31", "2026-11-25", "2026-12-31", "2028-02-29"];

describe("sampleJobPlan", () => {
  for (const day of days) {
    it(`holds together when created on ${day}`, () => {
      const today = new Date(`${day}T12:00:00Z`);
      const p = sampleJobPlan(today);
      expect(p.sov.reduce((s, l) => s + l.originalCents, 0)).toBe(
        p.project.originalContractSumCents,
      );
      // Consecutive monthly periods, after the contract date, the last one this month.
      let prevTo = p.project.contractDate;
      for (const a of p.payApps) {
        expect(a.periodFrom > prevTo).toBe(true);
        expect(a.periodFrom <= a.periodTo).toBe(true);
        prevTo = a.periodTo;
        if (a.paidOn) {
          expect(a.paidOn >= a.applicationDate).toBe(true);
          expect(a.paidOn <= day).toBe(true);
        }
      }
      expect(p.payApps.at(-1)?.periodFrom.slice(0, 7)).toBe(day.slice(0, 7));
      // CO-1 is approved inside application #2's period; nothing is sent in the future.
      const co1 = p.approvedChangeOrder;
      expect(co1.approvedOn > (p.payApps[0]?.periodTo ?? "")).toBe(true);
      expect(co1.approvedOn <= (p.payApps[1]?.periodTo ?? "")).toBe(true);
      expect(p.pendingChangeOrder.submittedOn <= day).toBe(true);
      // No line is billed past its scheduled value.
      const billed = new Map<number | "co1", number>();
      for (const a of p.payApps)
        for (const e of a.entries) billed.set(e.line, (billed.get(e.line) ?? 0) + e.workCents);
      for (const [line, cents] of billed) {
        const max = line === "co1" ? co1.amountCents : (p.sov[line]?.originalCents ?? 0);
        expect(cents).toBeLessThanOrEqual(max);
      }
    });
  }
});
