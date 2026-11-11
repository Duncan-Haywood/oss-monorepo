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

## Reproduce
```bash
pip install numpy matplotlib pytest
cd research/buildbot-sheathing
python -m pytest -q tests                                    # 6 tests; one uses ../buildbot-studfind
python experiments/m1_gap_placement/run.py > experiments/m1_gap_placement/results.txt   # ~12 s, writes results.json
python experiments/m1_gap_placement/figure.py
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

## Limitations
- **Gaussian, independent, swept.** Stud, edge, gauge and width errors are swept, not measured;
  real errors have bias and heavy tails. The stud estimate includes the layout scatter
  (studfind's single-read policy).
- **Studs are straight and points.** Crook, twist and a stud face that rotates under the joint
  are milestone 2; sheet bow and wall racking are not modelled.
- **Plate nails** see only the tool scatter: the sheet's vertical placement is not modelled.
- **Strict pass/fail.** One nail outside its window fails the sheet; the nails missed are
  reported beside it, and real practice may accept a near miss or re-drive it.
- **Windows from secondary sources.** The gap, edge distance and trim were read in search
  results (APA pages, a manufacturer's guide, a trade Q&A), not in APA E30 or the code.

## Next steps
Milestone 2: as-built framing variation (stud crook and twist; the Adel et al. 2024 data set if
it can be fetched). Milestone 3: the sheet pose a G1/H1 co-hold, a lift or a ledger guide leaves
in MuJoCo, against the ~0.03° found here. The full plan is in [`PROPOSAL.md`](PROPOSAL.md),
"Milestones".

## Owner steps
None needed. A hardware check needs a framed mock-up wall, a nailer on an arm, a measured stud
grid and a risk assessment.

## Outside dependencies (vitamins)
NumPy, Matplotlib (figure), pytest. Reads `../buildbot-studfind` in one test. No group in
`prompt.md` covers construction, and none is claimed.
