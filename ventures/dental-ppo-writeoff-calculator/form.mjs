/**
 * What each plan row in the table should show when restoring a saved
 * scenario (or the shipped worked example).
 *
 * The page ships with four example plans in the first four of six blank
 * rows. If a practice later saves a scenario with fewer than four plans and
 * returns, restoring by only writing the saved plans into rows 0..n-1 would
 * leave rows n..3 holding the *example's* plan names and dollar figures --
 * still filled in, never touched, not blank. `readPlan` in calc.mjs treats a
 * row as blank only when its name, production and write-off are all empty,
 * so those leftover example rows would be counted as real plans and folded
 * silently into the practice's own totals. This is the same
 * clear-not-leave-stale defect `platform/ci/check_shared_link_clears.py`
 * guards for a shared link, arrived at here through a saved-scenario restore
 * instead of a URL.
 *
 * `resolvePlanRows` returns one entry per row that must exist afterward --
 * growing to fit more plans than there are rows, and always as many entries
 * as there were rows already, so a shorter incoming list clears the rest
 * rather than leaving them alone.
 */
export function resolvePlanRows(existingRowCount, plans) {
  const list = Array.isArray(plans) ? plans : [];
  const count = Math.max(Number(existingRowCount) || 0, list.length);
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const plan = list[i] ?? {};
    rows.push({
      planName: plan.planName ?? '',
      grossProduction: plan.grossProduction ?? '',
      writeOff: plan.writeOff ?? '',
    });
  }
  return rows;
}
