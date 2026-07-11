/**
 * coverage.ts — sanity-checks a processed shoot against
 * process/capture-checklist.ts's expected shot count.
 *
 * This can't verify *which* rooms were captured (that needs vision, not
 * file counting), but a simple count check catches the most common
 * concierge-shoot mistake: leaving with fewer photos than the checklist
 * calls for, which STRATEGY.md flags as costing the 30-minute target to
 * fix after the fact.
 */

import { captureChecklist } from "../../process/capture-checklist";

/** Total distinct photo shots in the checklist, excluding the wrap-up review step (not a photo). */
export function expectedShotCount(): number {
  return captureChecklist
    .filter((room) => room.id !== "wrap")
    .reduce((sum, room) => sum + room.shots.length, 0);
}

export type CoverageCheck = {
  expected: number;
  actual: number;
  shortfall: number;
  ok: boolean;
};

export function checkCoverage(actualCount: number): CoverageCheck {
  const expected = expectedShotCount();
  const shortfall = Math.max(0, expected - actualCount);
  return { expected, actual: actualCount, shortfall, ok: shortfall === 0 };
}
