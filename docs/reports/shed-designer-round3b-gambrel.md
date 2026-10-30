# Shed designer, round 3b lane 2: the gambrel (barn) roof

Lane: a gambrel roof as a fully modelled style, with framing, checks, plans, 3D, cut sheet, build steps and prices, an optional loft, a storage measure against a gable, and a place in the design search and the gallery. 2026-10-30.

## What landed

| PR | What |
| --- | --- |
| #11619 | Engine. `gambrel.mjs`: shape, truss parts, and a three-hinged frame solved by statics (held to the closed form within 0.2%) under snow on both sides and on one. Checks: chords (NDS 3.9.2), tie (tension, or tension with bending under a loft, NDS 3.9.1), knee and peak gusset nails (elastic method, NDS yield-limit Z for an 8d common through 15/32" plywood, 61 lb), heel nails, seat bearing. Optional loft (`loft: 'half' or 'full'`, 20 psf, IRC R301.5). `storage.mjs` (`dims.section`, the roof's underside across the width). Connections, estimate (gusset plywood, loft floor, nails), render colours. Gable-vent framing fixes the fuzz found: studs next to trimmers, and cripples under the sill and over the header at siding joints. Gambrels are in the fuzz sweep (a quarter of designs). |
| #11636 | Page. Gambrel in the Shape menu, with its own fields; the end-view editor; the 10x10 barn preset. Plan sheets via `gambrel-sheets.mjs`: section, roof plan, gambrel truss detail, gable-wall roof line, exterior elevations, cover, nailing schedule. Build steps. HOA packet elevations. Fixes: lap-siding courses bend at the roof line, and `utilisation.mjs` has gambrel rows. `gambrel.browser.test.mjs` is in CI. The renders budget went from 900 to 1,100 KB. |
| this PR | Search and gallery. `style: 'gambrel'` in the design search, with looks terms for a barn (half marks for no overhang). A fixed `roofType` other than ridge board rules out lean-to and gambrel. A "Barn for storage" gallery card from its own gambrel-only search; the other cards stay gables and lean-tos. Labour minutes for chord cuts and gambrel gussets. |

Posts:
- `2026-10-30-a-barn-roof-for-the-same-money.md`
- `2026-10-30-drawing-a-barn-roof.md`
- `2026-10-30-the-barn-took-six-of-ten-cards.md`

## Findings worth keeping

- On a 10x10 with 86-1/2" walls, the gambrel encloses 900 cu ft for $3,228; a 6/12 gable encloses 756 cu ft for $3,216. More than twice the space is above the walls.
- Let into the gallery searches, barns took six of the ten cards. Its own card is a 7x14 in lap siding and shingles: $3,168, 806 cu ft, 255 cu ft per $1,000. The lap-sided gable cards run 202 to 251.
- Gambrel trusses are very lightly used: 2x4 chords at 16" check at about 10%. The gusset nails and the heel govern.

## Open, in order of value

1. **Plywood gusset strength** (panel shear and bending at the knee) is not checked, only its nails. APA's Panel Design Specification gives the capacities; cite it before adding them.
2. **Wind and uplift on the gambrel trusses** are not checked. Unbalanced snow is "snow on one side only", a screening proxy, not ASCE 7's gambrel provisions.
3. **No eave overhang or flared kick** on a gambrel. Some barns have a short one, framed as a kicker at the foot.
4. **The search does not vary `gambrelLower`, `gambrelKnee` or `loft`.** Adding them as knobs, plus a storage objective that values a decked loft, would let it find better barns. Peak is the binding limit (13 ft).
5. **The loft has no ladder or access opening** in the model or the steps.
6. **Not mine (lap lane):** `FUZZ_SEED=11` design 403, a gable truss shed with LP lap siding, has one lap butt joint at 168" with no stud behind it. It fails identically on `main`.

## Next step

Add the gambrel's shape (lower slope 18 to 24, knee a fifth to a third of the width) and the loft to the design search's knobs, under the 13 ft peak. Then cite APA PDS values for a gusset panel check.
