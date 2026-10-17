# Does the jaw-force bound still hold at arm accelerations of 100 to 800 m/s^2? MuJoCo check, and the settings it needs (stylised)

A follow-up to `research/robofab-armaccel` (track `robofab`; its "MuJoCo arm ... so the jaw bound is checked at the arm's accelerations" next step) and `research/robofab-graspmove`, which tested the bound `N >= m sqrt((g + a_up)^2 + a_side^2) / (2 mu)` only up to 40 m/s^2. `robofab-armaccel` reported accelerations of 28 to 837 m/s^2. Here the jaw assembly of `robofab-graspmove` is driven at 40 to 800 m/s^2 and the smallest holding force is found in MuJoCo for three parts. I do not simulate the arm itself, only a prescribed constant acceleration of the jaws. All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-graspfast/

- **With fine contact settings the bound holds up to 800 m/s^2.** With timestep 0.05 ms and contact time constant `solref` = 0.1 ms (Table B, 39 cases: link, finger_a and cover; static, up and side at 40 to 800 m/s^2, two mixed loads; mu = 0.5), the simulated minimum force is 0.89 to 1.02 times the bound (median 1.00). The lowest ratios (0.89 to 0.94) are the 0.36 g link at 40 m/s^2 and below, where the force is 3 to 17 mN and the 2 mm slip criterion lets a little creep through. At 400 and 800 m/s^2 every ratio is 1.00 or 1.01. The cover (5.95 g) needs 2.46 N per jaw at 400 m/s^2 up and 4.86 N at 800.
- **The `graspmove` settings fail above 200 m/s^2, and it is the simulator.** With timestep 0.2 ms and `solref` = 0.5 ms (Table A), the bound is matched up to 200 m/s^2 (ratio 0.96 to 1.02 in the 27 cases that have a result) but at 400 and 800 m/s^2 no force up to 60 N holds any part: 12 of 39 cases have no result. A sweep on the cover at 400 m/s^2 up shows the pass or fail depends only on settings: timestep 0.2 or 0.1 ms with `solref` 0.5 ms fails; `solref` 0.2 ms passes at timesteps 0.1 and 0.05 ms (ratio 1.01), and so do the finer settings tried. This is the contact lag already seen in `robofab-graspmove` (slip of order `a * solref * t`), now bound at high acceleration.
- **The duration of the move does not change the answer once the settings are fine.** For the cover sideways at 400 m/s^2 the ratio is 0.98 at 0.02 s, 1.01 at 0.05 s, 0.10 s and 0.15 s.
- **Consequence for `robofab-armaccel`.** Its jaw forces (1.25 N for the cover at 5 N m) were the bound applied beyond 40 m/s^2. In this idealised set-up (prescribed constant acceleration, rigid box pads, mu = 0.5) the bound is a good prediction at those accelerations. It says nothing about the arm trajectory, vibration, pad compliance or a real gripper.

```bash
pip install mujoco numpy
cd research/robofab-graspfast
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, < 1 s
python3 experiments/run.py                                # about 1 min; writes experiments/results.{txt,json}
```
Produced with MuJoCo 3.15.0 and Python 3.13.

## Motivation

A bound is only useful where it has been checked. The fidelity lesson of `robofab-graspmove` (a loose contact setting makes a moving test fail) reappears here at a larger scale: the settings that were adequate to 40 m/s^2 are not adequate at 400 m/s^2.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), and `research/robofab-graspmove` (`model.py` and the simulation are copied from there so the project is self-contained; `t_acc` and the timestep are now parameters, and the acceleration window is 0.05 s instead of 0.15 s) and `research/robofab-armaccel`. No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. Self-replication context: Zykov et al. (2005). `paper/refs.bib` is copied from `robofab-graspmove` and was not independently re-verified here.

## Method

As in `robofab-graspmove`: a free-body part held between two force-driven pad bodies hung under a heavy gravity-compensated carrier whose position and velocity are overwritten each step to follow constant acceleration after 0.1 s of settling. The part holds if it moves less than 2 mm relative to the carrier. Minimum force by bisection on 0 to 60 N (tolerance 2%). Elliptic cones, 10 no-slip iterations, density 1240 kg/m^3 (assumed), mu = 0.5. Parts: link (0.36 g), finger_a (1.59 g), cover (5.95 g). Loads: static; up and side at 40, 100, 200, 400 and 800 m/s^2; and two mixed loads (200 up, 100 side; 100 up, 200 side). Acceleration lasts 0.05 s unless stated.

## Results

See the bullets above and `experiments/results.txt` (Table A: `graspmove` settings; Table B: fine settings; a settings sweep; a duration check).

## Limitations

- The jaws move with a prescribed constant acceleration for 0.05 s; the `robofab-armaccel` carries are min-jerk moves with changing acceleration and changing direction, which I did not simulate.
- Boxes only, rigid pads, assumed density and friction (one value, 0.5), no tipping or pad compliance, a 2 mm slip criterion that is a choice, and one grasp axis per part.
- Three of the six free parts only. The "fine" settings were chosen after Table A failed, and I did not search the settings systematically; the sweep has six points on one case.
- Whether the remaining 1 to 2% above the bound comes from the 2% bisection tolerance, the slip criterion or contact softness is not separated here.

## Next steps

Drive the jaws along the actual `robofab-armaccel` trajectory (or a MuJoCo arm with actuators) instead of constant acceleration; compliant pads; tipping for off-centre masses; the remaining three parts; a systematic study of the settings needed as a function of acceleration.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
