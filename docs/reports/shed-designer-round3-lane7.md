# Shed designer, round 3, lane 7: foundation, floor, doors and windows as cost levers

Run of 2026-10-30. The brief came from the owner's walk-through with a builder on 2026-10-29: a shed under 100 sq ft, about $2,000 against about $3,000 for the default, every part in play for cost, and some choices (siding, roofing) fixed to match the house.

## What landed

| PR | What |
| --- | --- |
| #11551 | Floor joists at 16" or 24" and 2x4 to 2x8 as search moves. A **Subfloor** row checks the joist spacing against APA's Sturd-I-Floor span rating (23/32" T&G = 24 oc). Adhesive tubes scale with joist spacing. `levers.mjs` started. |
| #11555 | `costlevers.mjs`: the **part options table** ("Price the options", under Options made for you). It frames, prices and checks every foundation, floor, door (site-built 36" to 72", a pair over 48", every stock door) and window (none, or each stock size) alternative against your design. Each row gives the change in materials, hours and peak, the checks it fails, and a site-prep, access or light note. "Use this" is undoable. |
| #11562 | **Your limits and fixed choices**: the floor-area and peak limits, plus six "keep as I chose" boxes (siding, roofing, foundation, floor, doors, windows) stored as `design.locked`. `budget`, `simplify` and the options table honour them. `fixedKeys(design)` and `LEVER_KNOBS` are exported for r3 lane 1's `searchDesigns({ fixed, knobs })`. |
| this PR | **Concrete piers**: a 12" form tube (Quikrete 692203) to a pier depth you set (frost depth; 24" default), 4" above grade, with Quikrete 80 lb bags at 0.6 cu ft. Piers are drawn and checked as the equal-area 10.2" square, so the r2 soil and skid checks (PR #11531) get the true round area. Build steps cover 811, frost depth, cutting the tubes, a string line and the cure. Priced in the options table and the searches. |

Posts:
- `2026-10-30-a-shed-floor-at-24-inches.md`
- `2026-10-30-what-each-shed-part-costs.md`
- `2026-10-30-concrete-piers-under-a-shed.md`

## Findings (8x12 starter, materials before tax)

- **Floor:**
  - joists at 24" save $27.98;
  - 2x4 joists save $47.85, at a **scaled** price (no readable PT 2x4 listing);
  - an OSB subfloor saves $41.58.
- **Windows:** dropping both saves $139.80 and about 3.3 hours, at the cost of daylight.
- **Doors:**
  - a 60" site-built pair costs $76.24 more than the 38-1/2" site-built door;
  - stock prehung doors cost $219 to $564 more and save about 2 hours.
- **Foundation:** blocks on tamped soil are cheapest. Options cost up to $422 more (deck blocks on a full pad). Piers add $165 (12" deep) to $531 (48" deep) over the starter's blocks on gravel beds, footings included (follow-up PR: a bare 12" tube failed PR #11531's soil check at 1.63; a 16" square, 6" footing pad brings it to 0.66 for $106.38, cheaper than about six more piers).
- **With siding and roofing fixed,** the cheaper-build search still finds $170.88 (joists, subfloor, overhang, rafters).
- **No single lever in this lane gets close to the $1,000 gap.** The big money is in siding, roofing, framing and size (r3 lanes 1 and 6).

## Prices to check (a person should confirm)

- **12" x 48" form tube:** $13.99 is Ace Hardware's listing. Home Depot (100318546) and Lowe's (item 10150) showed no readable price.
- **Quikrete 80 lb concrete:** $5.91, read from a search result of Home Depot's category page, undated.
- **PT 2x4:** still scaled from PT 2x6 (r2 lane 2 is filling missing prices).
- **Lowe's prices** for the tube and the concrete: none found, so neither is in the Lowe's list.

## Deviations

- **No-floor variant: evaluated, not built.** The floor and its supports on the starter cost about $444. That covers:
  - PT 4x4 skids;
  - PT 2x6 joists and rims;
  - three 23/32" T&G plywood sheets;
  - adhesive;
  - 12 blocks.

  A floorless shed needs a full gravel pad (about $296 to $328 here) plus a PT perimeter timber under each wall, so the saving is perhaps $40 to $130, and you lose a dry floor (rodents, damp, frost). It also cuts across the framing engine, the connection checks, the floor sheet, the section, the wall detail and the steps, where about 15 agents are working. It is the next step if the owner wants it (below).
- **Opening framing** (headers, kings, jacks, door snapping) is left to r2 lane 1. The options table uses the model's framing as it is.

## Open, and the next step

1. **No-floor shed on a gravel pad**, as `floor: 'none'`. Walls bear on PT 4x6 perimeter timbers bedded in the pad: no skids, no joists, no subfloor. Under a ridge beam each post needs a footing (a pier). It also needs:
   - a connection check that the bottom plates bear on the timbers;
   - drawings without the floor framing sheet;
   - honest notes on damp and rodents.
2. **Pier spacing.** Piers use the block layout (no more than 4 ft apart). Once PR #11531's skid-on-blocks check is on `main`, a wider pier spacing could be searched, letting the skid check decide (fewer, deeper piers).
3. **Windows that fit a stud bay.** A 14-1/4" rough opening fits between studs at 16" o.c., which could drop a king and jack each side. This belongs with r2 lane 1's opening framing.
4. **Wire `LEVER_KNOBS` into `designsearch.mjs`** (r3 lane 1), so its search also tries 24" joists, piers and the gravel options.
5. **Lowe's listings** for the form tube and concrete, from a store page with a store selected.

Not engineered or code-checked; every check here is a screening check.
