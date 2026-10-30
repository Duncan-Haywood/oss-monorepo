# Shed designer, round 4 lane 2: saltbox, plus gambrel and lean-to depth

Session 2026-10-30. Built from the "Open" and "Next step" sections of `shed-designer-round3b-lane1.md` (the lean-to) and `shed-designer-round3b-gambrel.md`.

## What landed

| PR | What |
| --- | --- |
| #11862 | **Saltbox engine.** See [Saltbox engine](#saltbox-engine-11862) below. |
| #11899 | **Saltbox page.** See [Saltbox page](#saltbox-page-11899) below. |
| #11905 | **Gambrel gusset plywood check, and barn knobs in the search.** See [Gambrel gussets and search knobs](#gambrel-gussets-and-search-knobs-11905) below. |
| #11911 | **Loft access.** See [Loft access](#loft-access-11911) below. |
| #11910 | **Lean-to clerestory windows.** A front-wall layout "eave door and clerestory windows": the door 12" from the left corner, then a row of fixed 23 x 12 transoms (`swm-t2312`) with sills 6" over the door head. It is seeded for lean-tos only. |
| #11917 | **Gambrel wind uplift and tie brace.** See [Gambrel wind](#gambrel-wind-11917) below. |
| #11920 | **The saltbox in the design search.** `style` includes `'saltbox'`, with the front at twice the back's pitch and trusses pinned to a ridge board. It has its own looks rule. This report and the run record also land here. |

### Saltbox engine (#11862)

- **`saltbox.mjs`.**
  - `roofSides`: the ridge sits where the two rafters' top lines meet.
  - `threeHinged`: the rafter pair's statics.
- **`model.mjs`.** `style: 'saltbox'` with `frontPitch` (clamped to between the back pitch and three times it). Every ridge-side element is per side:
  - rafters (two cuts), eave blocks, ties, fascia, soffit, rake;
  - sheathing, siding, lap courses and trim;
  - gable studs, vents and posts at the ridge.
  - A ridge-beam post gets a skid under it.
- **Checks.**
  - Two rafter rows.
  - Heel nails for H = w·a·b/2h.
  - Per-wall loads (`eaveWallLoads(d, wall)`).
  - Uplift on the worse side.
  - The ridge beam, conservatively, with the steep side's dead load over its whole strip.
- **Estimate and storage** go by each slope.

### Saltbox page (#11899)

- **Plan sheets:**
  - gable framing roof line;
  - roof plan;
  - section, with two pitch marks;
  - elevations;
  - a rafter detail per slope;
  - sheathing layout.
- **Editor:** end-view peak off centre; dragging it moves both pitches.
- **Other surfaces:**
  - 3D labels;
  - two rafter patterns in the build steps;
  - HOA elevations and plan.
- **The preset** "8x12 saltbox" is in the New design menu, with its renders.
- **Also fixed:** the HOA roof plan no longer draws a ridge on a lean-to.

### Gambrel gussets and search knobs (#11905)

