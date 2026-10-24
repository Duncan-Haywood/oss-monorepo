# How fast can an arm carry a printed part when the jaw force is capped as well as the joint torque? Time-optimal vs min-jerk (stylised)

A follow-up to `research/robofab-armbang` (its "cap the jaw force and solve for the fastest move that respects both limits" next step), on the geometry of `research/robofab-reach` and the grip bound of `research/robofab-graspmove` (track `robofab`). `robofab-armbang` showed that the time-optimal move saves 21 to 29% of carry time but needs 1.2 to 2.4 times the jaw force. Here the jaw force is capped at k times the static hold force `m g / (2 mu)` and both profiles (time-optimal and min-jerk) are made as fast as that cap and the same assumed joint torque limit allow. All numbers come from `experiments/results.txt`. Pure Python, no dependencies, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-jawcap/

- **Time-optimal still saves 17 to 43% under a jaw cap.** Over nine arm and torque cases and caps from k = 1.25 to 10, the six-part total under the time-optimal profile is 17 to 43% shorter than the fastest min-jerk move meeting the same two limits. The saving is largest when the cap is tightest (37 to 43% at k = 1.25) and smallest at k = 5 to 10 (17 to 24%), then settles near the torque-only values (20 to 28% here; `robofab-armbang` reports 21 to 29% because its min-jerk search used a coarser 1 ms grid).
- **A tight cap makes the torque limit irrelevant.** At k = 1.25 the six-part time is 1.142 s (0.08 m links), 2.286 s (0.12 m) or 2.087 s (0.2 m) for all three torque limits (2, 5, 10 N m): the jaw force alone sets the speed. A stronger motor buys nothing until the grip is stronger.
- **Grip dominates up to about k = 10.** With 5 N m and 0.12 m links the time-optimal total is 6.9 times the torque-only time at k = 1.25, 3.1 times at k = 3 and 1.7 times at k = 10. Only for the weakest-torque, longest-link case (0.2 m, 2 N m) does k = 10 cost nothing, because the jaw force never reaches the cap there.
- **The cap is met to within about 3%.** The computed profiles reach the cap, and exceed it by up to 3.3% (the discretisation, below). Joint torques stay within 3.3% of the limit.

```bash
cd research/robofab-jawcap
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 23 tests, < 2 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 30 s; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

A printed part is held by friction, so the faster the arm moves it, the harder the jaws must squeeze. A real gripper has a force limit, and `robofab-armbang` left open how much of the time-optimal saving survives it. The answer decides whether a stronger motor or a stronger grip pays off in the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`).

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-armbang`, `robofab-armaccel`, `robofab-reach` and `robofab-graspmove`, whose arm model, geometry, time-optimal solver and grip bound I copy so the project is self-contained. No paper from either group is reproduced, and nothing here is affiliated with or endorsed by them. The method is time-optimal path parameterisation by numerical integration (Bobrow, Dubowsky and Gibson, 1985, *Int. J. Robotics Research* 4(3):3-17; Pfeiffer and Johanni, 1987, *IEEE J. Robotics and Automation* RA-3:115-123), as in `robofab-armbang`; the references were checked there by bibliographic record, not by reading the papers, and I did not re-read them. Adding a constraint on a quantity affine in the path acceleration and squared path speed is my own derivation (below). Min-jerk: Flash and Hogan (1985, *J. Neurosci.* 5(7):1688-1703), not re-verified. Self-replication context: Zykov et al. (2005, *Nature* 435:163-164).

## Method

Path and dynamics are those of `robofab-armbang`: the joint-space line between the inverse kinematics of the pick point and of the lift point, with each joint torque `A_i s'' + B_i u + G_i` in terms of the path acceleration s'' and u = (ds/dt)^2. The wrist position x(s) = (r, z) along the line gives the wrist acceleration `a = P s'' + Q u`, with P = dx/ds and Q = d^2x/ds^2 (central differences in s). The grip bound `F = m sqrt((g + a_z)^2 + a_r^2) / (2 mu)` is at most the cap exactly when `(Q_r u + P_r s'')^2 + (g + Q_z u + P_z s'')^2 <= R^2` with `R = 2 mu Fcap / m`. That is a quadratic in s'', so at each (s, u) it allows an interval of s'', which I intersect with the torque interval. The forward and backward integration is then unchanged. Because a centripetal term can cancel gravity, feasibility is not monotone in u with the cap, so the speed limit at each node is the largest feasible u on a geometric grid (ratio 1.1), refined by bisection. The comparator is the shortest min-jerk duration (bisection, 0.1 ms) meeting both limits. A cap below the static hold force `m g / (2 mu)` is infeasible. The cap is k times that force for each part.

Tests (`tests/test_jawcap.py` plus the `robofab-armbang` tests) check: the interval endpoints lie on the force disc; a cap below the hold force is infeasible; a loose cap reproduces the torque-only time; time falls as the cap loosens; the force and torques of the computed profile, recomputed by an independent finite-difference of the kinematics, stay within 5% (force) and 3% (torque) of their limits; the cap binds when tight; the time-optimal move is never slower than the capped min-jerk move; and the capped min-jerk result meets both limits and is shortest on its grid.

## Results

![Carry time from `experiments/results.json`, stylised simulation](experiments/carry_time.svg)

*Figure: carry time from the committed run output, regenerated with `python3 experiments/figure.py` (standard library only). Stylised model; nothing here is measured on a real arm.*

`experiments/results.txt` has, for each of nine arm and torque cases, seven rows (k = 1.25 to 10 and torque-only): six-part min-jerk total, time-optimal total, percent saved, the time-optimal total relative to its torque-only value, the worst force over cap and torque over limit, and how many of the six parts were feasible (all six were, in every row). Per-part values are not printed. For 0.12 m links at 5 N m: torque-only 0.416 s (min-jerk) and 0.332 s (time-optimal); at k = 3, 1.425 s and 1.028 s; at k = 1.25, 4.001 s and 2.286 s.

## Limitations

- Stylised. As in `robofab-armbang`, all parameters other than geometry are assumed, and the torque limits are far above a small hobby arm of these link lengths. The caps are multiples of the static hold force of an assumed friction coefficient (0.5), not a real gripper's rating. Read results as ratios between profiles.
- The jaw bound is the friction estimate `robofab-graspmove` checked against MuJoCo up to 40 m/s^2; most torque-only cases, and the looser caps here, exceed that, and I did not re-simulate them. Tight caps (k <= 3) keep accelerations low.
- The path is the fixed joint-space line; the time-optimal profile is optimal along it only. The min-jerk comparator also follows it.
- The profile exceeds the cap by up to 3.3% and the torque limit by up to 3.3%, from the 400-node grid and the finite-difference path acceleration. The solver treats the force constraint as holding exactly at nodes.
- A non-monotone feasible range of u is handled only by scanning for the largest feasible u; a gap below that value would make a node infeasible and was not seen in these cases.
- One planar arm, no wrist orientation, no joint-speed limit, no motor dynamics, no payload swing, no link collision.
- Simulated results are not claims about physical arms or grippers.

## Next steps

A MuJoCo arm with real actuators and contact to check the capped profiles; a joint-speed limit; the descent and insertion legs; choose the cap from a gripper's force rating and compare candidate jaws; optimise the path as well as the speed profile.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
