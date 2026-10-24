# Once the solver is converged, is the time-optimal carry's edge over a tuned trapezoid still positive in all twelve speed-limited rows? (stylised)

A follow-up to `research/robofab-scurvefine` (track `robofab`), taking its first "Next steps" item: re-solve the time-optimal profile at higher node counts for all rows. Same toy arm, parts, limits, ramp grid and ramp-resolved sampling as `robofab-scurvefine`, `robofab-scurve`, `robofab-trapezoid`, `robofab-jointspeed` and `robofab-jawcap`. All numbers below are from `experiments/results.txt` (and `results.json`).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-edgeconv/

- **Raising the solver from 400 to 6400 nodes moves the six-part time-optimal total down by 0.01 to 0.46%** across the 12 rows (3 arm sizes x jaw cap 5x hold force or none x speed limit 2 or 1 rad/s). Most of the change is already there at 1600 nodes: the 1600 to 6400 step is 0.000 to 0.009 s, against 0.000 to 0.038 s for 400 to 1600.
- **With n = 6400 the time-optimal edge over the ramp-resolved trapezoid is positive in all 12 rows: +0.11% to +0.88%.** At n = 400 it was negative in 7 of the 12 rows (down to -0.30%), five of them at 1 rad/s. So the negatives reported in `robofab-scurvefine` were the solver's discretisation, as that project suspected from one row.
- **A one-step Richardson estimate (assuming error proportional to 1/n) changes the edge by at most 0.03 percentage points** from the n = 6400 value (+0.12% to +0.88%). The ratio of the 400-to-1600 change to the 1600-to-6400 change ranges from 4 to 85 across rows (4 would be exactly first order), so the extrapolation is only indicative; the n = 6400 figures are the ones to quote.
- **Reading:** in this toy the time-optimal carry is about 0.1 to 0.9% faster than a well-tuned trapezoid at tight speed limits. The solver side is now converged to a few hundredths of a percent; the trapezoid side still uses a finite ramp grid (below), which can only make the true edge smaller. The earlier 0.8 to 2.9% (`robofab-scurve`) was an overestimate, as `robofab-scurvefine` found.

```bash
cd research/robofab-edgeconv
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 47 tests, < 10 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 2 min; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

A 0.1 to 0.9% gap is smaller than the 0.5% node-count error the solver had at n = 400, so whether the edge exists at all depended on the solver's resolution. This project removes that dependence for the twelve speed-limited rows, so later projects (the workcell twin `robofab-cell`, the self-replicating shop in track `selfrep`) can quote one calibrated figure for how much a time-optimal planner could save over a simple one in this toy.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-scurvefine` and the projects it copies from. The arm model, geometry, time-optimal solver and trapezoid are copied from `robofab-scurvefine` (renamed package) so this project is self-contained. It does not build on, and is not endorsed by, either group. No external paper is reproduced.

## Method

Unchanged from `robofab-scurvefine` for the "resolved" configuration: planar two-link arm, joint-space line from pick to lift point, torque limit 5 N m, jaw cap k times static hold force, speed limit wmax; trapezoid with the best ramp fraction on the 14-value grid (0.002 to 0.5) and 40 extra samples per ramp; time-optimal profile from the `robofab-jointspeed` solver. New: the solver is run at n = 400, 1600 and 6400 for every part and row, and `T_ext = T_6400 - (T_1600 - T_6400)/3`. Arm links 0.08, 0.12 and 0.2 m (1.0, 1.5 and 2.5 times the smallest feasible link, rounded), k in {5, none}, wmax in {2, 1} rad/s, six printed parts per row. One new test (47 in all) checks that the solver's time falls with n with shrinking steps.

## Results

`experiments/results.txt` lists, per row, the trapezoid total, the solver totals at the three node counts, the extrapolated total and the three edges. All 12 rows had all six parts feasible. For 0.12 m links, k = inf, wmax = 1 rad/s: trapezoid 10.132 s, solver 10.162 / 10.124 / 10.115 s at n = 400 / 1600 / 6400, edge -0.30% at n = 400 and +0.17% at n = 6400 (the solver totals agree with `robofab-scurvefine/experiments/solver_n.txt`).

## Limitations

- Stylised. All parameters other than geometry are assumed; simulated results are not claims about physical arms or drives.
- The trapezoid side was not re-converged: its best ramp fraction is picked from a 14-value grid, so its time is an upper bound on the best trapezoid. A finer grid could shave the edge further. The 40 samples per ramp are a choice, not checked against a denser setting.
- The Richardson step assumes first-order convergence, which the data only roughly support (ratio 4 to 85 between steps). The residual solver error at n = 6400 is not bounded rigorously; it is estimated to be a few hundredths of a percent from the last step.
- The torque- and jaw-bound rows of `robofab-scurve` (no speed limit) are not re-examined.
- One speed limit on both joints, a fixed joint-space line, one planar arm, no motor dynamics, and jerk as a shape parameter, as in the parent projects.

## Next steps

Refine the trapezoid's ramp-fraction search (golden-section instead of a grid) so both sides are converged; re-run the unlimited-speed torque- and jaw-bound rows with ramp-resolved sampling and n = 6400; an absolute jerk limit in rad/s^3; check the profiles in MuJoCo.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
