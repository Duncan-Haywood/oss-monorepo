# Is the time-optimal carry's speed-limited advantage just the min-jerk profile's shape? A trapezoidal-velocity baseline (stylised)

A follow-up to `research/robofab-jointspeed` (its "replace min-jerk with a trapezoidal-velocity baseline" next step), on the arm, geometry and limits of `research/robofab-jointspeed`, `robofab-jawcap`, `robofab-reach` and `robofab-graspmove` (track `robofab`). `robofab-jointspeed` found the time-optimal carry 28 to 46% shorter than min-jerk once a joint-speed limit binds, and predicted that a trapezoidal baseline would show less. This project tests that. All numbers come from `experiments/results.txt`. Pure Python, no dependencies, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-trapezoid/

- **Against a trapezoid, the speed-limited advantage nearly vanishes.** With the same torque, jaw-cap and speed limits, a trapezoidal-velocity move (ramp fraction chosen per part from a grid) is 38 to 46% faster than min-jerk in the 18 rows with wmax of 2 or 1 rad/s, and the time-optimal profile is only 0.4 to 2.9% faster than that trapezoid (0.4 to 0.8% at 1 rad/s).
- **The earlier 46% was mostly the comparator.** Over all 45 speed-limited rows (three arm sizes, three jaw caps, wmax 6 to 1 rad/s) the time-optimal total beats the best trapezoid by 0.4 to 19.8%; the 19.8% is the one row where the 6 rad/s limit does not bind (0.2 m links, k = 2, where the unlimited carry peaks at 6.4 rad/s), so it is a torque-limited case. The next largest is 8.6% (wmax 4 rad/s, same case).
- **Without a speed limit the time-optimal profile still wins clearly.** Over the nine unlimited cases it is 8.7 to 22.5% shorter than the best trapezoid (and 18 to 34% shorter than min-jerk, as in `robofab-jointspeed`). When torque or the jaw cap binds, the optimal profile shapes its acceleration to the arm's dynamics, which a trapezoid cannot.
- **Tight limits want near-rectangular trapezoids.** The best ramp fraction (the share of the move spent accelerating, each end) falls from about 0.2 to 0.5 without a speed limit to 0.01 to 0.02 at 1 rad/s; at that point the trapezoid is nearly a pure cruise at wmax, which is the speed-limited optimum.

```bash
cd research/robofab-trapezoid
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 37 tests, < 6 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 6 min; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

`robofab-jointspeed` compared the time-optimal carry only with min-jerk, whose peak speed is 1.875 times its mean. That makes it a weak baseline for a speed-limited arm, and the reported 46% ceiling is a property of that shape. A trapezoidal velocity profile is the standard industrial point-to-point move, so the honest question for the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`) is how much a time-optimal planner adds over it.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-jointspeed`, `robofab-jawcap`, `robofab-armbang`, `robofab-reach` and `robofab-graspmove`, whose arm model, geometry, time-optimal solver and grip bound are copied here so the project is self-contained. No paper from either group is reproduced, and nothing here is affiliated with or endorsed by them. The time-optimal solver is time-optimal path parameterisation by numerical integration (Bobrow, Dubowsky and Gibson, 1985, *Int. J. Robotics Research* 4(3):3-17; Pfeiffer and Johanni, 1987, *IEEE J. Robotics and Automation* RA-3:115-123); min-jerk is Flash and Hogan (1985, *J. Neurosci.* 5(7):1688-1703). Those references were checked in earlier projects by bibliographic record, not by reading the papers, and I did not re-read them. The trapezoidal profile is textbook and is cited to no particular source.

## Method

Everything but the comparator is unchanged from `robofab-jointspeed`: planar two-link arm, joint-space line from pick to lift point, torque limit 5 N m, jaw cap k times the static hold force `m g / (2 mu)`, joint-speed limit wmax (per-path cap, so the joint that travels furthest sets it). The new comparator, `src/robofab_trapezoid/trap.py`, moves the path parameter s with a symmetric trapezoidal velocity profile of duration T: a constant acceleration for a fraction f of T, a cruise at `1 / (T (1 - f))` in s per second, and a mirrored deceleration. Its peak joint speed is `max|dq| / (T (1 - f))`. For each ramp fraction f in {0.01, 0.02, 0.05, 0.1, ..., 0.5} the shortest T meeting the torque limit (sampled at 201 points), the jaw-force bound and the speed limit is found by bisection, and the best f per part is kept. The table's trapezoid total is the sum over the six parts of that per-part best. The ramp fraction is picked per part and per limit set, so it is a tuned baseline, not a fixed one.

Tests (`tests/test_trap.py` plus the earlier ones): the profile is continuous, integrates to 1 and peaks at `1/(1-f)`; with loose torque the speed limit sets T to within 2 ms of `max|dq| / (0.9 wmax)`; time falls as the speed limit loosens; the returned T respects the torque and jaw limits when re-evaluated; the time-optimal profile is never slower than the best trapezoid (to 0.5%); the best trapezoid beats min-jerk at 1 rad/s; an unreachable torque limit gives no solution.

## Results

![Carry time from `experiments/results.json`, stylised simulation](experiments/carry_time.svg)

*Figure: carry time from the committed run output, regenerated with `python3 experiments/figure.py` (standard library only). Stylised model; nothing here is measured on a real arm.*

`experiments/results.txt` has, for each of three arm sizes (link 0.08, 0.12, 0.2 m) and three jaw caps (k = 2, 5, none), six speed limits (none, 6, 4, 3, 2, 1 rad/s): the six-part min-jerk, trapezoid and time-optimal totals, the saving of the time-optimal profile over each, the saving of the trapezoid over min-jerk, and the mean best ramp fraction. For 0.12 m links with k = 5: unlimited 1.019 s (min-jerk), 0.931 s (trapezoid), 0.782 s (time-optimal); at 3 rad/s 6.320, 3.430 and 3.409 s; at 1 rad/s 18.959, 10.214 and 10.162 s. Time-optimal saving over the best trapezoid, by speed limit, across the nine arm and jaw-cap cases: wmax 6 rad/s 0.6 to 19.8%; 4 rad/s 0.5 to 8.6%; 3 rad/s 0.5 to 4.9%; 2 rad/s 0.4 to 2.9%; 1 rad/s 0.4 to 0.8%.

## Limitations

- Stylised. All parameters other than geometry are assumed (as in `robofab-jawcap`) and the speed limits are round numbers, not any actuator's rating.
- The trapezoid has a velocity-continuous but acceleration-discontinuous profile; a real drive would round the corners (S-curve), which costs some time. The 0.4 to 0.8% gap at 1 rad/s is therefore a lower bound on the gap against a jerk-limited industrial profile.
- The smallest ramp fraction tried is 0.01 and the best is at that edge in most rows with wmax of 2 rad/s or less, so the gap there is bounded by the grid, not by the method. Torque and jaw force are checked at 201 sample points; a narrow peak at a profile corner could slip between samples. I re-evaluated the returned durations in a test but did not measure the residual over a finer grid.
- The same limitations as `robofab-jointspeed`: one speed limit on both joints, no speed-dependent torque, a fixed joint-space line, one planar arm, a friction-based jaw bound checked against MuJoCo only to 40 m/s^2 in `robofab-graspmove`, no motor dynamics.
- Simulated results are not claims about physical arms or grippers.

## Next steps

An S-curve (jerk-limited) comparator; a speed-dependent torque limit (a motor torque-speed line); per-joint speed limits; a finer ramp-fraction grid; the descent and insertion legs; check the profiles in MuJoCo.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
