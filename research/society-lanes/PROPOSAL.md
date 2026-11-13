# Programme proposal: robots, passing side and lane formation in real corridor crowds

Opened 2026-11-13 (track 17, `society`). AI-assisted research (an AI agent wrote the code and the
text); no affiliation with any group cited is implied.

## Question

When mobile robots share a two-way corridor with people, which robot passing policy (keep to the
crowd's side, hold the other side, adapt, or head for a lateral goal) keeps or breaks the lanes
people form, and what does each cost the people? The question is open in a specific way. We want
crowd models fitted to real bidirectional trajectories, and then we want to know whether the answer
stays the same when the crowd model changes.

Why it is open: pedestrian-dynamics experiments measure lanes in crowds of people only, and
robot-navigation work scores the robot's own success, time and collisions on trajectory benchmarks.
Neither measures how robots change the lane convention of the crowd around them. The 31 earlier
`society-*` projects here asked that question, but on uncalibrated 1D games and an uncalibrated
social-force corridor.

## Why it matters

Autonomous mobile robots (hospital delivery carts, airport and warehouse AMRs, sidewalk couriers)
increasingly travel the same corridors as people. A fleet operator chooses a passing policy once and
then runs it for thousands of encounters a day. If robots that hold the wrong side, or that cut
across toward a goal, break lanes that people form unprompted, the cost lands on the people:
slower walking, more close passes, more stop-and-go. An answer from calibrated and cross-checked
models tells a navigation engineer which policy to ship and how much human delay each robot pass
costs. It also tells them how far a simulation-trained policy can be trusted, and that question
is this portfolio's theme (digital twins and sim-to-real).

## Related work

All identifiers checked with `research/_shared/cite_check.py` on 2026-11-13 (`cite_check.json`).

*Lane formation in real bidirectional crowds (data):*
- Kretz et al. (2006), counterflow in a corridor, *J. Stat. Mech.* P10001, doi:10.1088/1742-5468/2006/10/P10001. An early controlled counterflow experiment that measured flow and lanes. It has no robots and no per-walker side measure.
- Zhang et al. (2012), ordering in bidirectional flows and the fundamental diagram, *J. Stat. Mech.* P02002, doi:10.1088/1742-5468/2012/02/P02002. These are the HERMES runs we use. Stable separated lanes form under free choice of exit and dynamic multi-lanes under assigned exits, and ordering hardly changes the fundamental diagram. The paper reports no per-walker share of walkers on their own right and no permutation-null lane order.
- Feliciani and Nishinari (2016), empirical analysis of lane formation, *Phys. Rev. E* 94, 032304, doi:10.1103/PhysRevE.94.032304. It brings lane-order measures to controlled experiments. Humans only.
- Boltes and Seyfried (2013), collecting pedestrian trajectories (PeTrack), *Neurocomputing*, doi:10.1016/j.neucom.2012.01.036. This is the extraction pipeline behind the data, and the source of its accuracy limits.
- FZJ pedestrian data archive: HERMES bidirectional free / symmetric / asymmetric, doi:10.34735/ped.2009.12, .11, .10; BaSiGo bidirectional corridor (926 participants), doi:10.34735/ped.2013.5.

*Crowd models (the candidate twins):*
- Helbing and Molnár (1995), social force model, *Phys. Rev. E* 51, 4282, doi:10.1103/PhysRevE.51.4282. Lanes emerge in this model, but its parameters are rarely fitted to lane statistics.
- van den Berg et al. (2011), reciprocal n-body collision avoidance (ORCA), ISRR, doi:10.1007/978-3-642-19457-3_1. The velocity-obstacle family used in robot planners. Its human fidelity in counterflow is not established.
- Karamouzas, Skinner and Guy (2014), universal power law of pedestrian interactions, *Phys. Rev. Lett.* 113, 238701, doi:10.1103/PhysRevLett.113.238701. An anticipatory energy fitted to real data, which makes it the strongest physics-style candidate.
- Moussaïd et al. (2009), behavioural mechanisms of self-organisation, *Proc. R. Soc. B*, doi:10.1098/rspb.2009.0405. It measured a side preference in pairwise avoidance and showed that the bias drives lane asymmetry in a model. It measured pairs, not a crowd, and had no robots.
- Murakami et al. (2021), mutual anticipation and self-organisation in crowds, *Science Advances*, doi:10.1126/sciadv.abe7758. Lane formation fails when walkers cannot anticipate, which bears on robots that do not signal intent.
- Alahi et al. (2016), Social LSTM, CVPR, doi:10.1109/CVPR.2016.110, and Pellegrini et al. (2009), the ETH data, ICCV, doi:10.1109/ICCV.2009.5459260. Data-driven predictors and the benchmark they are trained on. That benchmark has sparse counterflow and no controlled lane experiment.

*Robots among people:*
- Trautman and Krause (2010), the freezing robot problem, IROS, doi:10.1109/IROS.2010.5654369. Robot-centred.
- Kruse et al. (2013), human-aware navigation survey, *Robot. Auton. Syst.*, doi:10.1016/j.robot.2013.05.007, and Mavrogiannis et al. (2023), core challenges of social robot navigation, *ACM THRI*, doi:10.1145/3583741. Both name the effect of robots on crowd norms as open and call for evaluation beyond robot-side metrics.
- Chen et al. (2019), crowd-aware navigation with attention-based deep RL (SARL), ICRA, doi:10.1109/ICRA.2019.8794134 (arXiv:1809.08835). A strong learned baseline. It is trained against ORCA crowds, so its human-side cost depends on the twin.
- Rudenko et al. (2020), human motion prediction survey, *IJRR*, doi:10.1177/0278364920917446.

*Conventions:*
- Centola et al. (2018), tipping points in social convention, *Science*, doi:10.1126/science.aas8827. A committed minority of about 25% tipped a naming convention, measured in an online game and not in walking.
- Park et al. (2023), generative agents, UIST, doi:10.1145/3586183.3606763. Agents that state norms. Our `society-llmtown` asked whether such agents keep the norms they state.

*Our prior work (cited as prior work):* `society-robotnorms` (tipping share 16 to 32% in a 1D memory
game), `society-plaza` (holding robots slow a social-force corridor), `society-twinfidelity` (the
slowdown's size depends strongly on the crowd model), `society-sidefit` (a side bias read off
Moussaïd et al., Fig. 4). None of them is fitted to trajectories.

## Gap

There is no study that (i) measures from real trajectories how strongly a crowd keeps a passing
side and forms lanes, (ii) fits several crowd-model families to those measurements and holds out a
real perturbation, and (iii) asks whether the effect of robot passing policies on people is the
same across the fitted families. The HERMES data contain a natural held-out perturbation. In the
assigned-exit runs each walker was told to leave by the left or right exit, so each walker carried
a lateral goal, the way a robot heading for a side door would. A model that reproduces the
free-choice lanes but not the collapse of the right-side bias under assigned exits is not a twin
anyone should trust for robot policies. That test is the narrow novelty claim.

## Hypotheses

- **H1 (baseline exists).** In free-choice counterflow, a clear majority of people walk on their own
  right and lane order sits far above a shuffled-label null. *Refuted if* the pooled share's 95%
  interval includes 0.5. (Milestone 1 tested this: held, 0.937 [0.865, 0.993].)
- **H2 (lateral goals override the convention).** Assigning lateral exits removes most of the
  right-side bias while lanes persist. *Refuted if* the assigned-exit share stays within 0.1 of the
  free-choice share. (Milestone 1: held descriptively, 0.53 against 0.94. The design confounds the
  instruction with run order, which milestone 2 checks on BaSiGo variants A and B.)
- **H3 (twins fit).** At least two of three model families (social force, ORCA, the anticipatory power
  law), fitted on free-choice runs, reproduce the free-choice right share, lane order and
  speed-density curve within the data's run-level intervals. *Refuted if* fewer than two do.
- **H4 (held-out perturbation).** A family that passes H3 also predicts the assigned-exit share
  within 0.1 without refitting. *Refuted if* none does. Failing here is a finding: the twin
  carries no information about goal-driven agents.
- **H5 (policy ranking is model-invariant).** Across the families that pass H4, the ranking of four
  robot policies by human cost (delay per robot pass, close passes under 0.5 m, lane order) has
  Kendall tau of at least 0.8 at robot shares of 5, 10 and 20%. *Refuted if* any pair of families
  ranks the policies with tau below 0.8. That outcome would mean a policy chosen in one simulator
  cannot be trusted in another.

## Method

*Theory.* For the 1D memory game of `society-robotnorms`, derive the tipping share when people
begin with the measured bias instead of an unbiased crowd, as `society-sidefit` did with a
read-off number. Then connect the 2D lane order to the 1D share through a mean-field lane-occupancy
argument, and test that connection against the data.

*Experiments.* (1) Measure the human baseline on HERMES (this step) and replicate it on BaSiGo 2013
(926 participants, variants with and without assigned exits). (2) Implement or use open tools for
the three families: JuPedSim (FZJ, open-source; its collision-free speed and social-force models)
or a stdlib/numpy implementation checked against it, ORCA via RVO2, and the power law from its
published parameters. Fit each on the free-choice runs by minimising the distance on right share,
lane order and the fundamental diagram, with the HERMES geometry from the archive's WKT polygons.
(3) Add robots with four policies (hold the crowd's side, hold the opposite side, adapt to the
local majority, lateral goal) at 5, 10 and 20% of agents. Robots use the same body radius as
people but a speed capped at a typical AMR corridor limit, with the source cited when it is set.
(4) Check whether the keep-right baseline holds outside the laboratory on a public in-the-wild
dataset with counterflow (ETH/UCY or the ATC shopping-centre data, if the hosts answer).

## Evaluation

Metrics: share on own right, lane order excess over the shuffled null, speed-density
(fundamental diagram), human delay per robot pass, close-pass rate under 0.5 m. Seeds: at least 20
per cell in simulation. Intervals: two-stage bootstrap over runs and walkers for data, over seeds
for simulation. Tests: Kendall tau with a bootstrap interval for H5. Baselines: the three model
families above. For the robot side, SARL (Chen et al. 2019) is trained against each family's crowd,
so that a learned policy is compared on equal training budgets. Ablations: no side bias in the
model; no anticipation (Murakami et al. 2021); corridor width 3.0 against 3.6 m.

## Milestones

1. Human baseline on HERMES: share on own right, lane order against a null, speed (**this step**).
2. Replicate on BaSiGo 2013 bidirectional (variants A and B), and test the run-order confound in H2.
3. Fit the social-force family (JuPedSim or a checked implementation) on free-choice runs. Score H3 and H4.
4. Add ORCA and the power law, and score H3 and H4 for all three.
5. Add robots with four policies at three shares. Measure human costs per family.
6. Test policy-ranking invariance (H5), and add SARL trained against each family.
7. Check the baseline in the wild (ETH/UCY or ATC).
8. Write the paper in RA-L format, with one command per figure.
9. Owner steps: any corridor trial with a real robot and people needs ethics review and consent, and is the owner's to run. Submission is the owner's step.

## Target venue

*IEEE Robotics and Automation Letters* (8 pages, with the ICRA presentation option). Fallback:
*Transportation Research Part C*, or *Collective Dynamics* for the pedestrian-dynamics half. This is
an aim, not a claim of acceptance.

## Deep-tech application

The system is the navigation policy of an autonomous mobile robot fleet in shared indoor corridors
(hospital logistics, airports, warehouses with staff on foot). The numbers it moves are human delay
per robot pass and the close-pass rate, together with whether lanes survive a given robot share.
The people who would act on it are AMR navigation and fleet-operations engineers, who choose a
passing-side policy and a goal-approach behaviour. Trying it on the real thing means instrumenting a
corridor with overhead tracking (PeTrack-style) and running a robot with each policy among
consenting participants. That is an owner step with ethics review (milestone 9).

## Guardrails

The simulated people are not people. Each simulated result names the model family and the
behavioural rule it assumes, and real-data results are kept apart from simulated ones. No design
for covert crowd steering, policing or surveillance is in scope. The FZJ data are used under the
archive's request to cite the HERMES project (BMBF 13N9952 to 13N9960) and the DOIs. They are
fetched by script and not redistributed; only derived statistics are committed.
