# homebot: co-designing a printable 22-DOF bimanual mobile manipulator and its MuJoCo twin

*White paper, research/homebot. Produced with AI assistance (Claude); all numbers come from
the code in this directory. Simulation only: the robot has not been built.*

## Abstract

We describe an open design for a home-assistant robot built entirely from one cheap servo
model (Feetech STS3215, 12 V) and PLA:
- two 7-DOF arms with grippers;
- a pan/tilt head;
- a 0.5 m lift;
- a holonomic omni-wheel base;
- 22 actuators in total, for $625–946 in parts.

The robot is generated, together with its MuJoCo twin, from a single parameter file. Printed
parts are cut from a measured servo envelope, and each body's inertia is summed from the
printed geometry (a slicer-like shell model) and the bought parts. The servo is modelled as a
saturating proportional loop in front of a brushed motor, which MJCF reproduces exactly: a
force-limited position actuator plus back-EMF damping gives the datasheet torque-speed line.

On this twin we run four checks:
- *Engineering checks:* with 3:1 printed gears on the shoulders, every joint stays under half
  its peak torque with 200 g in the hand. A 135 g payload is held indefinitely at the full
  0.53 m reach. The tall kiwi base tips at 0.68 m/s² in its worst pose, which sets a 0.5 m/s²
  command ramp.
- *A twin-gap study for RL:* reaching policies trained on the exact twin ignore servo-gain,
  friction and mass errors, but fail as soon as one 40 ms control step of action latency is
  added (100 % to 10 % success). Domain randomisation restores 97–99 %. MOBILE_ABSTRACT
- *Two twins of the base:* ideal planar joints versus omni wheels with passive rollers. They
  disagree by about 7.6 % of the distance driven, and the gap does not depend on the wheel
  servos' speed-loop gain.
- *System identification on a test pendulum:* it recovers the servo parameters within 0.5 %
  (friction 9 %) from 12 s of synthetic steps. A too-light pendulum leaves the overall
  parameter scale unidentifiable.

## 1. Motivation

Hobby bus servos have made robot arms cheap: the SO-100/SO-101 arms and the LeKiwi base are
built around the STS3215 [soarm100, lekiwi, cadene2024lerobot]. XLeRobot combines two 5-DOF
SO-101 arms, a LeKiwi base and a 2-DOF head into a 17-servo household robot from about $660
[wang2025xlerobot]. ALOHA and Mobile ALOHA showed that low-cost bimanual hardware with
learning can do fine household tasks [zhao2023learning, fu2024mobile].

Two things are missing for a robot meant to be trained in simulation:
- **Dexterity per dollar.** Redundant 7-DOF arms and a lift cost only a few more servos, but
  the extra load on the shoulders has to be checked.
- **A twin that is consistent with the hardware by construction.** The same parameters should
  drive the parts and the simulator, so that changing a link length cannot leave the
  simulator's masses or the printed brackets behind.

The twin should also say which of its simplifications matter for transferring policies, before
any hardware exists.

## 2. Design

**Kinematics.** Each arm has shoulder pitch, shoulder roll, upper-arm yaw, elbow, forearm roll,
wrist pitch and wrist roll, plus a one-pivot gripper. Link lengths are set by the servo stack.
With the module offsets at their minimum, the arm reaches 0.53 m from the shoulder axis to the
grasp point. The two arms are mirror images, and joint axes are mirrored so that a positive
angle means the same anatomical motion on both sides (checked to 1e-9 m in the tests).

**Modules.**
- *Roll joints:* the servo sits in line with the link. The two mid-arm rolls run in a 6806
  thin-section bearing that carries the bending moment.
- *Pitch joints:* a clevis bolted to the horn on one side and pivoting on an M4 shoulder screw
  on the other.
- *Geared shoulder joints:* 14:42, module 2, profile shift ±0.3, on two 608 bearings and an M8
  shaft.

**Carriage, head, base.**
- A two-part printed carriage rides on four mini V-wheels on a 1 m 2020 V-slot mast. The lift
  servo's GT2 pulley wraps an omega belt fixed at both ends of the mast.
- The head sits on a cap at the mast top, like Stretch's mast head [kemp2022design].
- The base is a Y frame of 2020 spokes on a printed hub, with three servo-driven 100 mm omni
  wheels at 0.2 m radius and a six-sector printed deck.

**Parts.** 20 printed parts (29 STL files with the mirrored copies), all checked to fit a
220 x 220 x 250 mm bed; 2.4 kg of PLA for the full robot.

## 3. Twin

