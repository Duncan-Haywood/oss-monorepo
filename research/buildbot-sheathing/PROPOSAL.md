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
has been estimated from images (Construction Robotics 2024). Our own 26 `buildbot-*` projects
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
   read a stud: 0.9997 clean, 76–216 s a sheet; the best single-2x pipeline (three reads) 0.56
   clean and 18–65 s slower, which is what the extra joint stud may cost. Still open: a measured
   time for each stage.
6. **Sim-to-sim on a second contact model** (done 2026-11-12, `experiments/m6_drake/`): the
   ledger seat and slide rebuilt in Drake (SAP). Clean sheets of all 24 ledger pipelines agree
   within 0.06 points (H-E held); Drake's press thresholds sit at 97–100% of the closed form,
   MuJoCo's at 87–99%. Still open: how far a bowed bottom edge rocks the sheet (0.11–0.15°,
   model-dependent).
7. **Cost per clean sheet by robot class** (done 2026-11-12, `experiments/m7_cost/`): the G1 on a
   drive-and-lift base is the cheapest robot below about 500 houses a year and beats the walking H1
   in every draw; it beats a hand crew in 37% of draws at 100 houses a year and 74% at 300. Doubled
   joints never pay in dollars unless a missed nail costs about $6.50 more than its re-drive.
8. **Paper draft** (done 2026-11-12, `paper/draft.md`): the article for *Automation in Construction*
   in its structure, with `paper/check_numbers.py` tying each quoted figure to its results file.
   Still open: the Elsevier LaTeX template, the unconfirmed citations and authorship.

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