- **Capacities.** APA Panel Design Specification D510-2020, Table 9: Rated Sheathing 32/16, the 3-ply column (lowest, PDS 4.8), across the strength axis. PDS 4.5.5 size factor.
- **Method.** The knee moment is checked as edge stress. That method is ours, and the row says so.
- **Finding.** The knee gussets were 334% on the barn preset.
- **Fix.** They now reach into the corner, sized to 85% (the heel nailing's HEEL_TARGET), up to PDS 4.4.5's 24".
- **Search knobs:**
  - `gambrelLower`;
  - `gambrelKnee` (a fifth, a quarter or a third of the width);
  - `loft`.
- **Opt-in objective `usable`:** the room, plus roof space that is open or decked.

### Loft access (#11911)

- **Half loft.** A site-built ladder: 2x4 rails 16" apart, 2x4 rungs 12" apart (OSHA 1910.23: 10" to 14"), leaning 1 in 4 on the loft's edge joist.
- **Full loft.** A 22-1/2" x 30" hatch (IRC R807.1), with a warning when the joist bay is narrower than 22".
- **Placement.** The ladder moves clear of a gable-end door. On a shed too short for the ladder's lean, it is left out.
- **Also:** a ladder detail sheet and build steps.

### Gambrel wind (#11917)

- **Load case.** ASCE 7's 0.6D + 0.6W, using the user's single wind figure as uplift on plan, solved through the same frame.
- **Finding.** At 20 psf a no-loft barn's frame reverses, and its unbraced 2x4 tie (le/d 78) checked at 155%.
- **Fix.** A 2x4 brace along the ties at mid-span, as the gable trusses get. It costs $7.72.

Posts, one per PR:
- `2026-10-30-a-saltbox-roof-framed-and-checked.md`
- `2026-10-30-drawing-a-saltbox.md`
- `2026-10-30-the-barn-gusset-was-too-small.md`
- `2026-10-30-a-way-up-to-the-barn-loft.md`
- `2026-10-30-clerestory-windows-on-a-lean-to.md`
- `2026-10-30-wind-turns-a-barn-tie-into-a-column.md`
- `2026-10-30-the-search-tries-saltboxes.md`

## Findings worth keeping

- **The saltbox is a looks choice.**
  - An 8x12 saltbox costs $26.73 over a 6/12 gable of the same finishes, for about the same space (677 against 675 cu ft), and $82.23 over a 5/12 gable.
  - In a 600-design search under 100 sq ft, saltboxes took 12 of 54 front designs, plus the most-storage and best-looks picks.
  - A ridge-board gable is still the cheapest: $2,572.02, against $2,820.79 for the cheapest saltbox.
- **An unequal rafter pair under an even load still puts equal reactions on both walls,** w(a+b)/2. Its tie force is w·a·b/2h, less than a gable's of the same width.
- **The steep front rafters of a saltbox are very lightly used** (2x6 front at 8%, back at 35%). The tool still uses one rafter size for both sides.
- **The barn's knee gussets were the weak link, not the nails.** A gusset no deeper than the chord carries the whole knee moment across a 3-5/8" strip. Reaching 3-1/4" into the corner fixes it at no extra price on the preset.
- **Wind reverses a shallow-topped barn at 20 psf.** The tie becomes a column. Every barn without a full loft now gets a brace when that happens.

## Verification

Runners were often starved, so verification was local:
- the full venture suite once per PR (the latest: 466 tests, 0 fail, 3 skipped for missing axe-core);
- after the final merge of `main`, the test files the conflicts touched (named in each merge message);
- `node platform/pages/typecheck.mjs shed-designer`: 0 diagnostics;
- `make-renders.mjs --check` up to date.

Gable, lean-to and barn output was snapshot byte-identical to `main` where a change should not touch it:
- 68 designs' members, panels, notes and totals;
- 48 designs' plan sheets;
- the build steps;
- the HOA packets.

I read the saltbox section, framing, rafter details, elevations, HOA packet, 3D hero and the barn truss and ladder sheets by eye. About 1,300 random saltboxes went through `invariants()`.

## Open, and the next step

1. **Lane 3, the gallery and search defaults.** Three things are waiting for that lane:
   - the opt-in `usable` objective;
   - the new gambrel knobs and `'saltbox'` in `style`, which are not in the gallery's searches (`OTHER_STYLES` and the barn search pass their own lists; the barn search does pick up the gambrel knobs);
   - the looks score, which gives a clerestory row nothing (no symmetry points), so no clerestory lean-to reached a front.

   `gallery-data.mjs` was not regenerated; drift is reported, not failed.
2. **Saltbox rafters by side.** The front could take a lighter size than the back (one `rafterSize` today).
3. **Saltbox trusses** are not modelled; a saved truss saltbox builds with a ridge board.
4. **ASCE 7's zoned gambrel wind pressures** are not modelled. Wind is the user's single figure as uplift, and sideways racking of the trusses is not checked.
5. **The renders budget** is at 1,058 KB of 1,100 KB. The next preset needs the budget raised or a view dropped.
6. **Loft ladder.** It has no handhold above the loft floor; the notes say so. Rails or a grab bar reaching above the landing are not modelled.
