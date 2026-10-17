# How much of the time-optimal carry's remaining edge survives a jerk-limited (S-curve) profile? (stylised)

A follow-up to `research/robofab-trapezoid` (its "S-curve (jerk-limited) comparator" next step), on the arm, geometry and limits of `research/robofab-trapezoid`, `robofab-jointspeed`, `robofab-jawcap`, `robofab-reach` and `robofab-graspmove` (track `robofab`). `robofab-trapezoid` found the time-optimal carry only 0.4 to 2.9% faster than a tuned trapezoidal-velocity move at speed limits of 2 and 1 rad/s, and noted that a real drive rounds the trapezoid's corners, so that gap was a lower bound. Here the corners are rounded: each ramp becomes a jerk-limited S-curve, and the three profiles are compared again. The comparison covers the same three arm sizes, three jaw caps and six speed limits (54 rows, six printed parts each). All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-scurve/

- **A jerk-limited profile never beat the trapezoid, and the cost is small when a speed limit binds.** In none of the 45 speed-limited rows was an S-curve faster than the trapezoid (same ramp-fraction grid). With wmax of 2 or 1 rad/s (18 rows) a half-jerk S-curve (j = 0.5: acceleration changes over half of each ramp) costs 0.0 to 2.0% over the trapezoid and a full-jerk one (j = 1: no constant-acceleration part) costs 0.0 to 7.0%. Over all 45 speed-limited rows the costs are 0.0 to 4.5% and 0.0 to 15.9%.
- **So the time-optimal profile's edge grows, but stays small at tight limits.** At wmax of 2 or 1 rad/s it is 0.8 to 2.9% faster than the trapezoid, 1.3 to 4.8% faster than the j = 0.5 S-curve and 1.3 to 9.2% faster than the j = 1 S-curve. At 1 rad/s all three jerk settings are within 1.3% of each other and the time-optimal gap is 0.8 to 1.5%; with ramp fractions down to 0.02 this is grid-limited (see Limitations).
- **Where torque or the jaw cap binds the shape matters more.** With no speed limit (9 rows) the S-curves cost 1.4 to 13.8% (j = 0.5) and 7.4 to 33.7% (j = 1) over the trapezoid, and the time-optimal profile is 22.5 to 36.8% faster than the j = 1 S-curve (9.0 to 22.9% faster than the trapezoid).
- **Practical reading in this set-up:** a drive that must limit jerk gives up very little at a tight speed limit, but a lot where the move is torque- or jaw-limited; the full price of jerk limiting is not shown here because the jerk limit is a shape parameter, not a value in m/s^3.

```bash
cd research/robofab-scurve
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 42 tests, < 10 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 12 min; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

A trapezoidal velocity profile has an acceleration step at each corner, which real drives avoid by limiting jerk (an S-curve; see the motion-control texts cited below). `robofab-trapezoid` could therefore only bound the time-optimal profile's advantage from below. This project measures how much a jerk-limited shape closes or widens that gap for the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`).

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-trapezoid`, `robofab-jointspeed`, `robofab-jawcap`, `robofab-reach` and `robofab-graspmove`, whose arm model, geometry, time-optimal solver and grip bound are copied here so the project is self-contained. It does not build on, and is not endorsed by, either group. The S-curve idea is standard in industrial motion control; I did not follow a specific textbook formula, and the seven-phase-style construction here is my own simple parameterisation.

## Method

Everything but the comparator is unchanged from `robofab-trapezoid`: planar two-link arm, joint-space line from pick to lift point, torque limit 5 N m, jaw cap k times the static hold force `m g / (2 mu)`, joint-speed limit wmax. The path parameter follows a symmetric profile of duration T: a ramp up over a fraction f of T, a cruise at 1/(1-f), a ramp down. In `src/robofab_scurve/trap.py` the ramp's acceleration rises linearly over a share j/2 of the ramp, holds, then falls linearly over j/2 (j = 0 is the trapezoid, j = 1 has no flat part). The peak speed is the same for all j (the speed limit is checked identically), and the integral of velocity is 1. For each of j = 0, 0.5 and 1 the best f on the grid (0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5) is chosen per part, with the shortest T meeting torque, jaw force and speed by bisection, as in `robofab-trapezoid`. The time-optimal profile is the `robofab-jointspeed` solver, unchanged.

Tests (42): the S-curve profile reaches 1, integrates correctly, has continuous velocity and acceleration at the ramp ends and zero acceleration at the start; j = 0 reproduces the trapezoid; the peak acceleration of j = 1 exceeds the trapezoid's; an S-curve is never faster than the trapezoid on the same grid; plus the 37 earlier tests.

## Results

![Carry time from `experiments/results.json`, stylised simulation](experiments/carry_time.svg)

*Figure: carry time from the committed run output, regenerated with `python3 experiments/figure.py` (standard library only). Stylised model; nothing here is measured on a real arm.*

`experiments/results.txt` has, per arm size (link 0.08, 0.12, 0.2 m) and jaw cap (k = 2, 5, none) and six speed limits (none, 6, 4, 3, 2, 1 rad/s), the six-part totals for the trapezoid, the j = 0.5 and j = 1 S-curves and the time-optimal profile, the S-curve costs over the trapezoid, and the time-optimal saving. For 0.12 m links with k = 5 and no speed limit: trapezoid 0.939 s, j = 0.5 0.966 s, j = 1 1.067 s, time-optimal 0.782 s. All 54 rows had all six parts feasible. The min-jerk comparator is not re-run here (see `robofab-trapezoid`).

## Limitations

- Stylised. All parameters other than geometry are assumed and the speed limits are round numbers, not any actuator's rating.
- Jerk is limited by shape (j), not by an absolute jerk bound in rad/s^3, so no row corresponds to a specific drive. The two j values are two points, not a sweep; the ramp-fraction grid (7 values) is coarser than in `robofab-trapezoid` (12) to keep the run time down, so trapezoid totals here are not those of that project; at tight speed limits the best ramp fraction sits at the grid edge (0.02), so the time-optimal gaps there are bounded by the grid, not only by the method.
- Torque and jaw force are checked at 201 sample points; a narrow peak could slip between samples.
- The same limitations as `robofab-trapezoid`: one speed limit on both joints, no speed-dependent torque, a fixed joint-space line, one planar arm, a friction-based jaw bound, no motor dynamics.
- Simulated results are not claims about physical arms or grippers.

## Next steps

An absolute jerk limit swept over a range, with the time-optimal solver also jerk-limited (a fair like-for-like comparison); a finer ramp-fraction grid; a speed-dependent torque limit; per-joint speed limits; the descent and insertion legs; check the profiles in MuJoCo.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
