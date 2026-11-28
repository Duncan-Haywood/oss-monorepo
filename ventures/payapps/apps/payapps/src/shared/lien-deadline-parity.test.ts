// The paid product's lien clock (lien-deadline.ts) was ported from the free calculator
// (ventures/mechanics-lien-deadline-calculator/calc.mjs). The two must agree on every state they
// share: a red-team run on 2026-11-27 found the port silently dropping a completion date entered
// before the last day of work (California, Arizona, Utah), a date later than the free tool's, so
// the paid product was the less safe of the two. This grid catches the next drift of either copy.
import { describe, expect, it } from "vitest";
import { addDays, isLienDeadlineState, lienDeadline } from "./lien-deadline";

// calc.mjs is plain JavaScript with no types; this is the slice of it the grid reads.
interface FreeCalc {
  STATE_RULES: Record<string, unknown>;
  lienDeadlines(input: Record<string, string>): { lien: { date: Date; safeDate: Date } | null };
}
const CALC = new URL("../../../../../mechanics-lien-deadline-calculator/calc.mjs", import.meta.url);
const { lienDeadlines, STATE_RULES } = (await import(/* @vite-ignore */ CALC.href)) as FreeCalc;

const LAST = ["2026-01-31", "2026-02-28", "2026-05-15", "2026-08-30", "2026-12-31"];
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("lien deadline parity with the free calculator", () => {
  const shared = Object.keys(STATE_RULES).filter(isLienDeadlineState);
  it("shares every state PayApps carries (all sixteen since 2026-11-28)", () => {
    expect(shared.length).toBeGreaterThanOrEqual(16);
  });
  for (const state of shared) {
    it(`${state}: same statutory and act-by dates on a grid of inputs`, () => {
      const diffs: string[] = [];
      for (const last of LAST) {
        for (const completion of [null, addDays(last, -20), addDays(last, 25)]) {
          for (const noc of [null, addDays(last, 5), addDays(last, 200)]) {
            for (const residential of [false, true]) {
              const free = lienDeadlines({
                state,
                projectType: residential ? "residential" : "commercial",
                firstFurnishing: addDays(last, -60),
                lastFurnishing: last,
                completionDate: completion ?? "",
                noticeOfCompletionDate: noc ?? "",
              }).lien;
              const paid = lienDeadline({
                state,
                residential,
                lastFurnishedOn: last,
                completedOn: completion,
                noticeOfCompletionOn: noc,
              });
              if (paid.kind !== "deadline" || !free) {
                diffs.push(`${last} c=${completion} n=${noc} r=${residential}: no date`);
                continue;
              }
              const got = `${paid.deadline.statutoryOn}/${paid.deadline.dueOn}`;
              const want = `${iso(free.date)}/${iso(free.safeDate)}`;
              if (got !== want) {
                diffs.push(
                  `${last} c=${completion} n=${noc} r=${residential}: paid ${got}, free ${want}`,
                );
              }
            }
          }
        }
      }
      expect(diffs).toEqual([]);
    });
  }
});
