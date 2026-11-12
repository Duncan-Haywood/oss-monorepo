# buildbot-sheathing research log

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
