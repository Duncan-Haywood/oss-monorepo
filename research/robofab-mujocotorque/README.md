# Do the robofab carry results survive an independent physics engine? Re-checking the two-link arm's torques in MuJoCo (stylised, preliminary)

A follow-up to `research/robofab-torquebound`, `robofab-peakcheck` and `robofab-motorcurve`, whose next steps all say "check the profiles in MuJoCo". Every number on this track (the 9 to 23% edge of a time-optimal carry over a tuned trapezoid) rests on one hand-written equation for the two-link arm's joint torques. If that equation had a sign or inertia error, every row would be wrong together and no amount of re-sampling would show it. Here the same arm is rebuilt in MuJoCo and the actual planned profiles are checked against its inverse dynamics (track `robofab`).

- **The hand-written torques match MuJoCo.** For all 108 profiles (3 arm sizes x jaw cap k = 2, 5 or none x 6 printed parts x {best trapezoid, time-optimal}), MuJoCo's inverse dynamics and the hand-written model differ by at most 1.8e-5 N m at any of 4,000 samples along the move (trapezoid: at most 4.8e-6), against a 5 N m limit. The wrist position agrees with the hand-written forward kinematics to 1e-9 m.
- **Torque limit, as MuJoCo sees it.** Where only torque binds (jaw cap none, 18 profiles per type) the best trapezoid's MuJoCo peak is 4.97 to 5.04 N m: 5 of 18 exceed 5 N m, by at most 0.73% (0.12 m, `finger_a`: 5.025; worst 5.037). The time-optimal profile's peak is 5.000 to 5.011 N m, 18 of 18 above 5 N m by at most 0.21%. That is the trapezoid's remaining ramp-sampling gap and the solver's n = 1600 discretisation, which `robofab-peakcheck` and `robofab-toppconv` bound separately; they are tiny next to the edge. In the 36 jaw-capped profiles per type the jaw force binds first and the torque peak is 0.38 to 1.9 N m.
- **Open-loop replay.** Applying each plan's torque to MuJoCo's arm (RK4, 0.1 ms step, no feedback, zero-order hold between plan samples) from the planned start state, the arm stays within 0.023 rad of the plan (trapezoid: 0.009 rad) and ends within 1.43 mm of the target (trapezoid: 0.70 mm). The time-optimal moves, which end at higher accelerations and are shorter, drift more. I did not separate plan-sample hold error from integration error, so this is an upper bound on how well the plan can be tracked feed-forward, not a measure of either.
- **Not checked here:** the jaw-force bound (a friction-pad formula, not a MuJoCo contact test; `robofab-liftload` and `robofab-graspmove` test grips in MuJoCo), the motor torque-speed line of `robofab-motorcurve`, and anything about real servos.
- **Reading:** the track's central modelling assumption (planar rigid two-link arm, rods plus a point-mass payload) is implemented consistently by two independent codes, so the earlier edges are not an artefact of a dynamics bug. This does not validate the toy against a physical arm.

```bash
cd research/robofab-mujocotorque
PY=$(python3 ../../platform/ci/pyenv.py mujoco numpy)   # or any python with mujoco and numpy
PYTHONPATH=src "$PY" -m unittest discover -s tests -v   # 5 tests, < 5 s
PYTHONPATH=src "$PY" experiments/run.py > experiments/results.txt   # about 2 min; also writes results.json
```
MuJoCo 3.x and numpy; the arm, geometry, time-optimal solver and trapezoid code are copied from `robofab-torquebound`.

## Motivation

See above. It also gives the track a reusable MuJoCo model of the arm (`src/robofab_mujocotorque/mj.py`) for later checks.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning interests of the CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>), via `research/robofab-torquebound`. MuJoCo: Todorov, Erez and Tassa (2012), "MuJoCo: A physics engine for model-based control", *IROS*. Time-optimal solver: Bobrow, Dubowsky and Gibson (1985), *IJRR* 4(3), and Pfeiffer and Johanni (1987), *IEEE J. Robotics and Automation* 3(2); the implementation is the repository's own. It does not build on, and is not endorsed by, either group.

## Method

`mj.py` builds the arm as an MJCF model: hinges about the horizontal axis in a vertical plane, uniform rods (mass at mid-length, inertia m l^2 / 12), gripper plus part as a point mass at the wrist. `MjArm.torque` sets the state (q, qd, qdd) and calls `mj_inverse`. `experiments/run.py` rebuilds the nine rows of `robofab-torquebound` (best trapezoid on the 14-value ramp grid with 160 extra samples per ramp; time-optimal solver at n = 1600; no speed limit; torque limit 5 N m) and evaluates both hand-written and MuJoCo torques at 4,000 midpoints plus the ramp corners (trapezoid) or at every solver node (time-optimal). It then replays each plan open loop.

## Results

Full per-profile output is in `experiments/results.txt` and `results.json`. Worst case per row (six parts):

| L (m) | k | profile | max diff (N m) | peak torque (N m) | replay deviation (rad) | end error (mm) |
|---|---|---|---|---|---|---|
| 0.08 | none | trapezoid | 4.8e-6 | 4.99 | 0.009 | 0.67 |
| 0.08 | none | time-optimal | 1.8e-5 | 5.009 | 0.023 | 1.43 |
| 0.12 | none | trapezoid | 2.4e-6 | 5.037 | 0.0085 | 0.70 |
| 0.12 | none | time-optimal | 3.0e-6 | 5.011 | 0.0063 | 0.53 |
| 0.2 | none | trapezoid | 8.9e-7 | 5.033 | 0.0047 | 0.61 |
| 0.2 | none | time-optimal | 1.5e-6 | 5.007 | 0.0041 | 0.51 |

The six jaw-capped rows (k = 2 or 5) have worst differences from 1.5e-7 to 2.8e-6 N m, torque peaks from 0.38 to 1.9 N m, and replay deviations up to 0.008 rad.

## Limitations

- Stylised toy arm with assumed parameters. Agreement of two implementations of the same equations of motion shows the equations are implemented as intended; it does not show they describe a real arm.
- Only joint torques are compared. The jaw-force bound, friction, contact, joint damping and motor dynamics are not in this check.
- The 1e-5 N m differences are largest for the time-optimal profiles, which have the highest accelerations; I did not investigate their source.
- The replay is open loop with held samples; its deviations bound nothing about a feedback-controlled arm.
- Simulated results are not claims about physical arms or grippers.

## Next steps

Replay with a joint PD controller and report tracking error against the 5 N m limit; test the jaw-force bound with a MuJoCo contact model during the carry; add the motor torque-speed line to the MuJoCo arm; an absolute jerk limit in rad/s^3 for both profiles.

## Owner steps

None; nothing was built or ordered.

## Outside dependencies

MuJoCo and numpy (pip). No language model, key or hardware. Produced with AI assistance (Claude).

MIT.
