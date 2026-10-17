# Does an off-centre centre of mass need a harder grasp? Ball and flat pads, bounds vs MuJoCo (stylised)

A follow-up to `research/robofab-liftload` and `research/robofab-graspmove` (track `robofab`). `robofab-liftload` could not say how much extra force a twisting load needs: its torque bracket for an off-centre bar depended on a rotation tolerance I had chosen, and it listed "a torsional-friction model that can be checked in isolation" as a next step. This project does that on the simplest case: a 20 mm cube pinched on two faces whose centre of mass is shifted by `d` in the pad plane, so gravity also twists it about the grasp axis. All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-graspoffset/

- **Ball pads (one point contact each): the bound is exact in the simulator.** With an assumed torsional friction coefficient `mu_t` = 2 mm and `mu` = 0.5, the elliptic-cone bound `N >= (m g / 2) sqrt(1/mu^2 + (d/mu_t)^2)` matches MuJoCo within 1.1% at all 8 offsets from 0 to 20 mm (ratio 0.999 to 1.011). The needed force rises from 0.097 N at `d` = 0 to 0.50 N at 20 mm, 5x. Torsion starts to dominate at `d` = `mu_t`/`mu` = 4 mm. This mostly confirms that the simulator implements its own cone; `mu_t` is not a measured property of any pad.
- **Flat pads (a rigid face on a face): the offset costs far less, and the answer is an interval.** A rigid flat contact has no torsional friction in my model; the twist is resisted by friction at the contact points, which MuJoCo places at the face corners (10 part-pad contacts at rest for the two pads together). How the normal load is shared between those corners is not determined by rigid-body statics. With four corner contacts, an equal split gives an upper bound and the best split a lower bound. MuJoCo lies inside the interval at all 8 offsets (2% tolerance): 0.099 N at 2 mm, 0.103 N at 10 mm and 0.161 N at 20 mm, against 0.097 to 0.128 N at 10 mm. At 10 mm offset the flat pad needs 0.39 times the ball-pad force. The simulator picks a split in between and I did not test why or whether it would in another solver.
- **The rotation tolerance did not matter here.** At `d` = 10 mm the minimum force is identical for 1, 3 and 10 degrees of allowed rotation, for both pad types (`results.txt`), because a part that is short of force turns rapidly rather than creeping. This resolves, for this simple case only, the sensitivity that left the `robofab-liftload` bar result inconclusive; it does not explain that result. `research/robofab-sliprate` (merged in parallel) measures the creep rate of the `robofab-liftload` bar directly and attributes that result to solver creep; the cube here, with full-face pads, shows no such creep at the tolerances tried, and I have not compared the two set-ups further.

```bash
pip install mujoco numpy
cd research/robofab-graspoffset
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, a few seconds
python3 experiments/run.py                                # about 20 s; writes experiments/results.{txt,json}
```
Produced with MuJoCo 3.15.0 and Python 3.13.

## Motivation

A part picked up by a corner or end hangs off-axis and twists in the jaws. Whether the pad can resist that is a property of the contact model as much as of the part, which makes it a simulation-fidelity question, the repository's central theme: the same cube needs 0.26 N or 0.10 N at a 10 mm offset depending on the pad idealisation.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), and `research/robofab-liftload`, `research/robofab-graspmove` and `research/robofab-grasp` in this repository. No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. The elliptic friction cone with a torsional coefficient is MuJoCo's own contact model (`condim` 4); I did not read the original derivation beyond the MuJoCo documentation and make no claim about it. The flat-pad bound uses the standard idea of a convex limit surface of friction wrenches (support function of a Minkowski sum of friction discs); I derived it for this note and did not cite a source for it. Self-replication context: Zykov et al. (2005). Entries in `paper/refs.bib` are copied from `robofab-graspmove` and were not independently re-verified.

## Method

`model.py`: the cube has side `L`, density 1240 kg/m^3 (assumed), mass `m`. Each pad carries `m g / 2` of force and `m g d / 2` of torque about the grasp axis. Ball pad: one contact, elliptic cone, bound above. Flat pad: four corner contacts at (+-L/2, +-L/2) in the face plane, each carrying a share `w_i N` of the normal load and a friction force up to `mu w_i N`; feasibility of the target wrench is checked on 1440 directions of the support function, with the shares set equal (upper bound) or minimised over a grid of step 1/10 (lower bound). `sim.py`: the cube is a free body with a massless box geometry and an offset inertial frame; two pad bodies on slide joints are pushed together by constant forces; balls have radius 4 mm. After 0.1 s of settling plus 0.25 s of hold, the part "holds" if its centre moved less than 2 mm and it turned less than 3 degrees. Minimum force by bisection on 0 to 20 N (2% tolerance). Elliptic cones, 10 no-slip iterations, timestep 0.2 ms, `solref` 0.0005 s (the value `robofab-graspmove` found necessary for moving grasps; here nothing moves).

## Results

See the bullets above and `experiments/results.txt` (one row per offset).

## Limitations

- One cube, one `mu`, one `mu_t` (assumed, not measured), rigid pads, a point contact for the ball and four corner points for the flat pad. Real pads deform, and a soft finger has a contact patch whose torsional capacity grows with force.
- The flat-pad interval is wide at some offsets (0.097 to 0.128 N at 10 mm) and I have not explained where in it MuJoCo lands.
- The 8 offsets and the single cube size do not show how the result scales with size.
- Static hold only; no motion, so this does not combine with the acceleration loads of `robofab-graspmove`.
- The 3 degree and 2 mm criteria are choices; only the rotation tolerance was varied.

## Next steps

Combine with the acceleration loads of `robofab-graspmove`; a compliant (soft-finger) pad with force-dependent patch; the real gripper meshes from `robofab-selfparts`; check the `robofab-liftload` bar case with this pad model.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.

## Figure
`python3 experiments/figure.py` plots the minimum grip force against offset from the committed `experiments/results.json` and writes `experiments/force.png` (needs matplotlib; no new results).