**Inertias from geometry.** Each printed part's mass is ρ·(A·t_wall + infill·(V − A·t_wall)),
with A and V its CAD surface area and volume. Its centre of mass and inertia are those of the
solid scaled to that mass. Servos, bearings, extrusions, the battery and electronics are boxes
or points. Each MuJoCo body gets the parallel-axis sum of its contents.

**Servo model.** With duty u = clip(K e, ±1), a brushed motor gives τ = u τ_s − b ω at the
output, with b = τ_s/ω₀. Hence τ = clip(k_p e, ±τ_s) − b ω with k_p = K τ_s. MJCF implements
this exactly as a `position` actuator with `forcerange` ±τ_s plus joint damping b. A gear stage
of ratio n and efficiency η maps (τ_s, ω₀, b, k_p, armature) to (n η τ_s, ω₀/n, n² η b,
n² η k_p, n² J).

τ_s and ω₀ come from the 12 V datasheet: 30 kg·cm and 0.222 s/60°, giving b = 0.62 N·m·s/rad.
That b matches the SO-101 model's 0.60. The loop gain (17.8 N·m/rad), armature (0.028 kg·m²)
and friction (0.052 N·m) are taken from the SO-101 MuJoCo model. Those values were identified
for Open Duck Mini on the *7.4 V* servo with BAM [openduckmini, duclusaud2025extended], so here
they are priors.

**Two base twins.**
- *Planar:* x, y and yaw joints with velocity servos whose force limits are those of three
  wheel servos.
- *Rollers:* a free base on three omni wheels, each with 20 passive ellipsoid rollers, driven
  by speed-mode servo models through the kiwi inverse kinematics [siegwart2011introduction].

## 4. Engineering results

All numbers come from `experiments/analyze.py`, `experiments/scripted_pick.py` and
`experiments/base_fidelity.py` (results under `experiments/results/`).

**Torque.** We took the worst static holding torque over 20,000 random arm poses plus the
straight-out poses. With a 200 g payload, every joint stays at or below 46 % of its peak torque
(stall torque times the reduction, with the shoulder torque register at 75 %).

Measured against the datasheet's *continuous* rating (10 kg·cm at 0.9 A, times the reduction),
three joints exceed it when holding 200 g at full reach: shoulder pitch 103 %, upper-arm yaw
119 %, elbow 120 %. The largest payload held with every joint within its continuous rating,
arm level with the shoulder, is:

| Horizontal reach | Payload |
|---|---|
| 0.53 m | 135 g |
| 0.42 m | 184 g |
| 0.32 m | 240 g |

Within peak torque, the same reaches hold 0.79, 0.94 and 1.11 kg. Without the 3:1 stage, the
shoulder-pitch servo would hold 1.75 N·m just for the arm's own weight, 60 % of stall.

**Stability.** The support triangle's edges lie R/2 = 0.1 m from the centre. The static margin
of the full robot ranges from 38 mm (both arms straight forward, 200 g each) to 92 mm (arms
down).

The largest base acceleration before the point-mass ZMP leaves the triangle depends on the
lift height:
- 3.5 m/s² with the arms down and the lift low;
- 0.68 m/s² with both arms forward and the lift at the top.

So velocity commands are ramped at 0.5 m/s² in both the environments and the driver.

**Gripper (scripted, not learned).** Damped-least-squares IK drives the servo twin through a
top-down pick of a 4 cm, 60 g cube at 40 random table positions. Results:
- 32 picks hold the cube clear of the table after a 12 cm lift.
- 6 positions are out of reach for a vertical grasp.
- 2 picks fail.
- The single pivoting jaw squeezes at an angle, so the cube slides a median 34 mm (22–53 mm)
  down the jaws before wedging.
- The proportional servo loops let the hand droop a median 5.6 mm under load.

**Cost.** 22 servos at $15.99, plus bearings, extrusion, belt, omni wheels, electronics and
2.4 kg of PLA, come to $946 at the listed retail prices. The cheapest sourced options bring
this to $625 (`hardware/BOM.md`).

## 5. Twin-gap experiments

**E1. Which twin errors matter for a reaching policy?**

*Setup.*
- PPO with an MLP of 2x256 units, 8 environments, 1.5 M steps (about 12.5 min on 4 cores).
- Action: joint-target increments at 25 Hz on 500 Hz physics.
- Observation: joint angles (quantised to the encoder) and velocities, the previous action, and
  the target relative to the gripper.
- Each policy is scored on 100 fixed episodes on the nominal twin and on nine perturbed twins
  (`homebot.envs.GAPS`).
