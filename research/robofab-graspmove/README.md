# How hard must the jaws squeeze while the arm moves? Friction grasp under acceleration, bound vs MuJoCo (stylised)

A follow-up to `research/robofab-grasp` (track `robofab`; its "lift and acceleration loads" next step). That project found the static holding force of the six free parts of a toy gripper to be at most 0.1 N. Here the whole jaw assembly accelerates, upward or sideways along the pad faces, and I ask for the smallest jaw force that still holds each part. I compare the bound `N >= m sqrt((g + a_up)^2 + a_side^2) / (2 mu)` (the inertial load adds to gravity in the jaw frame; two contacts each carry `mu N`) with MuJoCo. All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-graspmove/

- **Bound and simulation agree.** Over 77 cases (6 parts, the grasp axes that fit a 30 mm opening, 7 load cases, mu = 0.5) the simulated minimum force is 0.99 to 1.07 times the bound (median 1.01). The 1.05 to 1.07 cases are the lightest part (the 0.36 g link) at 3 to 5 mN. As in `robofab-grasp`, this mainly confirms the set-up; the bound is textbook, not new.
- **Loads of 4 g still need under 0.3 N.** The heaviest part (the 5.95 g cover) needs 0.06 N at rest, 0.30 N when lifted at 40 m/s^2 and 0.25 N when accelerated sideways at 40 m/s^2. Friction is still not the binding constraint in this model.
- **A simulator artefact matters more than the physics here.** With MuJoCo's contact time constant `solref` = 0.004 s (the value `robofab-grasp` used), a part held by 20 N appears to slip more than 2 mm as soon as the jaws accelerate at 10 m/s^2, so the "minimum force" does not exist. The friction constraint lags the pad velocity by roughly `a * solref`, which over the 0.15 s acceleration is a slip of order `a * solref * 0.15 s`. The agreement above needed `solref` = 0.0005 s (the table in `results.txt` shows 10 and 40 m/s^2 at 0.004, 0.002, 0.001 and 0.0005 s). A static test cannot see this; a moving one can. I did not check whether other settings (smaller timestep, other solver options) change it further.

```bash
pip install mujoco numpy
cd research/robofab-graspmove
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, < 1 s
python3 experiments/run.py                                # about 1 min; writes experiments/results.{txt,json}
```
Produced with MuJoCo 3.15.0 and Python 3.13.

## Motivation

A grasp that holds a static part may drop it when the arm moves. This is also a fidelity check, in the repository's simulation-fidelity theme: a loose contact setting that passes the static test can fail a moving one.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), and `research/robofab-grasp` and `research/robofab-selfparts` in this repository, whose part list and model I copy so the project is self-contained. No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. Self-replication context: Zykov et al. (2005). Entries in `paper/refs.bib` are copied from `robofab-grasp`, where they came from `PROJECTS.md` (checked 2026-10-12) and were not independently re-verified.

## Method

`model.py` is copied from `robofab-grasp` plus `moving_bound`. In `sim.py` the part is a free body; two pad bodies on slide joints along the grasp axis are pushed together by a constant force each, and hang under a heavy, gravity-compensated carrier with two slide joints (vertical, and horizontal along the pad faces). After 0.1 s of settling, the carrier's position and velocity are overwritten every step to follow constant acceleration `a` for 0.15 s. The part "holds" if its position relative to the carrier never moves more than 2 mm. The minimum force is found by bisection on 0 to 20 N. Elliptic friction cones, 10 no-slip iterations, timestep 0.2 ms, assumed density 1240 kg/m^3 and mu = 0.5. Accelerating along the grasp axis is not tested (it loads one pad, not friction).

## Results

See the bullets above and `experiments/results.txt` (rows per part, axis and load; a `solref` check for the finger).

## Limitations

- Boxes only, rigid pads, assumed density and friction, one friction coefficient (0.5), constant acceleration for 0.15 s from rest, and a 2 mm slip criterion that is a choice.
- The carrier is driven by overwriting its state each step, not by a modelled actuator, so arm dynamics are absent.
- Tipping from an off-centre centre of mass, pad compliance and real gripper geometry are still left out.
- The `solref` value was chosen after seeing the failure at 0.004; the reported results use 0.0005 only, and the failing settings are shown in `results.txt`.

## Next steps

Tipping about the pad-to-pad axis for off-centre centres of mass; compliant pads; the real gripper geometry as meshes; link the required acceleration to the `robofab-reach` arm.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
