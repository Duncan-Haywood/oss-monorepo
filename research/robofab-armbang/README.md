# How much carry time does a time-optimal move save over min-jerk, and what does it cost the jaws? Torque-limited two-link arm carrying printed parts (stylised)

A follow-up to `research/robofab-armaccel` (its "time-optimal (bang-bang) profile instead of min-jerk" next step), on the geometry of `research/robofab-reach` and the grip bound of `research/robofab-graspmove` (track `robofab`). `robofab-armaccel` carried six parts of a toy gripper on min-jerk joint moves. Here the same carries use the time-optimal speed profile along the same joint-space line under the same assumed joint torque limit, and I compare time and the jaw force each demands. All numbers come from `experiments/results.txt`. Pure Python, no dependencies, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-armbang/

- **Time-optimal saves 20 to 29% of total carry time.** Over nine arm and torque cases (links 0.08, 0.12, 0.20 m; limits 2, 5, 10 N m) the six-part total drops by 21 to 29% (for 0.12 m links at 5 N m, 0.419 s to 0.332 s). The min-jerk times here use a 0.001 s search grid; `robofab-armaccel` used 0.01 s, so its totals are a little higher than the min-jerk column here.
- **The price is a harder grip: 1.2 to 2.4 times the jaw force.** Across all 54 part-and-case combinations, the peak jaw force bound under the time-optimal move is 1.18 to 2.41 times that of min-jerk. The 5.95 g cover on the 0.12 m arm at 5 N m needs 2.66 N per jaw instead of 1.49 N. The time-optimal acceleration jumps, which min-jerk avoids.
- **So friction binds sooner.** Since time-optimal motion needs more grip for the same part, a jaw-force-limited design gives back part of the time saved. This note does not compute that trade (see Next steps).
- **Caveat on the range.** As in `robofab-armaccel`, the bound `m sqrt((g + a_up)^2 + a_rad^2) / (2 mu)` was checked against MuJoCo only up to 40 m/s^2 in `robofab-graspmove`, and most cases here exceed that. I did not re-simulate them.

```bash
cd research/robofab-armbang
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 14 tests, < 1 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 2 s; also writes results.json
```
Produced with Python 3.11, standard library only.

## Motivation

Cycle time of part hand-offs matters to the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`). Min-jerk is smooth but not fast; the time-optimal profile is the speed limit for a given path and torque bound, so the gap measures how much a smooth profile leaves unused.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-armaccel`, `robofab-reach`, `robofab-graspmove`, whose arm model, geometry and bound I copy so the project is self-contained. No paper from either group is reproduced, and nothing here is affiliated with or endorsed by them. The time-optimal profile along a fixed path under torque limits is the classical problem of Bobrow, Dubowsky and Gibson (1985, *Int. J. Robotics Research* 4(3):3-17) and Pfeiffer and Johanni (1987, *IEEE J. Robotics and Automation* RA-3:115-123). I wrote my own short numerical-integration implementation and did not copy their code. I confirmed the Bobrow et al. reference by a web search of its bibliographic record; for Pfeiffer and Johanni the volume, pages and year agree across sources but the issue number does not, so I omit it. I did not read either paper's full text, and I describe the method from my own derivation. Min-jerk: Flash and Hogan (1985, *J. Neurosci.* 5(7):1688-1703), not re-verified. Self-replication context: Zykov et al. (2005).

## Method

Path: the straight line in joint space between the inverse kinematics of the pick point and of the lift point above the place point (elbow-up), as in `robofab-armaccel`. Along it, with path position s and u = (ds/dt)^2, each joint torque is `A_i s'' + B_i u + G_i` (inertia, velocity-product and gravity terms, taken from the same dynamics as `robofab-armaccel`, whose mass matrix and gravity terms are checked in `tests/` against independently computed energies). `topp.py` discretises s into 400 steps, finds for each step the largest u that leaves any feasible s'', then integrates forward at the highest allowed acceleration and backward at the strongest allowed deceleration and takes the pointwise minimum. This is rest-to-rest and the result is bang-bang in s''. Tests check it against the closed form `T = 2 sqrt(dtheta m11 / tau)` for a one-joint zero-gravity move, the `1/sqrt(tau)` scaling in zero gravity, that the peak torque stays within 3% of the limit, that it is never slower than min-jerk, and that an impossible gravity load is reported as infeasible. The jaw force uses the wrist's radial and vertical acceleration from the kinematics, with mu = 0.5, density 1240 kg/m^3, link mass 1 kg per metre and gripper 0.1 kg, all assumed as in `robofab-armaccel`.

## Results

Per-part tables for nine cases are in `experiments/results.txt`: min-jerk time, time-optimal time, percent saved, jaw forces and their ratio, and the peak torque of the computed profile over the limit (1.000 to 1.008, from the discretisation).

## Limitations

- Stylised. All parameters other than geometry are assumed; the torque limits of 2 to 10 N m are far above a small hobby arm of these link lengths, so accelerations are extreme. Read the results as relative (a ratio between two profiles), not as achievable cycle times.
- The path is fixed to the joint-space line; true time optimality over all paths is not attempted, and the min-jerk comparator is the one shortest duration on a 0.001 s grid at the same path.
- The computed profile exceeds the torque limit by up to 0.8% at nodes because of the 400-step grid and finite-difference accelerations.
- The path acceleration is estimated by differences of the speed profile, so the jaw force at the switching points is approximate (a true bang-bang has a step there).
- One planar arm, no wrist orientation, no link-table collision, no joint-speed limit, no motor dynamics, no payload swing.
- The jaw bound is not re-simulated beyond 40 m/s^2.
- Simulated results are not claims about physical arms or grippers.

## Next steps

Cap the jaw force and solve for the fastest move that respects both limits (the trade this note only points at); a joint-speed limit; a MuJoCo arm with real actuators to check the bound at these accelerations; the descent and insertion legs.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
