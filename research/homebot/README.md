# homebot: a printable 22-DOF bimanual mobile manipulator and its MuJoCo twin

A home-assistant robot you can 3D print in PLA and build from cheap, easy-to-get parts. It has:
- two 7-DOF arms with grippers;
- a pan/tilt camera head;
- a 0.5 m lift on an aluminium mast;
- a holonomic three-omni-wheel base.

Every actuator is the same $14–16 Feetech STS3215 bus servo (22 in total), so each extra degree
of freedom costs about one servo and some filament. One parameter file generates three things
together, so they agree by construction:
- the printable parts (CadQuery: STL and STEP);
- the simulator model (MuJoCo), with masses taken from the printed geometry;
- the RL environments (Gymnasium).

A small driver runs the same joint-target interface on the real servos.

> **v2 in progress.** The code and parts now have a 2:1 geared elbow, a parallel rack-and-pinion
> gripper with TPU pads, a CAD interference sweep over every joint and a learned pick task
> (`ArmPick`). The numbers below are from v1 and are being re-run for v2.

**Status: designed and simulated, not yet built.** Every number below comes from the code in
this directory: CAD, the MuJoCo twin, analyses and RL runs. Nothing has been measured on
hardware yet. `hardware/ASSEMBLY.md` lists what to measure on the first build so the twin can be
corrected.

![The full robot in the twin](hardware/renders/mobile.png)

| | |
|---|---|
| ![one arm at a table](hardware/renders/arm.png) | ![the omni base](hardware/renders/base.png) |

## At a glance

| | |
|---|---|
| Actuated DOF | 22: 2 x (7 arm + 1 gripper), 2 head, 1 lift, 3 wheels (holonomic base) |
| Servo | Feetech STS3215, 12 V, 30 kg·cm stall, 45 rpm, 4096-count encoder, 55 g (datasheet) |
| Arm | shoulder pitch/roll (printed 3:1 spur gears), upper-arm yaw, elbow, forearm roll, wrist pitch, wrist roll; 0.53 m from shoulder axis to gripper |
| Payload | 135 g held at full horizontal reach within the servos' continuous rating (240 g at 60 % reach); about 0.8 kg briefly within the peak torque |
| Lift and head | shoulder height 0.45–0.95 m (GT2 belt on a 1 m 2020 V-slot mast), camera at ~1.15 m |
| Base | 3 x 100 mm omni wheels at 0.2 m radius, 0.2 m/s and 1 rad/s commanded, 0.5 m/s² ramp |
| Mass (twin) | 2.25 kg one-arm desk build, 3.48 kg two-arm torso, 5.17 kg mobile robot |
| Cost (`hardware/BOM.md`) | **A** one arm: $290 ($229 budget route) · **B** two arms + head: $484 ($403) · **C** mobile: $946 ($625) |
| Filament | about 1.1 / 1.6 / 2.4 kg PLA for A / B / C |

## Build it in three stages

1. **A. One arm on a desk post (8 servos).** Prints and tests the arm modules.
2. **B. Two arms and the head on the post (18 servos).** A bimanual table-top workstation.
3. **C. The mobile robot (22 servos).** Adds the base, lift and battery.

Guides: [`hardware/BOM.md`](hardware/BOM.md) (parts, prices, sources),
[`hardware/PRINTING.md`](hardware/PRINTING.md), [`hardware/ASSEMBLY.md`](hardware/ASSEMBLY.md),
[`hardware/WIRING.md`](hardware/WIRING.md) (bus ids, power, zero pose, directions). STLs are in
`hardware/stl/` (millimetres, `_mirror` = left side) and STEP files in `hardware/step.zip`.

## Quick start (simulation)

```bash
cd research/homebot
python -m venv .venv && . .venv/bin/activate
pip install numpy scipy mujoco gymnasium pyserial pytest stable-baselines3
pip install torch --index-url https://download.pytorch.org/whl/cpu
PYTHONPATH=src python -m pytest tests -q                   # 59 tests, ~10 s on an idle 4-core machine
PYTHONPATH=src python experiments/view.py mobile           # interactive viewer (arm | torso | mobile)
PYTHONPATH=src python experiments/train.py --env ArmReach --dr --steps 1500000   # ~13 min on 4 cores
```

```python
import gymnasium as gym, homebot.envs
env = gym.make("homebot/MobileReach-v0", randomize=homebot.envs.Randomization())
```

Environments: `ArmReach` (one arm, 7 joints), `BimanualReach` (14 joints), `MobileReach`
(base twist + lift + 7 arm joints, on the fast planar base), and `MobileReachRollers` (the same
task on the roller-wheel base, for evaluation). Actions are joint-target increments, exactly what
the real driver sends as goal positions. Control runs at 25 Hz on 500 Hz physics.

