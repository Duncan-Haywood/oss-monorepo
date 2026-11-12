# Proposal: when does fixed rotor cant pay on a small multirotor, once airframe, motors and controller are designed together?

Programme `codesign-cant`, opened 2026-11-12 under track 14 (`codesign`, `research/PROJECTS.md`).
Written with AI assistance (Claude Code). It consolidates seven earlier single-step projects
(`codesign-aero-cant`, `-bound`, `-kappa`, `-propdata`, `-twr`, `-twrceil`, `-poshold`) into one
question and one paper. Milestone 1 (in `LOG.md`) audits the actuator model those projects shared.

## Question

For a small (0.5 to 3 kg) quadrotor sized for a fixed mission, how much yaw authority, attitude
accuracy and disturbance rejection does a fixed rotor cant angle buy once arm length, propeller,
motor headroom and controller are optimised with it, what does it cost in hover power and in
side force coupled into position control, and does the answer hold on a full-allocation,
blade-element simulator and on measured propeller and motor data?

Open because the tilted-rotor literature studies fully actuated vehicles (6 or more rotors, cant
chosen for force-moment decoupling) or argues from the allocation matrix alone, while the
co-design literature optimises frames and propellers with the controller fixed or absent. Nobody
has published the joint optimum for the most common vehicle, the four-rotor X, with a learned or
tuned controller in the loop and an honest cost model, and practitioners who cant motors for
"yaw authority" do it by rule of thumb.

## Why it matters

Yaw is the weakest axis of a quadrotor: reaction torque is about a tenth of the thrust moment
arm (κ/L of 0.03 to 0.1 with measured propellers). Inspection and mapping vehicles that must hold
heading in gusts, and heavy-lift frames with large, slow propellers, run out of yaw first. A few
degrees of cant is a printed-part change. If the answer is "8 to 15° of cant triples yaw
authority for 1 to 3% hover power and a side force the position loop can absorb", it is a free
upgrade for every small-UAV builder; if the side force or efficiency loss eats the gain once the
controller is retuned, the rule of thumb should go. The same co-design method (allocation
polytope, sizing closure, controller tuning in a randomised simulator) carries over to other
small robots where a geometric parameter and a controller trade off.

## Related work

Tilted and fully actuated multirotors (allocation analysis):
- Crowther, Lanzon, Maya-Gonzalez and Langkamp, "Kinematic analysis and control design for a nonplanar multirotor vehicle", *J. Guidance, Control, and Dynamics* 34(4), 2011, doi:10.2514/1.51186. Shows tilted rotors add yaw authority to a quadrotor; allocation and control only, no sizing, power or controller co-design.
- Rajappa, Ryll, Bülthoff and Franchi, "Modeling, control and design optimization for a fully-actuated hexarotor aerial vehicle with tilted propellers", *IEEE ICRA* 2015, doi:10.1109/ICRA.2015.7139759. Optimises cant angles of a hexarotor for full actuation; six rotors, allocation-only cost, controller not in the loop.
- Michieletto, Ryll and Franchi, "Fundamental actuation properties of multirotors: force-moment decoupling and fail-safe robustness", *IEEE Trans. Robotics* 34(3), 2018, doi:10.1109/TRO.2018.2821155. The theory of which tilt patterns decouple force from moment; structural, not a design optimum for a mission.
- Hamandi, Usai, Sablé, Staub, Tognon and Franchi, "Design of multirotor aerial vehicles: a taxonomy based on input allocation", *Int. J. Robotics Research* 40(8-9), 2021, doi:10.1177/02783649211025998. A taxonomy of designs by allocation properties; a map, not a co-design result.
- Ryll, Bülthoff and Giordano, "A novel overactuated quadrotor UAV: modeling, control, and experimental validation", *IEEE Trans. Control Systems Technology* 23(2), 2015, doi:10.1109/TCST.2014.2330999. Actively tilting rotors (servos); fixed cant is the cheap, passive end of the same spectrum, not studied there.
- Brescianini and D'Andrea, "Design, modeling and control of an omni-directional aerial vehicle", *IEEE ICRA* 2016, doi:10.1109/ICRA.2016.7487497. Eight fixed rotors in an omnidirectional layout; the opposite extreme of fixed cant, with large efficiency cost.

