# Shed Designer round 2, lane 5: buildability and cut sheet

2026-10-30. Session https://claude.ai/code/session_01XpHqyfYShuVWnhpoKnwfev.

The lane was built from round 1's open items: a carpenter's read of the build steps and lane 2's cut-sheet leftovers. Two owner requests arrived through the parent session mid-run: plans for a permit or HOA desk, and a board-length limit ("I can't load up a 16 foot board in the back of my truck").

## What landed

| PR | What | Evidence |
|---|---|---|
| #11525 | Build steps fixed after reading the default 8x12, 10x12 and 12x16 start to finish | Seven tests in `instructions.test.mjs`; default total $3,048.40 to $3,026.46 (subfloor nailed with the 8d already bought; screws for door skins only) |
| #11530 | Stud-centre labels on the wall sheets spread to at least 8.5 px apart, with leaders | The narrowest gap went from 5.09 px to 8.5 px over every preset; test in `plans.test.mjs` |
| #11542 | Site plan sheet from the lot you type; cover sheet with floor area, height, materials, colours and project lines; IRC/IBC exemption note | Tests in `plans.test.mjs` |
| #11540 | 2-D sheet goods: mixed strip widths, strips from offcuts, nested gable siding | 840 floor and roof lists 4,496 to 4,453 sheets; 474 designs' upper siding 1,614 to 1,332 panels; 8x10 roof 5 to 4 |
| #11546 | Optimizer also rounds fractional LP patterns up | 217 preset and option lists: $30,676.81 to $30,649.48, 139 to 143 proven optimal, no search slowdown |
| #11550 | Longest board you can haul, default 12 ft; a long board says why; summary prices the no-limit order | Before and after per preset in the README; fuzz at 600 designs × 2 seeds and 400 × 1 is clean |

Check this table against GitHub: any PR not marked merged there was still waiting on CI when this was written.

### The build-step fixes (#11525, plus one in #11550)

- **Roof-edge layers in lapping order:** fascia before the eave drip edge, siding before the rake board, rake board before the rake drip edge.
- **Z-flashing over the head casing:** the siding nails above each head are left out until the flashing is in.
- **Door-wall bottom plates:** already in pieces on the cut sheet, so the step no longer says to cut them out.
- **Rafters on connectors:** the step now gives the wall line and tail measured on the board.
- **Site-built door:** frame, then braces, then the skin face up; hinge straps packed out to the casing.
- **Fasteners:** the steps now match the list.
- **Smaller fixes:** blocks without shims, cap-joint wording, vented eave blocks, vent openings in the siding, the post on the cap plate, a handsaw in the tool list, and a ridge board's temporary props left in until the ties are on.

## What is open

- **Ridge-beam hangers.** A sloped rafter at a ridge beam probably wants a sloped hanger (LSSU type) rather than the standard 2x6 hanger on the list. This is a product and price change, so it needs a sourced listing.
- **Pairs of doors.** A pair probably wants a cane bolt on the fixed leaf. Same problem: it needs a sourced price.
- **Sheet layouts.** The count is a buying count; no sheet has a drawn cutting layout. Triangle offcuts from tall gable panels are not reused as upper pieces.
- **Optimizer gap.** It is 0.35% ($106 over 217 lists). A pairwise board re-pack would close $14 of it, but makes the design searches 36% slower, so it was not shipped. Branch-and-price is the real fix if prices ever make this matter.
- **Site plan.** It assumes the shed's door wall faces the street, and it has no north arrow or easements; the sheet tells you to add them. A rotation setting is the next step if users ask.
- **Haul limit and overhang.** With the 12 ft limit, the default's automatic overhang went from 6" to 9" (one more shingle bundle). That is the "longest overhang that needs no more lumber" rule working as designed. If 6" is wanted, make the rule "longest within $X".
- **Worked-example facts.** `shed-plans-with-cut-list.html` has about 20 hand-kept figures that `marketing.test.mjs` checks. I refreshed them with a throwaway script that recomputes each `data-fact`. Making that script a `--write` mode of the test, or part of `make-size-pages.mjs`, would be software doing the routine.

## Next step

Merge order matters, because #11540, #11546 and #11550 all move prices. Before each merge, merge `main` in, then run `node make-size-pages.mjs` and refresh the worked-example facts.

After that, the most useful single piece of work is a drawn cutting layout per sheet good, built from `levelPack`'s sections. A builder can then cut the 8x10's four roof sheets the way the count assumes.
