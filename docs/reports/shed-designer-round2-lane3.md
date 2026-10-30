# Shed Designer round 2, lane 3: editor UX and clarity

Session: https://claude.ai/code/session_01XpHqycJA9kKp6yr4akmWLq (2026-10-30). Built from the "Open" sections of round 1's lane 3, 4 and 5 reports.

## What landed

Eight stacked PRs, landed together through #11545, each with a browser test that fails on the code before it (except where noted) and passes now. Then a second stack, from the owner's walkthrough feedback that the parent session relayed: see the second table.

| PR | What | Evidence |
|---|---|---|
| #11518 | A cleared or junk number box keeps the design's last value. Leaving the box puts that value back, with no rebuild and no undo step. Opening fields too. | Browser test: wall height, length and an opening's width. |
| #11532 | A site-built door warns when its Z brace runs under 25 or over 65 degrees (a 12" leaf gave 1 degree). **Bug found on the way:** typing a size on a site-built door silently switched it to "Custom size". It now stays site-built. | Unit test (starting door 47 deg, 60" pair 56, 12" leaf 1, 20" leaf 70) and a browser test. |
| #11533 | `estimate().notes`: a siding note with the panel prices and column counts, explaining why 114" walls on the 8x8 cost less than 112" ($2,880.00 against $2,911.31). The status line and the Undo tooltip say undo is per design. | Unit test pins the price step; browser test. |
| #11534 | A steep peak drag grows the end view's viewBox upward as you drag, in the same coordinates. 3D label sizes are read once per `show()`. | Browser tests: the viewBox stayed at 192.5 before; 74 `offsetWidth` reads for 18 labels over 8 frames before, at most one per label now. |
| #11535 | `catalogueRange(kind, width)`: custom-size openings show a typical range (single doors $246 to $615 across 5; doubles over 44" $465 to $585 across 2; windows $47.75 to $86.45 across 8). A new box, `customRange` (off by default), counts each at the range median as a line marked "estimate", with no listing link. | `prices-honesty.test.mjs`; browser test. |
| #11538 | First-time-user pass. Phone: the cost panel starts about 1,340 px (1.6 screens) below the plan, so a floating total pill showed while the panel was off screen (replaced by #11544). Desktop: `.editors` no longer stretches to the 3D column's height, which had left large blank areas and pushed the end view below the fold. Blog post. | Browser test: on a laptop the plan's section is under 160 px taller than its drawing. |

| #11544 | Sticky section bar at the top: Total, Shopping list, Cut sheet, Parts list, Structure, Plans, How to build, Print all. The total moved here from #11538's pill, which CI showed could sit over a door on a phone. **Leave out** column beside "Have it": the line stays on the list struck through, and comes off the total with its tax (state `skip`, saved like `have`). "Materials, sales tax and delivery only" under the total. | Browser test. |
| #11545 | `boardUse` and `lumberUses`: each cut-sheet board says `16 ft → 2 x 7' 9" floor joist (C)`, and each lumber line "for rafter x 12, eave blocking x 8, header x 4". | Unit and browser tests. |

### Second stack (owner feedback)

| Branch / PR | What | Evidence |
|---|---|---|
| options | `designDiff(a, b)`: settings in plain words plus member counts by kind. It is on every option ("Make options") and every saved design card, with the price against the design you're editing. It showed that "Lower roof, 3/12" drops the gable vents (-4 vent header), which its label never said. | `candidates.test.mjs`; browser test. |
| pan | 3D pan: right-drag, Shift-drag, two fingers, Shift and the arrow keys. The target is clamped to 0.4 of the fit distance, and Reset and the preset views clear it. | Browser test (clamped, reset, mouse, touch). |
| opening cost | `openingCosts`: each opening's "costs in all" is the shed with it less the shed without it, with walls, pitch and overhang held at their built values. Not holding them charged the door $204.99 instead of $124.23. Custom sizes say the unit is not priced. Filled 400 ms after an edit. | Unit test; a browser test checks that removing the window saves what its column said. |
| subtotals | `sectionTotals`: a subtotal row closing each shopping-list section (page, print and CSV), and "Where the money goes" (the top five) in the summary. A test pins that sections are contiguous, which the subtotal rows rely on. | Unit and browser tests. |
| xref | "Show in 3D" on every lumber line, cut-sheet board and part. The pieces are drawn in orange after a depth clear, so they show through siding. Their marks are highlighted on the plan sheets too. A box names the pieces and links to the build step that names their mark, the plan sheets, the cut sheet and the parts list. Clicking a board in 3D picks it by projecting member triangles (CPU, on click only). | Browser test; axe run locally (axe-core 4.13.0) passes. |