Computational co-design of robots and drones:
- Du, Zhu, Schulz, Bickel and Matusik, "Computational multicopter design", *ACM Trans. Graphics* 35(6), 2016, doi:10.1145/2980179.2982427. Optimises multicopter geometry and parts with an LQR controller derived per design; rotors coplanar or user-tilted, no cant optimum or randomised plant.
- Zhao, Xu, Konaković-Luković, Hughes, Spielberg, Rus and Matusik, "RoboGrammar: graph grammar for terrain-optimized robot design", *ACM Trans. Graphics* 39(6), 2020, doi:10.1145/3414685.3417831. Joint morphology and control search for legged robots; not aerial.
- Carlone and Pinciroli, "Robot co-design: beyond the monotone case", *IEEE ICRA* 2019, doi:10.1109/ICRA.2019.8793926. Formal co-design of drone components as a design problem; no dynamics or controller tuning.
- Hansen and Ostermeier, "Completely derandomized self-adaptation in evolution strategies", *Evolutionary Computation* 9(2), 2001, doi:10.1162/106365601750190398. CMA-ES, the joint search method used by every earlier step.

Attitude control baselines and learned control:
- Lee, Leok and McClamroch, "Geometric tracking control of a quadrotor UAV on SE(3)", *IEEE CDC* 2010, doi:10.1109/CDC.2010.5717652. The standard nonlinear attitude controller to compare against PID.
- Smeur, Chu and de Croon, "Adaptive incremental nonlinear dynamic inversion for attitude control of micro air vehicles", *J. Guidance, Control, and Dynamics* 39(3), 2016, doi:10.2514/1.G001490. INDI, the robust attitude law used on real small vehicles; a stronger baseline than tuned PID under plant randomisation.
- Hwangbo, Sa, Siegwart and Hutter, "Control of a quadrotor with reinforcement learning", *IEEE Robotics and Automation Letters* 2(4), 2017, doi:10.1109/LRA.2017.2720851. Learned low-level control on hardware; fixed airframe.
- Kaufmann, Bauersfeld, Loquercio, Müller, Koltun and Scaramuzza, "Champion-level drone racing using deep reinforcement learning", *Nature* 620, 2023, doi:10.1038/s41586-023-06419-4. Sim-to-real RL with an identified quadrotor model; airframe fixed.

