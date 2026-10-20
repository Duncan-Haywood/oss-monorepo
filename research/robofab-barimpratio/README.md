# Does a stiffer friction cone make the held-bar result in robofab-liftload threshold-free? (stylised)

A follow-up to `research/robofab-sliprate` and `research/robofab-liftload` (track `robofab`; the "rate-based criterion applied to `robofab-liftload`'s cases" and "derive the creep rate from the soft-contact parameters" next steps). `robofab-sliprate` found that a 10x10x40 mm bar held at one end by two pads creeps at a steady rate in MuJoCo that depends on solver settings, so `robofab-liftload`'s pass/fail answer reflected the simulator. Here I raise MuJoCo's `impratio` (the option that makes the friction cone stiffer) until the creep is negligible, and ask whether the torque bracket from `robofab-liftload` then holds. All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-barimpratio/

- **The creep rate falls about in proportion to 1/`impratio`, with force and timestep irrelevant.** For the 40 mm bar (mu = 0.5), the rate over the last 0.5 s of a 1 s run is 3.66, 1.20, 0.36, 0.15, 0.044 and 0.004 deg/s at `impratio` 1, 3, 10, 30, 100 and 1000, and within 5% of that at 0.3, 1 and 3 N for `impratio` 10 or more. (A quick timestep check in the prototype, 0.4 to 0.05 ms at `impratio` 1, changed the rate by under 1%; that check is not in `results.txt`.)
- **With creep suppressed, the answer no longer depends on the tolerance I choose.** At `impratio` 1 the minimum force for a 1 degree tolerance is 1.4 to 250 times the 5 degree one where it exists, and it does not exist (fails at 20 N) in 6 of 12 cases. At `impratio` 10 or more the 1 degree force is 1.03 to 1.26 times the 5 degree force (median 1.12 to 1.14) in all 12 cases, and the numbers at `impratio` 100 and 1000 are almost identical (a single 60 mm, mu = 0.3 case differs by 2% at 1 degree).
- **The simulator's force sits below the uniform-pressure bracket, and above a point-contact bound.** At `impratio` 1000 and 1 degree, MuJoCo's minimum force is 0.67 to 1.17 times the `robofab-liftload` lower bound (median 0.78); it lies inside the bracket in 2 of 12 cases and below it in 10. MuJoCo's box pads touch the bar at five points per pad (the corners and one edge midpoint, read from the simulator), not as a uniform pressure patch. A point-contact bound using that layout (a least-force problem for equal normal loads at those points, `src/robofab_barimpratio/model.py`) is below MuJoCo in all 12 cases: MuJoCo needs 1.15 to 1.67 times as much (median 1.55). I did not test why; sag of the soft contact before it holds is one candidate. So the old bracket overstates what this simulator needs and the point-contact bound understates it, each by a factor that varies by about 1.7x over the 12 cases.
- **What this does not show.** It is a statement about MuJoCo's contact model, one pad geometry and one bar section. Whether a real pad behaves like the bracket, the point-contact bound or neither is untested here. A tight `impratio` is also not free: I did not time it or check stability on other scenes. **Preliminary.**

```bash
python3 -m pip install mujoco numpy
cd research/robofab-barimpratio
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, < 1 s
python3 experiments/run.py                                # about 90 s; writes experiments/results.{txt,json}
python3 experiments/figure.py                             # redraws the SVG from results.json
```
Produced with MuJoCo 3.16.0 and Python 3.13.

## Motivation

Whether a cheap analytic grasp bound survives a simulator is a simulation-fidelity question, the repository's central theme. `robofab-liftload` could not say, and `robofab-sliprate` traced the cause to the simulator. This project removes that cause and re-asks the question.

## Builds on

`research/robofab-liftload` and `research/robofab-sliprate` in this repository (the model code and simulation set-up are copied, with an `impratio` argument added, so this project is self-contained), and the workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from the group is reproduced and nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS (`paper/refs.bib`, entry carried over from `robofab-liftload` and not re-verified in this run). `impratio` is an option of MuJoCo's `option` element; I used it as documented there and did not re-derive its effect.

## Method

`src/robofab_barimpratio/sim.py`: the `robofab-liftload` set-up (a free 10x10 mm section bar, two force-driven slide pads of 10 mm window, elliptic cones, 0.2 ms step, `solref` 4 ms, point friction only, no torsional friction), with `impratio` as an argument. "Holds" means the centre of mass moves under 2 mm and the bar turns under the tolerance (5 or 1 degree) in 0.5 s; minimum force by bisection up to 20 N, to 2% resolution. Section A measures the rotation rate; section B finds the minimum force for bar lengths 20, 30, 40 and 60 mm and mu 0.3, 0.5, 0.8 at `impratio` 1, 10, 100 and 1000. `model.py` holds the uniform-pressure bracket (from `robofab-liftload`) and `point_contact_bound`: for n equal point contacts per pad, each able to carry friction mu N / n, the least N that balances the bar's weight and its moment about the pad normal, found by checking all directions of a support-function condition on a 40,000-point grid.

## Limitations

One bar section, one pad window, one `solref`, one engine, one run per cell (the simulator is deterministic). The 20 N search ceiling and 2% bisection tolerance apply; at `impratio` 1 the 30 mm bar at 1 degree returns 9.4 N for all three mu (the other 1 degree cases there fail at 20 N), which I did not investigate. The point-contact bound assumes equal normal loads, which the simulator does not guarantee (a pad that tilts loads some contacts more). Sag at the pads, not slip, may set the 1 degree force. No torsional friction, so nothing here says what a real pad's torsion would add. Simulated results only, with no claim about a real gripper.

## Next steps

Repeat in a second engine (for example PyBullet) to see whether the 0.78 and 1.55 factors belong to MuJoCo; add torsional friction (`condim` 4) at high `impratio`; unequal normal loads from the measured contact forces; a lower `solref` to separate sag from creep.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

MuJoCo and NumPy (open source, pip). No language model, key or hardware. Produced with AI assistance (Claude).

MIT.
