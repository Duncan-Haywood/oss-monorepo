# Shed designer, round 4, lane 1: structure and anchorage

Session: https://claude.ai/code/session_01XpHqyfWBmo8mgepzkdVK3S, 2026-10-30. Built from `shed-designer-round2-structure.md` ("Open") and `shed-designer-round3-lane3.md` ("Open").

## What landed

| PR | What |
|---|---|
| #11859 | **Truss heels under uplift.** New row "Truss heels (uplift)". Under 0.6D + 0.6W a net upward load reverses the chords. The row checks the heel gusset nails at CD 1.6, and the bottom chord as a column about its weak axis (NDS 3.7.1.4, le/d ≤ 50). An 8 ft 2x4 chord braced only at the heels is 64 slender. So when the wind reverses the chords and there is no king post, the model adds a **2x4 chord brace** flat across the chords at mid-span, running gable framing to gable framing. It is drawn, listed, priced (+$8.46 on an 8x12 at 40 psf) and has a build step. Nothing reverses at the default 20 psf, so no default moved. An attic deck counts as the brace. **Bug fixed:** the rafter-tie uplift row picked its tie from `rafterSeat` ("connector" by default), so trusses were checked against a VPA2 (220 lb) while the estimate buys an H2.5A (615 lb). It now follows `dims.connector` and counts the ceiling's dead load on truss heels. **Bug fixed:** the Siding build step said "T1-11 panels" whatever the siding was (round-2 open item 4). Post: `2026-10-30-when-the-wind-turns-a-shed-truss-inside-out.md`. |
| #11864 | **LP SmartSide racking** (round-2 open item 3). Values from APA PR-N124 (revised July 2, 2026) Table 1, read from LP's hosted PDF and cross-checked against ESR-1301 (Feb 2026). The values are already allowable: ×1.4 for wind (footnote 3) and ×0.82 for SPF (footnote 1). Shiplap edges take the next thinner category (footnote 5): **3/8" = 180 × 1.4 × 0.82 = 207 plf** (the same as T1-11) and **7/16" = 220 × 1.4 × 0.82 = 253 plf**. The build steps carry the double-nailed shiplap joints (footnote 6), no nails in grooves (footnote 7), and 6" field nailing for the 7/16" panel on 24" studs (ESR-1301). The shopping list counts the extra nails. All 11 gallery designs still pass. Post: `2026-10-30-what-lp-smartside-panels-hold-against-the-wind.md`. |
| this PR | **Ground anchors, a pass/fail row** (round-2 open items 1 and 2). New setting `anchors`: `'48'` (default), `'30'`, `'none'`. Kits are Tie Down Engineering 59802 (48", RADCO class 4a) and 59800 (30", class 2). The maker's sheet 08465 (D2048, Rev. 5/21/24) gives "tested to 4725 lbs. for 3150 lbs. working load with 1.5 safety factor"; soil classes are from catalog D2109. Prices: $145.84 and $109.35, Home Depot, read from search results on 2026-10-30. `groundAnchors()`: each strap wraps the outer skid at a corner and runs at 45° along the corner diagonal. Each windward corner holds the hold-down V and half the whole sideways push H. Friction under the blocks or skids is **not** counted, so the loose blocks carry weight only and the anchors hold the shed sideways. Pull = max(V/cos45, H/(sin45·cos45)) against 3,150 lb. **Sliding governs on every preset, 31% to 72%.** H2.5A ties hold the floor frame to the skid at each corner, ceil(V/615) per corner. Also added: a build step (811, soil probe, set-out, strap wrap, ties), a UI select, a utilisation breakdown, and README, llms and marketing numbers. **Default cost change, said openly:** the default 8x12 goes up by $148.16 (kit + 4 ties) and about 2 labour hours. With `'none'` the row shows the shed tipping at 6 to 7 psf. Post: `2026-10-30-four-ground-anchors-for-a-shed.md`. |

Verification for each PR: the full non-browser suite, the browser suites (`browser`, `picker.browser`, `gambrel.browser`, `utilisation.browser`, `renders`), `typecheck.mjs shed-designer` and `make-renders.mjs`, all run after merging `main` in. Counts are in each PR body.

## Researched and not added, with what blocks it

