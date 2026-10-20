# Does a rate-based "holds" criterion make a MuJoCo grasp verdict less dependent on solver settings? (stylised, negative)

A follow-up to `research/robofab-sliprate` (track `robofab`; its "rate-based criterion applied to `robofab-liftload`'s cases" next step). That project showed the off-centre bar creeps at a rate set by solver settings, so a rotation tolerance gives a settings-dependent verdict. Here I test the obvious fix: judge the bar by its extrapolated creep over a task time instead. It does not help. All numbers are from `experiments/results.txt` (MuJoCo 3.16.0).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-slipcrit/

- **The rate criterion is as settings-dependent as the strict tolerance.** Criterion "extrapolated far-end motion and centre-of-mass drop both under 2 mm over a 3 s hold" gives a minimum holding force that varies across 8 solver settings (contact `condim` 3 or 4, `solref` time constant 0.002 or 0.008 s, `impratio` 1 or 10) by a max/min ratio of 32.9 (20 mm bar), 400 or more (30 mm, some settings fail even at 20 N), 242.7 (40 mm) and 89.4 (60 mm). The 1 degree-in-0.5 s tolerance gives 54.3, 400, 242.7 and 89.4: nearly the same.
- **Only the loose 5 degree tolerance is stable, and only for short bars.** Its spread is 1.0 (20 mm), 1.6 (30 mm), 2.7 (40 mm) but 33.0 for the 60 mm bar. Its minimum forces (0.05 to 0.37 N for bars up to 60 mm, mostly) sit near or below the torque bracket's lower bound from `robofab-liftload`, so it passes bars that rotate and sag a little, as that project found.
- **The cause is the creep, not the criterion.** With `impratio` 1 and the stiff-to-soft `solref` of 0.008 s, many cases creep faster than any force in the grid can stop (the 3 s extrapolation multiplies a rate of order 1 to 4 deg/s by the 35 to 55 mm lever arm). Raising `impratio` to 10 removes most failures, consistent with `robofab-sliprate` and `robofab-barimpratio`. A better criterion cannot fix a verdict whose input is a solver artefact; the setting has to be fixed or reported with the verdict.
- **Negative for the rate criterion as a settings-independent test; preliminary.** The grid is coarse (13 forces), the "all larger forces also hold" rule makes a few cells jump, one engine and one MuJoCo version, and 2 mm over 3 s is one choice of threshold.

```bash
python3 -m pip install mujoco numpy
cd research/robofab-slipcrit
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, < 1 s
python3 experiments/run.py                                # about 35 s; writes experiments/results.{txt,json}
python3 experiments/figure.py                             # writes experiments/spread.svg
```
Produced with MuJoCo 3.16.0 and Python 3.13. (`robofab-sliprate` used 3.15.0; its rates were not re-run here.)

## Motivation

A twin's "holds" verdict should come from the grasp, not from contact settings. `robofab-sliprate` showed the bar's rotation rate depends on those settings; the natural remedy is a physically meaningful criterion. This tests whether it works.

## Builds on

`research/robofab-sliprate` and `research/robofab-liftload` in this repository (the simulator and bracket are copied, so this project is self-contained), and the workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from the group is reproduced and nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. Both entries in `paper/refs.bib` are copied from `robofab-sliprate`; they were not independently re-verified in this run.

## Method

`src/robofab_slipcrit/sim.py` and `model.py` are copied from `robofab-sliprate`: a 10x10 mm bar (20 to 60 mm long, assumed density 1240 kg/m^3) gripped at one end by two force-driven pads over a 10 mm window, mu = 0.5, gravity only, 0.2 ms step, 1 s run. `crit.py` defines three criteria on the trajectory: the angle at 0.5 s under 1 or 5 degrees (and drop under 2 mm), or the late (last 0.4 s) rotation and drop rates extrapolated over 3 s giving far-end motion `|w|*3 s*(L-5 mm)` and drop each under 2 mm. For each bar and each of 8 settings, a 13-point geometric force grid from 0.05 to 20 N is run; the minimum force is the smallest grid force from which all larger grid forces pass. Spread is max/min across settings (failures at 20 N counted as 20 N).

## Results

See the bullets above, `experiments/results.txt` and `experiments/spread.svg`.

## Limitations

- One engine (MuJoCo 3.16.0), boxes, rigid pads, assumed density and friction, no lift acceleration.
- Eight settings and one threshold (2 mm, 3 s) for the rate criterion; others were not tried. A longer task time or looser tip bound would loosen it and was not explored.
- The grid has 13 forces, and "all larger also hold" can hide non-monotone behaviour. Cells reading `None` mean no grid force up to 20 N passed.
- The 1 s run's late window is 0.6 to 1.0 s, so creep that develops later is not seen.

## Next steps

Sweep the task time and tip bound to see whether any rate threshold is settings-robust; compare with a second engine once one installs here (PyBullet failed to build in this environment); report each verdict together with the `impratio` and `solref` it used; fit settings to a measured grip (owner step).

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.

## Figure
`python3 experiments/figure.py` draws the spread of the minimum holding force across solver settings for each criterion and bar length from the committed `experiments/results.json` (standard library only; no new results; stylised simulation).
