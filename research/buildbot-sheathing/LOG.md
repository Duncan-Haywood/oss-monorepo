# buildbot-sheathing research log

## 2026-11-13 · Milestone 14 result: an escaped miss costs about 2% of the sheet; misses cluster, and 4 in joint nailing covers them for less than a re-drive

`experiments/m14_escaped/` (run.py, results.txt, results.json, figure.py, figure.png); `src/buildbot_sheathing/racking.py`; `tack.simulate` gains `u_joint` and `return_hits`, passed through `ceiling.clean`; `tests/test_racking.py` (5 tests). 9 s to run. Milestone 12's cells reproduce (0.4253 clean and 1.095 missed for three reads; 0.7707 for the full stack). The plastic-work minimum is solved by reweighted least squares and matches Nelder–Mead to 1e-13.

- **H60 held.** Against SDPWS Table 4.3A (15/32 in Structural I, 8d; 280, 430, 550, 730 plf), the model's intact-sheet ratios at 4, 3 and 2 in edge spacing are 1.442, 1.884 and 2.769 against 1.536, 1.964 and 2.607 (−6%, −4%, +6%). The table values were read from secondary copies (a state code reprint, a manufacturer's tech tip quoting SDPWS 2021), not the standard itself.
- **H61 refuted, and it matters.** Omitting every nail below 12 in (11 of 62) removes 20.4% of the model's capacity (23.7% at ≤ 12 in), against Weiss's (2017) tested walls, which lost "close to or more than half". The rigid-plastic model is unconservative for clustered missing nails by a factor of about 2.5 there. Possible reasons, not tested: the tests' walls may not have been fully anchored, a sheet with no bottom-edge nails rocks and tears out at the next row, and real nails are not rigid-plastic. Every loss below is therefore a lower bound.
- **H62 held.** One joint-edge nail missed alone costs 2.00–2.21% of the sheet (mean 2.08%; corners most), a field nail 0.70–1.02%, a plate nail 1.05–1.83%. The 62 single losses sum to 1.024, so a nail carries about its share by count, weighted toward the perimeter.
- **H63 refuted.** Three reads on measured studs, every miss escaping: the mean sheet loses 2.34% (2.13% per miss), but the 99th-percentile sheet loses 11.5% (bar 10%), and a 16 ft wall line's 1st percentile keeps 93.4% (bar 95%). The misses cluster: 13.4% of sheets have three or more joint misses (worst: 11), because a stud the robot misjudges is misjudged for a run of heights. The full stack (0.771 clean) loses 0.63% on average, 6.3% at the 99th percentile; doubled joints lose nothing.
- **H64 held.** Nailing the two joint edges at 4 in (25 a side; plates 6 in, field 12 in) raises the intact sheet to 1.318 of the 6 in sheet; with 1.572 misses a sheet all escaping, 99.98% of sheets still carry at least the intact 6 in sheet's capacity (1st percentile 1.160, worst 0.868). Post hoc, with every loss scaled by Weiss's 2.45, 97.6% do and the 1st percentile is 0.930.
- **Also found.** Sixteen extra nails at milestone 7's robot seconds per nail cost less than re-driving 1.1 misses a sheet: at 100 houses a year the 4 in joint edges with misses left cost a median $6.98 per sheet against $7.10 for 6 in with every miss re-driven and $12.17 for doubled joints (cheaper than doubled joints in all 4,000 draws). Nail material is not priced (a few cents). Miss rates by height run 1.8–4.4% a nail, highest at the ends and at 42–54 in, which is where the measured studs' waviness sits.
- **What it means for the programme.** Milestone 13 asked what a missed nail costs; in capacity, about 2% of its sheet each, more when they cluster, and the model likely understates clustered losses. For a shear wall, a design that expects misses can carry them: 4 in nailing on single-2x joint edges keeps the 6 in schedule's capacity with every miss left in, for no more than re-driving. Whether a code official accepts a schedule that knowingly includes shiners is a separate question this cannot answer; the honest framing is that it is a robot-friendly design margin, not a licence to skip inspection.
- **Inputs not sourced:** the rigid-plastic fastener (equal capacity, no edge-distance or tear-out effects), full anchorage, sheets acting independently; the seconds of an added nail (t_nail / 62).

## 2026-11-13 · Milestone 14 planned: what an escaped missed nail does to the sheet's racking capacity

Written before any milestone-14 capacity was computed. Inputs: milestone 12's pipeline (`ceiling.clean`, measured studs, 110 mm mean, seed 7), now asked for which nails miss, not how many.

- **Why.** Milestone 13 turned the framing question into a question about missed nails: doubled joints pay only if a missed nail costs about $5.51 more than its re-drive. Every milestone so far assumed each miss is found and re-driven. A miss that escapes (a "shiner" beside the stud) is a fastener missing from a shear wall's schedule, and its cost depends on how much racking capacity it takes away. That is computable without a price, as a fraction of the sheet's capacity, from where the misses fall: single-2x misses sit on the two joint edges, and a fastener's share of a sheet's capacity depends on its place.
- **Model.** The rigid-plastic model of a fully anchored sheathed wall (Källsner and Girhammar 2009, as we read it): framing pinned at its joints, so a stud nail at height z moves γz along the wall and a top-plate nail γH; the sheet rigid (translation u, v and rotation θ); every fastener rigid-plastic with the same capacity F in the direction of its slip. The racking capacity is the least work over the sheet's rigid motions, H·γ·H_wall = F·min Σ|slip_i|, so a capacity *ratio* needs only the nail positions, not F. Nails: SDPWS's 6 in edge and 12 in field schedule as the programme already places them (17 per joint edge, 7 per field stud, 7 per plate, 62 in all). A wall line is the sum of its sheets (they share γ). Misses come from `tack.simulate`, now returning the hit pattern of each sheet.
- **H60 (the model reproduces the spacing table).** The intact sheet's capacity at 4, 3 and 2 in edge spacing (field 12 in), relative to 6 in, lies within 10% of SDPWS Table 4.3A's ratios for 15/32 in Structural I with 8d common nails (430, 550 and 730 plf against 280: 1.536, 1.964, 2.607). Refuted if any is outside.
- **H61 (the model agrees with a test of missing nails).** Weiss (2017, MS thesis, WSU) omitted every sheathing nail in the bottom 12 in of tested walls to simulate decay, and the walls lost "close to or more than half" their capacity. The model, omitting every nail below 12 in, loses at least 40%. Refuted otherwise (the model would then be unconservative for clustered misses).
- **H62 (a missed nail costs about its share).** For each of the 34 joint-edge nails missed alone, the sheet loses at most 4% of its capacity, and the mean over the 34 lies between 1% and 3% (1/62 = 1.6%). Refuted otherwise.
- **H63 (escaped misses at the simulated rate are small).** Single 2x on measured studs, three reads, ledger (milestone 12: 0.425 clean, 1.095 missed a sheet), every miss escaping: the mean sheet loses under 3% of capacity and the 99th-percentile sheet under 10%, and a four-sheet (16 ft) wall line keeps at least 95% of its intact capacity in 99% of walls. Refuted if any of the three fails.
- **H64 (misses can be designed out with nails).** The same pipeline with its two joint edges nailed at 4 in (25 nails each; plates 6 in, field 12 in) and every miss escaping keeps at least the intact 6 in sheet's capacity in 99% of sheets. Refuted otherwise.
- **Also reported, not scored:** the capacity lost by misses on the best single-2x stack (per-nail reads, push, slide and shim; 0.771 clean) and on doubled joints; which joint heights miss most and what each height's nail is worth; the extra nailing seconds and dollars of H64's denser joint edges in milestone 7's cost model, against doubled joints' $5.13 premium; the break-even of milestone 13 restated as a capacity.
- **Limits known in advance.** A rigid-plastic model with equal fasteners: no stiffness, no sheathing tear-out, no nail-to-edge-distance effects, no partial anchorage; a shiner is assumed to carry nothing; sheet-to-sheet interaction at a shared joint stud is ignored (each sheet has its own edge nails); one wall of six measured studs drives the misses. The model ranks miss patterns and sizes their effect relative to an intact sheet; it does not give a design value.

## 2026-11-13 · Milestone 13 result: the remedies cost 32 cents a clean sheet; the doubled joint stud costs $5.13 and still loses every draw

`experiments/m13_price/` (run.py, results.txt, results.json, figure.py, figure.png); `src/buildbot_sheathing/price.py`; `tests/test_price.py` (5 tests). 5 s to run. One new Monte Carlo cell (doubled joints, single read, measured studs: 1.0000 clean, 0 missed); everything else reuses milestone 12's clean sheets and milestone 7's 4,000 cost draws.

- **H57 held.** At 100 houses a year the per-draw cheapest single-2x pipeline beats doubled joints in 1.000 of draws (bar 0.90), and also at 300 and 1,000; the median saving is $5.13 a sheet. Doubled joints are the fastest pipeline (145 s against 198–304 s) but the stud and a framer's time are 44% of their $12.17.
- **H58 held.** The full stack (per-nail reads by line laser, mid push, slide and shim; 0.771 clean) costs a median $7.42 per clean sheet against $7.10 for three reads on the ledger (0.425 clean), and is the cheapest pipeline in none of the 4,000 draws. Interpretation note: the plan said "the cheapest single-2x pipeline"; since a per-draw minimum can never be beaten by one of its members, it was scored against the lowest-median pipeline. Three reads on the ledger is cheapest in 52% of draws, per-nail reads by line laser on the ledger in 26%, three reads with slide and shim in 14%.
- **H59 refuted.** The extra cost a missed nail must carry for doubled joints to tie is a median $5.51 [5–95%: $3.91, $8.55] (8.8 loaded person-minutes), down from milestone 7's $6.51 but above the $5.00 bar; $5.83 with the common part removed. It fell less than the missed nails rose (0.79 to 1.095) because in about half the draws the cheapest single-2x pipeline is one that misses fewer nails (per-nail reads, 0.765; slide and shim, 0.726), which shrinks the denominator: the median saving over 1.095 alone would give $4.68.
- **Also found.** Below the base's capacity, seconds cost only supervision, so the price of first-pass quality is flat up to 0.77 (the cheapest pipeline at 0.40, 0.50, 0.60 and 0.75 first-pass clean costs $7.10, $7.14, $7.24 and $7.42) and then jumps to $12.17 for 1.000. A line laser beats three point reads at per-nail resolution above about 0.23 m/s; per-nail reads by point cost 15 cents and 31 s more than three reads.
- **What it means for the programme.** In dollars, the paper's question about framing is now a question about missed nails: if a missed nail found at inspection (or not found) costs more than about $5.50 beyond its re-drive, double the joint; otherwise run single 2x with whichever remedies the line allows, since they are nearly free. The next input to get is that cost and the detection rate of a missed nail, not more sensing.
- **Inputs not sourced:** the slide-and-shim time, the sweep speed and the push time (all swept); every missed nail assumed found.

## 2026-11-13 · Milestone 13 planned: what the single-2x remedies cost, and whether doubling pays on measured studs

Written before any milestone-13 pipeline was priced. Inputs are milestone 12's committed `results.json` (clean sheets and missed nails for the 12 single-2x cells on measured studs and the 12 with the common part removed) and milestone 7's cost model and 4,000 draws (seed 11).

