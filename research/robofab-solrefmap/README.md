# How fine must MuJoCo contact settings be for a moving friction grasp? A map over acceleration and part (stylised)

A follow-up to `research/robofab-graspfast` (track `robofab`; its "systematic study of the settings needed as a function of acceleration" and "remaining parts" next steps). `robofab-graspfast` found that the settings of `robofab-graspmove` (contact time constant `solref` 0.5 ms, timestep 0.2 ms) fail above 200 m/s^2 but passed fine settings on three parts. Here the same jaw test is run on all seven parts of the toy gripper at four settings pairs, and the `solref` at which the test starts to fail is scanned against acceleration on one part. I do not simulate an arm, only a prescribed constant acceleration of the jaws (upward). All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-solrefmap/

- **Setting pairs (0.2 ms, 0.1 ms), (0.1, 0.05) and (0.05, 0.025) reproduce the bound at 100, 400 and 800 m/s^2 for all seven parts.** The ratio of the simulated minimum force to `m sqrt((g + a_up)^2)/(2 mu)` is 0.98 to 1.04 in all 63 cases (7 parts x 3 accelerations x 3 settings; the 1.04 is the link at 800 m/s^2 at the finest setting, a 0.29 N force; I did not investigate it).
- **The coarse pair (0.5 ms, 0.2 ms) matches the bound at 100 m/s^2 (ratio 0.99 to 1.01, all seven parts) but at 400 and 800 m/s^2 no force up to 60 N holds any of the seven parts** (14 of 14 cases). The failure does not depend on the part in this set.
- **The failing region grows with acceleration** (cover, timestep 0.1 ms, scan of 25 cases). At 200 m/s^2 every `solref` from 0.2 to 0.5 ms holds; at 300 and 400 m/s^2 0.4 and 0.5 ms fail and 0.3 ms and below hold; at 600 and 800 m/s^2 only 0.2 ms holds in the scan (0.25 ms fails). So the largest adequate `solref` falls from at least 0.5 ms at 200 m/s^2 to between 0.2 and 0.25 ms at 600 m/s^2.
- **It is not a single threshold on `a * solref`.** 0.2 ms at 800 m/s^2 (product 0.16 m/s) holds, while 0.25 ms at 600 m/s^2 (0.15 m/s) and 0.5 ms at 300 m/s^2 (0.15 m/s) fail. The scan has 5 values of each variable, so I give only the table, not a fitted rule. The scan used one timestep (0.1 ms); the dependence on timestep alone is not separated here (`robofab-graspfast` swept it on one case).
- **Practical consequence in this set-up:** for a jaw test at up to 800 m/s^2 use `solref` <= 0.2 ms with a timestep of half that or less; a "holds at no force" result at a coarser setting should be read as a simulator artefact, not a grasp failure.

```bash
pip install mujoco numpy
cd research/robofab-solrefmap
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, < 1 s
python3 experiments/run.py                                # about 2 min; writes experiments/results.{txt,json}
```
Produced with MuJoCo 3.15.0 and Python 3.13.

## Motivation

A sim-to-sim fidelity check is only useful if it says which setting to trust. `robofab-graspfast` gave one working setting; this maps where the working region ends.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), `research/robofab-graspfast` (model and simulation copied so the project is self-contained) and `research/robofab-graspmove`. No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. Self-replication context: Zykov et al. (2005). `paper/refs.bib` is copied from `robofab-graspfast` and was not independently re-verified here.

## Method

As in `robofab-graspfast`: a free-body part held between two force-driven pad bodies under a gravity-compensated carrier that follows a prescribed upward constant acceleration for 0.05 s after 0.1 s of settling. Held if the part moves < 2 mm relative to the carrier. Minimum force by bisection on 0 to 60 N (tolerance 2%). Elliptic cones, 10 no-slip iterations, density 1240 kg/m^3 (assumed), mu = 0.5, the first grasp option of `grasp_options` per part. "None" means no force up to 60 N holds.

## Results

See the bullets above and `experiments/results.txt` (main grid: 7 parts x accelerations 100, 400, 800 x four settings pairs; boundary scan: cover, five accelerations x five `solref`).

## Limitations

- Upward acceleration only, constant for 0.05 s; no sideways or mixed loads, no arm trajectory, no vibration.
- Boxes, rigid pads, assumed density and one friction value; one grasp axis per part; the 2 mm slip criterion is a choice.
- Settings pairs were chosen by hand; the timestep was tied to `solref` in the main grid and fixed in the scan, so their separate effects are not isolated. The 1.04 outlier is unexplained.
- Only MuJoCo 3.15.0 and one contact model (`solref` damping ratio 1, default `solimp`).

## Next steps

Separate timestep from `solref` in a full grid; add sideways and mixed loads; vary `solimp` and the damping ratio; find whether the boundary tracks pad stiffness or part mass (the cover and link have different masses but the same failing region in the main grid).

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
