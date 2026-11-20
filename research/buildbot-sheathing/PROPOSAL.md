# Proposal: can a robot sheath a wood-frame wall to code tolerance, and what decides it?

Programme `buildbot-sheathing`, opened 2026-11-11 (track 20, robots on the residential building
site). Written with AI assistance (Claude Code). This is a plan: nothing below is a result
unless it cites a file in this repository. **Citation status.** `research/_shared/cite_check.py`
could not reach Crossref, doi.org or arXiv from this session (the proxy refused all three), and
publisher pages would not load. Each work below was checked against a catalogue record (DBLP, the
publisher's or arXiv's listing, a university repository) seen through web search on 2026-11-11:
authors, venue, year and identifier match that record. None was read in full in this session, so
the one-line summaries come from abstracts and records, and each says what we could and could not
see. Identifiers marked **[memory]** were not found in any record this session; check them before
reuse.

## Question

Can a robot (a stock humanoid, a mobile manipulator with a lift, or a purpose-built gantry) hang
and nail the wall sheathing of a wood-frame house so that every fastener lands where the code and
the panel maker require, at a lower cost per sheet than a two-person crew, and which error source
(framing as built, stud sensing, sheet placement, arm control, tool recoil) and which seconds of
the cycle decide that?

It is open because the pieces have been studied apart. Mobile construction robots have been
localised to a few millimetres (Sandy et al. 2016; Lachmayer et al. 2022), factory and
multi-robot timber assembly correct their paths from measurement (Willmann et al. 2016; Adel et
al. 2024), a humanoid has screwed plasterboard to a wall (Kumagai et al. 2019), and stud pose
has been estimated from images (Cote et al. 2024). Our own 26 `buildbot-*` projects
priced reach, push, recoil, stud sensing and cost one at a time. What no work we found does is
carry every error source through to the outcome a builder inspects, the share of sheets with
every nail inside its window, on the geometry a real wall has (panel gaps, sheets that are not
quite 48 in, studs that are not quite on 16 in), and ask which robot design meets it.

## Why it matters

Fastening is the largest share of the framing crew's hours in our task book (31%,
[`buildbot-taskbook`](../buildbot-taskbook)), and sheathing is its most repetitive part: 62 nails
a 4x8 sheet ([`buildbot-fasten`](../buildbot-fasten)). Panel-line integrators and construction-robot
start-ups decide what sensing and fixturing to build on exactly this question: if the joint nails
need sub-millimetre placement, a robot must see the sheet edge and the stud, or the line must
hold the sheet in a jig, and a stock humanoid that cannot hang a sheet plumb to a few hundredths
of a degree is the wrong machine. A nail that misses the framing holds nothing, and where the sheathing braces the wall the
nailing schedule is structural, so the clean-sheet rate is the number a builder acts on, not a
robot's repeatability.

## Related work

