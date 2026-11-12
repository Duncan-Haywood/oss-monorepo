# buildbot-sheathing: can a robot nail wall sheathing to code tolerance, and what decides it?

**Live page:** https://marisstella.app/research/buildbot-sheathing/

A research programme (proposal: [`PROPOSAL.md`](PROPOSAL.md); log: [`LOG.md`](LOG.md)) on
**robotic sheathing of a wood-frame wall**: whether a stock humanoid, a mobile manipulator with a
lift or a purpose-built gantry can hang a 4x8 sheet and land all 62 nails where the panel maker
and the code want them, which error source decides it, and what a clean sheet costs. It pulls
together track 20's 26 `buildbot-*` projects, which priced reach, push, recoil, stud sensing and
cost one at a time, into one question aimed at *Automation in Construction*. Produced with AI
assistance (Claude); simulation and analysis only, nothing tested on hardware.

**Milestone 1 headline: the panel gap and the sheet's own pose set the budget.** Earlier
projects put each sheet edge exactly on its joint stud. Panels are actually hung with a 1/8 in
gap (APA's recommendation), so each edge sits 1/16 in past the stud centre, and the nail must
still be 3/8 in in from that edge and on the stud. That shrinks the 34 joint nails' window from
±3.93 to **±3.14 mm**, and the stud reading a robot needs for 95% clean sheets from 0.90 mm to
**0.41 mm** (1σ, single read, 0.9 mm tool scatter). A sheet must also hang **plumb to about
0.03° (1σ)** and in place to about 0.4–0.6 mm, even when the robot measures the sheet edge and
aims from it; aiming at the design window instead leaves no tolerance at all at a 0.5 mm stud
reading. Along a wall, sheets butted against each other with a 1/8 in gap **leave their studs by
the third sheet** with full 48 in panels and by the fifth with panels trimmed 1/16 in; setting
each sheet from its own studs keeps every sheet at 98% clean.

![Joint budget against the gap, clean sheets against sheet rotation, and clean sheets along a butted row](experiments/m1_gap_placement/figure.png)

**Milestone 2 headline: a bowed stud closes the joint, and wider joint framing fixes it where
sensing cannot.** Real studs are not straight. A Stud-grade 8 ft 2x4 may bow 3/4 in and twist
3/8 in, and published kiln-dried studs average 0.11 to 0.21 in of bow and 0.08 to 0.16 in of
twist. Bow moves the 1.5 in nailing face sideways under a sheet edge that is straight, so the
joint window shrinks by the bow whatever the robot knows: a joint stud on a single 2x closes for
any bow over **0.53 in** (8 ft equivalent; 12.5 mm on the stud). At the lower published warp a
robot that reads each stud once gets **55% clean sheets**; reading it at three heights and
fitting the curve gets **80%**, and even perfect stud and edge reads only 87%. To reach 95% on single 2x joints a framer
would have to reject about **two thirds of the studs** for bow (over 1/16 in). Framing the
joints with a **3x or two 2x fastened together**, which the shear-wall standard (SDPWS 4.3.7.1)
already calls for at adjoining panel edges in some shear walls, makes the window 1/2 in wider on each side, and three
reads per stud then give **100% clean sheets** at both published warp levels (20,000 sheets a
cell). Twist costs 1–2 points; plate layout lean of 1.6 mm costs 8.

![Clean sheets by stud sensing and joint framing, culling bowed studs, and plate lean](experiments/m2_asbuilt_studs/figure.png)

**Not a rated accuracy or a safety case.** Gaussian errors, mostly swept rather than measured;
a single nail outside its window counts as a failed sheet, though a person could pull and
re-drive it. Nailing near people needs a risk assessment (ISO 10218, ISO/TS 15066).

## Milestone 1 method (`src/buildbot_sheathing/budget.py`)
- **Windows.** The 62-nail schedule of [`buildbot-fasten`](../buildbot-fasten): 17 joint nails
  on each vertical edge (6 in), 7 field nails on each intermediate stud (12 in), 14 plate nails.
  A joint nail must land at least 3/8 in from the sheet's actual edge and with its shank on the
  stud face. Field and plate nails keep [`buildbot-studfind`](../buildbot-studfind)'s windows.
- **Sheet.** Its left edge sits at gap/2 + offset + x + θ (z − H/2) from the joint stud's
  centre, its right edge one sheet width further. x and θ are the hanging error, the width is
  48 in minus a trim plus a manufacturing error.
- **Aim.** *Nominal*: the centre of the design window from the robot's estimate of the stud.
  *Edge*: the centre of the window between the measured edge (+3/8 in) and the estimated far
  stud face.
- **Rows.** *Butt*: each sheet set against the last with a gauge gap (offsets accumulate).
  *Stud*: each sheet set from its own studs (the gap absorbs the width error).
- **Checks** (`tests/`, 6 tests): with no gap the model reproduces `buildbot-studfind`'s
  quadrature within 0.01 at three error settings; translation-only and rotation-only results
  match closed forms (|x| ≤ h, |θ| ≤ h/(H/2 − 3/8 in)) within 0.01; edge aim with perfect
  sensing passes exactly while the shifted window is non-empty; a row of exactly trimmed panels
  does not drift.

| Input | Value | Source |
|---|---|---|
| Nail, stud face, edge distance, schedule | 8d common (0.131 in), 1.5 in, 3/8 in, 6/12 in | [`buildbot-fasten`](../buildbot-fasten); edge distance also APA builder tips and West Fraser's install guide, via search |
| Panel gap | 1/8 in at edges, centred on the stud; swept 0 to 3/16 in | APA builder tips (a recommendation, not a requirement), via search, not opened |
| Panel trim ("sized for spacing") | 0, 1/16, 1/8 in | APA TT-055 (up to 1/8 in at the maker's option); "typically 1/16 in" from a JLC Q&A answer; via search |
| Tool-tip scatter | 0.9 mm per nail | `buildbot-fasten` model result (G1, 11-bit joint sensors) |
| Stud estimate scatter | 0.5 mm (0.3 mm sensitivity); swept in table A | **not measured**; inside `buildbot-studfind`'s budget |
| Edge-line error | 0.25, 0.5, 1 mm | **not sourced**: swept |
| Gauge-gap scatter, panel width scatter | 0.5 mm; 0.5 and 1 mm | **not sourced**: one product sheet lists ±1/16 in on width (seen in search); swept |

## Milestone 2 method (`src/buildbot_sheathing/asbuilt.py`)
- **Studs.** Each stud's face line is a parabola of bow b (zero at the plates, sign random) plus
  a straight lean from independent plate-layout errors at its ends; its section twists linearly,
  φ(z) = φ<sub>T</sub>(z/H − 1/2), with φ<sub>T</sub> = (twist rise)/3.5 in. 8 ft warp figures
  are scaled to the 92 5/8 in precut stud (bow by length², twist by length). Magnitudes are
  half-normal or exponential with a published mean, truncated at the grade limit. Crook moves the
  face out of the wall plane and is not modelled.
- **Twist.** A nail must keep its whole shank in wood for at least 10 nail diameters (1.31 in;
  6D swept) within the 2 1/16 in an 8d nail has past 7/16 in sheathing, through the rotated
  section with the sheathing bearing on its high corner. The band of good positions is computed
  by clipping the nail line against the rotated rectangle (`_band_one`, `Band`).
- **Sheets** are straight and plumb; on each joint stud the gap is centred on the middle of the
  robot's estimate of the stud's range (minimax), and panels are cut to fit (milestone 1's width
  drift is left aside).
- **Sensing.** *single*: one read at mid-height (studfind). *ends*: two reads, a line. *three*:
  bottom, middle, top, a parabola. *dense*: a read at each of the 17 joint heights, a fitted
  parabola. Reads 0.5 mm (1σ, independent), measured edge 0.5 mm, tool 0.9 mm.
- **Checks** (`tests/test_asbuilt.py`, 8 tests): the untwisted band is the stud face less the
  shank; the band is mirror-symmetric in twist and shrinks with it, by no more than the
  small-angle bound; straight studs and perfect sensing reduce to the closed-form erf product of
  the 62 half-windows (within 0.01); three or dense reads recover a noiseless parabolic bow
  exactly while a single read passes exactly a quarter of sheets; the bow feasibility edge
  matches the arithmetic (4h on the stud's range, 2h on the plate line) within 3%; truncated
  draws keep their mean and limit; a 3x joint widens the window by 1/2 in a side.

| Milestone 2 input | Value | Source |
|---|---|---|
| Stud-grade warp limits, 8 ft 2x4 | crook 1/4 in, bow 3/4 in, twist 3/8 in | USDA Forest Service reports quoting the 1978 NHPMA grading rules, and Shelly, Arganbright and Birnbach (1979), *Wood and Fiber* 11(1):50–56 (0.64, 1.90, 0.95 cm); seen in search results, not opened. One USDA report gives bow 1/2 in |
| Published mean warp, kiln-dried 2x4 studs | bow 0.11, twist 0.08 in ("low"); bow 0.21, twist 0.16 in ("high") | Koch, *Forest Products Journal* technical note (crook, bow, twist 0.06, 0.11, 0.08 in; drying treatment unclear from the snippet); Koch (1974), southern pine studs between serrated kiln sticks (0.13, 0.21, 0.16 in); both southern pine, seen in search results, not opened |
| Shape of the warp distribution | half-normal and exponential, truncated at the limit | **not sourced**: only means were visible; both shapes are reported |
| Required penetration | 10 D = 1.31 in (6 D swept) | NDS full-design-value penetration, **from memory**, not checked this session |
| Nail length, sheathing | 2.5 in 8d common; 7/16 in OSB | standard sizes |
| Joint framing alternatives | 3x (2.5 in face), two 2x fastened (3.0 in) | SDPWS 4.3.7.1 (3 in nominal or two 2x at adjoining panel edges, for some shear walls), via AWC errata and code-table snippets in search results |
| Plate layout error at each stud end | 0, 0.8, 1.6, 3.2 mm | **not sourced**: swept |
| Stud read, edge line, tool | 0.5, 0.5, 0.9 mm | as milestone 1 (read and edge swept there; read swept in table E here) |

## Reproduce
```bash
pip install numpy matplotlib pytest
cd research/buildbot-sheathing
python -m pytest -q tests                                    # 14 tests; one uses ../buildbot-studfind
python experiments/m1_gap_placement/run.py > experiments/m1_gap_placement/results.txt   # ~12 s, writes results.json
python experiments/m1_gap_placement/figure.py
python experiments/m2_asbuilt_studs/run.py > experiments/m2_asbuilt_studs/results.txt   # ~40 s, seed 3
python experiments/m2_asbuilt_studs/figure.py
```

## Milestone 1 results (`experiments/m1_gap_placement/results.txt`)
- **A. Gap.** Joint half-window 3.93, 3.73, 3.53, 3.34, 3.14, 2.74 mm at gaps 0, 1/32, 1/16, 3/32,
  1/8, 3/16 in; stud scatter allowed for 95%: 0.90, 0.79, 0.68, 0.56, 0.41, 0 mm; tip scatter
  allowed with perfect studs: 1.23, 1.17, 1.11, 1.05, 0.98, 0.86 mm. At `buildbot-studfind`'s
  0.89 mm: 0.95 clean without the gap, 0.75 with it planned for, 0.56 (1.1 nails missed) if the
  robot aims for no gap.
- **B. Pose** (gap 1/8 in, tip 0.9 mm). At stud 0.5 mm, nominal aim is at 0.93 clean with a
  perfect sheet, so no pose error is allowed; edge aim allows 0.62 / 0.44 / 0 mm of translation
  and 0.044° / 0.031° / 0° of rotation with the edge measured to 0.25 / 0.5 / 1 mm. At stud
  0.3 mm: nominal 0.38 mm and 0.028°, edge (0.5 mm) 0.61 mm and 0.042°. Edge aim also halves the
  stud error's weight (the aim point sits midway between edge and stud face): 0.93 to 0.96 clean
  with a perfect sheet.
- **C. Rows of 10 sheets** (gauge and width scatter 0.5 mm, edge aim). Butted full panels: clean
  0.98, 0.22, then 0; butted 1/16 in trimmed panels: 0.98, 0.73, 0.25, 0.05, 0.01, then 0;
  butted 1/8 in trimmed panels: 0.95 falling to 0.66 by sheet 10 (the gauge error accumulates);
  set from the studs: 0.98 at every sheet. With 1 mm of width scatter, stud-referenced 1/16 in
  panels would need a negative gap at 5.6% of joints.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H1 held; H2 held trivially; H3 held at
  the planned setting and fell short (ratio 1.6) at a tighter one; H4 partly refuted (the third
  butted sheet's window exists in 46% of trials, but none is clean); H5 refuted.

## Milestone 2 results (`experiments/m2_asbuilt_studs/results.txt`)
- **A. Geometry.** Half-window 3.14 mm. The largest wall bow that leaves a window on both sides
  of a single-2x joint is 12.5 mm with the gap centred on the stud's range (0.53 in over 8 ft) and
  6.3 mm centred on the plate line (0.27 in). Stud-grade's limit is 17.7 mm on the stud. Studs
  whose bow closes a joint: 0.01% and 0.7% (low warp, half-normal and exponential), 4.0% and 5.4%
  (high warp) with minimax centring; 5–31% with the plate line. Twist shrinks the side of the band
  the nail runs toward: the half-band falls from 17.38 to 16.94, 16.03 and 14.64 mm at 1°, 3° and
  6° (10D); the grade limit is 5.9° end to end.
- **B. H6.** Every stud at the bow limit: no feasible sheet under three or dense reads (minimax);
  single and ends pass 25%, the sheets whose own sides of both joints happen to open, which
  closes the neighbouring sheet's side.
- **C. Main table** (clean sheets; single / ends / three / dense). Straight studs 0.94 / 0.96 /
  0.96 / 0.97. Low warp, half-normal 0.55 / 0.55 / 0.80 / 0.83 (1.7, 2.2, 0.26, 0.21 nails missed
  a sheet); exponential 0.58 / 0.59 / 0.77 / 0.79. High warp, half-normal 0.39 / 0.35 / 0.47 /
  0.50; exponential 0.45 / 0.40 / 0.52 / 0.55.
- **D. Ablation (low warp).** Twist alone costs 1 point (three: 0.959 to 0.949); bow alone 14
  (0.818); 6D instead of 10D penetration gains 2 points; perfect reads lift three to 0.85 and
  perfect reads and edge to 0.87: the ceiling is the window the bow leaves against 0.9 mm of tool
  scatter, not sensing.
- **E.** Read scatter allowed for 95% on straight studs: 0.44 / 0.55 / 0.60 / 1.19 mm; with the
  low published warp no policy reaches 95% at any read scatter.
- **F. Culling (low warp).** Rejecting studs bowed over 1/4, 1/8 and 1/16 in (7%, 36%, 65% of
  studs) gives three-read 0.85, 0.92, 0.94 and dense 0.88, 0.94, 0.96.
- **G. Lean.** Plate layout error of 0.8 / 1.6 / 3.2 mm at each end takes three-read from 0.80 to
  0.78 / 0.72 / 0.55.
- **H. Joint framing** (added after C–F). A 3x joint (2.5 in face) or two 2x fastened (3.0 in):
  largest bow 37.9 and 50.6 mm, above the grade limit. Three or dense reads: **1.0000** at both
  warp levels and both shapes. Single read: 0.99 and 0.85 (3x, low and high warp), 1.00 and 0.95
  (two 2x).
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H6 held; H7 held (0.55 < 0.80); **H8
  refuted** (three reads give 0.80, not ≥ 0.95, on single-2x joints); H9 held (twist costs 1.4
  points, under 3).

## Limitations
- **Gaussian, independent, swept.** Stud, edge, gauge and width errors are swept, not measured;
  real errors have bias and heavy tails. The stud estimate includes the layout scatter
  (studfind's single-read policy).
- **Studs (milestone 2).** Warp means come from two southern pine studies seen as search
  snippets; the distribution shapes are guesses (two are reported); bow is a parabola fixed at
  the plates and twist is linear, both as the free piece warped, though nailing, blocking and
  the sheathing itself pull a stud partly straight (which would help) and studs keep moving as
  they dry in place (which would not). Crook, sheet bow and wall racking are not modelled.
- **Plate nails** see only the tool scatter: the sheet's vertical placement is not modelled.
- **Strict pass/fail.** One nail outside its window fails the sheet; the nails missed are
  reported beside it, and real practice may accept a near miss or re-drive it.
- **Windows from secondary sources.** The gap, edge distance and trim were read in search
  results (APA pages, a manufacturer's guide, a trade Q&A), not in APA E30 or the code.

## Next steps
Milestone 2 left two checks: measured stud profiles (the Adel et al. 2024 data set, or a scan of
real studs in a wall) in place of means and assumed shapes, and how far sheathing nails pull a
bowed stud straight. Milestone 3: the sheet pose a G1/H1 co-hold, a lift or a ledger guide leaves
in MuJoCo, against the ~0.03° found here. The full plan is in [`PROPOSAL.md`](PROPOSAL.md),
"Milestones".

## Owner steps
None needed. A hardware check needs a framed mock-up wall, a nailer on an arm, a measured stud
grid and a risk assessment.

## Outside dependencies (vitamins)
NumPy, Matplotlib (figure), pytest. Reads `../buildbot-studfind` in one test. No group in
`prompt.md` covers construction, and none is claimed.
