# Shed designer, round 4, lane 5: floorless and foundation options

Run of 2026-10-30. The brief came from round 3 lane 7's "Open" list:
- a no-floor shed;
- pier spacing as a search knob;
- Lowe's listings for the form tube and concrete;
- the options available to the search and the gallery.

## What landed (PR #11861)

- **`floor: 'none'`** (default `'framed'`; nothing changes unless you choose it).
  - **Model (`model.mjs`):**
    - no skids, blocks, joists or subfloor;
    - four or more ground-contact PT 4x6 perimeter timbers on edge (`kind: 'perimeter timber'`, `PERIMETER_TIMBER`) on a full 4" gravel pad, spliced at the haul limit;
    - PT bottom plates;
    - under a ridge beam, a pier (12" tube on a 16" square footing, `pierDepth` below grade, top level with the pad) under each gable post (`kind: 'post pier'`, `dims.postPiers`).
  - **New dims:**
    - `floorless`, `timber` and `pierCount`;
    - `sidingBottom`: the siding laps 1" over the timber, 4-1/2" above the gravel.

    Siding layout, lap courses, vinyl corners and the HOA drawing use `sidingBottom ?? skidTop`.
  - **Checks (`floorless.mjs`):**
    - timbers on the soil: the heaviest wall line, spread 2" each side through the gravel, against 1,500 psf (IRC R401.4.1);
    - bottom plate on the timbers: the worst point load (post, jack under a header, eave stud) against Fc⊥ of wet SYP No. 2 (565 x 0.67);
    - post piers on the soil: the post plus 145 pcf concrete.

    `structuralChecks` swaps these in for the floor-joist, subfloor and skid rows. `anchorage` tips about the eave timbers. `utilisation.mjs` has rows for them, and `invariants.mjs` expects the timber row in place of floor joists.
  - **Connections:** bottom plates bear on the timbers, the timbers on the pad, and the posts on a pier.
  - **Drawings:**
    - the floor framing sheet is dropped;
    - the foundation plan shows the timbers and piers;
    - the section and the "wall on a perimeter timber" detail are drawn;
    - the nailing schedule rows and the spec rows follow.
  - **Build steps:**
    1. strip the pad;
    2. pour the post piers;
    3. fill the pad;
    4. lay the timbers;
    5. frame the walls on a flat surface and nail them down into the timber.
  - **Notes on the design:**
    - damp;
    - burrowing animals (hardware cloth, unpriced);
    - the 5-1/2" door step;
    - the lap-siding clearance warning, which has a floorless remedy text.
  - **UI:** a Floor select in the Foundation fieldset. Options table: "No floor" in the Floor group. On a floorless design the table offers "Framed floor back", and every foundation row says "with a framed floor".
- **`blockSpacing`** (24" to 96", default 48"). It sets the block or pier layout along each skid, and the build steps say the spacing. The options table prices 5, 6 and 8 ft against the current block foundation. `LOCKABLE.foundation` holds it.
- **Search:**
  - `LEVER_KNOBS` gains `floor: ['framed', 'none']` and `blockSpacing: [48, 72]`, and both are polish moves.
  - `designsearch.mjs` keeps the design's own floor unless `opts.knobs.floor` asks for both. No floor is a different shed (damp, burrowers), so it is opt-in, not a silent saving.
- **Lowe's:** Quikrete 80 lb concrete, item 10385, model 110180, $6.24 ($5.93 at 42+). This is a search-result copy of the product page, read on 2026-10-30, undated.
- **Renders:** redrawn, because the design hash covers the two new fields. The pictures are the same sheds.
- Post: `docs/posts/2026-10-30-a-shed-with-no-floor.md`.

## Findings (8x12 starter, materials before tax)

- **Starter:** no floor costs **$15.82 more** than the starter's framed floor on blocks with gravel beds.
  - Dropped: the floor framing and subfloor (about $235).
  - Added: the full gravel pad ($244) and the two post piers (about $50).
- **Same full pad:** against a framed floor on a full gravel pad, no floor saves **$196.48**.
- **Ridge board (no post piers):** no floor saves **$61.20**.
- **Height:** the peak drops 8-1/4".
- **Checks on the starter:**
  - timbers on the soil 0.22 (206 lb/ft);
  - plate bearing 0.28 (the 1,099 lb post on 10.5 sq in);
  - post piers 0.55.
- **Block spacing:** 5 ft gives the same count as 4 ft on a 12 ft skid (four blocks). 6 ft fails the 4x4 skid's bending check, so the 4 ft default stands. Wider spacing may pass with 4x6 skids; the search can now find out.
- **Opt-in search** (budget 1,200, every size under 100 sq ft):
  - the cheapest passing framed design is $2,302.23 (an 8x10 gambrel on blocks on tamped soil);
  - the cheapest passing floorless design is $2,402.84;
  - 6 of the 55 front designs are floorless (on storage or looks, not cost).

  No floor does not beat blocks on tamped soil on cost.

## Prices to check (a person should confirm)

- **Lowe's 12" x 48" Quikrete form tube** (item 10150, model 692203): the product page showed no readable price, so it is not in the Lowe's list. Search-result copies of category pages showed $14.68 to $19.98, but none could be tied to this product.
- **Lowe's Quikrete 80 lb:** $6.24 from an undated copy. Category pages showed $6.98.

## Deviations

- **Timbers on edge, not flat.** On edge, a 4x6 lifts the siding to 4-1/2" above the gravel; flat, it would be 2-1/2". It is still under the 6" lap-siding makers ask for, and the tool warns. A 6x6 or a doubled course would clear it; this was not modelled.
- **The gravel pad stays 4" deep and 12" past the walls for a floorless shed.** A pad only inside the walls would cut about $90 of stone, but drip and splash at the eaves need the apron. Not offered.
- **No anchorage to the ground for the timbers** beyond the existing anchorage check: anchoring is lane 1's.
- **The gallery is not regenerated here.** Lane 3 owns it. To show floorless picks, pass `knobs: { floor: ['framed', 'none'] }` to the gallery's `searchDesigns` calls (`gallery.mjs`).

## Open, and the next step

1. **Gallery (lane 3):** decide whether a "no floor" pick belongs. Opt-in search puts it on the front, but never as the cheapest.
2. **Lap-siding clearance on a floorless shed:** offer a 6x6 timber, or Z-flashing with the siding stopped at 6".
3. **A pad only inside the walls,** as an opt-in with an honest drip/splash note.
4. **Lowe's form tube price** from a store page with a store selected.

Not engineered or code-checked; every check here is a screening check.

## Follow-up fix (same day)

Lane 2 found that a floorless 2x6-wall shed failed "Bottom plates bear on the timbers". The cause was a plate piece next to a door: it was 4-1/2" long and 5-1/2" deep, and the check took the plate's direction from its bounding box, so it read the piece as running the wrong way.

- **The fix:** the direction now comes from the plate's wall. The case is pinned in `floorless.test.mjs`.
- **A new floorless fuzz pass** in `fuzz.test.mjs` found one more bug: the teen-bedroom rug and beanbags floated at the top of the timbers. They now sit on the gravel.
- **Wide fuzz:**
  - seed 201: 1,200 floorless designs, 0 failures;
  - seed 7: 1,000 designs, 1 failure, a siding-joint check that fails on the framed version of the same design too, so not from the floorless work.
