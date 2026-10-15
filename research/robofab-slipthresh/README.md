# Is any rate threshold settings-robust for a MuJoCo grasp "holds" verdict? Only a loose one (stylised, preliminary)

A follow-up to `research/robofab-slipcrit` (track `robofab`; its "sweep the task time and tip bound" next step). That project found a rate criterion (far-end motion and drop under 2 mm over a 3 s hold) as settings-dependent as a strict rotation tolerance. Here I sweep both of its free parameters, 4 task times by 4 tip bounds, over the same 4 bars and 8 solver settings. All numbers are from `experiments/results.txt` (MuJoCo 3.16.0).

- **The sweep reproduces `robofab-slipcrit`'s 3 s / 2 mm row exactly** (spreads 32.9, 400, 242.7, 89.4 for 20, 30, 40, 60 mm bars), so the two projects agree.
- **Settings dependence falls monotonically with the allowed tip speed, tip bound / task time.** Worst-case spread (max/min of the minimum holding force over the 8 settings, worst of the 4 bar lengths) is 242.7 to 400 for every threshold at 2 mm/s or less, 89.4 at 3.3 to 5 mm/s, 20.0 at 10 mm/s, and **1.6 only at 20 mm/s (0.5 s, 10 mm)**: the one threshold where every bar gives a spread under 2.
- **That robust threshold is loose.** 20 mm/s over 0.5 s lets the far end move 10 mm. It puts 24 of 32 minimum forces within a factor 2 of `robofab-liftload`'s torque bracket (the other 15 thresholds put 8 to 23 there), but a 10 mm tip error is far above what an assembly task tolerates, and a longer hold (10 s) fails at every bound tried (10 to 22 of 32 cells fail even at 20 N).
- **Reading.** A threshold's robustness comes from the contact settings' creep being too small to matter against it, not from the criterion being better. A settings-independent verdict needs the setting reported with it, or a threshold chosen loosely enough that the artefact is below it. Preliminary and stylised.

```bash
python3 -m pip install mujoco numpy
cd research/robofab-slipthresh
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, < 1 s
python3 experiments/run.py                                # about 45 s; writes experiments/results.{txt,json}
python3 experiments/figure.py                             # writes experiments/spread.svg
```
Produced with MuJoCo 3.16.0 and Python 3.13.

## Motivation

A twin's "holds" verdict should come from the grasp, not from contact settings. `robofab-slipcrit` left open whether some rate threshold is robust; this answers it for the grid below.

## Builds on

`research/robofab-slipcrit`, `research/robofab-sliprate` and `research/robofab-liftload` in this repository (the simulator, criterion and bracket are copied, so this project is self-contained), and the workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from the group is reproduced and nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. The `paper/refs.bib` entries are copied from `robofab-slipcrit` and were not independently re-verified in this run.

## Method

As in `robofab-slipcrit`: a 10x10 mm bar (20, 30, 40, 60 mm long, assumed density 1240 kg/m^3) gripped at one end by two force-driven pads, mu = 0.5, gravity only, 0.2 ms step, 1 s run. Eight settings (contact `condim` 3 or 4, `solref` time constant 0.002 or 0.008 s, `impratio` 1 or 10) and a 13-point geometric force grid from 0.05 to 20 N. Each of the 416 trajectories is simulated once; the rate criterion (late rotation and drop rates, extrapolated over task time T, far-end motion and drop each under the tip bound) is then evaluated for T in {0.5, 1, 3, 10} s and tip bound in {1, 2, 5, 10} mm. The minimum holding force is the smallest grid force from which all larger grid forces pass; failures at 20 N count as 20 N in the spread.

## Results

See the bullets above, `experiments/results.txt` and `experiments/spread.svg` (heat map of worst-case spread).

## Limitations

- One engine (MuJoCo 3.16.0), boxes, rigid pads, assumed density and friction, no lift acceleration, one friction coefficient.
- The late-rate window is 0.6 to 1.0 s of a 1 s run, so extrapolating to 10 s multiplies a short measurement by 25; creep that develops later is not seen.
- A coarse 13-force grid, and "all larger also hold" can hide non-monotone behaviour. Spreads are ratios of grid values, so values such as 1.6 or 2.7 are one or two grid steps. The "within 2x of the torque bracket" count is a rough sanity check, not a fidelity test.
- The sweep covers 16 thresholds; the tip-speed pattern is read off these 16 and is not proved.

## Next steps

Test the 20 mm/s threshold with a second friction coefficient and a lift acceleration; compare with a second engine once one installs here; fit settings to a measured grip (owner step).

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
