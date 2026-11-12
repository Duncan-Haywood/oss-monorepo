# buildbot-sheathing research log

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
