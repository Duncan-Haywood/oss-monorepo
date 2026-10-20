# Jaw force under lift acceleration and an off-centre centre of mass (stylised)

A follow-up to `research/robofab-grasp` (track `robofab`; its "lift and acceleration loads" and "tipping for off-centre centres of mass" next steps). That project found that friction needs only milli- to centinewtons to hold the parts of a toy gripper at rest, and that the textbook bound `N >= m g / (2 mu)` matches MuJoCo. Here I add two things a moving gripper meets: a lift or sideways acceleration, and a centre of mass that is not under the pads. All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-liftload/

- **Acceleration is just a bigger weight, and MuJoCo agrees.** With the load as an effective gravity `sqrt((g + a_z)^2 + a_t^2)` in the pad frame, the bound scales as expected. Over 66 cases (the six free parts, every grasp axis that fits a 30 mm opening, six loads up to `a_z` = `a_t` = 20 m/s², mu = 0.5), the simulated minimum force is 1.00 to 1.06 times the bound (median 1.01). The largest bound is 0.21 N (cover, 20 m/s² up and sideways). Still tiny; the jaw opening remains the binding constraint.
- **These parts cannot show the torque effect.** Every part is symmetric, so its centre of mass sits at the centre of its bounding box (offset 0.00 mm in all 66 cases). Case A therefore says nothing about tipping.
- **Off-centre case (10x10 mm bar held at one end): the answer depends on a threshold I chose.** For a bar of length 20 to 60 mm held by a 10 mm pad window, I bracket the needed force by a force-only term and a torque-only term (`lower` = the larger, `upper` = their sum). With a 5 degree rotation tolerance, the simulation holds with *less* force than the lower bound in 11 of 12 offset cases (for example 0.35 N against a lower bound of 0.48 N for the 60 mm bar at mu = 0.5), which means the criterion lets the bar rotate and sag a little, not that the bound is wrong. With a 1 degree tolerance, 3 of 12 offset cases fall inside the bracket (the 20 mm bar), the 30 mm bar needs 9.4 N (far above the bracket), and the 40 and 60 mm bars do not hold even at 20 N. I did not resolve whether that is soft-contact creep in the simulator or a real feature of the model. **Negative/inconclusive for the torque bracket.**

```bash
pip install mujoco numpy
cd research/robofab-liftload
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, < 1 s
python3 experiments/run.py                                # about 1 min; writes experiments/results.{txt,json}
```
Produced with MuJoCo 3.15.0 and Python 3.13.

## Motivation

A grasp that holds at rest can still drop a part during a lift. Whether a cheap analytic bound survives acceleration and an off-centre load is a simulation-fidelity question, the repository's central theme.

## Builds on

`research/robofab-grasp` and `research/robofab-selfparts` in this repository (the part list and bound are copied so this project is self-contained), and the workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from the group is reproduced and nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. Context: Zykov et al. (2005). Both entries in `paper/refs.bib` come from `PROJECTS.md` (checked 2026-10-12) and were not independently re-verified in this run.

## Method

`src/robofab_liftload/model.py`: mass (box volume times an assumed 1240 kg/m³), the effective-load bound, and for the bar a force/torque bracket. The torque term uses the mean distance of the pad patch from its centre (uniform pressure), `N_torque = m g d / (2 mu r_mean)`, with `d` the distance from the pad centre to the bar's centre of mass. This is a simple bracket, not an exact limit-surface solution. `src/robofab_liftload/sim.py`: the `robofab-grasp` MuJoCo set-up (free part, two force-driven slide pads, elliptic cones, 0.2 ms step, stiff `solref`), with the load applied as the gravity vector in a fixed pad frame. That models a constant acceleration without rotation; ramp-up, arm dynamics and vibration are not modelled. "Holds" means the centre of mass moves under 2 mm and the part turns under a rotation tolerance (5 or 1 degrees) in 0.5 s; minimum force by bisection up to 20 N.

## Results

See the bullets above and `experiments/results.txt`.

## Limitations

- Boxes only, one design, assumed density and friction, rigid pads with stiff contact; none measured.
- The load is a constant effective gravity, not a trajectory.
- The pass/fail thresholds (2 mm, 5 or 1 degrees, 0.5 s) drive case B. The bisection is not guaranteed monotonic (the 30 mm bar at 1 degree shows this). Treat B as inconclusive.
- Case A has no centre-of-mass offset, so it does not test tipping.

## Next steps

Pad compliance and a torsional-friction model that can be checked in isolation; a smoother, tolerance-free criterion (for example slip speed); real gripper meshes; an arm trajectory from `robofab-reach` instead of a constant load.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.

## Figure
`python3 experiments/figure.py` plots the MuJoCo minimum holding force against the closed-form load bound (section A) from the committed `experiments/results.json` and writes `experiments/liftload_bound_vs_mujoco.svg` (standard library only; no new results; stylised simulation).
