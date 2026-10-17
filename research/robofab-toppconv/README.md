# Once the time-optimal solver's node count is converged, how big is its edge over a tuned trapezoid? (stylised, preliminary)

A follow-up to `research/robofab-scurvefine` (its first "next step"), on the same toy arm, parts and limits as `robofab-scurve`, `robofab-trapezoid`, `robofab-jointspeed`, `robofab-jawcap`, `robofab-reach` and `robofab-graspmove` (track `robofab`). `robofab-scurvefine` found that at 400 nodes the time-optimal solver was about 0.5% pessimistic in one row and so sometimes lost to a ramp-resolved trapezoid, but re-solved only one row at higher node counts. Here all 12 rows (3 arm sizes x jaw cap k = 5 or none x wmax = 2 or 1 rad/s, six printed parts each) are re-solved at n = 400, 1600, 6400 and 25600. All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-toppconv/

- **At n = 25600 the time-optimal profile is faster than the ramp-resolved trapezoid in all 12 rows**, by 0.11% to 0.88% (median about 0.18%). At n = 400 the sign was wrong in 7 of 12 rows (edge -0.30% to -0.17%), all at wmax = 1 rad/s or with no jaw cap; so the negative "edges" in `robofab-scurvefine` were solver discretisation, as it suspected.
- **The solver is converged to within 0.02% by n = 6400** in every row (the total changes by at most 0.0010 s, 0.018%, between n = 6400 and 25600), so n = 25600 is a fair reference; n = 400 is 0.006% to 0.48% pessimistic in total time (up to 0.048 s on totals of 2.5 to 10 s; see the table).
- **The observed convergence order is not clean.** Estimated from three successive 4x node counts it ranges from 1.1 to 3.2 across the rows (and is undefined where the total is flat to four digits, `L=0.2 m, k=5, wmax=2`). Richardson extrapolation with that order changes the edge by at most 0.005 percentage points from the n = 25600 value, so it is reported but not relied on.
- **Reading:** in this toy, the time-optimal carry beats a well-tuned trapezoid by a small amount (0.1 to 0.9%), largest for the 0.2 m arm with a 5x jaw cap at 2 rad/s. The earlier 0.8 to 2.9% (`robofab-scurve`) and the 1.3 to 1.5% figures were grid artefacts, as `robofab-scurvefine` showed. The trapezoid's own side (ramp grid, 40 extra samples per ramp) is unchanged from `robofab-scurvefine`; a still denser ramp sampling could change it slightly and is not tested here.

```bash
cd research/robofab-toppconv
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 48 tests, < 10 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 5 min; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

A comparison between a time-optimal profile and a trapezoid is only informative if the solver's own discretisation error is smaller than the gap. `robofab-scurvefine` showed that at n = 400 it was not; this project measures the error in every row and recomputes the gap. It matters for the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`) only as a calibration of how much a time-optimal planner could save over a simple one in this toy.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-scurvefine` and the projects it copies from. The time-optimal solver follows the numerical-integration approach to time-optimal path parameterisation of Bobrow, Dubowsky and Gibson (1985, "Time-optimal control of robotic manipulators along specified paths", *International Journal of Robotics Research* 4(3)) and Pfeiffer and Johanni (1987, "A concept for manipulator trajectory planning", *IEEE Journal of Robotics and Automation* 3(2)); the implementation is the repository's own. The arm model, geometry, solver and trapezoid code are copied from `robofab-scurvefine` so this project is self-contained. It does not build on, and is not endorsed by, either group. No external result is reproduced.

## Method

Unchanged from `robofab-scurvefine` except the solver's node count: planar two-link arm, joint-space line from pick to lift point, torque limit 5 N m, jaw cap k times the static hold force, speed limit wmax, six printed parts per row. Trapezoid: best ramp fraction on the 14-value grid 0.002 to 0.5 with 40 extra samples per ramp (the `resolved` configuration), shortest duration by bisection. Time-optimal: the forward-backward path-parameterisation solver at n in {400, 1600, 6400, 25600}. Observed order p = log4((T1600 - T6400)/(T6400 - T25600)); extrapolated total T_ext = T25600 - (T6400 - T25600)/(4^p - 1). Two new tests check that the solver's total decreases and converges with n.

## Results

| row (L, k) | wmax | T_trap (s) | T_opt n=400 | T_opt n=25600 | edge n=400 | edge n=25600 |
|---|---|---|---|---|---|---|
| 0.08 m, 5 | 2 | 2.884 | 2.8794 | 2.8734 | 0.15% | 0.35% |
| 0.08 m, 5 | 1 | 5.734 | 5.7452 | 5.7240 | -0.20% | 0.17% |
| 0.08 m, none | 2 | 2.866 | 2.8725 | 2.8602 | -0.24% | 0.18% |
| 0.08 m, none | 1 | 5.728 | 5.7450 | 5.7176 | -0.29% | 0.18% |
| 0.12 m, 5 | 2 | 5.091 | 5.0858 | 5.0810 | 0.10% | 0.20% |
| 0.12 m, 5 | 1 | 10.135 | 10.1619 | 10.1240 | -0.26% | 0.11% |
| 0.12 m, none | 2 | 5.068 | 5.0810 | 5.0613 | -0.25% | 0.14% |
| 0.12 m, none | 1 | 10.132 | 10.1619 | 10.1142 | -0.30% | 0.18% |
| 0.2 m, 5 | 2 | 2.585 | 2.5627 | 2.5625 | 0.87% | 0.88% |
| 0.2 m, 5 | 1 | 5.065 | 5.0525 | 5.0495 | 0.25% | 0.31% |
| 0.2 m, none | 2 | 2.540 | 2.5297 | 2.5292 | 0.39% | 0.41% |
| 0.2 m, none | 1 | 5.041 | 5.0495 | 5.0329 | -0.17% | 0.16% |

All 12 rows had all six parts feasible. `experiments/results.txt` also has n = 1600 and 6400, the observed order and the extrapolated total.

## Limitations

- Stylised. All parameters other than geometry are assumed.
- Convergence is shown for the solver's node count only; the trapezoid's ramp sampling (40 extra samples) is not varied, and the 201-point whole-move sampling is unchanged.
- The convergence order is noisy (1.1 to 3.2), so the extrapolation is crude; the n = 25600 value is the reference.
- Same model limits as `robofab-scurve`: one speed limit on both joints, fixed joint-space line, one planar arm, friction-based jaw bound, no motor dynamics, jerk as a shape parameter only.
- Simulated results are not claims about physical arms or grippers.

## Next steps

Vary the trapezoid's ramp sampling density; apply the converged solver and ramp-resolved sampling to the torque- and jaw-bound rows of `robofab-scurve`; an absolute jerk limit in rad/s^3; check the profiles in MuJoCo.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
