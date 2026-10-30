# Shed designer, round 2, lane 1: structure

Session: https://claude.ai/code/session_01XpHqyfVgGHrV4NLW2yWU3a, 2026-10-30. Built from round 1's lane 1 and lane 5 reports, "Open" and "What the next run should do".

## What landed

| PR | What |
|---|---|
| #11520 | **Plate joints over headers.** When no split on full studs keeps cap joints 24" from top joints (IRC R602.3.2), a joint may land on a cripple over a header. The header must run at least 1-1/2" past the joint each side. The connection check tests exactly that, and fails with the cripple removed. A swept 840 designs (6 presets x 5 board lists x 7 door offsets x 4 widths) had 94 splice failures before; now 0. **Short stubs:** when a plate piece is under 24" and one longer stock length avoids it, a note names the length (lane 5's case: 91" door, 15'6" wall, 12 ft boards, 6-1/2" stub, "adding 14 ft boards"). No preset changes. Post: `2026-10-30-where-a-shed-plate-can-break.md`. |
| #11531 (landed in #11577) | **Southern pine and the foundation.** `structure.mjs` (both copies, open-house-plans too) gets SYP No. 2 values (SPIB Southern Pine Use Guide 2013, Table 1) and wet-service factors (Table A-2) through `designValues()`. `check()` takes `species` and `wet`. Treated floor joists are checked as SYP. New rows: **Skids on blocks** (wet SYP beam block to block) and **Blocks on the soil** (against IRC R401.4.1's 1,500 psf, spread through a gravel bed). **Finding:** the starter's bare blocks pressed about 1,970 psf (1.32), so it now starts on paver-base beds (+$83.58). Post: `2026-10-30-what-a-shed-block-presses-on-the-ground.md`. |
| #11543 (landed in #11577) | **Uplift and racking.** Rafter-to-plate ties are checked at 0.6D + 0.6W against Simpson C-C-2024 SPF/HF uplift (H2.5A 615 lb, VPA2 220 lb), with the pressure each holds to (72 to 100 psf on the presets). Walls are checked as SDPWS 2015 Table 4.3A shear walls (T1-11 as plywood siding at 450 plf nominal; OSB under lap siding at 670), with the aspect-ratio rules and the 4.2.5.2.1 open-front rule (1:1). A 4 ft door centred in an 8 ft gable end fails (7 of 24 gable-door variations). The Structure tab note and the FAQ now say what is checked. Post: `2026-10-30-does-the-wind-lift-or-rack-a-shed.md`. |
| #11549 (landed in #11577) | **Anchorage.** `selfWeight()` weighs the drawn framing and sheets at the NDS density (Supplement 3.1.3), counted low. `anchorage()` checks 0.6D + 0.6W overturning. Every preset tips at 6 to 7 psf, against the default 20 psf. The tool now gives the hold-down each windward corner needs (410 to 790 lb), under the structure table and as a build step. Post: `2026-10-30-a-shed-on-blocks-needs-anchors.md`. |

| #11577 | **Framing sized to the load** (the owner's "frames like a house" feedback, relayed mid-round). Each header is the shallowest two-ply size that passes `headerCheck` under `headerLoadPlf()` (two 2x4s at 30 psf, so the starter's auto walls drop 2" to 84-1/2"). A window that fits a stud bay gets a flat block above and below and no king, jack or header; `bayPlates()` checks the plates with a rafter landing mid-bay. `framing-moves.mjs` offers sliding a window into a bay, or a door or window so a king lands on a layout line, as priced moves (never silent; locks respected). Budget results drop $13 to $48 a preset. Also carries #11531, #11543 and #11549, merged with round 3's trusses, gambrels, utilisation view, lap siding and haul limit. Post: `2026-10-30-a-shed-is-not-a-house.md`. |

Why one PR at the end: round 3's lanes merged into the same files (README, model, checks, the size pages and renders) every few minutes, so each stacked PR went into conflict before its CI finished. Merging the top of the stack once, verified locally in full, beat four resolve-and-wait cycles.

Every new figure is pinned in `checks.test.mjs` or `connections.test.mjs` against a hand calculation written out in the test, as round 1 did.

## Sources read (and how)

- SPIB values and the wet-service factors: the SFPA "Southern Pine Use Guide" PDF on southernpine.com, read with `pdftotext -layout` (the web fetcher could not read it).
- Simpson H2.5A and VPA2: the C-C-2021 and C-C-2024 catalog pages, PDFs from retailers' CDNs, read with `pdftotext`. strongtie.com renders in JavaScript and returns nothing to a fetch.
- SDPWS 2015 Table 4.3A and 4.2.5.2: a PDF copy, read with `pdftotext`.
- Not found: LP SmartSide's racking values (APA PR-N124). SmartSide gets no racking row rather than a guessed value.

## Choices a later run may revisit

- **One wind pressure.** The user's wall pressure is also used as roof uplift (ties, anchorage). ASCE 7 MWFRS roof uplift is usually lower than the wall's net pressure, and C&C at edges and corners is higher. The rows show the pressure each part holds to, so a user can compare with a local figure. A second input (roof uplift) or an ASCE 7 velocity-pressure input would be the honest upgrade.
- **Anchorage is guidance, not a row.** If it were a pass/fail row, every design would fail and `simplify`/`budget`/`generateCandidates` (which require `ok`) would find nothing. Making it a row needs anchors in the model first (below).
- **Starter on paver-base beds.** This is a price change (+$83.58) made for the soil check. The size pages use gravel-pad presets and did not move.

## Open, for the next run

0. **From the owner's cost feedback, not done:**
   - **A single top plate with aligned framing** (IRC R602.3.2's exception) would save about a plate run a wall. It needs studs and rafters on the same 24" layout, a siding rated for 24" (T1-11 is rated 16"), and the straps the exception asks for at joints and corners. That is a model change, so it was left out.
   - **Flat headers in non-bearing gable walls** would save one 2x4 an opening over the two-2x4 header now used; small.
   - **The budget search holds the roof type by default.** The ridge board with ties saves $70.32 on the starter and passes, so whether to surface it is lane 3's keep/exclude UI call.
   - **The heel joint sits at 90 to 100% by design**, because its nail count is the fewest that carry the thrust. A fifth nail for margin is the owner's call.

1. **Anchors in the model and the shopping list.** Pick a rated ground anchor (auger anchors carry a maker's working load for given soils), add four with straps, check them against `anchorage().holdDown`, then turn anchorage into a pass/fail row. This needs a sourced product and price.
2. **Sliding**, and the loose blocks under the skids, are not checked. Neither is the hold-down at the ends of each braced wall panel.
3. **LP SmartSide racking.** Find APA PR-N124's table (3/8" and 7/16" panels, nail size and spacing) and add it to `BRACING`.
4. **Instructions say "T1-11 panels"** in the Siding step whatever `sidingType` is (instructions.mjs, Siding). Found in passing, not fixed, because it is outside this lane.
5. **Open-front torsion** uses equal stiffness and full-height segments only. A portal frame or perforated-shear-wall option would let a wide gable door pass with the right detail.
