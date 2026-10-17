# At tight joint-speed limits, is the time-optimal carry's edge over a trapezoid real or an artefact of the ramp grid? (stylised, negative on the old numbers)

A check on `research/robofab-scurve` (its "finer ramp-fraction grid" next step), on the same toy arm, parts and limits as `robofab-scurve`, `robofab-trapezoid`, `robofab-jointspeed`, `robofab-jawcap`, `robofab-reach` and `robofab-graspmove` (track `robofab`). `robofab-scurve` reported the time-optimal profile 0.8 to 2.9% faster than the best trapezoid at joint-speed limits of 2 and 1 rad/s, and said the figure was probably grid-limited because the best ramp fraction sat at the grid edge (0.02). This project refines that grid and finds that the old figure was too large, partly because of the coarse grid and partly because of a second effect found along the way. All numbers are from `experiments/results.txt` and `experiments/solver_n.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-scurvefine/

- **A finer ramp grid alone gives a wrong answer.** Extending the grid down to a ramp of 0.2% of the move makes the trapezoid *beat* the time-optimal solver by 0.3 to 1.8% (`fine` rows). That cannot be right for an optimum. The cause is the torque and jaw-force check: it uses 201 sample times over the whole move, and a 0.2% ramp falls between the first two samples, so the acceleration peak is never checked (test `test_naive_sampling_misses_a_very_short_ramp`: peak torque more than ten times higher once the ramp is sampled).
- **With the ramp sampled (40 extra samples in each ramp, `resolved` rows) the time-optimal edge shrinks** from 1.3 to 1.5% (old grid) to -0.2 to +0.9% at 2 rad/s and -0.3 to +0.3% at 1 rad/s (6 rows each; negative means the trapezoid is shorter than the solver's answer). The best ramp fractions move to 0.002 to 0.02.
- **The remaining negatives come from the solver, not the trapezoid.** With the node count raised from 400 to 6400 the six-part total for one row (L = 0.12 m, no jaw cap, 1 rad/s) falls from 10.162 s to 10.115 s, below the ramp-resolved trapezoid's 10.132 s (`solver_n.txt`). At n = 400 the solver is therefore about 0.5% pessimistic in that row, which is the same size as the whole edge. The true edge in that row is about 0.2%.
- **The S-curve costs shrink too, but stay positive where acceleration matters.** With the resolved sampling a half-jerk S-curve costs 0.0 to 1.1% over the trapezoid at 2 rad/s and 0.0 to 0.3% at 1 rad/s; a full-jerk one costs 0.1 to 2.4% and 0.0 to 0.5%. A jerk-limited profile was again never faster than the trapezoid. Only the two speed limits and two jaw settings (5x hold force, none) were re-run; the torque- and jaw-bound rows of `robofab-scurve` (where it found larger S-curve costs) are not re-examined here and stand as reported there, but they used the same 201-point sampling, so they are untested for the same artefact.
- **Reading:** in this set-up, at tight speed limits the time-optimal profile's advantage over a well-tuned trapezoid is under about 1%, and at 1 rad/s it is below the solver's own discretisation error. The earlier 0.8 to 2.9% should be read as an upper bound caused by a coarse ramp grid.

```bash
cd research/robofab-scurvefine
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 46 tests, < 10 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 8 min; also writes results.json
PYTHONPATH=src python3 experiments/solver_n.py > experiments/solver_n.txt   # about 1 min
```
Produced with Python 3.11, standard library only.

## Motivation

The comparison between a time-optimal profile and a tuned trapezoid is only informative if both are computed to a precision finer than the gap. `robofab-scurve` flagged that its gap at tight speed limits was bounded by its ramp grid. This project tests that, and in doing so finds that the feasibility check itself needs care for very short ramps. It matters for the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`) only as a calibration of how much a time-optimal planner could save over a simple one in this toy.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-scurve` and the projects it copies from (`robofab-trapezoid`, `robofab-jointspeed`, `robofab-jawcap`, `robofab-reach`, `robofab-graspmove`). The arm model, geometry, time-optimal solver and S-curve profile are copied from `robofab-scurve` so this project is self-contained. It does not build on, and is not endorsed by, either group. No external paper is reproduced.

## Method

Unchanged from `robofab-scurve`: planar two-link arm, joint-space line from pick to lift point, torque limit 5 N m, jaw cap k times the static hold force, speed limit wmax, trapezoid (j = 0) and half- and full-jerk S-curves (j = 0.5, 1), each with the best ramp fraction on a grid and the shortest duration found by bisection; time-optimal profile from the `robofab-jointspeed` solver with 400 nodes. Changes: (1) a 14-value grid, 0.002 to 0.5 (a superset of the old 7 values); (2) `trap.sample_points`, which can add `ramp_samples` extra sample times inside each ramp (default 0, which reproduces the old behaviour exactly); (3) three configurations per row: `coarse` (old grid, old sampling), `fine` (new grid, old sampling) and `resolved` (new grid, 40 extra samples per ramp). Rows: arm links 0.08, 0.12 and 0.2 m, k = 5 and no cap, wmax = 2 and 1 rad/s, six printed parts each (12 rows per configuration). Tests: 46, including four new ones on the sampling.

## Results

`experiments/results.txt` has the six-part totals per row and configuration. For 0.2 m links, k = 5, wmax = 2: trapezoid 2.602 s (coarse), 2.517 s (fine, unsound) and 2.585 s (resolved); time-optimal 2.563 s. All 36 rows had all six parts feasible. Ranges quoted above are over the 6 rows per speed limit.

## Limitations

- Stylised. All parameters other than geometry are assumed.
- 40 extra samples per ramp is a choice, not a proof that no peak is missed; the ramp acceleration is nearly constant so a few samples suffice, but this was not checked against a denser setting. The 201-point whole-move sampling is unchanged.
- Only the speed-limited rows with k = 5 and no jaw cap were re-run. The solver's node-count check covers one row (n up to 6400); the other rows were not re-solved at higher n, so their time-optimal figures carry the same ~0.5% pessimism of n = 400 and the "edge" ranges above include that bias.
- Jerk is a shape parameter (j), not an absolute limit in rad/s^3; the same other limitations as `robofab-scurve` apply (one speed limit on both joints, fixed joint-space line, one planar arm, friction-based jaw bound, no motor dynamics).
- Simulated results are not claims about physical arms or grippers. A ramp of 0.2% of a 5 s move (about 10 ms) is also unrealistic for a real drive; its role here is to bound the limiting case.

## Next steps

Re-solve the time-optimal profile at higher node counts for all rows and recompute the edge with a convergence estimate; apply the ramp-resolved sampling to the torque- and jaw-bound rows of `robofab-scurve`; an absolute jerk limit in rad/s^3; check the profiles in MuJoCo.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
