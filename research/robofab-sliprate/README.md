# Why the off-centre bar "inconclusive" result in robofab-liftload is solver creep (stylised)

A follow-up to `research/robofab-liftload` (track `robofab`; its "tolerance-free criterion" and "torsional-friction model" next steps). That project could not tell whether a bar held at one end by two pads failed its pass/fail test because of the grasp or because of the simulator. Here I measure the bar's rotation *rate* instead of applying a threshold. All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-sliprate/

- **Above a very low force the bar does not slip off; it creeps at a steady rate that barely depends on force.** For a 10x10x40 mm bar held by a 10 mm pad window (mu = 0.5, plain MuJoCo sliding friction), the rotation rate over the last 0.4 s is -3.67 deg/s at 0.3 N and -3.57 deg/s at 3 N. It falls only at large forces (-2.25 deg/s at 20 N). The angle grows linearly in time (over 3 s with torsional friction on, 1.35 deg/s throughout), so there is no threshold force above which it stops.
- **So the earlier pass/fail answer was set by my tolerance, not by the grasp.** A rotation tolerance of 1 degree in 0.5 s fails whenever the rate exceeds about 2 deg/s, and the 5 degree tolerance passes whenever it is below about 10 deg/s. The rates here sit between those.
- **The creep rate is set by solver settings.** At 40 mm and 1.2 N, rate scales with the contact time constant (condim 3: -1.82, -3.65, -6.97 deg/s at 0.002, 0.004, 0.008 s) and falls tenfold when `impratio` goes from 1 to 10 (-3.65 to -0.36 deg/s). Adding torsional friction (condim 4, coefficient 0.005 m) lowers it by 2.5 to 3 times (-3.65 to -1.35 deg/s) but does not remove it. This looks like soft-contact creep of MuJoCo's contact model, not a feature of a rigid grasp, but I did not test it against another engine.
- **Real falls are separate and sit below the torque bracket.** The only runs where the bar drops freely (more than 100 mm drop in the 1 s run, rates over 100 deg/s) are at 0.1 N for the 40 and 60 mm bars (bracket lower bounds 0.19 and 0.48 N) and, for 60 mm, at 0.1 N with torsion. At 0.3 N the 60 mm bar is below its lower bound (0.48 N) but still held in the sense of not dropping: it creeps at -23 deg/s without torsional friction and -2.2 deg/s with it. The bracket therefore does not separate holding from creeping either. **Negative for using the bracket as a tight limit; inconclusive about the real physics.**

```bash
python3 -m pip install mujoco numpy
cd research/robofab-sliprate
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, < 1 s
python3 experiments/run.py                                # about 5 s; writes experiments/results.{txt,json}
```
Produced with MuJoCo 3.15.0 and Python 3.13.

## Motivation

A gripper model is only useful if a "holds" verdict reflects the grasp, not the simulator's contact settings. This is the repository's central fidelity question (digital-twin fidelity), asked of the smallest case that failed to resolve.

## Builds on

`research/robofab-liftload` and `research/robofab-grasp` in this repository (the bar, bounds and MuJoCo set-up are copied and reduced so this project is self-contained), and the workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from the group is reproduced and nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. Context: Zykov et al. (2005). Both entries in `paper/refs.bib` are copied from `robofab-liftload`; they come from `PROJECTS.md` and were not independently re-verified in this run.

## Method

`src/robofab_sliprate/model.py` is the force/torque bracket from `robofab-liftload` (copied). `src/robofab_sliprate/sim.py`: a 10x10 mm bar of length 20 to 60 mm (density 1240 kg/m^3 assumed) held at one end by two force-driven slide pads covering a 10 mm window, gravity only, elliptic cones, 0.2 ms step. `run` records the rotation angle about the grasp axis and the centre-of-mass drop every 50 ms for 1 s; `late_rate` is the least-squares slope of the last 0.4 s. Variants: contact dimension 3 (sliding friction) or 4 (adds torsional friction 0.005 m), contact time constant 0.002 to 0.008 s, `impratio` 1 or 10. Experiments A (length x force grid), B (solver settings), C (a 3 s run).

## Results

See the bullets above and `experiments/results.txt`.

## Limitations

- One simulator (MuJoCo 3.15.0) and one contact family; no cross-check against another engine or a physical grip.
- Boxes, rigid pads, assumed density, friction and torsional coefficient; none measured.
- Gravity only, no lift acceleration. Rate is a slope over 0.4 s, so a falling bar's rate is not meaningful.
- I did not derive the creep rate from MuJoCo's soft-constraint equations; the solver-setting dependence is measured only.

## Next steps

Derive or bound the creep rate from the soft-contact parameters; compare with a second engine (for example PyBullet); a rate-based criterion such as "slip speed below a fraction of the release speed" applied to `robofab-liftload`'s cases; fit the torsional coefficient to a measured grip (owner step).

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.

## Figure
`python3 experiments/figure.py` plots the slip drop rate against pad force for each part length (section A, condim 3) from the committed `experiments/results.json` and writes `experiments/droprate_vs_force.svg` (standard library only; no new results; stylised simulation).
