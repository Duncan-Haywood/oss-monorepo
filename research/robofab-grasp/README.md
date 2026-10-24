# Can friction hold each printed part of a gripper? Analytic bound vs MuJoCo (stylised)

A small follow-up to `research/robofab-selfparts` (track `robofab`; its "grasp-stability check" next step). That project showed by geometry alone that a parallel-jaw arm with a 30 mm opening can place every part of a seven-part toy gripper. Here I ask the force question for the six free parts (not the fixtured base): what is the smallest force each jaw must apply so that friction holds the part against gravity, for every grasp axis that fits the jaw? I compare the textbook bound `N >= m g / (2 mu)` (two contacts, each carrying `mu N`) with a MuJoCo simulation. All numbers below are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-grasp/

- **Analytic bound and simulation agree.** Over 33 cases (6 parts, the grasp axes that fit, mu = 0.3, 0.5, 0.8) the simulated minimum holding force is 1.00 to 1.05 times the bound (median 1.00). The 1.05 cases are the lightest part (the 0.36 g link) at mu = 0.8, where the force is about 2 mN and the simulation's settling tolerance matters. This mainly confirms that the MuJoCo set-up reproduces the bound; it is not a new result.
- **The force is tiny.** The bound runs from 0.002 N (link, mu = 0.8) to 0.097 N (cover, mu = 0.3). Part masses are 0.36 to 5.95 g (PLA-like density assumed). Any real servo gripper's force is orders of magnitude higher, so in this model friction is never the binding constraint; the jaw opening is (the 30 mm cover fits only along y, with no slack).
- **Two grasp axes fit for the rails, fingers and link, one for the cover.** Rails are 4 mm in x and 30 mm in y, so both fit a 30 mm opening.
- **What this leaves out** is what makes real grasping hard: tipping from an off-centre centre of mass, inertial loads while moving, pad compliance, slip during insertion, and the insertion forces themselves.

```bash
pip install mujoco numpy
cd research/robofab-grasp
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, < 1 s
python3 experiments/run.py                                # about 15 s; writes experiments/results.{txt,json}
```
Produced with MuJoCo 3.15.0 and Python 3.13.

## Motivation

A plan that is geometrically feasible still fails if parts cannot be held. This is also a fidelity check: it asks whether a cheap formula and a physics engine agree, which is the repository's simulation-fidelity theme.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), and `research/robofab-selfparts` in this repository, whose part list I copy so the project is self-contained. No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. Self-replication context: Zykov et al. (2005). Entries in `paper/refs.bib`, taken from `PROJECTS.md` (checked 2026-10-12) and not independently re-verified in this run.

## Method

`src/robofab_grasp/model.py` gives part masses (box volume times an assumed 1240 kg/m³), contact area on each bounding-box face, the grasp axes that fit a 30 mm jaw opening, and the bound. `src/robofab_grasp/sim.py` builds a MuJoCo model: the part as a free body, two pad bodies on slide joints along the grasp axis, each pushed by a constant force, with gravity. The part "holds" if it moves less than 2 mm in 0.5 s; the minimum force is found by bisection between 0 and 20 N. Pads cover the whole bounding-box face, elliptic friction cones, timestep 0.2 ms.

## Results

See the bullets above and `experiments/results.txt`.

## Limitations

- Static hold only, boxes only, one design, rigid pads, assumed density and friction coefficients; none were measured.
- The simulated contact is made stiff (`solref` 0.004) because softer contacts were unstable above a few newtons with these light parts. In early trials with softer contacts the holding result was not monotonic in force, so I changed the contact settings; the reported results use the stiff setting only.
- The 2 mm displacement criterion is a choice; a stricter one would raise the light-part ratios slightly.

## Next steps

Tipping about the pad-to-pad axis for off-centre centres of mass; lift and acceleration loads; compliant pads; the real gripper geometry as meshes; link grasp force to the `robofab-reach` arm.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
