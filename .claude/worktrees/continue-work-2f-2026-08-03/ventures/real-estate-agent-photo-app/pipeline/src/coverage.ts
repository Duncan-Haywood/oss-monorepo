/**
 * coverage.ts — sanity-checks a processed shoot against
 * process/capture-checklist.ts's expected shot count.
 *
 * This can't verify *which* rooms were captured (that needs vision, not
 * file counting), but a simple count check catches the most common
 * concierge-shoot mistake: leaving with fewer photos than the checklist
 * calls for, which costs a second on-site trip to fix after the fact —
 * see process/capture-checklist.ts's preShootPrep doc comment.
 */

import { totalShotCount } from "../../process/capture-checklist";

/**
 * Total distinct photo shots expected, excluding the wrap-up review step
 * (not a photo). `additionalBeds`/`additionalBaths` are bedrooms/bathrooms
 * beyond the primary suite; omit both to fall back to a typical mid-market
 * home (see process/capture-checklist.ts's `totalShotCount`).
 */
export function expectedShotCount(additionalBeds?: number, additionalBaths?: number): number {
  return totalShotCount(additionalBeds, additionalBaths);
}

export type CoverageCheck = {
  expected: number;
  actual: number;
  shortfall: number;
  ok: boolean;
};

export function checkCoverage(actualCount: number, additionalBeds?: number, additionalBaths?: number): CoverageCheck {
  const expected = expectedShotCount(additionalBeds, additionalBaths);
  const shortfall = Math.max(0, expected - actualCount);
  return { expected, actual: actualCount, shortfall, ok: shortfall === 0 };
}
