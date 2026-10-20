# Does a joint-speed limit erase the time-optimal carry's advantage over min-jerk? Torque, jaw-force and speed limits together (stylised)

A follow-up to `research/robofab-jawcap` (its "a joint-speed limit" next step), on the geometry of `research/robofab-reach` and the grip bound of `research/robofab-graspmove` (track `robofab`). `robofab-jawcap` capped joint torque and jaw force but let the joints spin as fast as they liked: the unconstrained time-optimal carries here reach 6 to 154 rad/s, far above any real servo. Here a peak joint-speed limit `wmax` is added, and both profiles (time-optimal and min-jerk) are made as fast as torque, jaw cap and speed limit allow. All numbers come from `experiments/results.txt`. Pure Python, no dependencies, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-jointspeed/

- **A speed limit raises the time-optimal saving, up to a ceiling near 46%.** Over three arm sizes, three jaw caps (k = 2, 5, no cap) and speed limits of 6, 4, 3, 2 and 1 rad/s, the six-part time-optimal total is 28 to 46% shorter than the fastest min-jerk move meeting the same limits. Without a speed limit the same cases give 18 to 34%.
- **The ceiling is geometric, not dynamic.** Once the speed limit binds, a min-jerk move needs `T = 1.875 d / wmax` (its peak speed is 1.875 times the mean) while the time-optimal move can cruise near `wmax`, so the saving tends to `1 - 1/1.875 = 47%`. Every case reaches 46% by wmax = 2 or 1 rad/s.
- **The speed limit, not the grip or the motor, sets the time at low wmax.** At 1 rad/s all three jaw caps give the same time-optimal total for a given arm (5.75, 10.16 and 5.05 to 5.08 s for 0.08, 0.12 and 0.2 m links, to within 1%), so a stronger gripper or motor buys nothing there.
- **A speed limit shrinks the spread across jaw caps.** At wmax = 6 rad/s and 0.12 m links the time-optimal total is 1.857 s at k = 2, 1.761 s at k = 5 and 1.702 s with no cap; without a speed limit the same three are 1.331, 0.782 and 0.332 s.
- **The longest links are speed-limited later.** For 0.2 m links at k = 2 a limit of 6 rad/s changes the time by under 1% (1.258 to 1.264 s), because that case only reaches 6.4 rad/s unconstrained.

```bash
cd research/robofab-jointspeed
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 29 tests, < 3 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 20 s; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

`robofab-jawcap` found that a jaw-force cap shrinks but does not remove the time-optimal profile's advantage, but its profiles had no speed limit, so the fastest cases were not realisable by any servo. A speed limit is the constraint hobby-class actuators hit first. The question decides how much a time-optimal planner is worth in the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`) when the arm is speed-limited.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-jawcap`, `robofab-armbang`, `robofab-reach` and `robofab-graspmove`, whose arm model, geometry, time-optimal solver and grip bound I copy so the project is self-contained. No paper from either group is reproduced, and nothing here is affiliated with or endorsed by them. The method is time-optimal path parameterisation by numerical integration (Bobrow, Dubowsky and Gibson, 1985, *Int. J. Robotics Research* 4(3):3-17; Pfeiffer and Johanni, 1987, *IEEE J. Robotics and Automation* RA-3:115-123), as in `robofab-jawcap`; those references were checked there by bibliographic record, not by reading the papers, and I did not re-read them. Min-jerk: Flash and Hogan (1985, *J. Neurosci.* 5(7):1688-1703), not re-verified. Self-replication context: Zykov et al. (2005, *Nature* 435:163-164).

## Method

Path, dynamics and jaw bound are those of `robofab-jawcap`. The path is the joint-space line from the pick to the lift point, so every joint moves as `q_i(s) = qa_i + s (qb_i - qa_i)` and its speed is `|qb_i - qa_i| sqrt(u)` with u = (ds/dt)^2. The speed limit `|dq_i| sqrt(u) <= wmax` is therefore a constant cap `u <= (wmax / max_i |dq_i|)^2` on the path speed, which I take as a minimum with the existing speed-limit curve at every node before the forward and backward integration. The min-jerk comparator's peak joint speed is `1.875 max_i |dq_i| / T` (the peak of `30s^2 - 60s^3 + 30s^4` is 1.875), added as a third condition to its bisection on T. Speed is limited per joint, not at the wrist. The jaw cap is k times the static hold force `m g / (2 mu)`, as before; the torque limit is 5 N m throughout.

Tests (`tests/test_jointspeed.py` plus the `robofab-jawcap` tests) check: the solved profile's peak joint speed stays within the limit and the limit binds when tight; a loose limit reproduces the unlimited time; time falls as the limit loosens; at a very low limit the time is within 5% of `max|dq| / wmax`; the capped min-jerk move meets the limit; and the time-optimal move is never slower than the capped min-jerk move.

## Results

`experiments/results.txt` has, for each of three arm sizes (link 0.08, 0.12, 0.2 m) and three jaw caps (k = 2, 5, none), six rows of speed limit (none, 6, 4, 3, 2, 1 rad/s): six-part min-jerk total, time-optimal total, percent saved, the time-optimal total relative to the unlimited one, the peak joint speed of the time-optimal profile, and the number of feasible parts (six in every row). For 0.12 m links with k = 5: unlimited 1.019 s (min-jerk) and 0.782 s (time-optimal); at 3 rad/s 6.320 and 3.409 s; at 1 rad/s 18.959 and 10.162 s.

## Limitations

- Stylised. All parameters other than geometry are assumed (as in `robofab-jawcap`), and the speed limits are round numbers, not any actuator's rating. Read results as ratios between profiles.
- One speed limit wmax applies to both joints (the joint that travels furthest sets the cap); there are no per-joint limits and no speed-dependent torque (a real motor's torque falls with speed).
- The 46% ceiling follows from the min-jerk profile shape and the cruise assumption; it says nothing about other comparator profiles (trapezoidal velocity, S-curve), which would give a smaller gap. The min-jerk comparator is the weakest natural baseline for a speed-limited arm.
- The jaw bound is the friction estimate `robofab-graspmove` checked against MuJoCo only up to 40 m/s^2; I did not re-simulate here. Fast unlimited cases exceed that range; the speed-limited ones mostly do not, but I did not measure the peak acceleration.
- The path is the fixed joint-space line. One planar arm, no wrist orientation, no motor dynamics, no payload swing, no link collision.
- The torque and jaw-force residuals of the profiles (about 3% in `robofab-jawcap`) were not re-measured here.
- Simulated results are not claims about physical arms or grippers.

## Next steps

Replace min-jerk with a trapezoidal-velocity baseline; a speed-dependent torque limit (a motor torque-speed line); per-joint speed limits; check the capped profiles in MuJoCo; the descent and insertion legs.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