*On-site and mobile construction robots.*
- Sandy, Giftthaler, Dörfler, Kohler and Buchli (2016), "Autonomous repositioning and
  localization of an in situ fabricator", ICRA 2016, 2852–2858
  (https://dblp.org/rec/conf/icra/SandyGDKB16). On-board sensing keeps a mobile arm's end
  effector accurate across repositioning (a brick stack). Settles that a site robot can be
  localised; does not budget a fastening task against it.
- Giftthaler et al. (2017), "Mobile robotic fabrication at 1:1 scale: the In situ Fabricator",
  *Construction Robotics* (doi:10.1007/s41693-017-0003-5; arXiv:1701.03573). The full system
  and two building-scale demonstrations (a brick wall, Mesh Mould). Shows the accuracy problem
  and a solution at the scale of one robot; no fastener windows.
- Lachmayer et al. (2022), ISPRS Archives XLIII-B1-2022, 453
  (https://isprs-archives.copernicus.org/articles/XLIII-B1-2022/453/2022/). Frames the main
  difficulty of mobile construction robots as the gap between the precision a task needs and the
  positioning accuracy a robot achieves, and refines the base pose with a laser scanner. Exactly
  our framing, for a different task; title not confirmed beyond the record.
- Kumagai et al. (2019), "Toward industrialization of humanoid robots: autonomous plasterboard
  installation to improve safety and efficiency", *IEEE Robotics & Automation Magazine* 26(4),
  20–29 (https://dblp.org/rec/journals/ram/KumagaiKMSNKKKB19). The HRP-5P humanoid carries an
  11 kg board and screws it to a wall, localising against a 3-D map. The closest work to a
  humanoid sheathing a wall; we could not see whether it measures screw placement against the
  framing.

*Timber framing and panel assembly with robots.*
- Willmann, Knauss, Bonwetsch, Apolinarska, Gramazio and Kohler (2016), "Robotic timber
  construction — expanding additive fabrication to new dimensions", *Automation in Construction*
  61, 16–23 (doi:10.1016/j.autcon.2015.09.011). Robotic spatial assembly of timber members in a
  factory; positioning, not fastener windows on sheathing.
- Adel, Ruan, McGee and Mozaffari (2024), "Feedback-driven adaptive multi-robot timber
  construction", *Automation in Construction* 164, 105444 (https://par.nsf.gov/biblio/10567690;
  dataset doi:10.34770/0w80-p436, CC BY 4.0). Pose-based and topology-based adaptation from
  as-built measurement; reduced deviations on nail-laminated panels and built a two-robot wall
  frame. The strongest recent baseline for "measure, then correct" and the most promising real
  as-built data set for milestone 2.
- Construction Robotics (2024), coarse-to-fine stud pose estimation for robot-assisted wood
  light-frame assembly (doi:10.1007/s41693-024-00122-0; Autodesk Research,
  https://research.autodesk.com/?p=5898). Deep-learning stud pose plus classical refinement with
  consumer sensors, on walls of good and poor lumber. The real-sensor counterpart of our swept
  stud error; authors and accuracy figures not confirmed in this session.
- ISARC 2019 paper 107 (https://www.iaarc.org/publications/fulltext/ISARC_2019_Paper_107.pdf).
  Argues off-site timber-frame module production misses the accuracy it needs and corrects the
  robot's path from a camera measurement of the grasped element. Authors and title not confirmed.

*Tolerance analysis.*
- Chase and Parkinson (1991), "A survey of research in the application of tolerance analysis to
  the design of mechanical assemblies", *Research in Engineering Design* 3, 23–37
  (doi:10.1007/BF01580066). Worst-case against statistical stack-up and allocation; the
  machinery we use, from mechanical assembly, not applied to construction fastening.

*Simulation and control the later milestones use.*
- Todorov, Erez and Tassa (2012), "MuJoCo: a physics engine for model-based control", IROS
  (doi:10.1109/IROS.2012.6386109). The simulator of every `buildbot-*` project.
- Castro, Permenter and Han (2023), "An unconstrained convex formulation of compliant contact",
  *IEEE Transactions on Robotics* (arXiv:2110.10107; checked by `cite_check.py`
  2026-11-12). Drake's SAP solver; the second contact model of milestone 6.
- Castro, Qu, Kuppuswamy, Alspach and Sherman (2020), "A transition-aware method for the
  simulation of compliant contact with regularized friction", *IEEE Robotics and Automation
  Letters* (arXiv:1909.05700; checked by `cite_check.py` 2026-11-12). Drake's TAMSI solver,
  the third check of milestone 6.
- Zakka et al. (2025), "MuJoCo Playground" (arXiv:2502.08844). GPU training of locomotion and
  manipulation policies, including Unitree G1 locomotion; the route to a learned hang-and-hold
  policy.
- Kajita et al. (2003), biped walking pattern generation by preview control of the zero-moment
  point, ICRA (doi:10.1109/ROBOT.2003.1241826 **[memory]**). The model-based baseline for
  walking with a sheet.
- Tobin et al. (2017), domain randomization for sim-to-real transfer (arXiv:1703.06907
  **[memory]**). The standard way to train the placement policy for a variable sheet and wall.

*Practice the windows come from.* APA builder tips on panel spacing and fastener edge distance
(1/8 in gap at panel edges and ends, a recommendation, not a requirement; fasteners 3/8 in from
panel edges; https://www.apawood.org/buildertips/pages/M300.html) and APA's technical topic on
panels "sized for spacing" (trimmed up to 1/8 in at the maker's option;
https://www.apawood.org/guides-tools-training/technical-document-library/technical-topics/sized-for-spacing/),
both seen as search-result records, not opened.

*Our own prior work* (cited as prior work, not as evidence from outside):
[`buildbot-fasten`](../buildbot-fasten) (the 62-nail schedule and ±3.9 mm joint window),
[`buildbot-studfind`](../buildbot-studfind) (a single stud read good to 0.89 mm),
[`buildbot-recoil`](../buildbot-recoil) and [`buildbot-nailseq`](../buildbot-nailseq) (recoil
moves the tip 1–4 mm and costs no time), [`buildbot-cohold`](../buildbot-cohold) (a co-held
sheet tilts 2–6° during the lift), [`buildbot-stance`](../buildbot-stance),
[`buildbot-mobilebase`](../buildbot-mobilebase) and [`buildbot-custom`](../buildbot-custom)
(cycle time by robot class), [`buildbot-skills`](../buildbot-skills) and
[`buildbot-mjsheet`](../buildbot-mjsheet) (sim-to-sim of the sheet-follow skill),
[`house-offsite`](../house-offsite) (factory wall panels).

## Gap

No published work we found, and none of our own, propagates the full chain (as-built framing,
stud sensing, panel gap and width, sheet placement, arm, tool) to the clean-sheet rate of
sheathing nailing, compares aiming strategies (at the design window, from the measured edge,
measure-then-tack) on that outcome, or ranks robot classes by the cost of a clean sheet. The
claim is narrow: a tolerance-allocation analysis for one construction fastening task, checked in
a physics simulator and, where data allow, on measured as-built framing, with the robot designs
priced on the same budget.

## Hypotheses

- **H-A (the edge decides).** Once the panel gap and the sheet's pose are in the budget, the
  joint nails' window, not stud sensing alone, sets the clean-sheet rate, and aiming each joint
  nail from the measured sheet edge is needed to reach 95%. Refuted if a robot aiming at the
  design window reaches 95% clean sheets with sensing and placement errors a commercial system
  achieves.
- **H-B (placement is the humanoid's bottleneck).** The sheet rotation a 95% clean-sheet rate
  allows (milestone 1: about 0.03° 1σ) is far tighter than a stock humanoid co-holding a sheet
  can hang it; a humanoid needs a guide (a ledger board, a jig) or a tack-then-measure strategy.
  Refuted if a MuJoCo hang policy for the G1 or H1 places sheets within the budget in ≥ 95% of
  randomised episodes.
- **H-C (rows need stud referencing).** Sheets butted against each other drift off their studs
  within a wall unless each is set from its own studs. Refuted if butted rows of commercially
  trimmed panels stay inside the joint windows along a 40 ft wall.
- **H-D (the cheapest clean sheet).** On cost per clean sheet, a mobile base with a lift beats a
  walking humanoid at every sensing quality, and a gantry beats both above a volume we will
  state. Refuted if the ranking flips inside the swept ranges.
- **H-E (sim-to-sim).** Clean-sheet rates of the final policies agree within 10 percentage
  points between two contact models (MuJoCo's soft contact and a second model or simulator).

## Method

*Theory.* Statistical tolerance analysis (Chase and Parkinson 1991) with the error structure of a
wall: errors shared by every nail on a stud, by every nail on a sheet edge, and drifting along a
row, propagated to the probability that all 62 nails land inside their windows. Closed forms or
quadrature where they exist, checked against Monte Carlo (milestone 1 does this for translation
and rotation; `tests/`).

*Experiments.* (1) The budget model with sourced windows (APA, the code) and swept errors.
(2) As-built framing variation from real data: the Adel et al. (2024) data set if it can be
fetched, otherwise lumber grading limits on crook and twist, swept. (3) A MuJoCo scene: a framed
wall, a flexing sheet (`buildbot-mjsheet`), the Menagerie G1 and H1, a mobile base with a lift;
placement policies (impedance follow, a ledger guide, tack-then-measure) scored on the sheet pose
they leave. (4) The full cycle with the nailer recoil of `buildbot-recoil` and the sequence of
`buildbot-nailseq`. (5) A second contact model for sim-to-sim. (6) Cost per clean sheet through
`buildbot-cost` and `house-cost`.

## Evaluation

Metrics: clean-sheet rate (all 62 nails inside), nails missed per sheet, seconds per sheet, cost
per clean sheet. Baselines: a two-person hand crew (time from `buildbot-taskbook`, swept);
aiming at the design window (the implicit assumption of `buildbot-fasten`/`studfind`); measure
and correct (the pose-based adaptation of Adel et al. 2024) as the strongest published strategy;
the gantry of `buildbot-custom` as the purpose-built baseline. Statistics: fixed seeds, at least
20,000 Monte Carlo sheets per cell (binomial standard error under 0.002 at 95%), Wilson
intervals on simulated episode rates, 10+ seeds for learned policies with their spread.
Ablations: remove one error source at a time; gap 0 against 1/8 in; each aiming policy.

## Milestones

1. **Gap, pose and row drift in the joint budget** (done 2026-11-11, `experiments/m1_gap_placement/`).
2. **As-built studs** (done 2026-11-12, `experiments/m2_asbuilt_studs/`): bow and twist from
   grading limits and published means; bow closes single-2x joints, wider joint framing reopens them.
   Still open: measured stud profiles in place of means.
3. Placement in MuJoCo: the sheet pose a G1/H1 co-hold, a lift and a ledger guide leave. First
   part done 2026-11-12 (`experiments/m3_ledger/`): a released sheet seats on a ledger to 0.0001°
   below a press of about 100 N; then panel squareness (PS 2) leaves 100% clean sheets on doubled
   joints and at most 84–95% on single 2x. Second part done 2026-11-12 (`experiments/m3b_humanoid/`):
   neither a G1 (8.7 kg) nor an H1 (18.8 kg) can carry the sheet to the wall, both can press it
   on the ledger (66–110 N, 128–281 N), and at Unitree's stock gains both are soft enough for the
   ledger to seat it, except an H1 with a rigid clamp. Still open: the dynamic hand-off.
4. **Tack-then-measure** (done 2026-11-12, `experiments/m4_tack_measure/`): the hang allowed is
   0.03° and 0.4 mm on single 2x joints and 0.54° and 10 mm on doubled ones; re-hanging cannot
   lift single-2x joints to 95%. Run before milestone 3, to give it a target.
5. **End-to-end cycle** (done 2026-11-12, `experiments/m5_cycle/`): ledger or lift-tack
   placement, sensing, recoil and rework in one steady-state cycle. Two 2x at the joint with one
   read a stud: 0.9994 clean, 76–216 s a sheet; the best single-2x pipeline (three reads) 0.56
   clean and 18–65 s slower, which is what the extra joint stud may cost. Still open: a measured
   time for each stage.
6. **Sim-to-sim on a second contact model** (done 2026-11-12, `experiments/m6_drake/`): the
   ledger seat and slide rebuilt in Drake (SAP). Clean sheets of all 24 ledger pipelines agree
   within 0.05 points (H-E held); Drake's press thresholds sit at 97–100% of the closed form,
   MuJoCo's at 87–99%. Still open: how far a bowed bottom edge rocks the sheet (0.11–0.15°,
   model-dependent).
   **6b. The bowed bottom edge** (done 2026-11-13, `experiments/m6b_bowed_edge/`): modelled as a
   curve, a 1/16 in bow is a stable rocker (R = 117 m against h0 = 1.22 m) and seats inside the
   friction band θ_s = μ F_n r̄ / (m g (R − h0)) in both engines (99th percentile 0.06° against the
   0.149° three-foot rock); the best single-2x pipeline goes from 0.56 to 0.625 clean. A kink or
   1 mm of grit keeps a rock of up to 0.09–0.15°, set by the approach.
7. **Cost per clean sheet by robot class** (done 2026-11-12, `experiments/m7_cost/`): the G1 on a
   drive-and-lift base is the cheapest robot below about 500 houses a year and beats the walking H1
   in every draw; it beats a hand crew in 37% of draws at 100 houses a year and 74% at 300. Doubled
   joints never pay in dollars unless a missed nail costs about $6.50 more than its re-drive.
8. **Paper draft** (done 2026-11-12, `paper/draft.md`): the article for *Automation in Construction*
   in its structure, with `paper/check_numbers.py` tying each quoted figure to its results file.
   Still open: the Elsevier LaTeX template, the unconfirmed citations and authorship.
9. **Straighten the joint stud instead of doubling it** (done 2026-11-13, `experiments/m9_straighten/`):
   a mid-height push onto the line takes 48 E I b / L³, a median of 28 N and a 99th percentile of
   126 N at the published warp (376 N at the grade limit), which a stock G1 can just manage
   (81–88 N sideways, covering 93% of low-warp studs). It lifts single-2x clean sheets from 0.56
   to 0.71 (low warp) and 0.31 to 0.68 (high), but not to 95%: on straight studs the same pipeline
   gives 0.74, so the sheet's pose, not bow, is the remaining cap. Still open: a mock-up push to
   pin the end restraint, and whether a pushed stud stays put between sheets.
10. **What the straight-stud ceiling is made of** (done 2026-11-13, `experiments/m10_ceiling/`):
   by Shapley share the tool's 0.9 mm scatter carries 45–47% of single 2x's misses on straight
   studs, the pose 39–44% and the reads the rest, and neither group misses alone. Sliding the sheet
   to centre its gap and shimming it plumb before tacking lift the ceiling from 0.74–0.81 to
   0.92–0.94; 95% then needs a tool held to about 0.8 mm. Still open: the slide and shim as
   mechanisms, and a measured tool scatter.

11. **Measured studs** (done 2026-11-13, `experiments/m11_measured/`): six installed studs from the
   Adel et al. (2024) laser scan of a robot-built 2x4 wall (CC BY 4.0). Bow amplitudes sit on the
   published mean (median 0.106 in at 8 ft), but the shape is not a parabola (0.6–0.9 mm RMS left,
   0.3–0.6 mm after removing what is common to every member), and on measured shapes the best
   single-2x pipeline gives 0.43–0.47 clean sheets against 0.58 for parabolas at the same bows.
   Doubled joints stay at 1.000. Still open: a population of framer-built walls scanned along
   the studs.
12. **The single-2x remedies on measured studs** (done 2026-11-13, `experiments/m12_remedies/`):
   reading each stud at every nail height recovers most of milestone 11's loss (0.425 to 0.530;
   waviness costs 4.7 points instead of 15.4), a mid push measured from the end chord still adds
   12.6 points, and per-nail reads, push and a slide and shim together reach 0.771 (0.860 on the
   same studs' parabolas). 95% then needs a tool held to 0.61 mm. Doubled joints stay at 1.000.
   Still open: a line-laser stud read on a robot, timed.
13. **What the remedies cost** (done 2026-11-13, `experiments/m13_price/`): with each remedy's
   seconds charged in milestone 7's cost model, the full single-2x stack costs $7.42 per clean sheet
   at 100 houses a year against $7.10 for three reads (0.771 against 0.425 first-pass clean); the
   doubled joint stud ($12.17, 1.000 clean) loses in every draw and pays only if a missed nail costs
   about $5.51 more than its re-drive. Still open: the cost and detection rate of a missed nail at
   inspection, and measured remedy times.
14. **What an escaped missed nail costs in capacity** (done 2026-11-13, `experiments/m14_escaped/`): a
   rigid-plastic fully anchored shear-wall model (Källsner and Girhammar 2009), checked against SDPWS's
   spacing table (within 6%), scores the simulated miss patterns. One joint-edge miss costs about 2% of
   its sheet; on measured studs with three reads the mean sheet loses 2.3% but the 99th percentile
   11.5%, because misses cluster. Nailing the joint edges at 4 in carries every escaped miss (99.98% of
   sheets at or above the intact 6 in sheet) for less than re-driving them. The model loses only 20% where
   Weiss (2017)'s walls with the bottom foot unnailed lost about half, so its losses are lower bounds.
   Still open: a racking test of sheets with shiners at the simulated positions.
15. **Framing joints of finite strength** (done 2026-11-14, `experiments/m15_frame_joints/`): the framed
   sheet as a rigid-body limit analysis (an LP), with stud-to-plate joints at the NDS yield-limit ratio
   (2.55 sheathing nails). It reproduces milestone 14 with rigid joints (0.09%), but at code-strength
   joints Weiss's unnailed bottom foot still costs only 20–21%: 40–50% needs joints at 0.46–0.56 of that
   ratio, or no hold-downs (64–100%). A lone sheet whose top plate can tilt loses 7% intact and 16.7% at
   the escaped-miss tail; a sliding top plate restores milestone 14's numbers; 4 in joint edges carry the
   misses either way. Still open: Weiss's anchorage, and ultimate (not design) joint and nail strengths.
16. **Softening nails** (done 2026-11-14, `experiments/m16_soft_nails/`): milestone 14's sheet pushed over
   with each nail on the tested backbone of an 8d common nail in 7/16 in OSB (Shameli Derakshan et al.
   2019). It reduces to milestone 14 for rigid-plastic nails (0.000%) and tracks SDPWS's spacing ratios
   within 6%; the unnailed bottom foot costs 20.1–20.4% at every slip-at-peak from 6 to 15 mm (rigid-plastic
   20.4%), because the perimeter nails slip almost equally. Escaped misses: 2.39% mean, 11.8% at the 99th
   percentile; 4 in joint edges carry them. Still open: the anchorage (hold-down and sill stiffness, uplift).
17. **Weiss's own wall** (done 2026-11-14, `experiments/m17_weiss_wall/`): with the thesis full text read,
   the limit analysis is rebuilt as her tested 8 by 8 ft wall (two sheets on a shared middle stud, hold-downs
   only at the wall's ends). It matches the controls' spacing ratio (1.93 against 1.87) but at NDS-ratio
   joints the decayed walls keep 80% and 63% where hers kept 57% and 34%, so the anchorage as tested does
   not explain them. Post hoc, end nails at 0.47 of the NDS ratio fit both groups (58%, 30%): the decayed
   wall then slides on its 18 sill nails whatever the sheathing schedule, as Weiss observed. Escaped misses
   cost the same on the two-sheet wall (2.7% mean, 10.4% at the 99th percentile). Still open: a tested
   ultimate for end-nailed stud-to-plate joints, and the hold-downs' and anchor bolts' shear.
18. **The anchor rods' shear path** (done 2026-11-14, `experiments/m18_holddown_shear/`): adding the HTT4
   rods' shear through the sill stops milestone 17's slide at about 420 lb a rod (below the rod's 617 lb
   design value), and then no end-nail strength fits the 3 in wall (64–74% kept against 34%). Fits need the
   rods and end nails both below their design values.
19. **The wall pushed over** (done 2026-11-14, `experiments/m19_wall_pushover/`): the same wall as a
   displacement model (sourced nail curves, softening stud joints, rods that bear after a gap). It matches
   the LP to 0.04%; a 1/16 in gap moves the decayed walls 0.1 point, early-peaking joints leave the 3 in wall
   at 71%, and all 30 fits within 5 points (960 pushovers) need end nails at a quarter of the NDS ratio.
   Still open: a tested end-nail ultimate and load-slip curve, and cyclic loading.
20. **The wall under the CUREE protocol** (done 2026-11-14, `experiments/m20_cyclic/`): SAWS pinching nails
   fitted to Weiss's materials (Anderson et al. 2007), checked against OpenSees to 2e-13. Cyclic loading
   moves the intact peaks 0.1% and the decayed 3 in wall's share 0.1 point (70.6% against 34% tested); fits
   still need end nails at a quarter of NDS. Still open: a tested end-nail ultimate, and nail fatigue and
   tear-out (a degrading nail model).
21. **Nails that lose strength with dissipated energy** (done 2026-11-15, `experiments/m21_degrading/`): the
   Rahnama–Krawinkler energy rule (c = 1) on every SAWS spring, rate swept. The intact walls' CUREE peaks fall to
   63–97% of monotonic, but the decayed shares rise 0.3–2.9 points at code-strength joints (3 in wall 70.6% to
   73.5%); the best fit stays at end nails of a quarter of NDS with no degradation. Still open: a local failure
   model for nails at the unnailed bottom edge, the middle stud splitting, and a tested 16d end-nail ultimate.
22. **The paper's capacity half** (done 2026-11-15, `paper/draft.md` sections 4.9–4.10 and 5.13–5.14): milestones
   14–21 written into the draft, with a table of the five decayed-wall models and 60 more numbers tied to their
   results files (190 checks).
23. **The submission source** (done 2026-11-15, `paper/build_latex.py`): the draft built into Elsevier's
   `elsarticle` class with natbib citations keyed to `references.bib` (23 works cited, 4 standards listed),
   checked for unconverted citations, missing keys, section/table/figure numbering and Elsevier's highlight
   limits; compiles to 27 pages with no undefined citation. Sections 4.7 and 4.8 were out of order and the
   eight highlights all ran past 85 characters (now five). Cote et al. (2024) and Lachmayer et al. (2022)
   completed from catalogue records. Still open: authorship, the abstract's length (469 words), the NDS and
   SDPWS editions.
24. **Submission limits** (done 2026-11-15, `paper/build_latex.py`): the abstract cut from 469 to 150 words,
   the journal's limit as excerpted from its guide for authors, and the build now fails on a longer abstract,
   on a single-author citation left as plain text (milestone 23's check missed them) and on a .bib entry
   cited nowhere; Ghazinader (2024) is cited where Folz and Filiatrault's set is used. 26 pages, 24 works
   cited. Still open: authorship, the NDS and SDPWS editions.
25. **Reproducibility check** (done 2026-11-15, `reproduce.py`): one command per experiment, and
   `--check`, which re-runs experiments in a temporary copy and diffs their results files against
   the committed ones. Twelve re-run (m1, m2, m4, m5, m7, m10–m14, m17, m18); milestones 5 and 12 had drifted from later edits to shared
   code (milestone 9 reordered two random draws; milestone 14 changed how a mean is rounded), so
   m5, m7, m12 and m13 are refreshed and every moved number in the paper updated (H22 0.5833 to
   0.5814, two 2x 0.9997 to 0.9994, break-even $6.51 to $6.47); no verdict changes.

27. **The slide as a mechanism** (done 2026-11-15, `experiments/m27_slide_mech/`): stick-slip on the ledger with
   a push-only hand of the stock G1's stiffness along the wall (63 N/m, a force source in effect). Tapping from
   either edge leaves 0.19–0.64 mm rms if the push is dropped within 20 ms of the sheet moving and 2.5–10 mm at
   100 ms (friction swept); the best single-2x stack goes from 0.771 (0.5 mm assumed) to 0.79 at 20 ms and 0.32 at
   100 ms (μ_k/μ_s 0.8). Still open: the OSB-on-lumber friction pair, a measured release latency, and the shim.
28. **The shim as a mechanism** (done 2026-11-16, `experiments/m28_shim_mech/`): plumbing the sheet needs a corner lift of
   a median 0.95 mm (p99 3.0 mm). A stack of 1/16 in horseshoe shims leaves 0.458 mm rms and keeps the best single-2x
   stack at 0.796 (0.791 with the assumed 0.5 mm). A 1:32 composite wedge needs a 118.5 N push at μ 0.4, against the
   stock G1's 65.6 N at a 0.5 m ledger (H1 132 N), and, because a hand weighs under 1 kg along the push, leaves 0.132 mm
   at a 20 ms release. Still open: the shim and OSB friction pairs measured, and a shim-placing end effector.
29. **The nailer's length and the nail's lean** (done 2026-11-16, `experiments/m29_tool_lean/`): the 0.9 mm tool scatter
   was the hand point. Carried to a nose 0.3 m ahead and to the shank 44.4 mm deep, the G1's 11-bit error is 1.31/1.38 mm
   and the best single-2x stack falls from 0.796 to 0.264 (H1 0.571); 12-bit joints restore 0.934. An independent lean
   of 0.43° (1σ) costs 2 points more. Doubled joints stay at 1.000. Still open: backlash and deflection at the tool
   point, a measured nose length, and the paper's headline restated for a tool-point spec.
30. **Backlash at the tool point** (done 2026-11-16, `experiments/m30_backlash/`): backlash randomises only joints that gravity
   and the press do not hold one way. At the stud pose (3.4 kg nailer, 25–50 N press) 16–19 of the G1's 22 joints that move the
   nose are held; the two ankle rolls carry no torque under an even ground reaction. 5 arcmin on every joint costs the 12-bit
   G1 17 points (0.934 to 0.765); preloaded 2.1 points; with the ankle rolls biased to one side, nothing up to 25 arcmin. The
   NR90AES1's 12-11/16 in height puts the grip 0.29–0.32 m behind the nose; a grip 0.15 m above the drive axis costs the 11-bit
   G1 8 points, below it gains 4. Still open: deflection under the press, the pose range, and the paper's headline for a
   tool-point spec.
31. **Backlash across the poses along a wall** (done 2026-11-16, `experiments/m31_pose_range/`): over 15 G1 poses
   (0.4–1.2 m, ±0.15 m along the wall) 13–20 of 22 nose-moving joints stay held; per-pose calibration leaves 5 arcmin costing
   0.3–9.9 points (worst at the top of the reach). Both hip yaws and the waist roll are held everywhere but flip sign, so one
   tool-frame calibration leaves up to 3.4 mm along the wall: 12-bit joints tolerate 2.5 arcmin calibrated per pose, 0.44
   calibrated once. Still open: deflection under the press, a balance controller's ground-reaction split, and the paper's
   headline for a tool-point spec.
32. **The ground reaction through real soles** (done 2026-11-16, `experiments/m32_grf_qp/`): with friction cones at the
   soles' contact points, the upright poses balance only 26–39 N of press above 0.8 m (G1), so the robot must lean
   0.04–0.12 m into the wall. On the leaned poses the hip-yaw and waist flips vanish under every ground-reaction model;
   holding all leg joints one-signed is infeasible, holding the hip rolls, hip yaws and ankle rolls is feasible and cuts the
   worst per-pose loss to 3.7 points, but one calibration still leaves 1.1–2.6 mm. Still open: deflection under the press
   and the paper's headline for a tool-point spec.
33. **Model-based backlash compensation** (done 2026-11-16, `experiments/m33_compensate/`): predicting each held joint's
   side from the static torques and subtracting the bias removes the residual entirely when the compensator models the
   robot's balance controller; then a full 64-nail magazine left out of the model costs 0.017 mm and +1 kg 0.057 mm on a
   G1 holding its light leg joints, against 0.41–0.84 mm under the torque-minimising controller. A wrong ground-reaction
   model leaves 1.16–1.92 mm, little better than no compensation (1.40–2.63), and a guard band on predicted torque only
   adds missed joints. Still open: deflection under the press and the paper's headline for a tool-point spec.
34. **Deflection under the press** (done 2026-11-16, `experiments/m34_windup/`): the joints' elastic windup over the
   25–50 N press window, swept over transmission stiffness k_t (none published). A nose free to slide needs k_t ≥ 1.8e4
   N m/rad on every joint to stay within 2 points (G1 5.5 points lost at 1e4); stuck by friction, the windup only tilts
   the tool (0.02 mm at the nail's tip), and at mu 0.4 the G1's nose sticks at 10 of 15 poses (friction-limited, 1e4
   suffices). The mean windup is a pose bias a model removes; an unmodelled magazine droops the servo by 32–51 mm under
   Unitree's gains, which the joint encoders see. Still open: the paper's headline for a tool-point spec, the hose as
   a force, and the nailer's recoil.
35. **The air hose as a force** (done 2026-11-16, `experiments/m35_hose/`): a 3/8 in hose (listed 0.152–0.274 kg/m)
   hanging as a catenary from the grip and dragged along the floor (tension swept 0–20 N, eight directions). At k_t 1e4 a
   5 N pull winds the G1's free nose up 1.25 mm (worst towards the wall, where it acts like a change of press) and leaves
   milestone 33's matched compensator 1.0 mm along the wall; even the hanging hose leaves 0.47 mm. With the tension
   uniform over 0–5 N the worst pose loses 2.2 points, over 0–10 N 21 points. Take the hose off the tool, measure the
   tool's wrench, or keep the drag under a few newtons. Still open: the paper's headline for a tool-point spec, a wrist
   force-torque sensor, and the nailer's recoil.
36. **A wrist force-torque sensor** (done 2026-11-16, `experiments/m36_wrist_ft/`): the compensator predicts from the
   measured wrench (Robotiq FT 300, 0.1 N noise; its pre-2017 version, 1.2 N; ATI Mini45, 1/16 N resolution). It cuts the
   G1's worst residual at a 20 N drag from 2.34 to 0.29 mm and the 0–20 N stack loss from 91.6 to 1.6 points, and k_t
   misjudged by 25% leaves at most 0.4 mm. But any sensor error (0.01 N is enough) flips a held joint that sits at the
   friction threshold, so a floor of 0.3–0.5 mm remains (0.82 mm at 5 N); the pre-2017 sensor is worse than none.
   Still open: a held-joint preload against that floor, the paper's headline for a tool-point spec, and the nailer's
   recoil.
37. **A held-joint preload** (done 2026-11-17, `experiments/m37_preload/`): with the controller planning from the
   measured force and the robot settling under the true one, 92% of the mispredicted joints are the balance
   controller's own held joints, pinned exactly at the threshold; a 0.1 N m preload on every leg joint removes them and
   brings the G1's 0–20 N stack loss from 56.5 points back to 1.6 (milestone 36's figure) for 1.7% more leg torque and
   one of 15 poses. The 0.3–0.8 mm left is in the waist and arm joints, which the ground reaction cannot move; a hedged
   compensator does not help. Still open: a two-handed squeeze to preload the arms, the paper's headline for a
   tool-point spec, and the nailer's recoil.
38. **A two-hand squeeze** (done 2026-11-17, `experiments/m38_squeeze/`): a force pair along the line between the grip
   points has no net wrench, so it moves only the arm joints (to 1e-16 N m elsewhere). Chosen from the plan within
   10 N it clears all 14 arm flips and, with milestone 37's leg preload and the FT 300, takes the 0–20 N stack loss
   from 1.64 points to 0.05 (G1) and 2.19 to 0.02 (H1); the G1's worst residual at a 5 N drag falls from 0.83 to
   0.49 mm. The 0.48–0.50 mm left is in the waist and the H1's torso. Side finding: the G1's wrist pitch carries more
   than its 5 N m MJCF rating at 7 of 14 poses. Still open: the paper's headline for a tool-point spec, a grip that
   changes the waist's share, and the nailer's recoil.
39. **The waist's gap** (done 2026-11-17, `experiments/m39_waist/`): at milestone 38's 10 N squeeze and leg preload, a
   braked waist takes the G1's worst residual at a 5 N drag from 0.485 to 0.012 mm and its 0–10 N stack loss from 5.80
   to 0.04 points; a 1 arcmin waist gearbox gives 0.106 mm and 0.11 points. Locking waist roll and pitch, as on the base
   G1, changes nothing: the yaw is the joint that flips. The pre-2017 sensor still leaves 0.87 mm. Still open: the
   paper's headline for a tool-point spec, and the nailer's recoil.
40. **The recoil's lift-off** (done 2026-11-17, `experiments/m40_liftoff/`): the recoil, bracketed from published
   measurements at 0.09–8.7 N s (nail momentum at chronograph speeds; Lowe et al. 2014's force plate), lifts the nose,
   so each press rises again from zero. That rise sets none of the 56 loose nose-moving joints (36 change sign inside
   the window), so milestone 39's 0.012 mm stands; a 20 N drag lets it set one wrist joint (0.203 mm for a compensator
   that does not plan the rise). At 12 of 35 poses the leaned stance balances only above 3.7–11.8 N of press, so it
   cannot be used with a tool that lifts off. Still open: the paper's headline for a tool-point spec, and a stance that
   balances at zero press.
41. **A stance that stands at zero press** (done 2026-11-17, `experiments/m41_stance0/`): all 12 poses that needed a
   press can be re-leaned (9.9–39.1 mm back) to balance over 0–50 N; the window's width is (m + m_tool) g × sole / grip
   height, so a zero-press stance reaching 50 N exists only below 1.225 m (G1) and 1.883 m (H1) grip height, and the G1
   at 1.2 m keeps 1.6 N of margin. The braked spec holds (G1 0.011 mm, H1 0.019 mm at a 5 N drag); one H1 pose loses its
   controller and the G1's worst no-hose stack falls 1.3 points (0.9160 to 0.9030).
42. **The lean or the controller's sides?** (done 2026-11-17, `experiments/m42_sides/`): a 2 × 2 (leans × 'hold-min'
   sides) puts all of the G1's 1.30-point loss on the lean (sides 0.00, interaction 0.00); the four flipped roll sides
   change no stack, but the old sides lose the controller at one re-leaned G1 pose. Post hoc, like for like, the H1's
   re-lean costs 0.09–0.29 points per pose, not milestone 41's mixed-convention 0.1–0.9.
43. **The spec's own stack on the zero-press poses** (done 2026-11-17, `experiments/m43_specstack/`): with the spec's
   re-planned leg preload and squeeze the re-lean raises the G1's worst no-hose stack 0.97 points (braked, 0.9160 to
   0.9257; stock +1.76), so milestones 41–42's 1.3-point loss is the 'hold-min' convention's; the H1 keeps a spec plan at
   only 3 of 6 re-leaned poses, two because the stance allows only 0.033 and 0.095 N m of leg preload at 50 N.
44. **A per-pose leg preload** (done 2026-11-17, `experiments/m44_legpreload/`): preloading each leg to 0.9 of what the
   stance allows (0.030 and 0.085 N m) gives both dropped H1 poses a spec plan at no clean-sheet cost (the stack does not
   move between 0 and 0.085 N m; −0.08 and −0.27 points against the old lean), but the worst residual along the wall
   becomes 0.172 mm (0.241 at 20 N drag) against the spec's 0.019: (1.6 m, 0) is rescued (0.003 mm), (1.4 m, −0.15 m) is
   not, because the joint that flips there is a hold-set joint the leg preload does not reach.
45. **A hold-first preload** (done 2026-11-18, `experiments/m45_tiered/`): corrects milestone 44's post hoc (the flipping
   right hip roll is a preloaded leg row whose margin, 0.030 N m, is under a 0.2 N sensor error's 0.033 N m shift). Even
   with every other leg released, the stance caps it at 0.0339 N m, so the residual stays 0.172 mm (20 N drag: 0.241 to
   0.172) at no stack cost; the pose needs a sensor z error under about 0.19 N (0.163 N m per N), a Mini45-class sensor.
46. **The hold side** (done 2026-11-18, `experiments/m46_holdside/`): corrects milestone 45 (the per-robot hold side
   pinned the right hip roll at τ_f; the controller wants −3.8 N m). Held on the other side the stance allows 2.29 N m
   (from 0.033), the pose takes the full 0.1 N m preload and leaves 0.005 mm (from 0.172) with a 0.2 N sensor error, so
   the H1 meets the tool-point spec at all 19 poses with an FT 300; the per-robot side is wrong at four more H1 poses.
47. **Per-pose hold sides** (done 2026-11-18, `experiments/m47_poseside/`): the side combination with the largest
   zero-drag common margin at each pose lifts every pose above the preload goal (smallest 0.886 N m), gives the two H1
   poses milestone 38 skipped a plan (not yet swept), and cuts the H1's worst residual at 20 N drag from 0.032 to 0.010
   mm; but the G1 rises from 0.011 to 0.037 mm at 20 N (a leg joint flips at three poses), so sides must be scored
   under drag.
48. **Hold sides scored under drag** (done 2026-11-18, `experiments/m48_loadside/`): the side with the largest worst
   margin over 17 hose loads returns the G1 to 0.016 / 0.011 / 0.011 mm at 0 / 5 / 20 N and keeps the H1's 0.010 /
   0.014 / 0.010, at no stack cost; but at 8 of 34 poses no side has a plan under 20 N of backward drag at the 50 N
   press, and the G1's worst residuals since milestone 41 cover only 83% of the swept cases (the rest have no plan).
49. **Backward-hose infeasibility** (done 2026-11-18, `experiments/m49_backload/`): a stance limit, not a solver
   false negative. At the 50 N end of all 24 cells no force balances the base in the μ 0.5 cones (best slack
   &minus;23.77 to &minus;0.10 N); the robot tips back. 20 N of backward drag lowers the top of the press window by
   about 15 N (G1 51.6 to 36.4 N, H1 58.7 to 42.8 N), below the 50 N press. Next: re-lean those poses for the drag.
50. **Re-lean under drag** (done 2026-11-18, `experiments/m50_relean/`): no forward lean keeps the 8 poses balanced
   at 25 and 50 N under all 17 hose loads (best worst cone slack &minus;0.69 to &minus;10.12 N); a forward lean trades
   backward-drag headroom for forward. The drag each pose tolerates is linear in its press headroom (H206 held): the
   G1 at 1.2 m grips 4.0 N straight back, 11.4 to 13.4 N in every direction at its best lean; every pose that has a
   plan tolerates at least 20.1 N. Next: a hose-management rule (dragged length or reel tension per pose).
51. **Drag envelope** (done 2026-11-18, `experiments/m51_envelope/`): every swept case past milestone 50's drag
   limits (at the pose or the calibration pose) has no plan (G1 162 of 162, H1 36 of 36); inside them the G1 plans
   93.0% (83.1% overall), the H1 99.7%, in spec (H209 held). 101 cases inside have no plan (H208 refuted), 75 of the
   G1's 96 at its one calibration pose. Next: calibrate with the hose slack and rerun the sweep.
52. **Slack-hose calibration** (done 2026-11-18, `experiments/m52_slackcal/`): calibrating under the hanging hose's
   weight alone plans at every sensor-error axis (H213 held); the G1 plans 98.1% of in-envelope cases (from 93.0%,
   H211 held), the H1 99.7%, and no residual changes (H212 held: the calibration error is the sensor bias alone,
   load-independent once the measured load is compensated). Left: 21 G1 and 5 H1 plan limits at 1.0 to 1.6 m grips,
   5 G1 sensor-error cases. Next: which hold row binds at those plan limits.
53. **Hold sides per load** (done 2026-11-18, `experiments/m53_loadside/`): at 20 of the 26 remaining plan limits
   the leg preload binds, not the hold QP (H214 refuted; the pose's sides leave 0.004 to 0.092 N m of common leg
   margin against 0.1 N m). Choosing the hold sides per measured load recovers 31 of 33 drops, so both robots plan
   100% of in-envelope cases (G1 1368, H1 1902), in spec (H216 held; largest recovered 0.0106 mm). Left: 2 G1
   sensor-error cases outside milestone 51's envelope with no hold solution on any side (H215 refuted). Next: sample
   hose loads off the 8-direction grid; the cost of side switches.
54. **Hose loads off the grid** (done 2026-11-18, `experiments/m54_lhs/`): at 48 Latin-hypercube loads (0 to 20 N,
   any direction) both robots plan every in-envelope case (G1 4002, H1 5436; H217 held), but 4 of 9438 leave the
   0.03 mm spec, worst 0.284 mm (H218 refuted): one joint at the 0.2 N m friction threshold, held in the plan and free
   under the true load (or the reverse), in direction spans under 5 degrees wide. Per-load sides fix the 3 H1 cases,
   not the G1 arm joint. The grid's drag limits are up to 2.17 N optimistic between directions, only above 23 N (H219
   refuted). Next: a held-or-free margin covering the sensor error on every joint.
55. **A held-or-free margin covering the sensor error** (done 2026-11-19, `experiments/m55_robust/`): plan only when
   every joint sits more than 0.2 N &times; ||G<sub>j</sub>|| (its worst settle change under the sensor bound) from the
   0.2 N m friction torque, re-choosing the squeeze and hold sides. Every planned in-envelope case is in spec (worst
   0.011 mm, from 0.284; H220 held), but coverage falls to 95.9 to 96.8% (H221, H222 refuted), mostly at the G1
   waist and H1 torso, which nothing preloads; the dropped cases were in spec under the old rule. Next: weight the
   margin by a flip's cost at the nose, or preload the waist.
56. **A held-or-free margin weighted by each flip's cost at the nose** (done 2026-11-19, `experiments/m56_weighted/`):
   bound the backlash part of the residual by &Sigma;<sub>j</sub> |w<sub>j</sub>| &times; the worst `held_bias` change
   reachable in each joint's torque band (`preload.flip_cost`) and plan when it is at most half the spec. Every planned
   in-envelope case stays in spec in three sections (worst 0.0178 mm; H223 held), coverage is G1 100% and H1 99.6 to
   99.9% (H224 held; 637 of milestone 55's 667 drops won back), and the bound is never beaten (H225 held). The H1 left
   knee and right elbow are what still bind. Next: sweep the budget share on a held-out seed, add the z residual.
57. **The budget share on a held-out seed** (done 2026-11-19, `experiments/m57_beta/`): &beta; in {0, 0.25, 0.5,
   0.75, 1} on 48 new loads (seed 57). &beta; = 0.5 replicates (H226 held: worst 0.0178 mm, coverage G1 99.93%, H1
   99.54%); coverage is the same from &beta; = 0 to 0.5 (H228 held) and reaches 100% on the H1 at 0.75; &beta; = 1 puts
   one H1 press at 0.0315 mm (H227 refuted). Every flip the budget admits is a knee or ankle pitch joint that moves the
   nose 0.27 to 0.29 mm across the wall (z), which no rule budgets; at &beta; = 0 the worst z is 0.026 mm. Next: bound
   both rows.
58. **A two-row flip bound** (done 2026-11-19, `experiments/m58_tworow/`): each flip priced along (Y<sub>y</sub>) and
   across (Y<sub>z</sub>) the wall, each with half a 0.03 mm spec, on 48 new loads (seed 58). The y-only rule leaves
   0.27 to 0.29 mm across the wall again (H231 held); with both rows every planned press is inside 0.03 mm in both
   directions (worst z 0.022 mm; H229 held) at the same coverage, G1 100% and H1 99.63% (H230 held). Next: the H1's
   left knee and right ankle, or the depth point's rows.
59. **The depth point in the bound** (done 2026-11-19, `experiments/m59_depth/`): the same flip cost through the
   rows of the point 44.4 mm along the nail (y<sub>d</sub>, z<sub>d</sub>) as well as the nose's, half a 0.03 mm spec
   each, on 48 new loads (seed 59). The two-row bound already keeps the depth point inside 0.03 mm (worst 0.022 mm;
   H232 refuted; tilt at most 0.034 mrad), so the four-row bound holds (H233) and changes no plan or coverage, G1 100%
   and H1 99.65% (H234 held). Next: the H1's left knee and right ankle.
60. **A raised leg preload for the unplanned presses** (done 2026-11-19, `experiments/m60_jointpreload/`): for each
   case the four-row rule leaves unplanned, the leg preload margin raised (binding joint only, or every leg joint)
   up a ladder from 0.12 N m, on 48 new loads (seed 60). 17 of the H1's 18 unplanned cases (all left knee) plan at
   0.12 to 0.18 N m, in spec at both points with no flip (H237 held); H1 coverage 99.67% to 99.98%; median leg
   effort +0.1%, at most +13.5%. An H1 elbow case and 3 G1 cases with no plan on any side stay unplanned (H235
   refuted), and the binding joint alone plans as many as the uniform raise (H236 refuted). Next: the arm-side
   squeeze for the elbow case, and why the G1's (1.2 m) poses have no plan on any side at one load.
61. **The last unplanned presses** (done 2026-11-20, `experiments/m61_lastfour/`): the four-row rule, milestone 60's
   uniform leg raise, then a squeeze widened past S\* = 10 N (12.5 to 20 N), with the planner's own limit L<sub>p</sub>
   bisected at every pose and direction, on 48 new loads (seed 61). The rule plus the leg raise plans every
   in-envelope case, G1 4050 of 4050 and H1 5436 of 5436, in spec with no flip (H240 held); no case needed the squeeze
   or lay past L<sub>p</sub> (H238, H239 untestable). The balance gate exceeds L<sub>p</sub> by up to 31 N (G1) and
   44 N (H1) in two direction bands. Next: the gate as the planner's limit over every hold-side combination, or
   dynamics and measured sensor bias.
62. **The exact envelope gate** (done 2026-11-20, `experiments/m62_exactgate/`): the planner's limit over every
   hold-side combination, L<sub>any</sub>, bisected at every pose and direction against the balance limit, on 48 new
   loads (seed 62). L<sub>any</sub> equals the balance limit to 0.01 N in 712 of 720 G1 and 904 of 912 H1 pairs and is
   more than 0.5 N short only in 7 G1 pairs at 46 to 60 N (H241 held); the chain plans every case inside
   H &le; L<sub>any</sub> &minus; 0.5 N, 9384 of 9384, and every balance-envelope case (H242 held); the 0.5 N band drops
   12 G1 cases the chain plans (0.30%, H243 refuted at its ceiling). The balance gate is the planner's envelope at
   working loads once hold sides are chosen per load. Next: dynamics (the press's impulse) or measured sensor bias.
63. **The worst-direction sensor bias** (done 2026-11-20, `experiments/m63_worstbias/`): per pose and load, a 0.2 N
   bias aimed (both signs) along the settle gradient of the joint the plan leaves nearest its threshold, against 6
   random directions on the same 48 new loads (seed 63). Every planned press stays inside 0.03 mm (worst 0.0203 mm;
   H244 held) and coverage is G1 99.93%, H1 100% (H245 held; the one refused load sits 0.06 N under its balance limit,
   inside milestone 62's band). The aimed bias beats random on the H1 (0.0203 against 0.0182 mm) but not on the G1
   (0.0180 against 0.0238; H246 refuted): the rule protects the weakest joint, and residuals come from admitted flips
   elsewhere. Next: dynamics, a residual-maximizing bias search, a bias above the bound.

## Target venue

*Automation in Construction* (Elsevier; full research article, no fixed page limit; the field's
main journal, and where Willmann et al. 2016 and Adel et al. 2024 appeared). Fallback: ISARC
(the International Symposium on Automation and Robotics in Construction; 8-page papers). This is
an aim, not a claim of acceptance.

## Deep-tech application

The system is a sheathing station: a wall-panel line in a factory (the `house-offsite` setting)
or a robot on site. The number it moves is the clean-sheet rate at a given sensing and placement
spend, and from that the cost per sheet. Panel-line integrators and construction-robot companies
would act on it when choosing between edge sensing, jigs and tighter placement. Trying it on the
real thing takes a framed mock-up wall, a nailer on a robot arm or a G1, and a risk assessment
under ISO 10218 and ISO/TS 15066 (an owner step; track 20, milestone 9).
