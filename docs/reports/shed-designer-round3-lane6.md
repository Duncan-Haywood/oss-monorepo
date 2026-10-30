# Shed Designer round 3, lane 6: where the money goes

Session: https://claude.ai/code/session_01XpHqyg7ixNGUH3USNit4uK (2026-10-30).

## What landed

| Piece | Where | Evidence |
|---|---|---|
| Cost by assembly and by material type | `costs.mjs` (`costBreakdown`), "Where the money goes" tab (`costview.mjs`) | `costs.test.mjs`: both splits add up to the shopping list to the cent on all six presets and on six variants (every siding, metal roof, drywall, teen bedroom, insulation, glitter, gravel pad, deck blocks, ridge board); every line has an assembly and a type ("Other" never appears) |
| Lumber shared by use | `lumberShares`: each board's price split over its cuts by length, so offcut and spares follow their material | test: skids to the foundation, PT joists to the floor, studs to the walls, rafters and the ridge beam to the roof; the 2x4 shares sum to the 2x4 lines bought |
| Ranked bars, one hue, tap a bar for its lines, hover shows the top four | `breakdownHtml`, `tipHtml`, `wireCosts` | browser test: rows open with `aria-expanded`, the material view shows treated lumber; axe 0 violations on every results tab, the new one included |
| Change by assembly | `costDelta`, `deltaPhrase`, `deltaSentence`; the summary's line under the total, the tab, every option card ("Against yours") and the cheaper-build card | browser test: choosing an OSB subfloor shows "Last change: materials −$42 (floor −$42)". Switching design (option, cheaper build, a future gallery pick) reads "Against "<previous design>"" |
| Bridge to the cheapest passing design | `costBridge`, `bridgeHtml`; "Show the bridge" in the tab, and a fold-out on the cheaper-build card | test: starts and ends on the two totals, each step starts where the last ended, savings first; rounding residue under 50 cents folds into the last step |
| Phone and print | CSS in `index.html`; `data-print="costs"` prints every group's lines with the bars (`print-color-adjust: exact`) | browser test on a Pixel 7: no sideways scroll, every amount inside its row, rows at least 44 px; print PDF checked by eye |
| Palette | blue `#2a78d6` (bars, savings), red `#e34948` (rises), ink grey `#5b6157` (totals) | dataviz `validate_palette.js` on the page surface `#fffdf8`: all checks pass (CVD ΔE 21.6, normal 32.3, contrast ≥ 3:1). Every step is also labelled with a signed amount, so colour is never the only cue |
| Post | `docs/posts/2026-10-30-where-a-sheds-money-goes.md` | numbers from `costBreakdown` on the default and preset designs |

## Findings worth acting on (other lanes)

- On the default 8x12 ($3,074.14 of materials after the 12 ft board default), the skin (siding, roofing, trim, paint) is 46% and the framing 27%. All the untreated framing lumber is $503, so right-sizing (r2 lane 1) can save at most a share of that. The owner's $2,000 needs a different design (the gallery), not a trimmed one.
- **Fasteners and hardware are 14% ($420).** The 16d framing nails come to four 5 lb boxes ($100.80) and the VPA connectors to $89.46. The 16d count in `estimate.mjs` (two nails every 16" on every long member, plus per-member counts) looks high for a shed. Worth checking against a nailing schedule.
- The "8x12 classic" and other `classic()` presets have custom-size doors with no unit picked, so their doors are not in the total (the "Doors, windows and vents" group is just the vents, $46). The shopping list says so, but the preset totals undercount.

## Open, for the next run

- **Bridge target.** It uses `budget()` as it is on `main` (materials plus time at the labour rate). When r2 lane 1's "fit my budget" search or a gallery of pre-optimised designs lands, add a bridge to each, using `bridgeHtml(from, to, { toLabel })`.
- **Gallery deltas.** The "Against "<previous design>"" line already covers a gallery pick by design switch. A gallery card could show `deltaPhrase(costDelta(here, card))` the way the option cards do.
- **Per-assembly fasteners.** The fasteners are one group. Splitting the 16d nails by member group would move about $100 into the framing assemblies.
- **Section subtotals.** r2 lane 3's per-section subtotals were not on `main` when this landed. If they land, link each section's subtotal to this tab's row for the same money.

## Second PR: the gallery's price breakdown by assembly

- `designFacts` (the gallery's detail panel, `picker.mjs`) grouped a design's cost by store section ("Lumber", "Sheet goods", ...). It now uses `costBreakdown`'s assemblies, the same split as the editor's tab, so a design's price reads the same in both places. The top five are kept, with "Everything else" after them, as before. `designfacts.test.mjs` checks the names; `picker.browser.test.mjs` passes 7/7.
- Site-built trusses (#11589) are placed: the truss members go to roof framing, as do the OSB gusset sheets. A truss design with LP lap siding is in the `costs.test.mjs` sweep.
- One tsc diagnostic on `main` after #11589 (`where` on truss gusset panels, `model.mjs`) is fixed by adding `where?` to the panel type.