Simulators and data:
- Folk, Paulos and Kumar, "RotorPy: a Python-based multirotor simulator with aerodynamics for education and research", 2023, arXiv:2306.04485. An open simulator with rotor drag and blade-flapping terms; rotors coplanar by default, so canted rotors need its allocation extended.
- Panerati, Zheng, Zhou, Xu, Prorok and Schoellig, "Learning to fly: a gym environment with PyBullet physics for reinforcement learning of multi-agent quadcopter control", *IEEE/RSJ IROS* 2021, arXiv:2103.02142. PyBullet multirotor gym for the learned-controller arm.
- Brandt and Selig, "Propeller performance data at low Reynolds numbers", AIAA 2011-1255, doi:10.2514/6.2011-1255 (UIUC Propeller Data Site, https://m-selig.ae.illinois.edu/props/propDB.html). The measured C_T, C_P behind κ in the earlier steps.
- Johansen and Fossen, "Control allocation: a survey", *Automatica* 49(5), 2013, doi:10.1016/j.automatica.2013.01.035. Allocation as constrained optimisation; the basis of the attainable-torque computation in milestone 1.

Our own prior steps (all simulated, all with the actuator model audited in milestone 1):
`codesign-aero-coupled` (yaw sets the attitude error), `codesign-aero-cant` and `-bound` (an
interior cant optimum near 35 to 40°), `-kappa` and `-propdata` (κ from measured propellers),
`-twr` and `-twrceil` (cant against motor headroom), `-poshold` (side force in the position loop).

## Gap

No published work gives the mission-level optimum of a single fixed cant angle on a four-rotor X
when (a) the controller is tuned or learned per design in a randomised plant, (b) motor headroom,
arm and propeller are free under a cost cap with measured propeller data, and (c) the attainable
torque comes from the full thrust-bounded allocation rather than a linearised authority. The
narrow claim to test: the co-designed cant angle, its yaw gain and its hover-power and
side-force costs, with intervals, on two simulators and measured component data.

## Hypotheses

- H1. With correct allocation limits, the co-designed cant is interior and small (5 to 20°), not
  the 35 to 40° of the earlier steps. Refuted if the optimum stays above 25° at the median measured κ.
  Milestone 1 evidence (per-axis limits, attitude-only objective): the optimum stays at 31 to 37°, so H1
  is at risk; it is tested properly once the objective prices hover power (milestone 2).
  Milestone 2 evidence (shared thrust polytope, attitude-priority mixer, hover power priced at 0 to 1 deg per 100 W,
  best of three CMA-ES starts): the chosen cant stays at 28 to 37° in 9 of 10 seed-arms while hover power falls 5×.
  H1 is refuted under this objective; it stays open only for a mission objective that prices power more steeply.
- H2. Cant still lowers held-out attitude error against no cant at equal cost, paired by seed, at
  every measured κ percentile. Refuted if the paired 95% interval includes zero at the median κ.
- H3. The side force (sin α / (L cos α − κ sin α) per unit roll torque) costs position-hold accuracy
  by less than the yaw gain is worth under the composite objective. Refuted if position RMS rises
  by more than 20% with the force on.
  Milestone 6 evidence (6 s episodes with a wind step, polytope mixer, 6 seeds): not refuted where the gust torque's
  counter-torque makes the side force oppose the drag (force on/off 0.96×). Refuted, at 1.21×, where the centre of pressure
  flips that sign (post-hoc re-scoring, no retraining). Cant still wins the composite in both cases (4 of 6 and 6 of 6
  seeds). The sign of the centre-of-pressure lever decides H3.
  Milestone 6b evidence (retrained under a rigid centre-of-pressure offset, which has opposite roll and pitch signs): the side
  force hurts one horizontal axis (late-window position 1.9–3.4× the other axis) and helps the other, whichever side the centre
  of pressure is on. Median on/off 1.03× in both geometries; mean 1.14× and 1.26×, carried by one seed per geometry with rare
  divergences. H3 holds for the typical design and fails on the tail; cant still wins the composite (5 of 6 and 6 of 6).
- H4. A stronger attitude law (INDI or geometric control) narrows but does not remove the cant
  advantage. Refuted if INDI without cant matches PID with cant.
  Milestone 4 evidence (10 seeds, polytope mixer, 0.3° per 100 W): INDI narrows the advantage from 5.27° to
  4.18° and geometric control to 4.88°; INDI without cant is 4.02° worse than PID with cant in 10 of 10 seeds.
  Supported in simulation.
- H5. The ranking of the top designs survives the move from the stylised rigid-body simulator to
  RotorPy with rotor drag and canted allocation. Refuted if Spearman ρ of the top ten is below 0.5.
  Milestone 5 evidence (60 milestone-4 designs re-scored, not retuned, in RotorPy 3.0.0 with a canted-rotor wrench, four
  conditions): refuted as written, top-ten ρ 0.20–0.30. The top ten are tied (stylised J spread 0.064), and the stylised
  simulator against itself on fresh episodes reaches only 0.26 (post hoc), so the test measures episode noise. Over all 60 designs
  ρ is 0.80–0.91 against a self-agreement ceiling of 0.95–0.97; the six law × cant arms keep their order (ρ 0.94–1.00); cant
  wins 10 of 10 seeds for every law under RotorPy aerodynamics. Proposed replacement test (post hoc, to pre-register before the
  next fidelity step): arm-level rank agreement, and all-design ρ as a share of the simulator's own fresh-episode ceiling.

## Method

Theory: closed-form attainable pure torques and side force for a canted X quadrotor from the
thrust-bounded allocation (milestone 1, checked against a linear programme), then the attainable
torque polytope for combined commands, and the first-order hover-power penalty cos(α)^−1.5 with
its blade-element correction.

Experiments: joint CMA-ES (and Bayesian optimisation) over arm, propeller, cant, motor TWR and
controller gains in the existing randomised simulator with corrected limits; then the same
designs re-scored in RotorPy with canted rotors (allocation extended, rotor drag on); then a
learned residual controller trained per design in the PyBullet gym. Component data: UIUC
propeller C_T, C_P (in hand); motor mass, Kv and price from published manufacturer tables,
replacing the inherited power-law fits.

## Evaluation

Baselines: no cant at equal cost and equal optimiser budget; a yaw-only motor upgrade at equal
cost; PID, geometric SE(3) and INDI attitude laws; random search, CMA-ES and Bayesian optimisation
as design searchers. Metrics: held-out RMS attitude error per axis, position RMS under gusts,
hover power, mass and cost. At least 10 seeds per arm for paper figures, paired differences with
bootstrap 95% intervals and Wilcoxon signed-rank tests. Ablations: actuator model (prior,
hover-held, free collective), side force on or off, κ percentile.

## Milestones

1. Audit the earlier steps' actuator model against the full allocation and rerun their co-design
   with corrected limits (this run).
2. Attainable-torque polytope for combined commands in the simulator (replace the per-axis box),
   and a mixer that prioritises attitude (done 2026-11-12, with a price on hover power; `LOG.md`).
3. Motor catalogue data (mass, max thrust with the chosen propeller, price) replacing the fits.
4. INDI and geometric attitude baselines; 10 seeds per arm (done 2026-11-12: H4 supported; `LOG.md`).
5. RotorPy (or equivalent) with canted rotors; re-score the top designs; H5 (done 2026-11-12: the ranking of design classes survives, the top-ten test is noise-bound, the stylised model is 1–2° optimistic and most for INDI; `LOG.md`).
6. Position hold with the corrected side force and longer wind-step episodes; H3 (done 2026-11-12: depends on the centre-of-pressure sign; 6b, same day: a rigid frame is hurt on one axis and helped on the other; `LOG.md`).
7. Paper draft in `paper/` (RA-L format, 6 to 8 pages) with one command per figure.
8. Owner steps: print canted motor mounts at 0° and the co-designed angle for one frame; measure
   yaw step response and side force on a load cell.

## Target venue

*IEEE Robotics and Automation Letters* (6 pages plus 2 extra, with the ICRA presentation option),
code and data as a supplementary artefact. Fallback: the *International Conference on Unmanned
Aircraft Systems* (ICUAS). An aim, not a claim of acceptance.

## Deep-tech application

The system is a small inspection or mapping multirotor (0.5 to 3 kg) built from hobby-grade
parts. The numbers it moves are yaw authority per watt of hover power and heading hold in gusts.
The people who would act on it are UAV integrators and open-source frame designers (PX4 and
ArduPilot builders), for whom cant is a printed-part change. Trying it on the real thing takes
two sets of printed mounts, a load cell and a yaw-rate log (milestone 8, an owner step).

## Citation status

Every DOI and arXiv id above is run through `research/_shared/cite_check.py`; results in
`cite_check.json`. Lines written from memory and not yet machine-checked are marked here when a
check fails.
