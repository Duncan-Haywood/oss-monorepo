# Shed Designer round 3b, lane 4: design detail and compare view

Session: https://claude.ai/code/session_01XpHqyg18KFJ7wq52yKE93G (2026-10-30). PR #11559.

## What landed

| Piece | Where | Notes |
|---|---|---|
| Facts for one design | `designfacts.mjs` (pure) | `designFacts(design, { prices, reason, id })` returns the price and a breakdown by shopping-list section (top 5 plus "Everything else"; it adds up to `estimate().total`), footprint, wall height, peak, storage, per-$100 figures, style, siding, roof, openings with products, framing, and the most-used member from `structuralChecks`. `compareRows(facts[])` gives the compare rows with `differs` and `best` (ties within 0.5% share best). `tradeOff(f, all)` returns the entry's own reason, or else what it does best among those shown. Tests: `designfacts.test.mjs`. |
| Strip, detail and compare | `picker.mjs`, `#starts`, `#pick-dialog` and `#compare-tray` in `index.html`; 14 lines in `app.mjs` | The strip renders thumbnails one at a time after load. The detail and the compare are a native `<dialog>`: focus moves in, Escape closes, and focus goes back to the opener. Compare allows at most 3; a fourth replaces the oldest. The grid takes one column per design with the labels spanning the row, so it fits a phone. "Best" is a word tag, not colour alone. |
| Browser tests | `picker.browser.test.mjs`, added to `shed-designer-browser.yml` | 6 tests: re-pricing when a price is typed; detail contents and three distinct renders; Escape and focus return; "Start from this design"; compare cap, cheapest tagged best and differences-only; phone fit; axe on the strip, the detail and the compare. |
| Post | `docs/posts/2026-10-30-what-a-shed-holds-per-hundred-dollars.md` | Real numbers from the six presets. |

How storage is measured (also in the `designfacts.mjs` header):

- **Floor:** inside the studs.
- **Volume:** that floor times the wall height, plus the gable prism.
- **Shelf wall:** the inside wall length with no opening in it.
- **Headroom:** to the underside of the ridge beam on an open roof, or to the plates under rafter ties.

## Boundary with other lanes

- **r3 lane 2 (gallery cards).** Any element with `data-detail="<id>"` opens this panel, and `data-compare="<id>"` toggles the compare. Their cards can carry those attributes and replace the `.pick-list` strip; the panel, tray and compare stay in `picker.mjs`. The ids must be ones the picker has, from `presetEntries()` or `setEntries`.
- **r3 lane 1 (design search).** `mountPicker(...)` returns `setEntries([{ id, title, design, reason }])`. Feed it the search's optimised designs, under 100 sq ft, with the trade-off as `reason`. This is not wired yet: `designsearch.mjs` was not on `main` when this landed.
- **r3b lane 3 (renders).** `shot(id, view)` in `picker.mjs` is the one place renders are made: the live WebGL viewer, snapshotted from three camera angles. Swap in their renders there.

## Open, next step

1. **Wire the search's designs into `setEntries`** once `designsearch.mjs` lands. The six old presets are mostly over the owner's 100 sq ft limit (10x12, 12x16) and are not optimised. This is the most valuable next step.
2. **Re-pricing on price edits** landed: typing a lumber, item or delivery price re-prices the strip 500 ms after typing pauses (`reprice()`, browser-tested).
3. **The compare tray is sticky** only while the strip's container is on screen. That is fine while picking, but it could be fixed at the bottom if users compare from further down.
4. **Usage counting** reuses the existing `compares` event for opening a detail or a compare. A separate `details` event would need `usage.mjs` and its README line.
