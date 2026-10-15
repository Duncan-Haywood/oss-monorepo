# Does the loose 20 mm/s "holds" threshold stay settings-robust at other friction and under lift acceleration? Mostly, not strictly (stylised, preliminary)

A follow-up to `research/robofab-slipthresh` (track `robofab`; the first half of its "second friction coefficient and a lift acceleration" next step). That project found one threshold, far-end motion under 10 mm in 0.5 s (20 mm/s), where the minimum holding force of a bar varies by under 2x across eight MuJoCo contact settings, at one friction coefficient (mu 0.5) and gravity only. Here the same 16-threshold sweep is repeated at mu 0.3, 0.5 and 0.8, each with and without a 5 m/s^2 upward lift acceleration, six conditions in all. All numbers are from `experiments/results.txt` (MuJoCo 3.16.0).

- **The mu 0.5, no-lift condition reproduces `robofab-slipthresh` exactly** (3 s / 2 mm spreads 32.9, 400, 242.7, 89.4 for 20, 30, 40, 60 mm bars), so the two projects agree.
- **20 mm/s is the only threshold under 5x in every condition.** Its worst-case spread (max/min of the minimum holding force over the 8 settings, worst of 4 bars) is 1.6 in four conditions (mu 0.3, 0.5 and 0.8 without lift; mu 0.8 with lift), 2.7 at mu 0.5 with lift and **4.5 at mu 0.3 with lift**, so "under 2" does not survive a low-friction, accelerating grasp. No condition fails at 20 N at this threshold.
- **Every other threshold is at least 20x in every condition.** The next-best is 10 mm/s at 20.0 (mu 0.3 and 0.5, no lift) to 54.3 (mu 0.8, with lift); at 5 mm/s and below the worst spread is 54.3 to 400.
- **The decline with tip speed is not strictly monotone.** At mu 0.8 without lift, 5 mm/s (147.4) is worse than 4 mm/s (89.4), so "falls with tip speed" holds as a trend over these 16 thresholds, not as a rule.
- **The loose threshold is still loose.** 10 mm of far-end motion is far above what an assembly task tolerates; the finding is about what a settings-independent verdict costs, not that the grasps are good.
- **Reading.** `robofab-slipthresh`'s conclusion (robustness comes from a loose threshold, not a better criterion) holds over friction 0.3 to 0.8 and a 0.5 g lift, with the margin shrinking where friction is low and the load is high. Preliminary and stylised.

```bash
python3 -m pip install mujoco numpy
cd research/robofab-slipmu
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, < 1 s
python3 experiments/run.py                                # about 1 min on 4 cores; writes experiments/results.{txt,json}
python3 experiments/figure.py                             # writes experiments/spread.svg
```
Produced with MuJoCo 3.16.0 and Python 3.13.

## Motivation

A twin's "holds" verdict should come from the grasp, not from contact settings. `robofab-slipthresh` found a loose threshold that is robust at one friction coefficient with no lift; a real pick-and-place has other friction and accelerates, so this checks whether that result was an accident of mu 0.5 and 1 g.

## Builds on

`research/robofab-slipthresh`, `research/robofab-slipcrit`, `research/robofab-sliprate` and `research/robofab-liftload` in this repository (the simulator, criterion and bracket are copied, so this project is self-contained), and the workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from the group is reproduced and nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. The `paper/refs.bib` entries are copied from `robofab-slipthresh` and were not independently re-verified in this run.

## Method

As in `robofab-slipthresh`: a 10x10 mm bar (20, 30, 40, 60 mm long, assumed density 1240 kg/m^3) gripped at one end by two force-driven pads, 0.2 ms step, 1 s run, eight settings (contact `condim` 3 or 4, `solref` time constant 0.002 or 0.008 s, `impratio` 1 or 10) and a 13-point geometric force grid from 0.05 to 20 N. New here: the friction coefficient mu is 0.3, 0.5 or 0.8 (same value on part and pads), and a constant upward lift acceleration az of 0 or 5 m/s^2 is modelled as gravity g + az in the gripper frame, which is exact for a constant vertical lift of a rigid gripper. The torque bracket the "within 2x" count uses is scaled the same way. Each of the 2,496 trajectories is simulated once and the 16 rate thresholds (task time 0.5, 1, 3, 10 s; tip bound 1, 2, 5, 10 mm) are applied to it. The minimum holding force is the smallest grid force from which all larger grid forces pass; failures at 20 N count as 20 N in the spread.

## Results

See the bullets above, `experiments/results.txt` and `experiments/spread.svg` (worst-case spread against allowed tip speed, one line per condition).

## Limitations

- One engine (MuJoCo 3.16.0), boxes, rigid pads, assumed density, and the same friction on part and pad. Lift is a constant acceleration folded into gravity, so a jerk or a changing direction is not modelled, and neither is horizontal acceleration.
- The late-rate window is 0.6 to 1.0 s of a 1 s run, so extrapolating to 10 s multiplies a short measurement by 25; creep that develops later is not seen.
- The 13-force grid is coarse, and "all larger also hold" can hide non-monotone behaviour. Spreads are ratios of grid values, so 1.6 or 2.7 are one or two grid steps and the 4.5 is three. Three friction values and two accelerations are a probe, not a map.
- The sweep covers 16 thresholds per condition; patterns are read off them and not proved.

## Next steps

Add horizontal (tangential) acceleration and a jerk profile; compare with a second engine once one installs here (PyBullet failed to build in this environment); fit settings to a measured grip (owner step).

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
