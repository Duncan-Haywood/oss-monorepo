# Does arm torque or jaw friction limit how fast an arm carries a printed part? Two-link arm dynamics joined to the moving-grasp bound (stylised)

A follow-up to `research/robofab-graspmove` ("link the required acceleration to the `robofab-reach` arm") and `research/robofab-reach` (track `robofab`). `robofab-graspmove` asked how hard the jaws must squeeze under a given acceleration; `robofab-reach` found the shortest arm that reaches every pick and place point of a seven-part toy gripper. Here a vertical-plane two-link arm on that geometry carries each of the six free parts from its tray pick point to the lift point above its place point with a joint-space min-jerk move. I ask two things: how short can the carry be before the joint torque limit binds, and what jaw force does that move then demand? All numbers come from `experiments/results.txt`. Pure Python, no dependencies, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-armaccel/

- **Torque sets the carry time; the grip it demands is 5 to 100 times the static force.** For links of 0.12 m (1.5 times the `robofab-reach` minimum) and an assumed torque limit of 5 N m, the six carries take 0.06 to 0.10 s each (0.45 s in total) and the heaviest part (the 5.95 g cover) needs 1.25 N per jaw against 0.058 N at rest (21 times). With a 2 N m limit the total is 0.70 s and the cover needs 0.52 N; with 10 N m, 0.33 s and 2.49 N.
- **A bigger arm is slower, not stronger.** At 2 N m the total carry time is 0.30 s for 0.08 m links, 0.70 s for 0.12 m and 0.85 s for 0.20 m, because the link inertia grows with length while the torque limit is fixed (link mass assumed 1 kg per metre of length).
- **Whether the jaws or the arm bind depends on the jaw force.** For the cover on the 0.12 m arm at 5 N m the arm alone allows 0.10 s; a grip limited to 0.5 N stretches that to 0.17 s, 0.3 N to 0.23 s, 0.2 N to 0.29 s, 0.1 N to 0.53 s, and 0.05 N or less is not enough at any duration up to 10 s (the static force for the cover is 0.058 N per jaw, so 0.05 N cannot hold it even at rest). For the 0.36 g link the two limits meet near 0.1 N. In `robofab-graspmove`, friction was "not the binding constraint" at 40 m/s^2; at the accelerations a torque-limited arm actually produces (here 28 to 837 m/s^2) it can be, for grips under about 0.5 N.
- **Caveat on the range.** `robofab-graspmove` checked the bound `m sqrt((g + a_up)^2 + a_rad^2) / (2 mu)` against MuJoCo only up to 40 m/s^2. Most of the cases here exceed that (peak wrist accelerations of 28 to 837 m/s^2 in the tables), so the force numbers are the bound applied beyond its simulated range; I did not re-simulate them.

```bash
cd research/robofab-armaccel
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, < 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 1 min; writes experiments/results.{txt,json}
```
Produced with Python 3.11, standard library only.

## Motivation

Handling a printed part at speed is the cycle-time term of the self-replicating shop (track `selfrep`) and the workcell (`robofab-cell`). The jaw force and the arm torque are usually chosen separately; this joins them in the simplest model that can show which one binds.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-reach`, `research/robofab-graspmove` and `research/robofab-selfparts` in this repository, whose geometry, part list, density and bound I copy so the project is self-contained. No paper from either group is reproduced, and nothing here is affiliated with or endorsed by them. The min-jerk profile is the standard quintic point-to-point blend (Flash and Hogan, 1985, *J. Neurosci.* 5(7):1688-1703). The planar two-link dynamics are the textbook rigid-body equations. Self-replication context: Zykov et al. (2005). Entries in `paper/refs.bib` are copied from `robofab-graspmove`; Flash and Hogan is cited from memory and was not re-verified in this run.

## Method

`geometry.py` is a copy of the pick, lift and place targets and the base search of `robofab-reach` (shoulder height 0.1 m; tray 120 mm from the fixture; 10 mm base grid); the base is the feasible one closest to the fixture. `model.py` has the arm: two uniform rods (mass 1 kg per metre, assumed), a 0.1 kg gripper and the part as a point mass at the wrist, gravity in the plane. The mass matrix and gravity terms are checked in `tests/` against kinetic energy and potential energy computed independently from forward kinematics, and the torque equation against an energy balance over a move. Each carry is a min-jerk move in joint space from the inverse kinematics of the pick point to that of the lift point (elbow-up), with no check that the links clear the table or parts. `min_time` finds the shortest duration on a 0.01 s grid whose peak joint torque, over 100 samples, stays within the limit. The wrist's radial and vertical acceleration are taken by differentiating the kinematics, and the per-jaw force at each sample is `m sqrt((g + a_z)^2 + a_r^2) / (2 mu)` with mu = 0.5 and density 1240 kg/m^3 (the `robofab-graspmove` values). The grasp axis is taken as tangential to the turntable, so both accelerations lie along the pad faces.

## Results

See the bullets above and `experiments/results.txt`: three arm sizes (0.08, 0.12 and 0.20 m links) by three torque limits (2, 5, 10 N m), per-part time, peak accelerations and jaw force, then the grip-limited versus torque-limited time for the cover and the link.

## Limitations

- Stylised. Every parameter other than the geometry is assumed: link mass per length, gripper mass, torque limits, friction, density. The torque limits of 2 to 10 N m on links of 0.08 to 0.2 m are far stronger than a small hobby arm of that size, so the accelerations are extreme; read the results as how the two limits trade off, not as achievable cycle times.
- The carry time is quantised to 0.01 s, which is 10 to 20% of the shortest values; differences of that size are not meaningful.
- One move shape (min-jerk in joint space), one wrist orientation (not modelled), no collision of links with the table, no joint speed, backlash, motor dynamics or payload swing, and joint torque is the only arm limit.
- The jaw bound is not re-simulated beyond 40 m/s^2 (see above).
- Simulated results are not claims about physical arms or grippers.

## Next steps

A MuJoCo arm with real actuators and the same carry, so the jaw bound is checked at the arm's accelerations; a time-optimal (bang-bang) profile instead of min-jerk; the descent and insertion legs; a joint-speed limit; link-versus-part collision.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The Python standard library only; no language model, key or hardware. Produced with AI assistance (Claude).

MIT.

## Figure
`python3 experiments/figure.py` plots total move time against link length for each torque limit (feasible rows) from the committed `experiments/results.json` and writes `experiments/totaltime_vs_link.svg` (standard library only; no new results; stylised simulation).