- *Randomised* training resamples per episode: servo gain, back-EMF damping, friction, armature,
  link masses, a payload, 0–2 steps of action latency, and encoder noise. This is dynamics
  randomisation in the sense of [peng2018sim], who randomised the action timestep. Here we
  delay actions explicitly, following the actuator-and-latency modelling of [tan2018sim].

*Result (one arm, 3 seeds each):*
- **Nominal training.** The policy reaches 100 % (2 mm median error) on the nominal twin and
  stays at 100 % under servo gain x0.5 and x2, friction x3, +25 % link mass with 200 g in the
  hand, and 10 mrad encoder noise. One control step of latency (40 ms) drops it to 10 % (5–14 %),
  80 ms to 4 %, 120 ms to 2 %, and the combined perturbation to 3 %.
- **Randomised training.** 98 % (8 mm) on the nominal twin, 97–99 % up to 80 ms, and 81 %
  (74–93 %) at 120 ms, beyond the training range. It needs about 2.3x the samples to reach 90 %
  training success.
- **Interpretation.** For a position-controlled hobby-servo arm, the twin's servo gain, friction
  and mass errors are nearly irrelevant to a reaching policy, while bus latency decides whether
  it works at all.

*Two arms (randomised, 1 seed, 3 M steps).* 80 % on the nominal twin, where success means both
hands within 3 cm. It falls to 65 % with servo gain x2 and 34 % at 120 ms latency, both outside
its training ranges.

**E2. Planar or roller base twin?** Both twins receive 12 random drives of 12 s (about 1.8 m
each) through the same kiwi wheel commands.
- The planar twin stays within 1.5 cm of the ideal kinematics.
- The roller twin ends 14 cm (worst 47 cm) and 10° away, about 7.6 % of the distance driven.
- Raising the wheel servos' speed-loop gain 64x moves the gap only from 6.4 % to 5.5 %, so it
  comes from roller contact, not speed tracking.
- The roller twin runs 8.5x slower.

MOBILE_EXPERIMENTS

**E4. System identification.** We fitted the single-joint servo twin to 12 s of synthetic step
responses (encoder quantisation and 2 mrad noise included) for 8 servos whose parameters were
drawn at x0.5–2 of the priors. With a 0.5 kg mass at 15 cm, gain, damping, armature and stall
torque are recovered within 0.5 %, and friction within 9.1 %. With 0.1 kg at 10 cm, one fit in
eight lands 12 % off on *every* parameter with an unchanged residual: the reflected rotor
inertia (0.028 kg·m²) dominates the response and leaves the overall scale unidentifiable. This
is validation on synthetic data only.

**A bug the second twin caught.** The first mobile run reported 93/100 tip-overs under +25 %
mass on the planar twin, and none on the roller twin. MuJoCo precomputes subtree masses, and
randomising `body_mass` without refreshing them had scaled the centre of mass on which the ZMP
check is built. The physically tipping twin exposed what the analytic check could not. The bug
is fixed with a regression test, and the mobile policy reported here was retrained afterwards.

## 6. Limitations

- Nothing is built. Every claim is about the twin.
- Servo parameters beyond the datasheet are priors from a different winding. Backlash
  (≤0.5° per the datasheet), deadband, thermal limits and printed-part compliance are not
  modelled.
- The planar base cannot tip; tipping is inferred from the ZMP [vukobratovic2004zero].
- The RL tasks are reaching tasks with privileged state (target position, joint angles).
  Grasping is checked only with a scripted controller.
- Twin perturbations stand in for an unknown real robot. They show which errors a policy is
  sensitive to, not how large the real errors are.

## 7. Conclusion

A 22-DOF printable mobile manipulator is feasible on one $15 servo if the shoulders are geared
3:1 and the base is limited to gentle accelerations. Generating the parts and the twin from one
source keeps them consistent. The twin also identifies, before any hardware exists, which gaps
to close first: RL_CONCLUSION Next comes building stage A, identifying the servos, and
measuring base odometry against the two twins.

## References

BibTeX in `refs.bib`. Cited keys: todorov2012mujoco, towers2025gymnasium, raffin2021stable,
schulman2017proximal, tobin2017domain, peng2018sim, tan2018sim, hwangbo2019learning,
duclusaud2025extended, zhao2023learning, fu2024mobile, kemp2022design, cadene2024lerobot,
zakka2022menagerie, vukobratovic2004zero, siegwart2011introduction, openduckmini,
wang2025xlerobot, soarm100, lekiwi, feetechsts3215, ftservosdk.