## How the design and the twin fit together

- **One source of truth.** `src/homebot/params.py` holds every dimension and datasheet value.
  `layout.py` turns it into a body tree. `cad/parts.py` and `cad/base_parts.py` cut the printed
  parts in those body frames. `mjcf.py` writes the MuJoCo model, with each body's inertia summed
  from its servos and bought parts plus its printed parts' mass properties
  (`hardware/mass_properties.json`). Those use a slicer-like shell model: 3 perimeters, 25 %
  infill, PLA. Changing a link length moves the brackets, the meshes, the masses and the model
  together.
- **Servo pockets from the measured envelope.** The STS3215 case was measured from the
  datasheet drawing and the SO-ARM100 servo mesh: 45.4 x 24.8 mm, output axis 10.2 mm from the
  near end, horn face 4.3 mm above the case, idler boss 32.9 mm below. Every cradle is cut from
  that envelope plus 0.3 mm clearance. The mesh was measured, not copied.
- **Three joint modules.**
  - *Roll joints:* the servo sits in line with the link, and the upper-arm and forearm rolls
    run in a 6806 thin-section bearing so the servo only supplies torque.
  - *Pitch joints:* the child is a clevis bolted to the horn on one side and pivoting on an M4
    shoulder screw on the other.
  - *Geared shoulder:* a 14:42 module-2 spur pair, profile-shifted ±0.3 to avoid undercut, with
    the joint on two 608 bearings and an M8 shaft. It triples torque to 6.1 N·m peak (torque
    register at 75 % to spare the PLA teeth). It also slows the joint to 90°/s and limits it to
    120° of travel, because position mode is single-turn.
- **The servo model reproduces the torque-speed line.** A hobby servo is a brushed motor behind
  a saturating proportional loop: τ = clip(k_p e, ±τ_stall) − b ω, with b = τ_stall/ω₀ the
  back-EMF slope. In MJCF this is a force-limited `position` actuator plus joint damping b, so at
  saturation the twin delivers exactly τ_stall − b ω and reaches the datasheet's no-load speed
  (`tests/test_servo_model.py`).
  - Wheel servos in speed mode use the same construction with a feed-forward term.
  - Reflected rotor inertia (armature), Coulomb friction and the loop gain are not on the
    datasheet. They start from the SO-101 MuJoCo model's values, which came from an
    identification of the 7.4 V servo for Open Duck Mini with Rhoban's BAM (Duclusaud et al.
    2025). They must be re-identified for the 12 V servos you buy (`homebot.sysid`).
- **Head on the mast, not on the carriage.** The mast runs through the carriage, so a head
  there would hit it. A cap on the mast top keeps the camera at a fixed ~1.15 m overlooking
  both arms, like Stretch (Kemp et al. 2022).

## Engineering checks (from the twin)

`experiments/analyze.py` (results in `experiments/results/analysis.json`).

**Torque budget.** The table gives the worst static holding torque over 20,000 random arm poses
plus the straight-out poses, without and with a 200 g payload. "Continuous" is the datasheet
rated torque (10 kg·cm at 0.9 A) times the reduction; "peak" is the usable stall torque.

| Joint | Own weight (N·m) | + 200 g | Continuous | Peak | + 200 g vs continuous | vs peak |
|---|---|---|---|---|---|---|
| shoulder pitch (3:1) | 1.75 | 2.79 | 2.71 | 6.09 | 103 % | 46 % |
| shoulder roll (3:1) | 1.33 | 2.26 | 2.71 | 6.09 | 83 % | 37 % |
| upper-arm yaw | 0.57 | 1.17 | 0.98 | 2.94 | 119 % | 40 % |
| elbow | 0.58 | 1.18 | 0.98 | 2.94 | 120 % | 40 % |
| forearm roll | 0.14 | 0.43 | 0.98 | 2.94 | 44 % | 15 % |
| wrist pitch | 0.14 | 0.43 | 0.98 | 2.94 | 44 % | 15 % |

Every joint stays under half of its peak torque. With 200 g held at full reach, shoulder pitch,
upper-arm yaw and elbow exceed their continuous rating, so long holds at full reach will heat
them. Payload held indefinitely (all joints within the continuous rating, arm level with the
shoulder):
- 135 g at 0.53 m;
- 184 g at 0.42 m;
- 240 g at 0.32 m.

Within peak torque the figures are 0.79, 0.94 and 1.11 kg. Without the 3:1 gears, the shoulder
would already be at 60 % of stall under the arm's own weight.

