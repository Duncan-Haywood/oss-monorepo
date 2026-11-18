/**
 * A drop-down in a table row is never narrower than its longest option (up to 15em).
 *
 * Measured 2026-11-14 with `select-clip.mjs` on the built site: of the 606
 * pages that carry a `<select>`, 139 cut the text of at least one default
 * choice at 390px and 192 at 1,280px. Most of those are a select in a grid
 * track whose option text is longer than the track (a page-level fix; the
 * report lists them). One class is different, and it is the worst-looking:
 * a select inside a table cell, crushed to the width of its arrow.
 *
 * Why it happens. Ventures style every control `width: 100%`. In a table,
 * a percentage width makes the select's min-content contribution to the
 * column almost nothing, so the auto table layout gives the column what
 * the header and the other cells need and the select gets the rest. On a
 * phone `reflow.mjs` adds `min-width: 0` (correctly, for grid tracks), which
 * removes the last floor. Result: service-load-check painted 31px selects
 * showing only an arrow, wall-framing-takeoff's openings table read "windo",
 * "Fron", "Righ", and eleven pages had 129 selects under 90px between them.
 *
 * The fix: a select that is a direct child of a cell gets a floor of its
 * widest option plus the arrow (`max-content`), capped at 15em. It only ever
 * widens: a select that already fits is laid out exactly as before, and
 * `min-width` wins over a venture's `width: 100%` without touching it. The
 * extra width goes to the table, and tables already scroll inside their own
 * box (`.pf-table-scroll`, `reflow.mjs`), so the page does not scroll
 * sideways.
 *
 * Why the cap. The first version was a bare `min-width: max-content`. On
 * service-load-check one option reads "Appliance on its own circuit (range,
 * dryer, water heater, EV charger, pump...)", so the Kind column grew to
 * about 580px and at 1,280px the table, which had fitted its card, began to
 * scroll with the New and Remove columns out of view. A capped floor shows
 * the first 15em ("Appliance on its own circuit (r") and leaves the table's
 * shape alone; the short options that were being cut ("window", "Front",
 * "2x10") are far under the cap. `calc-size()` is what expresses "my
 * intrinsic width, but no more than 15em" for a minimum; it is in Chromium
 * from version 129. A browser without it drops the declaration and keeps
 * today's layout, so there is no fallback that could widen a column it
 * should not.
 *
 * Zero specificity (`:where`), so a venture's own `min-width` on its cell
 * selects still wins; it has to come after `REFLOW_CSS` in the chrome so it
 * beats that file's zero-specificity `min-width: 0` on narrow screens.
 * Print is excluded: paper cannot scroll, and a printed select shows only
 * its chosen value anyway.
 */
export const SELECT_FIT_CSS = `
/* A select in a table cell is never cut below its longest option, up to 15em.
   See platform/pages/select-fit.mjs. */
@media screen{:where(td>select,th>select){min-width:calc-size(max-content,min(size,15em))}}
`;