- **Let-in bracing (IRC Method LIB).** Read from the 2021 IRC as adopted by New Jersey, on UpCodes (codes.iccsafe.org returned 403).
  - Table R602.10.4 gives LIB as "1 × 4 wood or approved metal straps at 45° to 60° angles for maximum 16" stud spacing", fastened with two 8d commons per stud and plate.
  - Table R602.10.3(1) gives braced length per line: 3.5 ft at 10 ft spacing, ≤ 115 mph, one-story.
  - **The blocker is R602.10.4.3:** braced panels need ½" gypsum on the opposite face, and its Exception 3 lets gypsum be omitted "except for Method LIB". No adjustment factor rescues an unlined LIB wall.
  - So LIB on a shed needs 16" studs (the owner's lap design frames at 24") and drywall inside. Both cost more than the ~$128 of OSB it was meant to save. LIB is not a saving for this shed. Not added.
- **Single top plate (R602.3.2 exception).** The exception text is verified (NJ 2021 IRC on UpCodes). It needs:
  - corner ties of 3"×6"×0.036" plates with six 8d box each side, and splice ties of 3"×12" with twelve each side (Table R602.3.2);
  - rafters within 1" of studs, which the model already gives when both are at 24" (checked: 0.75" off on the barn).
  - A TP37 (3-1/8"×7", 20 ga) is $1.52 at Home Depot (search result, 2026-10-30).
  - **The blocker:** the uplift check's ties (H2.5A 615 lb, VPA2 220 lb) are Simpson values that, per the catalog footnote, are "based on installation to double top plate". I found no citable single-plate uplift value. Dropping the cap plate would leave the uplift row citing a value that no longer applies.
  - Next step: find Simpson's current single-plate tie values in C-C-2024 (the H3 was historically the single-plate tie, per Simpson's 2023 blog) or a rafter-to-stud strap, then implement `topPlate: 'single'` as a search move. That saves about one 2x4 run per wall, roughly $30 on an 8x12.
- **Flat headers in "non-bearing" gable walls.** IRC R602.7.4 permits a single flat 2x4 header in nonbearing walls up to 8 ft. But the IRC defines a load-bearing wall as one carrying any vertical load beyond its own weight; the IBC's 100 plf threshold is not in the IRC. A gable wall under the end rafter's strip and gable framing (~86 plf at 30 psf snow) is therefore bearing.
  - By analysis, a flat SPF 2x4 over a 48" door at that load is about 0.95 in bending and about 1.8 in L/240 deflection, so it fails.
  - Windows within a stud bay already get no header (round 2).
  - The saving would be about one 2x4 ($4) an opening. Not added.
- **Open-front portal or perforated shear wall** for a wide gable door:
  - SDPWS 2015 4.3.3.5 perforated walls still drop segments past 3.5:1 (4.3.4.3). A 48" door centred in an 8 ft gable leaves two 24" segments on a ~85" wall (3.5:1 to 3.75:1), so the perforated method gains nothing there.
  - IRC PFH needs two 3,500 lb hold-downs "embedded into concrete" and a 3"×11¼" header. CS-PF needs continuous sheathing and 670 lb framing anchors over a wood floor. Both give an IRC braced-length credit, which the tool's SDPWS plf check can't mix with honestly.
  - The tool's existing advice (move the door off centre or onto an eave wall) is the cheap fix. Not added.
  - The IRC tables (Table R602.10.6.4 straps, R602.10.5 PFH and CS-PF credits) and SDPWS Table 4.3.3.5 are transcribed in this session's research. Copy them from the NJ UpCodes chapter-6 page and AWC's view-only SDPWS chapter 4 if a later run takes this on.

## Open, for the next run

1. **Wall-to-floor hold at the anchored corners.** Uplift goes from the corner studs into the rim through the siding or sheathing nails over the rim. That link is not checked; the README says so. A rated strap from the corner studs to the rim or skid (Simpson MSTA or CS16) would close it. That needs a sourced price and its catalog tension value.
2. **Hold-downs at braced-panel ends** (round-2 open item 2, second half) are still not checked.
3. **One wind pressure.** The user's wall pressure is also roof uplift, as round 2 noted. Truss-heel reversal and the anchors both lean on it. An ASCE 7 velocity-pressure input would help them both.
4. **Lowe's has no anchor-kit line.** Its listing title ("4725-lb ... 4-Pack", item 5015007057) couldn't be matched to 59800/59802 with a readable price. The store comparison shows Home Depot only for the kit.
5. **3D view:** the anchors and straps are not drawn. They are in the list and the build steps.
6. The design search never picks `anchors: '30'`. Soil class is the user's reading, not a search knob, and that is deliberate.