**Tip-over.** The kiwi base's support triangle has edges only R/2 = 0.1 m from the centre.
Margins come from the zero-moment point (Vukobratović & Borovac 2004) of the full twin, with
200 g in each reaching hand:
- Static margin: 92 mm with the arms down, 69 mm reaching forward low, 48 mm reaching to the
  side, 38 mm with both arms straight forward.
- The largest base acceleration before a wheel lifts falls as the lift rises: 3.5 m/s² with the
  arms down and the lift low; 0.68 m/s² with both arms forward and the lift at the top.

So the base ramps its velocity commands at 0.5 m/s², in the environments and in the driver.

**Gripper.** A scripted top-down pick (`experiments/scripted_pick.py`, IK plus the servo twin)
lifts a 4 cm, 60 g cube in 32 of 40 random placements:
- 6 placements are out of reach for a straight-down grasp;
- 2 picks fail.

The single pivoting jaw squeezes at an angle, and the cube slides a median 34 mm (22–53 mm) down
the jaws before it wedges. The proportional servo loops let the hand droop 5.6 mm (median) below
the commanded lift height under load.

## Twin fidelity and RL results

**Which twin errors matter for a learned policy?**

Policies are trained with PPO (Stable-Baselines3, 25 Hz, 8 parallel environments on 4 CPU cores).
They are then scored on 100 fixed episodes on the nominal twin and on nine perturbed twins, each
standing in for a real robot that differs from the model in one way. Success means the gripper
centre is within 3 cm of the target at the end of the episode.

*Randomised* policies saw a twin resampled every episode:
- servo gain x0.6–1.6;
- back-EMF damping x0.75–1.3;
- friction x0.4–2.5;
- reflected inertia x0.6–1.6;
- link masses x0.85–1.2;
- 0–150 g in the hand;
- 0–2 control steps (0–80 ms) of action latency;
- 3 mrad encoder noise;
- a 10 % unit-to-unit servo spread.

The twin's own encoder quantisation is applied everywhere.

![Success on perturbed twins](paper/figures/gaps_ArmReach.png)

*One arm reaching a random point at the table: 3 seeds each, 1.5 M steps, about 12.5 min per
run. Success rate is the mean over seeds (range); the second figure is the median final
distance.*

| Twin the policy is tested on | Trained on the nominal twin | Trained on a randomised twin |
|---|---|---|
| nominal | 100 % (99–100), 2 mm | 98 % (96–99), 8 mm |
| servo gain x0.5 | 100 %, 2 mm | 98 %, 6 mm |
| servo gain x2 | 100 %, 3 mm | 96 % (92–99), 10 mm |
| friction x3 | 100 %, 2 mm | 97 % (94–99), 7 mm |
| links +25 % and 200 g in the hand | 100 %, 2 mm | 98 %, 6 mm |
| **40 ms action latency** | **10 % (5–14), 51 mm** | 99 %, 5 mm |
| **80 ms action latency** | **4 %, 79 mm** | 97 %, 8 mm |
| **120 ms action latency** (beyond the randomised range) | **2 %, 101 mm** | 81 % (74–93), 15 mm |
| 10 mrad encoder noise | 99 %, 2 mm | 98 %, 8 mm |
| combined (gain x0.6, friction x2, mass x1.15, +100 g, 80 ms, 5 mrad) | **3 %, 99 mm** | 98 %, 7 mm |

- **Latency is what breaks a nominal policy.** Trained on the exact twin, it ignores halving or
  doubling the servo gain, tripling friction, 25 % heavier links with 200 g in the hand, and
  encoder noise. A single control step of action latency (40 ms) takes it from 100 % to 10 %.
  We expect about one step of delay on the real bus, though it is not measured: a sync read of
  20 servos at the default 0.5 ms return delay is about 12 ms before USB latency and inference
  are added.
- **Randomisation fixes this at a cost.**
  - Success stays at 97–99 % up to 80 ms.
  - At 120 ms, beyond anything it saw in training, it still reaches 81 %.
  - The price is precision: the median final error rises from 2 mm to 8 mm.
  - It also needs about 2.3x the samples to reach 90 % training success (0.59 M steps against
    0.21–0.27 M).
- **Measuring the real bus's latency is therefore the first sim-to-real job**, ahead of
  friction or mass identification.

![Learning curves](paper/figures/learning_curves.png)

*Both arms, each reaching its own target (randomised twin, 1 seed, 3 M steps, 29 min):* 80 %
success on the nominal twin (both hands within 3 cm; median worse hand 18 mm), and 81–90 %
under most perturbations. It drops to 65 % with doubled servo gain and 34 % at 120 ms latency.
Both of those lie outside its training ranges. The 14-joint policy is still improving at 3 M
steps (figure above), so this is an under-trained result rather than a ceiling.