Also #11521: fixed `main`, where wall-framing-takeoff's `next:` in `flagships.yaml` was over its 2,000-character cap, which turned `validate` red on every PR.

## Open, for the next run

- **Sticky bar and handles.** The top bar is about 49 px tall. `html { scroll-padding-top: 64px }` keeps anything scrolled into view clear of it, but a person scrolling by hand can still put a plan handle under it.
- **Cross-reference gaps.** Sheet goods, siding, hardware and trim lines have no "Show in 3D": panels and fixtures have no part marks. 3D picking finds framing members only, not panels, so a click on siding picks the stud behind it. Door-frame parts (`doorParts`) have no geometry, so they can't be highlighted. The build-step link is the first section whose text names the mark; a mark that appears only in a later section links there.
- **Opening costs** rebuild the shed once per opening (about 30 ms each once warm). That is fine for a few openings, but a design with 15 would want a cache keyed per opening.
- **Option diffs** list at most four member-kind changes.
- **Renderer edits mean new pictures.** `make-renders.mjs` hashes the shader source and the body of `draw()` into each preset picture's scene hash. Any edit to `draw()` in `render3d.mjs` (pan and highlight did) turns `renders.test.mjs` red until `node ventures/shed-designer/make-renders.mjs` is run, even when the pictures come out pixel-identical.
- **One picker.** Lane 8 (`utilisation-ui.mjs`) and this lane both act on a click in the 3D view: lane 8 fills `#pick-info` when the structural colours are on, and this lane opens the cross-reference box. Both now use the same ray picker (`pick` in `render3d.mjs`, which accounts for pan).
- **Catalogue range is coarse.** Windows are compared with all 8 windows whatever their size, so a 14 x 21 and a 24 x 36 share one range. With more units, filter by rough-opening area.
- **Quote emails** list an opted-in custom opening as "custom size: typical range ... counted at the median". That reads honestly to a store, but it could instead ask "please quote a unit for this rough opening".
- **Siding note** is shown whenever a 9 or 10 ft panel or a strip is used, which is nearly every design. A sharper version would price the next wall step and only say so when it is cheaper.
- **Starting design warns.** A first-time visitor's very first view has a "Check these" warning (the peak is over the 8 ft limit). That is the owner's spec, and the warning says how to fix it, but it is the first thing a newcomer reads.
- Axe was not run locally (no axe-core in the container). CI's `browser-test` runs it.

## How to drive the page

As in round 1's lane 3 report, plus: `#jump [data-jump=panel-…]` for the section bar, and `#total-pill-n` for the total in it; `#shopping input[data-skip]` for Leave out; `button.xref-btn` (`data-xref-lumber`, `data-xref-marks`) and `#xref` for cross-reference; `#openings td[data-cost]`; `#customRange` for the range box; `input[data-i="0"][data-k="height"]` for opening fields. Scroll an editor into view (`scrollIntoViewIfNeeded`) before driving it with the mouse. Compare screenshots with `Buffer.equals`, never `assert.deepEqual`: a failing deepEqual on two PNG buffers builds a diff big enough to get the test process OOM-killed with no output.
