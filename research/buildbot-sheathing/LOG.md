# buildbot-sheathing research log

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