| ![arm policy](paper/figures/filmstrip_ArmReach.png) |
|---|
| ![bimanual policy](paper/figures/filmstrip_BimanualReach.png) |

*Whole robot, driving to a target and reaching it.* Targets lie 0.22–1.45 m from the base
centre and 0.29–1.09 m high (5–95 % ranges), in any direction. The policy commands the base
twist, the lift and 7 arm joints (randomised twin, 1 seed, 6 M steps, 62 min):
- **On the twin it trained on (planar base):**
  - 100 % success, median 6 mm, on the nominal twin;
  - 99–100 % under every single perturbation, including +25 % mass with 200 g in the hand
    and 120 ms latency;
  - 97 % (7 mm) under the combined perturbation.
- **Tipping.** None of the 1,000 planar-twin or 200 roller-twin evaluation episodes ended in a
  tip-over. On the planar twin that is the ZMP check; on the roller twin it is a physical tilt
  above 10°.
- **On the roller-wheel twin it never saw:** 100 % on the nominal roller twin (median 5.5 mm)
  and 96 % under the combined perturbation.
- **Why it transfers.** The policy closes the loop on the target position it observes, so the
  6–8 % base drift between the two twins (below) costs it almost nothing.

![mobile policy](paper/figures/filmstrip_MobileReach.png)

**A bug the second twin caught.** The first mobile run reported 93 tip-overs in 100 episodes
under +25 % mass on the planar twin, and none on the roller twin. The cause:
- MuJoCo precomputes subtree masses and divides by them when it computes centres of mass.
- Randomising `body_mass` without refreshing them scaled the computed centre of mass about the
  world origin.
- So the ZMP check flagged phantom tip-overs once the robot drove away from the origin.

It is fixed, with a regression test that fails on the old code, and the policy above was
retrained after the fix. Dynamics were never affected. Comparing two twins of different
fidelity is what exposed it.

**Base twin: planar or rollers?** (`experiments/base_fidelity.py`, 12 random 12 s drives of about
1.8 m.) The fast twin moves the base on ideal planar joints, at 89x real time with the arms on
one core. The detailed twin rolls three omni wheels with 20 passive rollers each through contact,
at 10x real time. With identical wheel commands from the kiwi inverse kinematics (Siegwart et al.
2011):
- The planar twin stays within 1.5 cm (mean) of the ideal kinematics.
- The roller twin ends 14 cm (mean; worst 47 cm) and 10° away from it, about 7.6 % of the
  distance travelled.
- The gap barely changes when the wheel servos' speed-loop gain is raised 64x (6.4 % to 5.5 %),
  so it comes from roller contact, not speed tracking.

Which twin is closer to the real base is the first thing to measure on hardware (a 1 m square
drive). Until then, mobile policies should close the loop on what they observe rather than on
dead reckoning.

