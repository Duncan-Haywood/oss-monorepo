# When does a purpose-built gantry beat a general two-link arm at tray pick-and-place?

Pure Python, no dependencies. First milestone (`osrobot-specialise`) of track 9, open-source purpose-built robots, which asks when a robot built for one job beats a general-purpose one. This run takes the simplest version of one task: pick small parts from random points of a square tray and place them at other random points, with a purpose-built Cartesian XY gantry (plus a short Z axis) against a general planar two-link arm on a Z axis. Pipetting and weeding, the other tasks the milestone lists, are not modelled. **Every cost, mass, speed, torque and accuracy figure is an assumption written into `model.py` (marked ASSUMED); none is a measured or quoted value of a real product, and the conclusions are conditional on them.** All numbers below come from `experiments/results.txt`. Simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/osrobot-specialise/

- **The gantry's cycle time grows with the work area; the arm's barely does.** At 2 mm placement tolerance the gantry takes 1.55 s per cycle on a 0.1 m side and 3.25 s on 1.0 m. The arm takes 2.98 s up to 0.6 m (limited by the assumed joint speed, since the same joint angles cover any scale) and 3.43 s at 1.0 m (limited by the assumed joint torque).
- **The arm only pays off in a middle band.** On cost per good pick per hour (capital cost divided by throughput), the gantry wins up to 0.35 m and the arm from 0.36 m to 0.99 m at 2 mm tolerance. At 1.0 m the two are level (0.506 against 0.509). Beyond that the gantry wins again: the arm's position error is its angle error times its reach, so its success rate falls (0.88 at 1.0 m, 0.57 at 1.4 m), and no arm within the assumed 1 m reach covers a side above 1.41 m, so only the gantry is left.
- **Tolerance shrinks the arm's band.** The arm never wins at 0.5 mm, wins only from 0.37 to 0.52 m at 1 mm, from 0.36 to 0.99 m at 2 mm, and from 0.36 to 1.15 m at 5 mm and looser.
- **The conclusion is mostly set by the assumed cost ratio.** At 2 mm, halving the gantry's cost per metre removes the arm's band entirely; doubling it widens the band to 0.17 to 1.34 m. Doubling the arm's cost coefficient removes the band; halving it widens it to 0.30 to 1.28 m. Halving the assumed joint speed also removes it. Scaling the gantry's assumed position error by 0.5 or 2 does not move the band at 2 mm.
- **Energy per pick favours the gantry in every case modelled** (9.5 to 31 J against 36 to 63 J), through lower assumed holding power and moving inertia. This follows from the assumptions, not from a measurement.

```bash
cd research/osrobot-specialise
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, about 9 s
PYTHONPATH=src python3 experiments/run.py                 # about 1 minute; output in experiments/results.txt
```

## Motivation

Track 9 starts from a job and lets it decide the body. For tray pick-and-place the obvious specialisation is a gantry, a stack of linear axes whose workspace is exactly the tray. The question is not whether a gantry works but where, in work-area size and accuracy demand, a specialised frame stops being worth it against a general-purpose arm, and what that depends on. This project builds the smallest model that can answer that, and reports that the answer is a function of costs this run could not source.

## Builds on

The groups listed for the track (ARPG, CAIRO Lab, HIRO Group) work on manipulation and lab robots; nothing here reproduces or builds on a paper from them, and nothing here is affiliated with or endorsed by any lab. The kinematics are textbook (trapezoidal velocity profiles; law-of-cosines two-link inverse kinematics, elbow down) and no result is taken from a paper. The arm is an equal-link planar arm, standing in for a hobby arm such as the SO-101 of track 4 without modelling it.

## Method

`src/osrobot_specialise/model.py`. For a square work area of side L, picks and places are uniform random points (2,000 pairs, fixed seed). The gantry's X and Y axes move independently with a trapezoidal profile; time is the slower axis, and kinetic energy is lost at each stop. The arm has two equal links (each half the reach) and a base at the centre, so the reach needed is the half-diagonal of the area. Joint moves are trapezoidal with acceleration capped at `min(alpha, torque / inertia)`, the inertia taken with the arm stretched out (worst case). Both designs add a 40 mm Z cycle. A cycle is a carry move plus the reverse move (a stand-in for the empty move to the next pick) plus two Z cycles. Energy adds holding power for three axes over the cycle. Success is the probability that a 2-D Gaussian position error lies inside the tolerance radius at both pick and place; the arm's position sigma is its angle sigma times its reach. Cost is `fixed + k * (Lx + Ly)` for the gantry and `fixed + k * R^2` for the arm. The figure of merit is cost divided by good picks per hour, and `arm_wins` lists the side lengths where the arm's is lower. Tests check the velocity profile, the IK boundary, monotonicity, reproducibility and the structure of the results.

## Limitations

Stylised. Every parameter is assumed and the result flexes strongly with the cost coefficients (see the sensitivity table in `results.txt`). No real part prices or bill of materials; no collisions, no payload dynamics beyond a fixed 50 g point mass, and no belt stretch, backlash, vibration, calibration, vision or gripping. The arm has no wrist orientation. Cycle time is two equal moves, not the exact route. The arm's cycle time is flat below 0.6 m because its assumed joint-speed limit binds there. The designs are compared by one scalar (cost per good pick per hour), which ignores floor space, set-up effort, safety around people and reconfigurability, the general arm's real strengths. Simulated results are not claims about physical machines.

## Next steps

Source dated prices for real bills of materials (owner step) and re-run the sensitivity with them. Add the milestone's other tasks: liquid handling (short distances, tight tolerance) and weeding (a mobile base changes the arm's reach limit). Replace the equal-link arm with a MuJoCo model of a real open arm, and add the value of reconfigurability that the single scalar leaves out.

## Owner steps

A bill of materials for a gantry (extrusion, belts or screws, steppers, controller) and for an open arm, each priced with a source and date, so the assumed cost coefficients can be replaced by real ones. No prices were checked in this run, so no bill is given.

## Outside dependencies

None (standard library only). Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