- **Why.** Milestone 7 found doubled joints never pay in dollars unless a missed nail costs about $6.51 more than its re-drive, but it priced parabolic low-warp studs (0.79 missed nails a sheet with three reads). On measured studs the same pipeline misses 1.09 nails a sheet, and the remedies of milestones 9, 10 and 12 (per-nail reads, a mid push, a slide and shim) each buy clean sheets with seconds milestone 7 never charged. Milestone 12 left the per-nail read's time open. The question a panel-line integrator asks: which single-2x pipeline is cheapest per clean sheet on real studs, and is the extra joint stud now worth it?
- **Model.** Milestone 7's G1 on a drive-and-lift base (the cheapest robot class), 100, 300 and 1,000 houses a year; every missed nail found and re-driven (t_fix). Seconds added per sheet: point reads at milestone 7's t_read U(1, 3) s each (three: 3 per stud; dense: 17 per stud; local: 17 on the joint stud and 7 on each of two field studs; plus 2 edge reads); or, for dense and local, a line-laser sweep along the three new studs, 3 × 2.353 m / v with v log-uniform 0.05–0.5 m/s (unsourced; ISO 10218-1's 250 mm/s reduced speed sits inside it) plus the 2 edge reads; the mid push U(10, 40) s (milestone 9); slide and shim U(5, 30) s plus 2 more edge reads (unsourced, swept). Doubled joints: single read, ledger, the extra stud and a framer's time (milestone 7), clean sheets and misses from a new 20,000-sheet run on the measured studs.
- **H57 (doubling still does not pay).** At 100 houses a year, the cheapest single-2x pipeline on measured studs (chosen per draw over all 12 cells and both read hardwares) is cheaper than doubled joints in at least 90% of draws. Refuted otherwise.
- **H58 (the remedies buy first-pass quality, not dollars).** In the median draw at 100 houses a year, the full stack (local reads by line laser, mid push, slide and shim; 0.771 clean) costs more per clean sheet than the cheapest single-2x pipeline. Held if it costs more; refuted otherwise.
- **H59 (measured studs lower the break-even).** The median extra cost a missed nail must carry, beyond its re-drive, for doubled joints to tie the per-draw cheapest single-2x pipeline is below $5.00 (milestone 7: $6.51 on parabolic studs). Refuted otherwise.
- **Also reported, not scored:** median dollars and seconds of every pipeline; the cost of first-pass quality (the cheapest pipeline reaching each clean-sheet level); the line-laser speed at which per-nail reads stop paying for themselves; the common-removed studs as a bracket; 300 and 1,000 houses a year, where the machine's capacity can bind.
- **Limits known in advance.** The slide-and-shim time and the sweep speed are unsourced and swept; missed nails are all assumed found, so an escaped miss (a shear-wall nailing defect) has no price here, which is exactly what H59's break-even asks the reader to supply; one robot-built wall's six studs.

## 2026-11-13 · Milestone 12 result: per-nail reads and the mid push both survive measured studs; together with slide and shim they reach 0.77, not 0.90

`experiments/m12_remedies/` (run.py, results.txt, results.json, figure.py, figure.png); `tack.simulate` gains a `local` read policy and a mid push on any stud shape; `measured.model_profiles` holds milestone 11's profile variants; `ceiling.clean` takes `profiles`; `tests/test_remedies.py` (5 tests). 39 s to run. Milestone 11's three cells reproduce to four decimals (0.4253, 0.4707, 0.5792).

- **A bug in the first run, fixed before any result was used.** Milestone 11's profiles are measured about each stud's least-squares line, not the chord through its ends; the first run took the push from the least-squares line, so the push moved a stud by a third of its bow in the wrong place and made things worse (three reads 0.425 to 0.428; the end-chord RMS of five studs went up). The registered model says "offset from its chord" and the push is physically pinned at the plates, so the push now uses the end chord (`test_push_is_measured_from_the_end_chord`). The results below are from the fixed code only; the parabola and straight cells were unaffected (their profiles are zero at the ends).
- **H53 held: most of the measured-stud loss is the estimate.** Reading the stud at every nail height and aiming at each read gives 0.530 on measured studs (ledger, no push), above the 0.502 bar; the waviness cost falls from 15.4 points (three reads) and 12.5 (dense parabola) to 4.7. On the parabola and straight studs per-nail reads gain nothing (0.577 and 0.813 against 0.579 and 0.811): their only use is waviness.
- **H54 held: the push still pays.** A mid push (three reads, ledger) lifts measured studs from 0.425 to 0.552 (+12.6 points; bar +10), against +16.3 on their own parabolas (0.579 to 0.742). Pushed onto the end chord, four of the six studs straighten (end-chord RMS 0.83–3.49 mm to 0.45–1.20) and the most leaning end stud gets worse (0.94 to 1.56), because its shape is not a bow. Forces 10–72 N at a mean Stud-grade E, inside milestone 9's range.
- **H55 refuted: the remedies stack, but to 0.77.** Per-nail reads, the mid push and a 0.5 mm slide plus shim give 0.771 on measured studs (0.796 with the common part removed), against 0.860 on their own parabolas and 0.92 on straight studs. 95% then needs a tool held to 0.61 mm (1σ; 0.63 with the common part removed) against 0.84 mm on straight studs; three reads with the push need 0.27 mm.
- **H56 held.** Doubled joints give 1.0000 in all six estimate-placement cells on measured studs.
- **What it means for the programme.** The single-2x route is now: read at every nail (a line laser along the stud, not three spots), push the joint stud to its end chord, slide and shim the sheet, and hold the tool to about 0.6 mm. Each step is needed and none is enough alone. Doubled joints still need none of it. The paper's single-2x recommendation narrows accordingly.
- **Inputs not sourced:** the slide and shim residuals (0.5 mm, milestone 10's sweep), the push error (= the 0.5 mm read), linear superposition of the push on the scanned shape, and the length-squared scaling from 2,220 mm.

## 2026-11-13 · Milestone 12 planned: do the single-2x remedies survive measured studs?

Written before any milestone-12 pipeline was run. Inputs are milestone 11's committed `profiles.json` and its 110 mm running mean.

- **Why.** Milestone 11 found the six measured studs are not parabolas, and the best single-2x pipeline drops from 0.579 (each stud's own parabola) to 0.425 on their measured shapes. Milestones 9 and 10 proposed two remedies, a mid-height push onto the line and a slide plus shim before tacking (0.92–0.94 on straight studs), both scored only on parabolic or straight studs. Milestone 11 also left open whether the loss is the robot's *estimate* (a parabola fitted to three or seventeen reads cannot follow the waviness) or the *geometry* (a straight sheet edge against a wavy face narrows the window however well it is known). These are different fixes: more sensing, or more framing.
- **Model.** Milestone 11's pipeline (single 2x, smooth-rock Drake seats, tool 0.9 mm, reads 0.5 mm, edge aim, 20,000 sheets, seed 7) on four stud sets: measured (110 mm mean), measured with the cross-member common part removed, each stud's own parabola, and straight. Three switches: (1) the estimate, *three* (parabola through three reads), *dense* (parabola through 17) or a new *local* policy that reads the stud at every nail height (17 on a joint stud, 7 on a field stud) and aims each nail at its own read, no fitted shape; (2) a mid-height push, generalised to any measured shape by superposition: the stud moves by (its mid-height offset from its chord + N(0, s_read)) times the pinned point-load shape, and the robot believes its own estimate moved by its estimated offset times the same shape; (3) placement, milestone 9's ledger seat or milestone 10's slide plus shim (0.5 mm residuals). Doubled joints on the measured studs as a check.
- **H53 (the loss is mostly the estimate).** On measured studs (110 mm mean), ledger placement, no push, *local* reads close at least half of the gap from three-read measured (0.425) to three-read own-parabola (0.579), i.e. reach 0.502 or more. Refuted otherwise.
- **H54 (the push still pays).** On measured studs, three reads, ledger placement, the mid push lifts clean sheets by at least 10 points over no push (milestone 9 found +15 on parabolic low-warp studs). Refuted otherwise.
- **H55 (the remedies stack).** The best single-2x cell on measured studs (any estimate, with or without push, slide plus shim 0.5 mm) reaches 0.90 clean sheets. Refuted otherwise.
- **H56.** Doubled joints give at least 0.99 on measured studs in every estimate and placement. Refuted otherwise.
- **Limits known in advance.** Six studs from one robot-built wall; the push is linear superposition on the scanned (already installed) shape, which assumes the plates hold the ends pinned as milestone 9 did; part of the waviness may be scanner artefact (milestone 11, post hoc), which the common-removed set brackets; the *local* policy's read count (24 per new stud pair against 3) has a time cost milestone 5 prices, not scored here.

## 2026-11-13 · Milestone 11 result: measured studs bow by the published amount, but not as parabolas; the parabola flattered single 2x by 11–15 points

`experiments/m11_measured/` (extract.py, profiles.json, run.py, results.txt, results.json, figure.png); `src/buildbot_sheathing/measured.py`; `tack.simulate` gains a `profiles` argument; 5 s to extract, 16 s to run.

- **H49 refuted, and the reason sets the resolution.** The faces read 35.6–36.0 mm wide (bar 38.1 ± 2) and centrelines jump 1.2–2.6 mm between some neighbouring slices. The scan takes a profile every 2 mm along the wall, so an edge between two profiles is known to about ±1 mm. A synthetic 38.1 mm face with eased corners on the same grid reads 36.0 mm wide and recovers bows of 0–6 mm to 0.25 mm RMS, leaving 0.27 mm RMS of quantisation after a perfect parabola. Bow amplitudes are well resolved; millimetre-scale shape is resolved only after averaging along the stud.
- **H50 held.** Scaled to 8 ft, the six studs bow 0.021–0.283 in, median 0.106 in, on the published low mean of 0.11 in; with the five inclined members, median 0.074 in, mean 0.105 in. The programme's bow magnitudes, taken from search snippets, are confirmed by a measurement.
- **H51 refuted.** On the four studs bowed over 1 mm, the parabola explains 21–79% of the shape about the chord (bar 80%) and leaves 0.59–0.94 mm RMS (bar 0.5). A 110 mm running mean brings it to 0.39–0.76 mm.
- **Post hoc, not registered: some of that is the scanner.** The residuals correlate across all eleven members (median pairwise r 0.47) and their mean carries 48% of the residual variance, against 9% if independent; wood waviness should not line up across members at the same heights, a pass registered slightly off would. Removing the common part leaves 0.31–0.60 mm RMS on the studs, still at or above the quantisation floor.
- **H52 refuted.** Single 2x, three reads: measured studs give 0.425 clean sheets (raw slices 0.311, common part removed 0.471, twist off 0.461) against 0.579 for each stud's own parabola and 0.625 for the model's low-warp draw. The parabola is 11–15 points optimistic, because a three-read (or 17-read) parabola cannot follow a millimetre of waviness inside a ±3 mm window. Doubled joints give 1.0000 in every variant.
- **Also found.** Layout about a 402 mm grid: sd 2.0 mm at the bottom, 5.1 mm at the top; the two end studs lean 14.6 and 6.5 mm and run 20.5 and 10.9 mm out of plane, the inner four studs within 1.7 mm of lean and 2–3.5 mm out of plane. The nail-laminated panel's benchmark poses reproduce the paper's Table 1 exactly (mean 1.282 mm); the adaptive file does not (1.956 against 0.401 mm), so it was not used. The paper's bibliography had two author first names wrong (Wes/Saeed for Wesley/Salma) and no DOI; both fixed from the NSF public-access record.
- **What it means for the programme.** The single-2x numbers in sections 5.2–5.9 are upper bounds by about 11–15 points; the doubled-joint recommendation is unchanged and better supported. The slide-and-shim route of milestone 10 (0.92–0.94 on straight studs) needs straight studs in the strong sense, a pushed stud keeps its waviness. The next measured input worth getting is a population: framer-built walls scanned along the studs, finer than 2 mm across them.
- **Inputs not sourced:** the length-squared scaling from 2,220 mm to the 92 5/8 in stud; treating the cross-member common part as scan artefact (it may include real shape the robots' fitting imposed).

## 2026-11-13 · Milestone 11 planned: the first measured studs, from a scanned robot-built 2x4 wall

Written before any stud profile was extracted. What had been looked at: the data set's README, the paper's description of the wall module, and one 100 mm slice at mid-height (to see which members the scan shows and that their faces are about 40 mm wide).

- **Why.** Every stud in milestones 2–10 is a parabola whose amplitude is drawn from two published means seen through search snippets; milestone 2 left "measured stud profiles in place of means and assumed shapes" open, and the paper's section 2 names the Adel et al. (2024) data set as the most promising source. It turns out to hold a laser-profiler scan (0.15 mm profile, 0.019 mm depth resolution, 2 mm between profiles) of a full-scale 2x4 wall module two industrial robots built: 2.05 m by 2.32 m, two plates, six vertical studs at about 16 in, five inclined members, scanned from one face. The scanned face is the 1.5 in face sheathing is nailed to. So the shape of six installed studs, as a sheathing robot would meet them, can be measured instead of assumed.
- **Model.** Fit the wall's plane to the plate and stud faces. For each vertical stud, slice the face every 10 mm of height; from each slice take the face's two side edges (centreline and width), its mean height off the plane (in and out of the wall: crook plus warp of the wall) and its slope across the face (twist). The flatwise bow is the centreline's deviation from the chord through its ends; lean and layout are the chord's ends against the nominal 16 in grid fitted to the six studs. The inclined members and plates give more in-plane straightness profiles, about their own chords. Then the milestone-9 single-2x ledger pipeline (`tack.simulate`, three reads, s_x 1 mm, edge aim, smooth-rock seats, 20,000 sheets, seed 7) with each sheet's four studs drawn from the six measured shapes (random left-right and top-bottom flips, deviation scaled from the measured length to the 92 5/8 in stud by length squared), against the same pipeline with each measured stud replaced by its own fitted parabola.
- **H49 (the scan resolves a stud).** On every vertical stud the median face width is 38.1 ± 2 mm and the centreline has no step over 0.3 mm between neighbouring slices beyond what its own slice-to-slice scatter explains (a step at a pass boundary would be stitching). Refuted otherwise.
- **H50 (magnitude).** Scaled to 8 ft, every vertical stud's flatwise bow is under the Stud-grade limit (3/4 in) and their median is at or below the high published mean (0.21 in). Refuted otherwise.
- **H51 (shape).** On every vertical stud whose bow exceeds 1 mm, the chord-plus-parabola fit explains at least 80% of the variance of the deviation from the chord and leaves an RMS residual of at most 0.5 mm. Refuted otherwise.
- **H52 (the parabola is a safe stand-in).** The measured-shape pipeline's clean sheets lie within 5 points of the fitted-parabola pipeline's, single 2x and doubled joints, and doubled joints give at least 0.99 on the measured studs. Refuted otherwise.
- **Also reported, not scored:** measured twist and in-and-out-of-plane profiles, stud spacing and lean, the inclined members' and plates' straightness, and the data set's per-board pose deviations from the nail-laminated panel experiment (an industrial robot placing 2x4s with and without its feedback loop) as a measured placement scatter beside the 0.9 mm tool scatter.
- **Limits known in advance.** One wall, six studs, lumber of unstated grade and species, built by robots with a feedback loop that adjusts element lengths (not by a framer), scanned from one side; the scan is stitched from passes on the robot's calibration. A sample this small can refute a shape assumption, not estimate a population.

## 2026-11-13 · Milestone 10 result: the tool carries half the single-2x ceiling, the pose the rest; a slide and a shim lift it to 0.92–0.94, not 95%

`experiments/m10_ceiling/` (run.py, results.txt, results.json, figure.png); `src/buildbot_sheathing/ceiling.py`; about a minute on one CPU.

- **H45 held.** Tool scatter alone gives 0.9838 clean in Monte Carlo against 0.9833 from the product of the 62 nails' normal probabilities.
- **H46 refuted; milestone 9's reading was half right.** On straight studs the Shapley shares of −ln(clean) are tool **44.6% / 46.9%** (three-foot / smooth rock), stud read 7.0 / 8.4, edge read 5.0 / 6.1, slide 17.5 / 21.7, ledger 4.1 / 5.9, panel 21.9 / 11.0: pose **43.5% / 38.6%**. The more useful number: no group misses alone. Pose alone is 0.995 / 1.000 clean, tool and reads alone 0.957, tool and pose 0.805 / 0.874. The window is ±3.14 mm and a sheet off by d shrinks one side's half by d/2, so a tool tail that would land and an offset that would be harmless combine into a miss.
- **H47 held.** Sliding the sheet along the ledger to centre its gap on the read studs (0.5 mm residual) adds **6.1 and 5.8 points** on straight studs (0.737→0.798, 0.811→0.869). A slide that leaves 1 mm is no better than the 1 mm slide already assumed.
- **H48 refuted.** Slide and shim (0.5 mm each) with a mid push give **0.893** at low warp (bar 0.95); 0.916 at 0.25 mm, 0.922 with dense reads. On straight studs the same remedies give 0.918 (0.938 at 0.25 mm). Once the shim plumbs the sheet, the three-foot and smooth rock models give the same result.
- **What 95% takes.** With slide and shim at 0.5 mm, the tool must hold **0.84 mm** (straight studs) or **0.79 mm** (pushed low-warp studs) 1σ, against the 0.9 mm `buildbot-fasten` used; without them, 0.41–0.66 mm. So single 2x reaches 95% only with a pose fix and a tool about 10% tighter than assumed. Doubled joints, at 0.9994–1.000 with no fix, stay the recommendation.
- **What it means for the programme.** The paper's section 5.2 should say the single-2x cap is a joint budget shared by the tool and the pose, not the pose alone. The tool's scatter is now the single input the single-2x case depends on most, and it comes from one source; a measured scatter for a nailer on an arm is the next number worth getting.
- **Inputs not sourced:** the slide and shim residuals (swept 0.25–1 mm); the shim as a mechanism.

## 2026-11-13 · Milestone 10 planned: what is the straight-stud ceiling made of, and can placement lift single 2x to 95%?

Written before any milestone-10 experiment was run.

- **Why.** Milestone 9 pushed the bowed joint studs straight and found single-2x joints still stop at 0.74 (three-foot rock) and 0.81 (smooth rock) clean sheets, the same as on perfectly straight studs. It read the gap as "the sheet's own pose on the ledger", but never ran the ablation that would show it. On straight studs six error sources remain: the tool's scatter (0.9 mm, `buildbot-fasten`), the stud read (0.5 mm a read, three reads), the edge read (0.5 mm), the slide's translation (1 mm), the ledger's slope (laser rating plus 0.5 mm at each corner) and the panel's own geometry (PS 2 squareness and the bottom-edge rock). With edge aim each joint nail's half-window is 3.14 mm less half the sheet's local offset from where the robot meant it, so the pose and the tool compete for the same 3 mm.
- **Model.** Milestone 5's ledger pipeline (`tack.simulate`, single 2x, three reads, edge aim, 20,000 sheets, seed 7) on straight studs, with each source switchable. Shapley shares of −ln(clean) over the six sources (all 64 subsets), for both rock models. Two placement remedies, each applied after the sheet is seated and before it is tacked: **slide**, the robot reads both sheet edges against its stud estimates and slides the sheet along the ledger to centre the gap (translation left: the edge read over √2 plus a slide residual, swept 0.25–1 mm); **shim**, the robot also reads the edge's slope and lifts the low corner on a shim to plumb (tilt left: the slope of two edge reads 2.39 m apart plus the shim's own step, swept). Then both on the pushed studs of milestone 9 (mid push, pinned) at the two published warps.
- **H45 (closed form).** Tool scatter alone (perfect pose, perfect reads, straight studs): Monte Carlo clean within 0.003 of the product of the 62 nails' normal probabilities. Refuted otherwise.
- **H46 (milestone 9's reading).** On straight studs, the three pose sources (translation, ledger slope, panel geometry) carry at least half of the Shapley share of −ln(clean), in both rock models. Refuted otherwise.
- **H47 (slide).** The slide (0.5 mm residual) raises the straight-stud ceiling by at least 5 points in both rock models. Refuted otherwise.
- **H48 (95%).** Slide and shim (0.5 mm residuals) with a mid push (pinned) give single-2x joints at least 0.95 clean at the low warp under the smooth rock. Refuted otherwise.
- **Also reported, not scored:** the largest tool scatter that meets 95% on each pipeline (bisection), the high warp, and dense stud reads.

## 2026-11-13 · Milestone 9 result: a push of 28–232 N straightens the joint stud, but single-2x joints still stop at the straight-stud ceiling

`experiments/m9_straighten/` (run.py, results.txt, results.json, figure.png); `src/buildbot_sheathing/straighten.py`; 48 s on one CPU (MuJoCo 4.0.1 for the humanoid capacity).

- **H41 held.** The cubic-Hermite FE beam reproduces the closed forms exactly: c = 48.000 and 192.000, residual 0.07407 b and 0.29630 b at u = 1/6.
- **H42 held.** A mid-height push on a Stud-grade 2x4 bending flatwise between pinned plates takes a median of **28 N** and a 99th percentile of **126 N** at the lower published warp (53 and 232 N at the higher), and 376 N for a grade-limit stud at DF-L's 95th-percentile E. Fixed ends cost four times that. Nail by nail equals the mid push for the median stud (the mid push alone brings every point within 0.5 mm when the bow is under about 6.8 mm), but on the studs it does not, holding each nail while pushing the next makes the stud a short beam: p99 355 N at low warp and **1,258 N** at high, up to 2,821 N at the grade limit, and 791 N (p99) if the tolerance is tightened to 0.25 mm. **Push first, then nail.**
- **A G1 can just do it.** Milestone 3b's static whole-body model gives a sideways push of **81–88 N** at 1.2–1.3 m (right ankle roll binds, at either foot friction), an H1 **120–123 N** (shoulder yaw). That covers 93% of low-warp studs and 69% of high-warp ones for the G1, 99% and 86% for the H1. A G1 that cannot move a stud can read it and fall back to the extra stud.
- **H43 refuted, and the reason is the useful part.** Straightening lifts the best single-2x pipeline from **0.560 to 0.710** clean sheets at low warp and **0.307 to 0.677** at high (0.625→0.782 and 0.344→0.750 under milestone 6b's smooth-bow rock), 6 to 37 points, but not to 95%: on perfectly straight studs the same pipeline gives **0.737** (0.811 smooth-bow). Bow was costing single-2x joints up to 37 points; the sheet's own pose on the ledger costs the remaining 19–26. Doubled joints (0.9994 single read, 1.000 three reads) stay the only route to 95%.
- **The push policy barely matters, the end restraint does.** Nail-by-nail and a three-point simultaneous push land within 0.4 points of the mid push. Fixed ends lose up to 5 points at high warp, because they leave 4 times as much shape (0.296 b at u = 1/6).
- **H44 held, on a low bar.** Single 2x plus straightening beats doubled joints in 100% of draws at 100 and 300 houses a year; milestone 7 had already found doubled joints never pay. The informative number is the break-even: the median draw keeps favouring the push until about **925 s** of pushing a sheet. Against *not* pushing, straightening pays in 92% of draws at high warp and only 7.5–10% at low: at low warp its rework saving (0.79 → 0.47 nails a sheet) is worth about what 10–40 s of a supervised robot costs.
- **What it means for the programme.** Three ways to deal with a bowed joint stud are now priced: double it ($5.42 a sheet, 95%+ clean), push it (28–232 N, free in dollars, 0.68–0.78 clean), or live with it (0.31–0.63). The recommendation stands as doubled joints where 95% first-pass is wanted; the push is the cheap fallback, and it removes bow as the cap, which turns the single-2x question into a placement question. The paper's section 5.2 can now say what the cap is made of.
- **Inputs not sourced:** the push tolerance (0.5 mm, swept 0.25–1), the push time (10–40 s a sheet), the end restraint (both ends bracketed), and whether a pushed stud stays put between sheets.

## 2026-11-13 · Milestone 9 planned: push the bowed joint stud onto its line instead of doubling it

Written before any milestone-9 experiment was run.

- **Why.** Milestone 2 found that bowed studs, not sensing, cap single-2x joints: the sheet edge is straight and the stud's face is not, so no placement leaves every joint nail a window. Doubling the joint stud fixes it (0.9997 clean) but milestone 7 found the stud and a framer's minute or two cost $5.42 a sheet, more than the rework it saves. Carpenters do a third thing: they push a bowed stud over to the line and nail it there. Once the first sheet's joint nails hold it, the stud stays straight for the second sheet. Nobody has asked what force that takes, what it leaves, or whether a robot doing it beats the extra stud. The 2026-11-12 "Next steps" asked how far sheathing nails pull a bowed stud straight; on their own they pull nothing (a nail goes in where the stud is), so the question becomes a push.
- **Model.** The stud as an Euler-Bernoulli beam bending flatwise (I = 3.5 x 1.5^3 / 12 in^4, span 92 5/8 in) between plates that hold it pinned or fixed (end nails are near pinned; fixed is the bound), its stress-free shape milestone 2's parabolic bow. E from the reference design values for Stud grade (Douglas Fir-Larch 1.4, Hem-Fir 1.2, Spruce-Pine-Fir 1.2, Southern Pine 1.3 million psi) with the coefficient of variation 0.25 that the NDS uses for visually graded lumber, lognormal. Two policies: **mid**, one push at mid-height until a read there is on the line through the stud's ends; **nails**, the robot pushes the stud onto that line at each joint nail height, bottom up, before driving the nail (the carpenter's way), each nail then holding its point. A finite-element beam (cubic Hermite elements) gives the forces and the shape left; clean sheets come from milestone 5's ledger pipeline (`tack.simulate`) with the joint studs replaced by their straightened shape.
- **H41 (closed form).** The FE mid push needs 48 E I b / L^3 (pinned) and 192 E I b / L^3 (fixed) within 1%, and leaves at most b u (1 - 2u)^2 peaking at 0.074 b at u = 1/6 (pinned) and 4 b u (1 - 2u)^2, 0.296 b (fixed), within 1% of b. Refuted otherwise.
- **H42 (force).** Pinned, at the lower published warp, the 99th percentile mid-push force is under 200 N; at the grade limit (3/4 in over 8 ft) with Douglas Fir-Larch's 95th-percentile E, under 400 N. The nail-by-nail push's largest force is no more than twice the mid push's in the median stud. Refuted otherwise.
- **H43 (clean sheets).** On milestone 5's best single-2x ledger pipeline (s_x 1 mm, three reads), nail-by-nail straightening gives at least 95% first-pass clean sheets at both published warps (low and high), within 3 points of doubled joints; the mid push alone, pinned, also reaches 95% at the low warp. Refuted on any of these.
- **H44 (dollars).** On the G1 on a lift base at 100 houses a year (milestone 7's draws), single 2x with nail-by-nail straightening costs less per clean sheet than doubled joints in at least 90% of draws when straightening adds 10 to 40 s a sheet (swept, unsourced). Refuted otherwise.
- **Also reported, not scored:** the force against what a G1 and an H1 can push sideways at the wall (milestone 3b's whole-body model) if Menagerie loads; the fixed-end and mid-push policies on the cost; what a grade-limit stud leaves.

## 2026-11-13 · Milestone 6b result: a smooth bow rolls back to level; the 0.149° rock was the three-foot model, and single-2x pipelines gain up to 6.9 points

`experiments/m6b_bowed_edge/` (run.py, results.txt, results.json, figure.png; envelope.py and envelope.txt post hoc); MuJoCo 4.0.1 and Drake 1.51.1 SAP; 278 s and about 3 min on 4 CPUs.

- **H37 held, in all 48 cells and both engines.** A parabolic bow (1/32 or 1/16 in) seats inside the stick band θ_s = μ F_n r̄ / (m g (R − h0)) + 0.005°: at most 0.007° (Drake) and 0.006° (MuJoCo) at a 5 N press, 0.058° and 0.054° at 50 N. With R = 117 m and h0 = 1.22 m the edge is a stable rocker; gravity rolls the sheet back and wall friction keeps what it can.
- **Over 2,000 random seats** (holder error ±1°, μ 0.3–0.5, press 5–50 N, the same draws as milestone 6): 1σ 0.022° in both engines, 99th percentile |θ| 0.059° (Drake) and 0.061° (MuJoCo), against a three-foot rock of up to 0.149° on half the sheets. |θ| rises with the press (correlation +0.62, +0.59): the lighter the press once seated, the straighter the sheet.
- **H40 held.** With that rock in milestone 5's ledger pipelines, the best single-2x pipeline (1 mm, low warp, three reads) goes from **0.560 to 0.625** clean (+6.5 points in both engines; 0.626 with no bow rock at all), every single-2x pipeline gains 1.8–6.9 points, and doubled joints move by 0.45 points at most. The engines now agree within 0.11 points on every pipeline. Single 2x joints are still far from 95%: the bow rock was not what caps them, the bowed studs are (milestone 2).
- **H38 refuted.** A kink (tent, p = 1) at a 5 N press leaves 0.013–0.038° in Drake and 0.037–0.147° in MuJoCo, not ≥ 0.8 × 0.149°. The three-foot model does the same at 5 N (0.026–0.107°, 0.038–0.150°). Balanced on a point, the sheet's toppling moment m g h0 θ is 0.68 N·m at 0.149°, less than the 3.1 N·m wall friction holds at 5 N and μ 0.4, so it stops wherever the approach leaves it. That is why milestone 6's engines disagreed: the outcome on a kink is set by the approach, not by statics, and neither engine is wrong.
- **H39 refuted as registered, and the post-hoc check says why.** Single seats on the parabola move by up to 0.017° between 25 and 97 feet: a sheet anywhere inside the stick band is at rest, so where it stops is sensitive to everything. The envelope converges in Drake: 100% of 24 seats inside the band at every n from 25 to 401 (max 0.005–0.006° at 5 N, 0.056–0.061° at 50 N). MuJoCo's envelope at 5 N exceeds the band at every n (max 0.017–0.037°, 79–88% inside) and does not shrink with n: the soft contact, not the discretisation. At 50 N both engines are inside the band at every n.
- **Shape and grit (not scored).** p = 4 (flat-bottomed) leaves 0.008° at most; p = 1.5 sits between. A 1 mm bump under a straight edge (a burr, or grit on the ledger) tips the sheet onto the far corner: median 0.050° (Drake) and 0.061° (MuJoCo), up to 0.090°, which MuJoCo matches to the slope 1 mm / (W/2 + |y|). Grit costs more than the whole PS 2 bow.
- **What it means for the programme.** The model-dependent term milestone 6 left open is closed for a smooth bow: charge θ_s (or the simulated seats), not 2 s / W. Two placement rules come out of it: once the sheet is on the ledger, back the press off to a few newtons, and keep the ledger clean (1 mm of grit undoes it). The paper's conclusions do not change: single 2x joints stay well under 95% and doubled joints stay at 94–100%. A kink in a real edge, a chipped corner or grit is the case where the rock stays; how often real sheet edges and ledgers have one is not known (no measured edge profiles found).
- **Inputs not sourced:** the edge shapes (PS 2 bounds the bow, not its shape; parabola and tent are the two ends), the 1 mm bump, and the press range (milestone 3's).

## 2026-11-13 · Milestone 6b planned: is the bowed-edge rock a property of the sheet or of three feet?

Written before any milestone-6b experiment was run.

- **Why.** Milestones 3, 5 and 6 model a bottom edge bowed outward by s as three feet (the two corners and one at mid-width, s lower). On its middle foot the sheet is an inverted pendulum, so it must fall onto a corner: milestone 5 charges a rock of 2 s / W (0.149° at PS 2's 1/16 in), and milestone 6 found the two engines disagree on it by 0.02–0.03°, the size of the whole single-2x hang budget. A real bow is a smooth curve, not a point. A smooth convex edge of radius R under a body whose centre of mass sits h0 = H/2 + s above it is a rocker: rolling by θ raises the centre of mass by (R − h0) θ²/2, so the sheet is *stable* about level whenever R > h0. A parabolic 1/16 in bow over 48 in has R = W²/(8 s) = 117 m against h0 = 1.22 m. If so, gravity rolls the sheet back to level and only wall friction can keep a tilt: at most θ_s = μ F_n r̄ / (m g (R − h0)), with r̄ the mean distance of the wall contacts from the mid-width contact (1.56 m on corner contacts). That is 0.005–0.009° at a 5 N press and 0.054–0.090° at 50 N (μ 0.3–0.5), against the 0.149° charged. A kink (a point, a chip, grit on the ledger) has R → 0 and keeps the full rock.
- **Model.** The bottom edge as n feet (2 mm spheres) on the profile z = −s (1 − |2y/W|^p): p = 2 a parabola (the smooth bow), p = 1 a tent (a kink at mid-width), 1.5 and 4 in between; n = 25, 49, 97. Same sheet, holder, release and press as `ledger.seat`; both engines (MuJoCo 4.0.1 and Drake 1.51.1 SAP).
- **H37 (a smooth bow rocks back).** p = 2, s of 1/32 and 1/16 in, holder error ±0.25 and ±1°, wall friction 0.3 and 0.5, press 5, 20 and 50 N: the seated |θ| is at most θ_s + 0.005° in every cell, in both engines. Refuted on any cell.
- **H38 (a kink keeps the rock).** p = 1, s = 1/16 in, press 5 N: |θ| at least 0.8 × 2 s / W in every cell (the three-foot result). Refuted otherwise.
- **H39 (the discretisation does not decide it).** p = 2: the seated tilt moves by under 0.005° between n = 25 and n = 97 in every cell of a 12-cell subset.
- **H40 (clean sheets).** Charging milestone 5's ledger pipelines with the smooth-bow residual (drawn from the simulated seats, press U(5, 50) N) instead of 2 s / W raises the best single-2x pipeline (s_x 1 mm, low warp, three reads; 0.56) by at least 2 points, and moves every two-2x pipeline by under 0.5 points. Refuted otherwise.
- **Also reported, not scored:** p = 1.5 and 4; grit (a 1 mm sphere on the ledger at a random point under a straight edge); and whether a light press after seating (5 N) is a placement rule worth stating.

## 2026-11-12 · Milestone 8: the paper draft, and what writing it changed

`paper/draft.md`, `paper/references.bib`, `paper/check_numbers.py` (70 checks, all ok; run by `tests/test_paper.py`).

- **The draft.** One article for *Automation in Construction* in its structure: highlights, abstract, an error-model section, methods and results for milestones 1–7 ordered by the proposal's hypotheses, discussion, limitations, a generative-AI declaration and references. Authorship is left for the owner.
- **Scoring the proposal's hypotheses for the first time.** H-B, H-C and H-E held. H-D held in its first half (the base beats the walking H1 in every draw) and is refuted as registered in its second: the gantry is cheaper than the base in the median draw only from about 501 houses a year, not 30–300, though the ranking does flip inside the swept range. H-A held at a 0.5 mm stud read (no pose tolerance without edge aim), but at 0.3 mm aiming at the design window allows 0.38 mm and 0.0276°, so it depends on a stud reader's accuracy no commercial source we found states; and on an as-built wall the joint framing, not the aim, decides.
- **H-B's own refutation test (a learned hang policy) was never run**; the paper says it is supported by the static analysis, not tested.
- **Before submission:** the Elsevier `elsarticle` template, the citations marked "not confirmed" (Construction Robotics 2024's authors, Lachmayer et al. 2022's title, the Adel et al. 2024 DOI, the SDPWS edition), APA E30 and SDPWS read in full, and authorship.

## 2026-11-12 · Milestone 6 result: on Drake the ledger still seats the sheet and clean sheets move by 0.06 points at most; the bowed-edge rock and a soft held wrist depend on the contact model

`experiments/m6_drake/` (results.txt, results.json, figure.png); Drake 1.51.1 SAP against MuJoCo 4.0.1; 404 s on 4 CPUs.

- **H35 (H-E) held, by a wide margin.** Over 2,000 seats on the same random draws, Drake leaves a seated residual of 0.00142° (1σ; 0.0047° at most) against MuJoCo's 0.00001°. Both are far under the 0.03° a sheet may hang on single 2x joints, so the 24 ledger pipelines of milestone 5 keep their first-pass clean sheets within **0.06 points** of each other (bar 10).
- **H32 held.** The press at which wall friction holds a 1° error is 0.965–0.998 of the closed form on corner contacts in Drake, against 0.872–0.987 in MuJoCo; the worst Drake/MuJoCo gap is 12.7% (μ 0.5). In MuJoCo wall friction holds the sheet from a little less press than rigid Coulomb friction predicts (the cautious side for a press limit); Drake is closer to the closed form. The 6 of 200 released-seat cells where the two disagree all sit at the threshold.
- **H33 held.** At 50 N or less and wall friction 0.3–0.5, Drake leaves 0.0025° at most (bar 0.005°).
- **H34 refuted.** 70% of held-wrist cells are within max(0.005°, 10%) of the closed form, bar 90%. Where the closed form keeps an error the simulators agree within 0.07°; where it predicts none (soft wrists, 300–3,000 N·m/rad) Drake keeps 0.001–0.016° and MuJoCo nothing. Small against a hang budget of 0.03°, but not zero, and a released holder (the policy milestone 5 uses) avoids it.
- **H36 held.** The push height that tips a sliding sheet is 0.995–1.007 of W / (2 μ_l) in Drake.
- **Not scored, and the one that matters next: the bowed bottom edge.** A sheet resting on its bowed middle rocks 0.107–0.123° in Drake and 0.139–0.145° in MuJoCo, both under the 2 s / W = 0.149° milestone 3 charged. On its middle foot the sheet is balanced, so how far it rocks is set by friction and the approach, not by statics: the full rock milestones 3 and 5 used is the conservative side, and the two engines disagree by 0.02–0.03°, the size of the single-2x budget. A flexible sheet (`buildbot-mjsheet`) or a mock-up would settle it.
- **Drake's own settings** (stiffness 10^5–10^7 N/m, dissipation 0.5–50 s/m, 0.5–2 ms, SAP, TAMSI, lagged) move the μ 0.4 threshold over 187.5–199.7 N and a released seat by 0.003° at most, except the softest contact (0.023°).
- **What it means for the programme.** The ledger results the cycle and cost milestones rest on are not a MuJoCo artefact. Milestone 8 (the paper draft) can report H-E as held, with the bowed edge as the open, model-dependent term.

## 2026-11-12 · Milestone 6 planned: do the MuJoCo results hold on a second contact model?

Written before any milestone-6 experiment was run.

- **Why.** Every result the cycle and cost milestones lean on that came out of a simulator came out of one: MuJoCo's soft, convex contact with an elliptic cone, `impratio` 10 and 20 no-slip iterations (milestones 3 and 3b). Soft contact can creep under static friction, and the ledger's whole job is a friction question (does the sheet rotate onto the ledger, or does wall friction hold it at the holder's error?). H-E of the proposal asks that clean-sheet rates agree within 10 points on a second contact model.
- **Second model.** Drake (Toyota Research Institute; `pip install drake`, 1.51.1) `MultibodyPlant`, discrete at 1 ms, point contact with the SAP solver (Castro et al. 2022, convex and near-rigid, with a regularised Coulomb cone) and, as a third check, Drake's TAMSI solver (Castro et al. 2020, Stribeck-regularised friction). Same sheet, same contact points (spheres on the back face at the corners or the stud lines, feet on the bottom edge), same holder law, applied as an external wrench each step. Contact stiffness and dissipation are Drake's per-geometry `point_contact_stiffness` and `hunt_crossley_dissipation`, swept by a decade either side.
- **H32 (press threshold).** The least press that leaves over half of a 1° holder error, corner contacts, wall friction 0.2–0.7: Drake SAP within 25% of the closed form m g W / (2 mu r_bar) at every friction, and within 15% of MuJoCo's. Refuted on any friction.
- **H33 (a light press seats).** Released at a press of 50 N or less with wall friction 0.3–0.5 and a holder error of 0.25–2°, Drake SAP leaves at most 0.005° (milestone 3's H13 on the second model). Refuted on any cell.
- **H34 (held wrist).** A wrist that keeps its stiffness leaves the closed-form tilt within max(0.005°, 10%) in at least 90% of milestone 3's section C cells in Drake SAP.
- **H35 (H-E, clean sheets).** Draw 2,000 seats per simulator with the holder error uniform in ±1°, friction uniform 0.3–0.5 and press uniform 5–50 N; add each simulator's seated residual to milestone 5's ledger tilt draw; the first-pass clean rate of every milestone-5 ledger pipeline (framing, s_x, warp, sensing policy; 24 cells, 20,000 sheets) agrees between MuJoCo and Drake within 10 points. Refuted on any cell.
- **H36 (slide and tip, milestone 3b).** The push height that tips a sliding sheet in Drake is within 10% of the closed form W / (2 mu_l) in each of milestone 3b's ten pushed-at-the-press cases.
- **Also reported, not scored:** the bowed bottom edge (section E), creep under a stuck press, the SAP against TAMSI difference, and the run time per seat.

## 2026-11-12 · Milestone 7 result: a G1 on a lift base is the cheapest robot below about 500 houses a year, the walking H1 never wins, and the extra joint stud does not pay in dollars

`experiments/m7_cost/` (results.txt, results.json, figure.png); 4,000 draws, seed 11, common random numbers; under a second.

- **H28 held.** The G1 on a drive-and-lift base costs less per clean sheet than a walking H1 in every draw, at every volume and with either sensing policy forced (H1 about 2.5 times dearer: a higher price and 85–265 s of walking nails against 54–121 s).
- **H29 refuted.** In the median draw the gantry is dearer than the base at 10 houses a year (+$43.67 a sheet) and cheaper only from about **501 houses a year**, outside the predicted 30–300 (at 300 it is still +$0.51). Per draw, 62% cross inside 10–1,000, at a median of 54 houses; the gantry's unsourced $40k–600k price spreads the crossing over two decades.
- **H30 refuted, for every class.** Doubled joints are cheaper in **0%** of draws at 100 houses a year: the stud and a framer's minute or two cost $5.42 a sheet (median), while the rework it saves (0.79 missed nails with three reads on single 2x) is under a dollar of robot and supervisor time. Doubling pays only if a missed nail costs **$6.51 [5.21, 7.88] more than its re-drive**, about ten loaded person-minutes. Milestone 5's 18–65 s are real but cheap; the milestone 5 conclusion that the joint framing moves the cost is reversed when the cost is dollars rather than seconds, unless missed nails are expensive (found at inspection, or on a shear wall where a missed nail is a structural defect) or the doubled joint is required anyway.
- **H31 held.** Hand crew $5.21 a sheet (median; $1.93–14.46 over the taskbook's sweep of its minutes); at 100 houses a year the base is $7.03 and the H1 $17.23; the gantry is $3.93 at 300 and $33.49 at 30. Paired, the base is cheaper than the crew in 37% of draws at 100 houses a year, 74% at 300 and 94% at 1,000.
- **Where the base's dollars go** (two 2x, single read, 100 houses a year): ownership 44%, the stud 44%, people 11%. Its cost is moved most by its life (ρ −0.58) and its base price (+0.58), both unsourced; supervision is fourth (+0.26).
- **What it means for the programme.** The robot design question has a plain answer on cost (put the arm on a lift base, not on legs) and an open one on volume (a robot pays against a crew only when it sheathes about 100 or more houses a year, which a site robot moving between jobs would struggle to do). The joint-framing recommendation of milestones 2 and 5 holds for clean sheets and seconds, not for dollars, unless a missed nail is costly. The paper should report both. Milestone 6 (a second contact model) is the remaining check before the draft.
- **Inputs not sourced:** the base and gantry prices, every life, interest and upkeep, every stage time but the nailing; the hand crew's minutes are its author's estimate and its own misses are not charged; site robots are dedicated to wall sheathing with no transport or set-up cost.

## 2026-11-12 · Milestone 7 planned: dollars per clean sheet, by robot class and house volume

Written before any milestone-7 experiment was run.

- **Why.** Milestone 5 put every stage in seconds and found doubled joint framing buys back 18–65 s a sheet of rework. Seconds are not the decision: a builder compares dollars a sheet against a two-person crew, and the robot classes differ in price, speed and who still has to carry the sheet. H-D of the proposal (a base with a lift beats a walking humanoid; a gantry beats both above a volume) has not been tested.
- **Classes.** *Hand crew* (taskbook S1 carry 0.8, S2 hold and square 1.5, S4 nail 62 x 0.1 person-minutes a sheet, each scaled by the taskbook's one-third-to-three-times sweep; clean rate not modelled, taken as 1). *Walking H1* (nailing 84.7–264.7 s, the walking-G1 range of `buildbot-mobilebase` at 5–20 s a step; a person carries the sheet to the ledger, since milestone 3b found neither humanoid can carry it). *G1 on a drive-and-lift base* (nailing 54–121 s, `buildbot-mobilebase`; a person carries the sheet; the base can also hang and tack without a ledger, milestone 5's lift-tack). *Gantry* over a framing table in a plant (nailing 20–115 s, scan 10–60 s and load 30–180 s, `buildbot-custom`; the table fence plays the ledger).
- **Pipelines.** Each class picks, per draw, the cheapest of framing {single 2x, two 2x} by sensing {single, three reads} (and for the base, ledger or lift-tack), at the lower published warp; missed nails and first-pass clean rates are milestone 5's (`m5_cycle/results.json`); every missed nail is re-driven, so every sheet ends clean and the cost of a clean sheet is the cost of a sheet with its rework.
- **Dollars.** Ownership: capital recovery of the price over its life at an interest rate plus upkeep, spread over the sheets of V houses a year (32 wall sheets a house, `buildbot-taskbook`), capped at the capacity of 2,000 machine hours a year (a fleet beyond that). People: loaded wage (BLS $29.12 times a burden of 1.0–1.6, `buildbot-cost`) times carry seconds plus supervision (0.1–1.0 person-hour a robot-hour on site, `buildbot-cost`; operator share 0–0.5 on the gantry, `buildbot-custom`). The extra joint stud: a 2x4 92 5/8 in precut stud at $3.41–5.56 (retail listings seen through search on 2026-11-12) plus 60–120 s of a framer's time. Prices: G1 $13,500–21,600 (Unitree's own page and 2026 retailer listings seen through search), H1 $90,000–150,000 (press reports, `buildbot-cost`), base and lift $10,000–40,000 (**not sourced**), gantry $40,000–600,000 (**not sourced**, `buildbot-custom`'s sweep); site robots live 2–7 years, the gantry 7–20; interest 4–10%; upkeep 5–20% (site) and 3–12% (gantry) of the price a year. Every other stage time is milestone 5's sweep. 4,000 draws, seed 11, common random numbers across classes.
- **H28 (H-D, first half: the base beats the walker).** At every volume tried (10, 30, 100, 300, 1,000 houses a year) and with either sensing policy forced, the G1 on a base costs less per clean sheet than a walking H1 in at least 95% of draws. Refuted otherwise.
- **H29 (H-D, second half: the gantry wins above a volume).** In the median draw the gantry is dearer than the base at 10 houses a year and cheaper at 1,000, crossing between 30 and 300. Refuted if it never crosses inside 10–1,000 or crosses outside 30–300.
- **H30 (doubled joints pay in dollars).** For each robot class, at 100 houses a year, the best two-2x pipeline is cheaper than the best single-2x pipeline in at least 90% of draws once the stud and its framing time are charged. Refuted for a class below 90%.
- **H31 (no site robot beats the crew).** At 100 houses a year both site robots cost more per clean sheet than the hand crew in the median draw, and the gantry costs less than the crew in the median draw at 300 houses a year and more at 30. Refuted on any of the three.
- **Also reported, not scored:** dollars a sheet by class and volume (median and 5–95%), the share of draws in which each class is cheapest, which inputs move the base's cost most (rank correlation), and the higher warp as a check.

## 2026-11-12 · Milestone 5 result: doubled joints and one read a stud give a clean sheet in 76–216 s; single 2x joints cost 18–65 s more in rework, and fire-at-once recoil is not free there

`experiments/m5_cycle/` (results.txt, results.json, figure.png); 20,000 sheets a cell, seed 7; under a minute.

- **H22 held.** On single 2x joints at the lower warp, with a ledger seat (PS 2 panels, 0.5 mm a corner, 1 mm left after the slide), first-pass clean sheets are 0.417 (single read), 0.560 (three), 0.583 (dense); 2.16, 0.79 and 0.70 nails missed a sheet. With 3 mm left after the slide: 0.25–0.31.
- **H23 held.** On two 2x the same pipeline gives **0.9997** with a single read (1.0000 with three); at the higher warp a single read falls to 0.938 and three reads hold 1.0000.
- **H24 held.** By seconds a sheet including rework, a single read is fastest on two 2x in all 108 time cells, and three reads are fastest on single 2x in all 108 (dense reads never: 53 reads a sheet cost more than the rework they save).
- **H25 held.** Before the extra joint stud is charged, the best two-2x pipeline beats the best single-2x one by 17.8–65.2 s a sheet; the place, ledger and nailing times cancel, so the break-even depends only on the read and rework times: 29.6–41.6 s at 30 s of rework, 17.8 s at the cheapest corner (15 s rework, 1 s reads). At the higher warp 33.8–129.2 s.
- **H26 refuted.** Firing at once after a 4 N s recoil, modelled conservatively as a 0.37 mm Gaussian added to the 0.9 mm tool scatter, costs up to **7.6 points** of clean sheets on single 2x joints (dense, 0.583 to 0.507), though at most 0.12 points on two 2x. `buildbot-nailseq` found no effect on single-2x joints with no panel gap; with the gap, bowed studs and a seated panel the single-2x window is tight enough to feel it. The residual there is a deterministic transient of at most 0.37 mm, so a Gaussian of that size overstates it.
- **H27 refuted.** In the two-2x single-read pipeline nailing is the largest stage in 90 of 108 cells; placing the sheet (60 s, plus 10–20 s of ledger) is larger in the other 18, all with fast 54 s nailing. Shares: place 10–57%, sensing 2–17%, nailing 37–86%.
- **Seconds a sheet.** Two 2x with a single read: 76–216 s (median 146). The best single-2x pipeline: 94–281 s (median 183). For scale, nailing alone takes 61 s on the gantry of `buildbot-custom` and 372 s by hand at the taskbook's estimated minutes.
- **Unplanned: on doubled joints the ledger is optional.** A lift that hangs the sheet to 0.25° and 5 mm (1σ) and tacks it gives 0.978 clean with a single read and 0.996 with three; at the middle time cell that is 97 s against 106 s with the ledger, since no ledger is set. On single 2x the same hang gives 0.08–0.09.
- **What it means for the programme.** The design choice that moves the cost of a clean sheet is the joint framing, not the robot's sensing or its recoil handling: doubled joints buy back 18–65 s a sheet of rework and let the robot read each stud once. Milestone 7 should price that extra stud (lumber and framing minutes) against these seconds, and milestone 6 should check the clean-sheet rates on a second contact model.
- **Inputs not sourced:** every stage time except the nailing (itself `buildbot-mobilebase`'s model with swept speeds) is swept: place and slide 15–60 s, ledger 0–20 s, a read 1–3 s, rework 15–60 s a missed nail. Every missed nail is assumed found and re-driven at the same cost; a closed joint window (a bowed stud) is charged the same per nail, where a real fix may need a block or a sister stud.

## 2026-11-12 · Milestone 5 planned: the whole cycle, in seconds per sheet and clean sheets

Written before any milestone-5 experiment was run.

- **Why.** Milestones 1 to 4 each scored one stage (gap and pose, as-built studs, ledger and
  humanoid, tack-then-measure) on the clean-sheet rate, and `buildbot-mobilebase`,
  `buildbot-nailseq` and `buildbot-custom` timed the nailing alone. Nobody has put the stages in
  one cycle and asked what a sheet costs in seconds once placement, sensing, recoil and the rework
  of missed nails are all charged, and which design choice moves that number.
- **Pipeline.** Steady state along a row: a lift (or a person) stands the sheet on a laser-set
  ledger and the robot slides it to its stud line and presses lightly, so it seats (milestone 3);
  two tacks freeze it; the robot reads each new stud (three a sheet, the left joint stud is shared
  with the last sheet) and both sheet edges, then nails the 62 nails with edge aim (milestones 1
  and 4). Clean sheets come from milestone 4's model (`tack.simulate`) with milestone 3's tilt
  draw (laser rating, 0.5 mm a corner of ledger error, PS 2 panels uniform within the limits) and
  a translation left after the slide, s_x 1 and 3 mm. A second placement, *lift-tack*, has no
  ledger: the lift hangs the sheet to σθ 0.25° and σx 5 mm and tacks it.
- **Choices compared.** Joint framing (single 2x; two 2x fastened, 3.0 in); sensing (single,
  three, dense reads a stud); recoil (none; fire without waiting at 4 N s, which leaves at most
  0.37 mm at the next nail in `buildbot-nailseq`, added in quadrature to the 0.9 mm tool scatter
  as a conservative Gaussian; wait, which costs 2.4 s a sheet on a fast arm and 0 on a slow one).
  Stud warp: the lower published means (0.11 in bow, 0.08 in twist), the higher (0.21, 0.16) as a
  check.
- **Seconds.** Nailing with moves and re-stancing from `buildbot-mobilebase` (54 s fast, 121 s
  slow, both with a 2 s settle); place and slide 15, 30, 60 s; ledger set-up 0, 10, 20 s a sheet;
  a read (stud or edge) 1 or 3 s including the move; rework 15, 30, 60 s per missed nail (find
  it, drive one beside it); the extra joint stud of doubled framing 0, 60, 120 s a sheet, with
  its break-even reported. **None of these times is sourced except the nailing**, which is itself
  a model with swept speeds; they are swept and the ranking is what is scored.
- **H22 (single 2x has no 95% pipeline).** On single-2x joints at the lower warp with a ledger
  seat, no sensing policy reaches 95% first-pass clean sheets (milestone 2: perfect sensing
  0.87 with a perfect hang). Refuted if any reaches 0.95.
- **H23 (doubled joints let the robot read less).** On two 2x at the lower warp with a ledger
  seat, a single read a stud gives at least 95% clean sheets. Refuted below 0.95.
- **H24 (sensing choice follows framing).** Ranking by seconds per sheet including rework, a
  single read is fastest on doubled joints, and three or dense reads are fastest on single 2x
  once rework costs 30 s or more, each in at least 90% of the swept time cells. Refuted otherwise.
- **H25 (the extra stud pays).** At rework 30 s, the doubled-joint pipeline's best seconds per
  sheet beat single 2x's best by at least 20 s before the extra stud is charged, so framing it may
  take 20 s or more and still win, in every place, read and nailing setting. Refuted if the
  break-even is under 20 s in any of them.
- **H26 (recoil stays out of the budget).** Firing without waiting at 4 N s costs under 2 points
  of clean sheets in every pipeline.
- **H27 (the nailing dominates).** In the doubled-joint single-read pipeline, nailing (with moves
  and settles) is the largest share of the sheet's seconds in every swept cell. Refuted if place,
  sensing or rework is larger in any.
- **Also reported, not scored:** the time per sheet set beside the 61 s gantry of
  `buildbot-custom` and the taskbook's 372 s of hand nailing (both nailing only); the share of the
  cycle by stage; the lift-tack placement; the higher warp.

## 2026-11-12 · Milestone 3 (second part) result: a stock G1 or H1 can press and let the ledger seat the sheet, but neither can carry it there

`experiments/m3b_humanoid/` (results.txt, results.json, figure.png); deterministic, about 6 min.

- **H18 refuted in part.** The G1 holds at most 2.8–8.7 kg in both hands at 0.6–1.3 m and presses 66–110 N on the ledger, as predicted. The H1 does not carry it either: 12.4–18.8 kg against the sheet's 21.8 kg (elbow torque). It presses 128–281 N. A lift or a person must stand the sheet on the ledger for either robot.
- **H19 held.** The push height that tips a sliding sheet is W/(2 μ_l) when the press is at the push height, 2.03 m at μ_l 0.3 to 0.87 m at 0.7; MuJoCo's threshold is 0.984–1.007 of the closed form in 14 cases, including a press fixed at 0.6 or 1.2 m (the general form).
- **H20 held.** At foot friction 0.6 a G1 slides the sheet at μ_l 0.3 with up to 96 N of press, and at μ_l 0.5 with at most 41 N (none above 1.0 m); the H1 manages 105–206 N and 34–141 N. On a foot friction of 0.3 the G1 slips at about 50 N.
- **Unplanned: not through the palms.** Sliding by palm friction needs F_n ≥ μ_l m g / (μ_h − μ_w), at least 107 N and up to 1.5 kN, and is impossible when the palm grips no better than the wall. The robot has to push the sheet's edge.
- **H21 refuted.** At Unitree's published gains (G1 arms kp 60 N·m/rad) the sheet's stiffness about the landing corner is 182–1,946 N·m/rad on a G1 against part one's 5,641 at 1°, 2.9 to 31 times under; H1 palm contacts 876–2,740. Only an H1 rigid clamp is too stiff (10,423–613,376; it keeps 0.46–0.99° of a 1° error), because its 4-joint arms cannot turn the forearm end about the wall normal. Releasing a G1's wrist roll changes the stiffness by 0.1–19%.
- **The catch.** The same softness lets the sheet's own gravity moment turn a stock hold 10–14° (G1) if nothing feeds the weight forward: the ledger carrying the weight is what makes the soft hold work, and a controller has to drop the feedforward at ledger contact.
- **What it means for the programme.** A stock humanoid is not the hanger; it is the presser and nailer once a lift or a person sets the sheet on a ledger. Milestone 5's cycle should carry that division of labour.
- **Modelling choices, not sourced:** static whole-body model, forces split 50/50 between hands, PD gains taken as the only compliance, feet rigidly planted, ledger and palm friction swept.

## 2026-11-12 · Milestone 3 planned (second part): can a stock G1 or H1 work a sheet the ledger carries?

Written before any part-two experiment was run. Part one found a ledger squares the sheet if the
holder goes limp in roll and presses under about 100 N. This part asks whether a Menagerie G1 or
H1 can be that holder, with the ledger (or a lift that stood the sheet on it) carrying the weight.

- **Scene.** The robot stands square to the wall in front of the sheet, hands at height z above the
  floor and reach x, feet flat (buildbot-payload's static whole-body model, buildbot-fasten's lean
  for a push). Three jobs: (a) hold the 21.8 kg sheet with no ledger; (b) press it into the wall
  with F_n once it sits on the ledger; (c) press and slide it sideways along the ledger to its
  stud line, a lateral force P = mu_l m g + mu_w F_n. Feet must stay inside torque limits, keep
  both soles loaded and not slip (rubber on concrete, mu 0.3 and 0.6, swept as in buildbot-fasten).
- **Gains.** Unitree's G1 arm SDK example drives arms and waist at kp = 60 N m/rad (kd 1.5), and
  unitree_rl_gym's G1 deploy config the legs at 100 (hips), 150 (knee), 40 (ankles); the H1
  training config uses 150 shoulder, 100 elbow, 300 torso, 150/200/40 legs. The sheet's rotational
  stiffness about the wall normal follows from those gains through both arms' Jacobians with the
  feet planted, for a rigid grasp and for point contacts at the palms, rotating about the landing
  corner. kp is also swept.
- **H18 (the ledger is what makes a G1 usable).** A G1 cannot hold the 21.8 kg sheet at any hand
  height from 0.6 to 1.3 m within its torque limits; with the ledger carrying it, it can press at
  least 50 N at some height in that band. The H1 can do both.
- **H19 (a high push tips the sheet).** Sliding a seated sheet by pushing at height h above its
  bottom edge, with the press applied at the same height and wall contacts at the corners, lifts
  the trailing corner once h > W / (2 mu_l) (1.52 m at mu_l 0.4): the wall friction's moment
  cancels. Held if the MuJoCo threshold is within 10% of the closed form for mu_l 0.3 to 0.7.
- **H20 (a G1 can slide only on a slippery ledger).** At F_n = 50 N and mu_w 0.4, a G1 can apply
  the slide force at mu_l = 0.3 (84 N) at some height, and not at mu_l = 0.5 (127 N); the H1 can at
  both.
- **H21 (stock gains are too stiff to let the ledger seat it).** At the sourced gains the sheet's
  rotational stiffness about the landing corner exceeds part one's limit (m g W/2 - mu F_n r_bar)
  / theta0 at theta0 = 1 deg for both robots and both grasps, so a stock position hold keeps part of
  its error; releasing the wrist roll alone does not bring it under, because the hands translate
  about the corner. Also reported: the kp at which it would.

## 2026-11-12 · Milestone 3 (first part) result: let go and press lightly, and a ledger squares the sheet; then the panel's squareness is what single 2x joints cannot absorb

`experiments/m3_ledger/` (results.txt, results.json, figure.png); MuJoCo seating runs are deterministic, Monte Carlo 20,000 sheets a cell, seed 5; about 95 s.

- **H13 held.** Released with a press of 50 N or less at μ 0.3–0.5, the sheet ends within **0.00003°** of the ledger from θ0 up to 2°. In fact every cell up to 100 N, μ 0.2–0.7, seats; descent speed, release time, step size and contact layout change it by under 0.0001°.
- **H14 held.** The press at which wall friction holds the error is 380, 253, 189, 143, 115 N at μ 0.2 to 0.7 (corner contacts), **0.87–0.99** of μ F_n r̄ = m g W/2; with contacts along four stud lines 0.90–1.00. The transition is sharp: below it the sheet seats, above it the sheet keeps 99.6–100% of its error.
- **H15 refuted, narrowly.** The held-wrist closed form max(0, θ0 − (m g W/2 − μ F_n r̄)/k) matches 29 of 30 cells within 0.005° or 10%; at 100 N, 0.5° and 10,000 N·m/rad MuJoCo leaves 0.089° against 0.119°, where wrist and friction share the moment and friction is not fully mobilised. The practical reading stands: a wrist stiffer than about 130 N·m / θ0 (7,500 N·m/rad at 1°) keeps part of its own error.
- **H16 held.** With a laser-set ledger (0.5 mm a corner) and panels uniform up to the PS 2 limits, the tilt σ is 0.085°, 6 times inside the doubled-joint target: **1.0000** clean on two 2x at the lower warp with σx = 3 mm, in every ledger and panel cell up to 2 mm a corner. Single 2x straight, σx 0: **0.844**.
- **H17 held.** With a perfect ledger and seat, panels at the PS 2 limits give 0.857 on single 2x; 95% needs panels within **0.244** of the limits (0.020° out of square, 1/64 in of edge bow). Even perfect panels give only 0.953, the laser's 0.020° rating included.
- **Unplanned: a bowed bottom edge rocks.** An outward bow of 1/16 in (PS 2's limit) puts the sheet on its middle and one corner, 0.139–0.145° in MuJoCo against 0.149° for a rigid edge; which corner follows the side the robot held it tilted to.
- **What it means for the programme.** H-B now has a concrete form: a humanoid does not need to hang a sheet plumb if it can set it on a ledger, go limp in roll and press under about 100 N. Whether a G1 or H1 can do that while carrying 22 kg is the second part of milestone 3. On single 2x joints the floor is the panel, not the robot: the shear-wall case for doubled joint studs (milestone 2) gets stronger.
- **Modelling choices, not sourced:** rigid sheet on point contacts; lumped impedance holder; uniform distributions within PS 2 limits; ledger height error swept; wall friction swept around a secondary-source range.

## 2026-11-12 · Milestone 3 planned (first part): does a ledger board square the sheet, and what does it leave?

Written before any milestone-3 experiment was run. Milestone 4 set the target: a hang within
about 0.5° and 10 mm (1σ) on doubled joints, 0.03° and 0.4 mm on single 2x. Translation is easy
(the robot sets x from its stud reads); rotation is the hard part. This first part of milestone 3
asks whether a temporary ledger board under the sheet, the guide H-B names, can set the rotation
for a robot that cannot, and what the ledger, the panel and the robot's wrist leave behind. The
humanoid whole-body hang (Menagerie G1/H1) is left for the second part.

- **Scene** (`src/buildbot_sheathing/ledger.py`, MuJoCo). A rigid 4x8 sheet of 7/16 in OSB
  (1.219 x 2.438 x 0.011 m, 21.8 kg, `buildbot-payload`'s figure) pressed against a wall plane by
  a holder that pushes at the sheet's centre with force F_n, and lowered onto a ledger board. The
  holder is an in-plane impedance on (y, z, θ) aimed at its believed-plumb pose, which is off by
  θ0. Once a corner touches, the holder ramps its vertical support and translation gains to zero
  over 0.5 s; its rotational stiffness k_θ about θ0 is either released too ("release") or kept
  ("hold", swept 0 to 10⁴ N·m/rad). Swept: wall friction μ 0.2 to 0.7 (wood on wood, 0.25 to 0.5
  in a secondary table; the Wood Handbook's own figure was not found), F_n 0 to 600 N, θ0 0.25 to
  2°, descent speed. The tilt left is read once the sheet has settled.
- **Panel and ledger.** PS 2-18 §5.2.1.3 (opened this session): panels square within 1/64 in per
  foot of the longest edge measured along the diagonals (1/8 in on an 8 ft panel, a corner angle
  of 0.083°), and edges within 1/16 in of the corner-to-corner line. A bottom edge bowed out by
  s rests on its middle and one corner, tilted 2s/W (up to 0.15°); bowed in, it rests on both
  corners. The ledger is set to a laser line; pro cross-line lasers are rated 1/8 in at 30 ft
  (0.020°; Fluke PLS 180, Stabila LAX 320 and others, maker listings seen in search), and the
  board is fixed to it with a height error at each sheet corner (σ swept 0 to 2 mm, not sourced).
- **H13 (a released sheet seats).** Released, with a light press (F_n ≤ 50 N) at μ 0.3 to 0.5,
  the sheet's bottom edge ends parallel to the ledger within 0.005° from any θ0 up to 2°.
- **H14 (a hard press freezes the hang).** Wall friction holds the tilt once μ F_n r̄ exceeds the
  gravity moment about the landing corner, m g W/2 = 130 N·m. With MuJoCo's four corner contacts
  on the wall, r̄ = (W + H + √(W² + H²))/4 = 1.596 m, so F_n* = 81.7/μ N (204 N at μ = 0.4).
  Held if the simulated threshold (the least press that leaves over half of θ0) is within 25%.
- **H15 (a stiff wrist fights the ledger).** Held, the residual tilt is
  max(0, θ0 − (m g W/2 − μ F_n r̄)/k_θ): a wrist stiffer than about 7,500 N·m/rad at θ0 = 1°
  with no press keeps part of its own error. Held if MuJoCo matches within 0.005° or 10%.
- **H16 (the ledger meets the doubled-joint target, not the single).** A released seat on a
  laser-set ledger (σ 0.5 mm a corner), with squareness and bottom-edge bow drawn uniformly up to
  the PS 2 limits, gives ≥ 95% clean sheets on two-2x joints at the lower published warp with
  σx = 3 mm, and < 95% on straight single-2x joints even with σx = 0 (milestone 4's model).
- **H17 (the panel, not the ledger, sets the single-2x floor).** With a perfect ledger and a
  perfect seat, panels drawn uniformly up to the PS 2 limits give under 90% clean sheets on
  straight single-2x joints. Also reported: the fraction of the PS 2 limits a panel would have to
  meet for 95%.

## 2026-11-12 · Milestone 4 result: on doubled joints a robot may hang the sheet 18x coarser; on single 2x joints re-hanging cannot reach 95%

`experiments/m4_tack_measure/` (results.txt, results.json, figure.png); 20,000 sheets a cell, seed 4; about 100 s.

- **H10 refuted.** On straight single-2x studs with a hang of σx = 1 mm, σθ = 0.1°, tack-measure-reject peaks at **0.87 clean sheets** (re-hang below a 2.0 mm predicted half-window, 2.1 hangs a sheet). A stricter threshold re-hangs more and does worse (0.81 at 2.5 mm, 3.6 hangs), because the fifth hang is nailed whatever it predicts. At the lower published warp the best is 0.66. Even a perfect hang gives only 0.96 (straight) and 0.81 (low warp): the narrow joint has no room left for the hang once sensing and tool scatter are in.
- **H11 held, by a wide margin.** On two-2x joints at the lower published warp, tacking and aiming from the measured edge allows **σθ = 0.54°** (11 mm at the top nail) and **σx = 10.4 mm** for 95% clean sheets, against 0.029° and 0.37 mm on straight single-2x joints: 18 and 28 times coarser. A 3x allows 0.38° and 7.2 mm. Studs that bow cost almost nothing on wide joints (0.556° straight against 0.537° low warp).
- **H12 held.** A held sheet that sways under the nail after the edge was measured may sway **0.19 mm** (1σ per nail) on straight single-2x joints and nothing at the lower warp, against **4.1 mm** on two-2x joints and 3.0 mm on a 3x.
- **Edge aim is worth having only when the hang is coarse.** With three reads per stud, aiming at the design window beats aiming from the measured edge on single-2x joints (0.972 against 0.958 with a perfect hang; 0.44 mm against 0.37 mm of translation allowed), because the 0.5 mm edge reading adds noise the hang does not. On wide joints edge aim nearly doubles the hang allowed (0.29° to 0.54°).
- **Re-hanging is cheap insurance on wide joints.** A 3x with a hang of 3 mm and 0.3° goes from 0.967 to 0.9996 clean with 1.1 hangs a sheet.
- **What it means for the programme.** Milestone 3 now has its target: a hang within about **0.5° and 10 mm (1σ)** on doubled joints, or 0.03° and 0.4 mm on single 2x. The first is a placement a guided humanoid or a lift might reach; the second is not plausible for any site robot co-holding a sheet. Tacking matters less than the framing: on wide joints a robot can hold the sheet and nail with millimetres of sway.
- **Modelling choices, not sourced:** hang and sway errors Gaussian and swept; sway is an independent translation per nail with no rotation; a re-hang is a fresh independent hang (a robot that corrects from its measurement would do better; table A's budget is that residual); the measured edge line has the true slope. Studs, sensing and tool are milestone 2's.

## 2026-11-12 · Milestone 4 planned: tack, then measure; how coarse may a robot hang the sheet?

Written before any milestone-4 experiment was run. Milestone 3 (placement in MuJoCo) needs a
target to score a G1, H1, lift or ledger against; this milestone writes that target, so it runs
first.

- **Why.** Milestone 1 gave the sheet pose a robot may leave as about 0.4 mm and 0.03° (1σ) on
  single-2x joints, even aiming from the measured edge, and milestone 2 found the joint framing,
  not sensing, sets the window once studs bow. Two things were left out. (1) A robot that holds
  the sheet while it nails sees it move between the edge measurement and each nail (sway, recoil).
  Two tack nails in the field studs freeze the pose, and the edge is measured after. (2) A robot
  that measures the edge can see a bad hang and re-hang before it drives the joints (pull the
  tacks, or nudge a held sheet: the pose-based correction of Adel et al. 2024).
- **Model** (`src/buildbot_sheathing/tack.py`, on milestone 2's studs: bow, twist, three reads at
  0.5 mm, edge line 0.5 mm, tool 0.9 mm, 1/8 in gap centred on each joint stud's estimated
  range). The sheet is hung off by a translation x and a rotation θ about its centre, both
  Gaussian, both swept. *Hold*: each nail sees the hung pose plus an independent sway s (swept);
  the edge is measured once. *Tack*: two field tacks freeze the pose (any shift while tacking folds
  into x), then the edge is measured. *Reject*: after measuring, the robot predicts each joint
  nail's window from its measured edge and stud estimate and re-hangs if the narrowest half-window
  is under a threshold (swept 1 to 2 mm), up to five hangs. Joint framing: single 2x, 3x, two 2x.
- **H10 (re-hanging rescues single-2x joints).** On straight single-2x studs, with a hang of
  σx = 1 mm and σθ = 0.1°, tack-measure-reject reaches ≥ 95% clean sheets with ≤ 2 hangs a sheet
  on average, at some threshold. Refuted otherwise.
- **H11 (wide joints relax the hang).** On two-2x joints at the lower published warp (three
  reads), tack-then-measure with no re-hang allows σθ ≥ 0.2° (with x = 0) and σx ≥ 4 mm (θ = 0)
  for 95% clean sheets. Refuted if either is smaller.
- **H12 (holding costs little on wide joints, much on narrow).** With a perfect hang, the per-nail
  sway allowed for 95% clean sheets is under 0.5 mm on straight single-2x joints and at least
  2 mm on two-2x joints at the lower published warp.
- **Also reported, not scored:** a grid of σx by σθ on each framing; the hang a 95% rate allows
  written as millimetres at the top of the sheet; the mean hangs a sheet under each threshold.

## 2026-11-12 · Milestone 2 result: a bowed 2x closes the joint whatever the robot sees; a 3x or doubled joint stud with three reads gives 100% clean sheets

`experiments/m2_asbuilt_studs/` (results.txt, results.json, figure.png); 20,000 sheets a cell, seed 3; about 40 s.

- **H6 held.** At the Stud-grade bow limit (3/4 in over 8 ft, 17.7 mm on the stud) no sheet is feasible with the gap centred on the stud's range: the arithmetic limit is 4h = 12.5 mm (0.53 in over 8 ft). Single and two-read policies pass 25% of sheets, but only by putting all the bow on one side, which closes the neighbour's.
- **H7 held.** At the lower published warp (bow 0.11, twist 0.08 in mean, half-normal) a single mid-height read gives 0.55 clean sheets (1.7 nails missed a sheet).
- **H8 refuted.** Three reads and a fitted parabola give 0.80, a read at every joint nail 0.83, and perfect stud and edge knowledge 0.87. The ceiling is the window the bow leaves, against 0.9 mm of tool scatter, not the sensing: no policy reaches 95% at any read scatter (table E).
- **H9 held.** Twist costs 1.4 points under three reads (0.818 bow only, 0.803 both); twist alone 1 point. The band shrinks on the side the nail runs toward: 0.44 mm at 1°, 1.35 mm at 3°.
- **Unplanned, and the useful result: widen the joint, don't sense harder.** A 3x joint stud (2.5 in face) or two 2x fastened together (3.0 in), which SDPWS 4.3.7.1 names for adjoining panel edges of some shear walls, widens the window by 1/2 or 3/4 in a side; the largest closable bow becomes 37.9 or 50.6 mm, beyond the grade limit, and three or dense reads give 1.0000 clean sheets at both warp levels and both distribution shapes. Even a single read gives 0.85–1.00. Section H was added after C–F showed no sensing policy could reach 95% on single 2x joints.
- **Culling is the expensive alternative.** On single 2x joints a framer would reject studs bowed over 1/16 in (65% of them at the low warp) to bring dense reads to 0.96 and three reads to 0.94.
- **Lean adds to bow.** Plate layout error of 1.6 mm at each stud end takes three-read from 0.80 to 0.72.
- **What it means for the programme.** The robot design question (H-B, H-D) should be asked on doubled or 3x joint framing, where the sheet's pose and the tool scatter set the budget again, or the robot must straighten studs. A panel line that frames its own walls can choose that cheaply; a site robot sheathing someone else's framing cannot.
- **Inputs not sourced or seen only in snippets:** warp limits and means come from search snippets of USDA and *Wood and Fiber* reports (southern and ponderosa pine), not opened; the distribution shape is assumed (two shown); the 10D penetration is from memory; plate layout error is swept. The model takes the free-piece warp as installed; nailing may pull bowed studs partly straight.

## 2026-11-12 · Milestone 2 planned: real studs bow, twist and lean, and the sheet edge is straight

Written before any milestone-2 experiment was run.

- **Why.** Milestone 1 kept every stud straight and plumb. Stud-grade 2x4s are not: the grading
  limits for an 8 ft Stud-grade 2x4 are crook 1/4 in, bow 3/4 in and twist 3/8 in (USDA Forest
  Service reports quoting the 1978 NHPMA rules and Shelly, Arganbright and Birnbach 1979, *Wood and
  Fiber* 11(1):50–56, seen through search, not opened; one report gives bow 1/2 in), and kiln-dried
  southern pine studs averaged crook, bow and twist of 0.06, 0.11, 0.08 in in one Koch FPJ note
  and 0.13, 0.21, 0.16 in in another (Koch 1974, serrated sticks), also seen through search. In a
  wall the 3.5 in depth is normal to the sheathing, so **bow** (flatwise) moves the nailing face
  along the wall, **twist** rotates it, and crook moves it out of plane (not modelled here). A sheet
  edge is straight, so a bowed joint stud moves under it; no sensing can widen a window the bow
  has closed.
- **Model.** Each stud's face line is a parabola of bow b (sign random, zero at the plates) plus
  a linear twist φ(z) = φ_T (z/H − 1/2) with φ_T = t / 3.5 in, scaled from 8 ft to the 92 5/8 in
  precut stud (bow by length², twist by length). Magnitudes are half-normal or exponential with the
  sourced mean, truncated at the grade limit. A joint nail must have its shank on the stud and at
  least P = 10 nail diameters (1.31 in, the NDS full-value penetration, from memory, not checked
  this session; 6D swept) of wood along its path, through the twisted section, within the 2 1/16 in
  an 8d nail has past 7/16 in sheathing. Sheets are straight and plumb, edges set gap/2 either
  side of a reference on each joint stud (panels cut to fit; milestone 1's width question is left
  aside). The robot reads each stud with 0.5 mm scatter per read and aims from the measured edge
  (0.5 mm) and its estimate of the stud at each nail height, with 0.9 mm tool scatter.
- **Sensing policies.** *single*: one read at mid-height, stud assumed straight (studfind).
  *ends*: reads near the top and bottom, a straight line. *three*: bottom, middle, top, a parabola.
  *dense*: a read at each of the 17 joint heights, least-squares parabola. Every fitted policy
  centres the gap on the middle of its estimated range (minimax).
- **H6 (a grade-limit bow closes the joint).** A Stud-grade stud at the 3/4 in bow limit leaves
  no window on one side of the joint under any straight-sheet placement. Arithmetic before the run:
  minimax centring needs b ≤ 4h = 12.6 mm, and the scaled limit is about 17.7 mm. Held if the Monte
  Carlo finds zero feasible joints at the limit.
- **H7 (a single read fails on typical studs).** At the low published mean bow (0.11 in) and twist
  (0.08 in), half-normal, a single mid-height read gives under 80% clean sheets. Refuted at ≥ 80%.
- **H8 (three reads suffice).** Reading each stud at three heights and fitting a parabola gives
  ≥ 95% clean sheets at the same warp. Refuted below 95%.
- **H9 (twist is second order).** At that warp under the three-read policy, removing twist raises
  clean sheets by under 3 points. Refuted at ≥ 3.
- **Also reported, not scored:** the window against twist angle; clean sheets at the higher
  published means (0.21 in bow, 0.16 in twist) and with exponential tails; the share of studs a
  framer would have to cull (bow over a threshold) for a single read to reach 95%; stud read
  scatter allowed for 95% by policy; plate layout lean swept 0 to 1.6 mm.

## 2026-11-11 · Milestone 1 result: the 1/8 in gap cuts the stud budget from 0.90 to 0.41 mm, sheets must hang plumb to ~0.03°, butted rows leave the studs by sheet 3–5

`experiments/m1_gap_placement/` (results.txt, results.json, figure.png); 20,000 sheets a cell, seed 1; rows 4,000 trials, seed 2; about 12 s.

- **H1 held.** With APA's 1/8 in gap centred on the joint stud, the joint window shrinks from ±3.93 to ±3.14 mm, and the single-read stud scatter allowed for 95% clean sheets falls from 0.90 mm (no gap; `buildbot-studfind` gave 0.89) to **0.41 mm**; the tip scatter allowed with perfect studs falls from 1.23 to 0.98 mm. At studfind's own 0.89 mm budget, clean sheets drop from 0.95 to 0.75 when the robot plans for the gap, and to 0.56 (1.1 nails missed a sheet) when it aims for no gap and the sheet is hung with one.
- **H2 held, trivially at the pre-registered setting.** With stud 0.5 mm and tip 0.9 mm a robot aiming at the design window is already at 0.93 clean sheets with a perfectly hung sheet, so it has no pose tolerance at all. Unplanned, at stud 0.3 mm: 0.028° of rotation (1σ; 0.58 mm at the top nail) and 0.38 mm of translation.
- **H3 held at the pre-registered setting, refuted at a tighter one.** Aiming from the measured edge (edge line good to 0.5 mm) allows 0.44 mm of translation and 0.031° of rotation where nominal aim allows none (ratio unbounded). At stud 0.3 mm (unplanned) the ratio is 0.61/0.38 = 1.6, under the 2 the hypothesis asked for. With the edge line good to only 1 mm, edge aim allows nothing either.
- **Unplanned: edge aim halves the weight of the stud error.** The aim point sits midway between the measured edge (+3/8 in) and the estimated far stud face, so a stud error moves it by half. With no pose error, clean sheets rise from 0.93 to 0.96 at stud 0.5 mm.
- **H4 partly refuted, held in outcome.** Full 48 in panels butted with a 1/8 in gauge drift 3.2 mm a sheet; the third sheet's joint window exists in 46% of trials, not 0% as predicted (6.35 mm of drift against a 6.27 mm window, so gap and width noise open it), but no third sheet is clean (sheet 2: 0.04 nominal, 0.22 edge aim). Panels trimmed 1/16 in keep a joint window in at least half the trials for 4 sheets (sheet 5: 47%): held. Even panels trimmed by the full 1/8 in lose clean sheets along the row (0.95 to 0.66 by sheet 10) because the gauge's 0.5 mm scatter accumulates as a random walk.
- **H5 refuted.** Setting each sheet from its own studs keeps every joint window open and every sheet at 0.98 clean (1/16 in trim, 0.5 mm width scatter, 0.1% of joints overlapping), but at the pre-registered 1 mm width scatter 5.6% of joints would need a negative gap: a 1/16 in trim leaves a 1.6 mm mean gap, too little for 1 mm of width scatter. A robot setting sheets from the studs must either trim the panel or accept an edge off-centre by up to a millimetre or two there.
- **What it means for the programme.** The joint window, not the stud reading alone, is the binding constraint once the gap is in, and a robot must see the sheet edge and set each sheet from its own studs. The rotation budget (~0.03°) is two orders of magnitude below the 2–6° tilt `buildbot-cohold` saw during a co-held lift, which makes H-B (placement is the humanoid's bottleneck) the next thing to test, in MuJoCo (milestone 3).
- **Inputs not sourced, swept or fixed by choice:** tip scatter (0.9 mm, a `buildbot-fasten` model result), stud scatter, edge-line error, gauge scatter (0.5 mm) and panel width scatter (0.5 and 1 mm). The 1/8 in gap, 3/8 in edge distance and the "sized for spacing" trim come from APA pages seen through search, not opened.

## 2026-11-11 · Milestone 1 planned: the panel gap and the sheet's own pose in the joint-nail budget

Written before any milestone-1 experiment was run (the model and its tests, `src/` and `tests/`, were written first; the tests only check it against `buildbot-studfind` and closed forms).

- **Why.** `buildbot-fasten` and `buildbot-studfind` put each sheet edge exactly on its joint stud's centre line. On a real wall the panels are hung with APA's recommended 1/8 in gap, centred on the joint stud, so each edge sits 1/16 in past the centre and the 3/8 in edge-distance rule moves with it. The sheet is also hung with a translation and a rotation error, and its width differs from the 48 in stud module. None of that has been in the budget.
- **Fixed inputs.** Robot tip scatter 0.9 mm per nail (`buildbot-fasten`); stud estimate scatter a shared error per stud, single read (`buildbot-studfind`'s policy); 8d common nail, 1.5 in face, 3/8 in edge distance, 1/8 in gap (APA builder tips, via search).
- **H1 (the gap alone tightens the stud budget).** Perfect placement, nominal aim: the single-read stud scatter allowed for 95% clean sheets falls below 0.70 mm (from `buildbot-studfind`'s 0.89 mm with no gap). Refuted if ≥ 0.70 mm.
- **H2 (a nominal-aim robot needs a near-perfectly plumb sheet).** With stud scatter 0.5 mm and tip scatter 0.9 mm, the sheet rotation (1σ) allowed for 95% clean sheets is under 0.05°. Refuted if ≥ 0.05°.
- **H3 (seeing the edge buys placement tolerance).** Aiming each joint nail from the measured sheet edge (edge-line error 0.5 mm) at least doubles the sheet translation (1σ) allowed for 95%, against aiming at the design window. Refuted if the ratio is under 2.
- **H4 (sheet-referenced rows drift off the studs within a wall).** Butting each sheet against the last with a 1/8 in gap: with full 48 in panels the third sheet's joint window is empty (arithmetic: 3.2 mm of drift a sheet against a 6.3 mm window); with panels trimmed by the typical 1/16 in ("sized for spacing"), no more than 5 sheets in a row keep every joint window non-empty. The Monte Carlo adds gap and width noise; refuted if a 1/16 in row stays feasible (≥ 50% of trials) past sheet 5.
- **H5 (stud-referenced placement fixes the drift).** Setting each sheet from its own studs keeps every joint feasible, and with 1/16 in trimmed panels and a width scatter of 1 mm (1σ) the realised gap is positive at ≥ 99% of joints. Refuted below 99%.
- **Also reported, not scored:** clean-sheet rate along a 10-sheet row for each placement and aim; nails missed per sheet; the allowed stud scatter as a function of gap.
