# Does the time-optimal carry's edge over a tuned trapezoid survive when torque or the jaw cap binds, and is it solver- or sampling-proof? (stylised, preliminary)

A follow-up to `research/robofab-toppconv` (its "apply the converged solver and ramp-resolved sampling to the torque- and jaw-bound rows of `robofab-scurve`" and "vary the trapezoid's ramp sampling density" next steps), on the same toy arm, parts and limits (track `robofab`). `robofab-toppconv` showed that with a joint-speed limit the time-optimal carry beats a tuned trapezoid by only 0.1 to 0.9%. `robofab-scurve` reported 9 to 23% for the rows with no speed limit, where torque or the jaw cap binds, but with 7 ramp fractions, a 400-node solver and no extra ramp samples. Here those 9 rows (3 arm sizes x jaw cap k = 2, 5 or none, six printed parts each, no speed limit) are recomputed with the solver at n = 400, 1600, 6400 and 25600 and the trapezoid on the fine 14-value ramp grid with 40 and with 160 extra samples per ramp. All numbers are from `experiments/results.txt`.

- **The large edge survives.** At n = 25600 against the trapezoid with 160 ramp samples the time-optimal profile is 9.4% to 23.0% faster in all 9 rows (with 40 samples: 9.0% to 22.9%). Largest for the 0.08 m arm with k = 2 (23.0%), smallest for the 0.2 m arm with no jaw cap (9.4%). Unlike the speed-limited rows, the torque- and jaw-bound gap is not an artefact of grid or solver resolution in this toy.
- **The solver is converged to within 0.004% by n = 6400** (six-part total versus n = 25600). Unlike in `robofab-toppconv`, n = 400 is not pessimistic here: its total is 0.05% to 0.08% *lower* (optimistic) than n = 25600 in the six jaw-capped rows and 0.005% to 0.03% higher in the three uncapped rows. I did not investigate the cause; the effect is tiny next to the edge.
- **Denser ramp sampling makes the trapezoid slower, by 0.05% to 0.50%.** Going from 40 to 160 extra samples per ramp finds brief torque or jaw-force peaks the 40-sample check missed; the edge rises by 0.1 to 0.4 percentage points (for example 0.2 m, no cap: 8.98% to 9.39%). The trapezoid side may not be converged at 160 either, so these edges are, if anything, slight underestimates of the edge over a perfectly checked trapezoid.
- **Reading:** in this toy a time-optimal planner saves roughly a tenth to a quarter of the carry time when the move is torque- or jaw-limited, and under 1% when a joint-speed limit binds; the ramp grid and node count do not change that. The comparison is against a trapezoid only; against a jerk-limited profile (`robofab-scurve`) the gap is larger.

```bash
cd research/robofab-torquebound
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 50 tests, < 10 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 6 min; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

`robofab-scurve` found the time-optimal carry far ahead of the trapezoid where torque or the jaw cap binds, but with a coarse ramp grid and a 400-node solver; `robofab-toppconv` showed that for the speed-limited rows such settings can move a sub-1% edge around. This project checks whether the much larger torque- and jaw-bound gap is robust to the same two resolutions. It matters for the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`) only as a calibration of what a time-optimal planner could save in this toy.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-toppconv` and `robofab-scurve`, whose arm model, geometry, solver and trapezoid code are copied here so the project is self-contained. The time-optimal solver follows the numerical-integration approach of Bobrow, Dubowsky and Gibson (1985, "Time-optimal control of robotic manipulators along specified paths", *International Journal of Robotics Research* 4(3)) and Pfeiffer and Johanni (1987, "A concept for manipulator trajectory planning", *IEEE Journal of Robotics and Automation* 3(2)); the implementation is the repository's own. It does not build on, and is not endorsed by, either group. No external result is reproduced.

## Method

Unchanged from `robofab-toppconv` except the rows: planar two-link arm, joint-space line from pick to lift point, torque limit 5 N m, jaw cap k times the static hold force, no speed limit, six printed parts per row. Trapezoid: best ramp fraction on the 14-value grid 0.002 to 0.5, shortest duration by bisection, with 40 and with 160 extra samples per ramp. Time-optimal: the forward-backward path-parameterisation solver at n in {400, 1600, 6400, 25600}. Edge = 1 - T_opt / T_trap on six-part totals. Two new tests check that the solver converges without a speed limit and that denser ramp sampling never shortens the trapezoid.

## Results

| row (L, k) | T_trap (40) | T_trap (160) | T_opt n=400 | T_opt n=25600 | edge n=400 / 40 | edge n=25600 / 40 | edge n=25600 / 160 |
|---|---|---|---|---|---|---|---|
| 0.08 m, 2 | 0.866 | 0.868 | 0.6678 | 0.6683 | 22.91% | 22.85% | 22.98% |
| 0.08 m, 5 | 0.464 | 0.465 | 0.3841 | 0.3843 | 17.26% | 17.21% | 17.40% |
| 0.08 m, none | 0.146 | 0.146 | 0.1224 | 0.1224 | 16.16% | 16.18% | 16.22% |
| 0.12 m, 2 | 1.603 | 1.610 | 1.3313 | 1.3321 | 16.95% | 16.90% | 17.28% |
| 0.12 m, 5 | 0.939 | 0.944 | 0.7821 | 0.7826 | 16.70% | 16.66% | 17.07% |
| 0.12 m, none | 0.372 | 0.373 | 0.3316 | 0.3315 | 10.87% | 10.90% | 11.17% |
| 0.2 m, 2 | 1.584 | 1.592 | 1.2584 | 1.2592 | 20.58% | 20.52% | 20.92% |
| 0.2 m, 5 | 0.882 | 0.884 | 0.7516 | 0.7519 | 14.76% | 14.71% | 14.95% |
| 0.2 m, none | 0.453 | 0.455 | 0.4124 | 0.4124 | 8.98% | 8.98% | 9.39% |

All 9 rows had all six parts feasible. `experiments/results.txt` also has n = 1600 and 6400. Totals are six-part sums in seconds.

## Limitations

- Stylised. All parameters other than geometry are assumed.
- Only the solver's node count and the trapezoid's ramp sampling are varied; the 201-point whole-move sampling is unchanged, and 160 ramp samples may not be converged either.
- The sign of the n = 400 error differs between capped and uncapped rows and its cause is not investigated.
- Same model limits as `robofab-scurve`: fixed joint-space line, one planar arm, friction-based jaw bound, no motor dynamics, no speed-dependent torque, no jerk limit.
- Simulated results are not claims about physical arms or grippers.

## Next steps

Bound the trapezoid's missed peaks (denser whole-move sampling or an analytic peak check); an absolute jerk limit in rad/s^3 for both profiles; a speed-dependent torque limit; check the profiles in MuJoCo.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