**System identification** (`homebot.sysid`, validated on synthetic data only). Fitting the
twin's single-joint model to 12 s of step responses on a test pendulum recovers gain, back-EMF
damping, reflected inertia and stall torque within 0.5 %, and friction within 9.1 %, for 8
random servos with ±2x errors. Encoder quantisation and 2 mrad noise are included. The
pendulum must be heavy: 0.5 kg at 15 cm. With 0.1 kg at 10 cm, the servo's own reflected
inertia (0.028 kg·m², 28x the pendulum's) dominates, and one of 8 fits converged to a solution
12 % off on *every* parameter with the same residual. That is a scale ambiguity, not noise.

## Reproduce

```bash
cd research/homebot
PYTHONPATH=src python -m pytest tests -q                  # 59 tests
PYTHONPATH=src python experiments/analyze.py              # torque, payload, stability, BOM, sysid (~4 min)
PYTHONPATH=src python experiments/base_fidelity.py        # planar vs roller base (~3 min)
PYTHONPATH=src python experiments/scripted_pick.py        # gripper check (~1 min)
bash experiments/run_all.sh                               # all RL runs (~3.5 h on 4 cores)
PYTHONPATH=src python experiments/summarize.py            # RL tables
PYTHONPATH=src python -m homebot.cad.build                # rebuild STL/STEP/mass properties (needs cadquery)
PYTHONPATH=src python -m homebot.analysis.bom             # rebuild hardware/BOM.md
```

The three randomised seed-0 policies ship in `experiments/runs/*_dr_s0/` (`policy.zip` with its
observation normaliser), with every run's learning curve and evaluation. Run
`experiments/filmstrip.py <run dir>` to watch one. Versions in `requirements.txt` (Python 3.11,
CPU only). Bringing up hardware is covered in
`experiments/hardware.py` (`set-id`, `calibrate`, `sysid-log`, `sysid-fit`) and `WIRING.md`.

## Builds on

- **Low-cost arms and mobile manipulators.** The servo choice and much of the practical
  know-how come from the open SO-100/SO-101 arms (TheRobotStudio, Apache-2.0), the LeKiwi base
  (SIGRobotics-UIUC, Apache-2.0), LeRobot (Cadene et al. 2024) and XLeRobot (Wang et al. 2025).
  XLeRobot is the closest prior design: two 5-DOF SO-101 arms on a LeKiwi base with a 2-DOF
  head, 17 servos, from about $660. homebot differs in three ways:
  - 7-DOF arms with geared shoulders and bearing-supported roll joints;
  - a lift;
  - a single parametric source for CAD and twin.

  No CAD or code from those projects is copied. Their STS3215 mesh was used only to measure the
  case. Low-cost bimanual and mobile-bimanual learning: ALOHA (Zhao et al. 2023) and Mobile
  ALOHA (Fu et al. 2024).
- **Mast-and-lift mobile manipulator for homes:** Stretch (Kemp et al. 2022).
- **Servo and actuator modelling for sim-to-real:**
  - an actuator model and simulated latency (Tan et al. 2018);
  - a learned actuator model (Hwangbo et al. 2019);
  - STS3215 parameters identified for Open Duck Mini with BAM (Duclusaud et al. 2025), used here
    as priors via the SO-101 MuJoCo model;
  - dynamics randomisation, including randomised action timing (Peng et al. 2018), after visual
    domain randomisation (Tobin et al. 2017).
- **Tools:** MuJoCo (Todorov et al. 2012), Gymnasium (Towers et al. 2025), Stable-Baselines3
  (Raffin et al. 2021), PPO (Schulman et al. 2017), CadQuery. Servo protocol and control table:
  Feetech's FTServo SDK and LeRobot's Feetech tables.
- **Research directions:** digital twins of manipulation workcells and sim-to-real for
  manipulation, the HIRO Group (Alessandro Roncone, CU Boulder,
  <https://hiro-group.ronc.one/>); learning from demonstration and human-robot collaboration in
  simulation, the CAIRO Lab (Bradley Hayes, CU Boulder, <https://cairo-lab.com/>). Nothing here
  is affiliated with or endorsed by either lab; no specific paper of theirs is reproduced.

Full references: [`paper/refs.bib`](paper/refs.bib). White paper: [`paper/whitepaper.md`](paper/whitepaper.md).

## Limitations

- **Not built.** Fits, clearances, gear mesh, bearing seats and screw access are checked in
  CAD and simulation only. Expect a round of fixes after the first prints.
- **Servo parameters are priors.** Loop gain, armature and friction come from an identification
  of the 7.4 V servo. Speed-loop gain is a guess. Backlash (≤0.5° per the datasheet), deadband,
  temperature and current limits are not modelled.
- **Simplified physics.**
  - Printed parts are assumed rigid, with uniform density inside each part.
  - Gears have no backlash or tooth compliance.
  - The planar base cannot tip; tipping is predicted from the ZMP and ends the episode.
- **Mechanical limits.**
  - Geared shoulder pitch travels only 120° (−14° to +103°) because position mode is
    single-turn.
  - The lift runs in speed mode, with the host counting turns.
  - The gripper is a single pivoting jaw and lets objects slide.
- **Prices** were checked on 2026-10-02 from the retailers listed. A few are taken from other
  projects' BOMs and are marked as such. Small hardware is listed but not priced.
- **RL scope.** The tasks are reaching only. Picking with learned policies, camera observations,
  and any real-robot transfer are not attempted.

## Next steps

1. Print and assemble stage A. Measure part masses, gear backlash and joint friction. Fit the
   servo parameters with `sysid-log` and update `params.py`.
2. Gear the elbow (it exceeds its continuous rating holding 200 g at full reach) and replace the
   pivoting jaw with a parallel or pre-angled jaw with TPU pads.
3. Run the 1 m square odometry test to decide between the planar and roller base twins.
4. Add camera observations (wrist cams and head cam) and pick-and-place tasks. Collect
   teleoperated demonstrations with a mirrored leader arm for learning from demonstration.

## Notes

Written with AI assistance (Claude). The design, code, analyses and text were produced in an
AI-assisted session and checked by the tests and scripts above. Citations were checked against
publisher DOI records, arXiv, proceedings pages and the cited repositories. MIT licence
(`research/LICENSE`).
