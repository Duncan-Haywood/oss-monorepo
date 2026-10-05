# homebot: co-designing a printable 22-DOF bimanual mobile manipulator and its MuJoCo twin

*White paper, research/homebot. Produced with AI assistance (Claude); all numbers come from
the code in this directory. Simulation only: the robot has not been built.*

## Abstract

We describe an open design for a home-assistant robot built entirely from one cheap servo model
(Feetech STS3215, 12 V) and PLA:
- two 7-DOF arms with parallel grippers;
- a pan/tilt head;
- a 0.5 m lift;
- a holonomic omni-wheel base;
- 22 actuators in total, for $627–948 in parts.

The robot is generated, together with its MuJoCo twin, from a single parameter file. Printed
parts are cut from a measured servo envelope, and each body's inertia is summed from the
printed geometry (a slicer-like shell model) and the bought parts. The servo is modelled as a
saturating proportional loop in front of a brushed motor, which MJCF reproduces exactly: a
force-limited position actuator plus back-EMF damping gives the datasheet torque-speed line.

This is the second version of the arm. v1 had a direct-drive elbow and a single pivoting jaw;
v2 gears the elbow 2:1 and uses a rack-and-pinion parallel gripper. On the twin:
- *Engineering checks:* with printed gears at the shoulders (3:1) and elbow (2:1), every joint
  stays under half its peak torque with 200 g in the hand. The arm holds 145 g indefinitely at
  its full 0.53 m reach and 560 g at 0.32 m. A sweep that intersects the exact printed solids
  over each joint's range found that v1's elbow could not reach the range its twin allowed,
  because the simulator ignores contacts between linked bodies. The parallel jaws remove the
  34 mm slip of v1's pivoting jaw in a scripted pick. The tall kiwi base tips at 0.63 m/s² in
  its worst pose, which sets a 0.5 m/s² command ramp.
- *Which twin errors matter for learning:* reaching and picking policies trained on the exact
  twin ignore servo-gain, friction, mass and object errors. They fail once one 40 ms control
  step of action latency is added: reaching drops from 99 % to 29 %, picking from 91 % to 41 %.
  Domain randomisation fixes this almost for free for reaching (99 % up to 80 ms), but for
  picking it costs 14 points on the nominal twin (77 %, holding 77 % at 40 ms) and about 6x the
  samples.
- *Mobile transfer:* a whole-body mobile reaching policy trained on a cheap planar base twin
  transfers to a contact-rich roller-wheel twin (98 % nominal, 95 % under combined
  perturbations, no tip-overs).
- *Perception:* a rendered head camera and an ArUco fiducial locate the cube to 0.8 mm (median),
  or 3.5 mm once the head servos' backlash is included. That supports the 5 mm error used in
  training. But in the closed loop the arm hides the cube during the approach, and the pick
  policies, trained on continuous tracking, fall from 84–96 % to 32–40 % success. Training on a
  model of the camera pipeline reaches 50 % (one seed).
- *Two twins of the base* disagree by about 7.6 % of the distance driven.
- *System identification on a test pendulum* recovers the servo parameters within 0.5 %
  (friction 9 %). A too-light pendulum leaves the overall parameter scale unidentifiable.

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
wrist pitch and wrist roll, plus a parallel gripper. Link lengths are set by the servo stack.
With the module offsets at their minimum, the arm reaches 0.53 m from the shoulder axis to the
grasp point. The two arms are mirror images, and joint axes are mirrored so that a positive
angle means the same anatomical motion on both sides (checked to 1e-9 m in the tests).

**Modules.**
- *Roll joints:* the servo sits in line with the link. The two mid-arm rolls run in a 6806
  thin-section bearing that carries the bending moment.
- *Pitch joint* (wrist): a clevis bolted to the horn on one side and pivoting on an M4 shoulder
  screw on the other.
- *Geared shoulder joints:* 14:42, module 2, profile shift ±0.3, on two 608 bearings and an M8
  shaft.
- *Geared elbow:* 15:30, module 1.5. The forearm clevis turns on an M5 shaft in two 625 bearings,
  and the servo sits one centre distance (34 mm) up the upper arm.
- *Parallel gripper:* an 18-tooth module-1.25 pinion on the gripper servo drives two racks in
  opposite directions. Each rack belongs to a jaw carriage on two 4 mm steel rods, and each jaw
  carries a printed TPU pad. The jaws open 0–64 mm. At a 35 % torque register they squeeze with
  about 37 N each and move at 17 mm/s.

This is the second version of the arm. The first had a direct-drive elbow and a single pivoting
jaw; section 4 compares the two.

**Carriage, head, base.**
- A two-part printed carriage rides on four mini V-wheels on a 1 m 2020 V-slot mast. The lift
  servo's GT2 pulley wraps an omega belt fixed at both ends of the mast.
- The head sits on a cap at the mast top, like Stretch's mast head [kemp2022design].
- The base is a Y frame of 2020 spokes on a printed hub, with three servo-driven 100 mm omni
  wheels at 0.2 m radius and a six-sector printed deck.

**Parts.** 24 printed parts (31 STL files with the mirrored copies), all checked to fit a
220 x 220 x 250 mm bed; 2.5 kg of PLA for the full robot, plus a few grams of TPU.

**Range of motion from the parts.** MuJoCo ignores contacts between a body and its parent, so a
joint range the printed parts cannot reach is invisible in the twin. We therefore check each arm
joint by intersecting the exact solids, printed parts plus servo envelopes, on both sides of the
joint at 25 angles across its range (OpenCascade booleans). Gear and rack meshes are checked
separately, in 2D, with both members turning.

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

τ_s and ω₀ come from the 12 V datasheet [feetechsts3215]: 30 kg·cm and 0.222 s/60°, giving
b = 0.62 N·m·s/rad.
That b matches the SO-101 model's 0.60. The loop gain (17.8 N·m/rad), armature (0.028 kg·m²)
and friction (0.052 N·m) are taken from the SO-101 MuJoCo model. Those values were identified
for Open Duck Mini on the *7.4 V* servo with BAM [openduckmini, duclusaud2025extended], so here
they are priors. Once hardware logs exist, a learned actuator model [hwangbo2019learning] or
BAM's extended friction model would be the next refinement.

**Driver.** The real-robot driver speaks the Feetech STS protocol directly. Register addresses
and the sign-magnitude encoding follow the FTServo SDK [ftservosdk] and LeRobot's tables
[cadene2024lerobot]. Policies send the same joint targets to the twin and to the servos.

**Coupled jaws.** The two jaws are slide joints tied by an equality constraint (q₂ = q₁). The
gripper servo acts on one of them with ratio 1/r (r is the pinion's pitch radius), so its force
limit is the total clamp force. Its reflected inertia, damping and friction are split equally
between the two joints, which gives the same kinetic energy and dissipation as one servo
driving both racks.

**Two base twins.**
- *Planar:* x, y and yaw joints with velocity servos whose force limits are those of three
  wheel servos.
- *Rollers:* a free base on three omni wheels, each with 20 passive ellipsoid rollers, driven
  by speed-mode servo models through the kiwi inverse kinematics [siegwart2011introduction].

## 4. Engineering results

All numbers come from `experiments/analyze.py`, `experiments/scripted_pick.py` and
`experiments/base_fidelity.py` (results under `experiments/results/`).

**Range of motion (v1 and v2).** The interference sweep found two errors in v1:
- its elbow parts collided from about 1.7 rad, although the twin allowed 2.3 rad;
- a pivot boss overlapped its clevis cheek by 1.5 mm.

Neither was visible in the twin, because parent–child contacts are excluded. All eight v2
joints are clear over their full ranges. The v2 elbow first touches between 2.15 and 2.2 rad,
and its range is set to 2.0.

**Torque.** We took the worst static holding torque over 20,000 random arm poses plus the
straight-out poses. With a 200 g payload, every joint stays at or below 49 % of its peak torque
(stall torque times the reduction, with the geared joints' torque register at 75 %).

Measured against the datasheet's *continuous* rating (10 kg·cm at 0.9 A, times the reduction),
the 2:1 elbow drops from 120 % (v1) to 69 %. The 67 g that v2 adds (28 g in the gripper, 39 g at
the elbow) raises shoulder pitch from 103 % to 111 % and upper-arm yaw from 119 % to 127 %,
with 200 g held at full reach. The largest payload held with every joint within its continuous
rating, arm level with the shoulder, is:

| Horizontal reach | v2 | v1 |
|---|---|---|
| 0.53 m | 145 g | 135 g |
| 0.42 m | 300 g | 184 g |
| 0.32 m | 560 g | 240 g |

Within peak torque, the same reaches hold 0.80, 1.12 and 1.60 kg. Without the 3:1 stage, the
shoulder-pitch servo would hold 1.96 N·m just for the arm's own weight, 67 % of stall.

The elbow's 15-tooth module-1.5 pinion is the most stressed printed tooth. By the Lewis formula
(no profile-shift credit) its root stress is about 38 MPa at full stall with the 75 % register,
against about 20 MPa for the shoulder pinions. That is within the 40–60 MPa tensile strength of
printed PLA, but not by much, so the elbow relies on stall being brief. At the continuous rating
it is about 17 MPa.

**Stability.** The support triangle's edges lie R/2 = 0.1 m from the centre. The static margin
of the full robot ranges from 35 mm (both arms straight forward, 200 g each) to 92 mm (arms
down).

The largest base acceleration before the point-mass ZMP leaves the triangle depends on the
lift height:
- 3.6 m/s² with the arms down and the lift low;
- 0.63 m/s² with both arms forward and the lift at the top.

So velocity commands are ramped at 0.5 m/s² in both the environments and the driver.

**Gripper (scripted, not learned).** Damped-least-squares IK drives the servo twin through a
top-down pick of a 4 cm, 60 g cube at 40 random table positions, lifted 12 cm.
- *v2, parallel jaws:* every one of the 24 reachable placements holds the cube, which slips
  0 mm (median; at most 2 mm) down the pads.
- *v1, pivoting jaw:* 32 of 34 held, but the jaw squeezed at an angle and the cube slid a median
  34 mm (22–53 mm) before wedging.
- *Reach:* in v2, 16 of the 40 placements are out of reach for a vertical grasp, against 6 in
  v1. All 16 lie 0.18–0.26 m in front of the post, where a vertical grasp needs more elbow flex
  than the parts allow. v1 appeared to reach them only with an elbow angle its own parts could
  not reach.
- *Droop:* the proportional servo loops let the hand droop a median 6 mm under load.

**Cost.** 22 servos at $15.99, plus bearings, extrusion, belt, omni wheels, electronics and
2.5 kg of PLA, come to $948 at the listed retail prices. The cheapest sourced options bring
this to $627 (`hardware/BOM.md`). The v2 additions (625 bearings, M5 bolts, 4 mm rods, a few
grams of TPU) are listed but not priced.

## 5. Twin-gap experiments

**E1. Which twin errors matter for a reaching policy?**

*Setup.*
- PPO [schulman2017proximal] from Stable-Baselines3 [raffin2021stable], an MLP of 2x256 units,
  8 Gymnasium environments [towers2025gymnasium] in MuJoCo [todorov2012mujoco], 1.5 M steps
  (about 14 min on 4 cores).
- All results below are for the v2 arm; v1 values are given where they differ.
- Action: joint-target increments at 25 Hz on 500 Hz physics.
- Observation: joint angles (quantised to the encoder) and velocities, the previous action, and
  the target relative to the gripper.
- Each policy is scored on 100 fixed episodes on the nominal twin and on nine perturbed twins
  (`homebot.envs.GAPS`).
- *Randomised* training resamples per episode: servo gain, back-EMF damping, friction, armature,
  link masses, a payload, 0–2 steps of action latency, and encoder noise. This is dynamics
  randomisation in the sense of [peng2018sim], who randomised the action timestep, after the
  visual randomisation of [tobin2017domain]. Here we delay actions explicitly, following the
  actuator-and-latency modelling of [tan2018sim].

*Result (one arm, 3 seeds each):*
- **Nominal training.** The policy reaches 99 % (2 mm median error) on the nominal twin and
  stays at 99–100 % under servo gain x0.5 and x2, friction x3, +25 % link mass with 200 g in
  the hand, and 10 mrad encoder noise. One control step of latency (40 ms) drops it to 29 %
  (25–31 %; v1 10 %), 80 ms to 8 %, 120 ms to 2 %, and the combined perturbation to 5 %.
- **Randomised training.** 99 % (8 mm) on the nominal twin, 99 % up to 80 ms, 100 % under the
  combined perturbation, and 71 % (45–88 %; v1 81 %) at 120 ms, beyond the training range. It
  needs about 2.3x the samples to reach 90 % training success.
- **Changing the arm.** The v1 policies, trained before the elbow was geared and the gripper
  replaced, run unchanged on the v2 twin. One arm keeps 98 % (98 % on v1). The mobile policy
  drops from 100 % to 99 % nominal, and from 97 % to 93 % combined.
- **Interpretation.** For a position-controlled hobby-servo arm, the twin's servo gain, friction
  and mass errors are nearly irrelevant to a reaching policy within the ranges tested (gain
  x0.5–2, friction x3, mass +25 %). Bus latency decides whether it works at all.

*Two arms (randomised, 1 seed, 6 M steps).* 87 % on the nominal twin, where success means both
hands within 3 cm, and 78–90 % under the single non-latency perturbations. Latency hurts more
than for one arm: 58 % at 80 ms and 22 % at 120 ms, against 86 % and 34 % for the v1 policy
(3 M steps). The v2 run's training success peaked at about 3 M steps and then declined. With
one seed per version, we do not attribute the difference.

**E2. Planar or roller base twin?** Both twins receive 12 random drives of 12 s (about 1.8 m
each) through the same kiwi wheel commands.
- The planar twin stays within 1.5 cm of the ideal kinematics.
- The roller twin ends 14 cm (worst 47 cm) and 10° away, about 7.6 % of the distance driven.
- Raising the wheel servos' speed-loop gain 64x moves the gap only from 6.4 % to 5.5 %, so it
  comes from roller contact, not speed tracking.
- The roller twin runs 8.5x slower.

**E3. Whole-body mobile reaching, and transfer to the roller twin.**

*Setup.*
- The policy commands the base twist, the lift and 7 arm joints.
- Targets lie 0.22–1.45 m from the base centre and 0.29–1.09 m high (5–95 % ranges), in any
  direction.
- It is trained with randomisation on the planar twin (6 M steps, 77 min) and terminated when
  the point-mass ZMP leaves the wheel triangle.

*Result.*
- **Planar twin:** 98 % success (6 mm) on the nominal twin, 95–98 % under every single
  perturbation and 95 % under the combined one, with no tip-overs (v1: 100 %, 99–100 %, 97 %).
- **Roller twin** (never seen in training, physically able to tip): 98 % nominal (6 mm) and
  95 % combined, with no tip-overs (v1: 100 % and 96 %).
- Because the policy closes the loop on the observed target, the 6–8 % odometric gap between
  the twins (E2) costs it almost nothing.
- It tolerates 120 ms of latency better than the one-arm policy (96 % against 71 %). A likely
  reason, untested, is that its 10 s episodes leave time to settle where the arm task's 4 s do
  not.

**E4. System identification.** We fitted the single-joint servo twin to 12 s of synthetic step
responses (encoder quantisation and 2 mrad noise included) for 8 servos whose parameters were
drawn at x0.5–2 of the priors. With a 0.5 kg mass at 15 cm, gain, damping, armature and stall
torque are recovered within 0.5 %, and friction within 9.1 %. With 0.1 kg at 10 cm, one fit in
eight lands 12 % off on *every* parameter with an unchanged residual: the reflected rotor
inertia (0.028 kg·m²) dominates the response and leaves the overall scale unidentifiable. This
is validation on synthetic data only.

**E5. Learning to pick with the parallel gripper.**

*Setup.*
- One arm at the table edge. A cube is placed at random 0.24–0.40 m in front of the post, at
  any yaw within ±45°. The policy moves the seven arm joints and the gripper by target
  increments, starting with the gripper open (61 mm).
- *Observations:* joints, velocities and the previous action; the gripper servo's load (which
  the STS3215 reports); the cube position relative to the gripper and to the table; the cube's
  yaw as (sin 4ψ, cos 4ψ), because a cube is symmetric under quarter turns; and the gripper's
  closing and approach axes. There is no touch sensing. The cube position stands in for a camera
  with a fiducial on the cube; no images are rendered.
- *Reward:* dense and staged. It pays 1 − tanh(10 d) for approach and 0.25 per jaw touching the
  cube. While both jaws hold it, it adds twice the lift fraction (up to 8 cm), plus 1 once the
  cube is 5 cm up. Small penalties apply for action size and for contact with the table. An
  episode lasts 6 s.
- *Success:* at the end of the episode the cube is at least 5 cm above the table and held by
  both jaws.
- *Randomisation:* as for reaching (without the hand payload), plus cube edge 30–50 mm, mass
  30–200 g, cube friction 0.3–0.8, pad friction x0.65–1.25, and an observed cube position that
  is off by N(0, 5 mm) per axis, fixed per episode, plus jitter.
- *Extra test twins:* slippery pads (x0.55), a 300 g cube, a 10 mm position error.
- *Training:* nominal policies use PPO for 3 M steps. Randomised policies use PPO with an
  entropy bonus of 0.005 [schulman2017proximal] for 8 M steps. Three seeds each.

*Result (mean over 3 seeds, min–max in brackets).*

| Test twin | Nominal-trained | Randomised |
|---|---|---|
| nominal | 91 % (89–93) | 77 % (71–87) |
| gain x0.5 / x2, friction x3, mass +25 % with 200 g | 86–92 % | 72–77 % |
| latency 40 / 80 / 120 ms | 41 / 18 / 8 % | 77 / 63 / 48 % |
| slippery pads, 300 g cube | 89 %, 89 % | 80 %, 77 % |
| 10 mm cube-position error | 67 % | 61 % |
| combined | 27 % (16–37) | 61 % (52–71) |

- **The ranking of gaps carries over from reaching.** Latency is again what breaks a nominal
  policy; servo, friction, mass and object errors barely matter.
- **Randomisation is more expensive here.**
  - It costs 14 points on the nominal twin, against 2 for reaching.
  - It needs about 6x the samples to reach 50 % training success: 0.73–3.75 M steps against
    0.32–0.43 M for nominal training.
  - The seeds vary widely (71–87 % nominal).
- **An optimiser detail mattered.** Without the entropy bonus, the first randomised run (5 M
  steps) let PPO's action noise collapse from 0.6 to 0.08. It plateaued at 75 % on the nominal
  twin.
- **Failures are missed grasps.** On 300 twins drawn from the whole training distribution, the
  randomised policies succeed 65 % of the time (60–73 % by seed), and 4 % knock the cube off
  the table. The rest miss the grasp, most often on 45–50 mm cubes (53 %): with the jaws open to
  61 mm, a 50 mm cube leaves about 5 mm per side, no more than the position error. The
  nominal-trained policies score 34 % on the same twins, falling from 56 % without latency to
  11 % at two steps.
- **They grasp from the side.** At first two-jaw contact, the gripper is tilted a median 43–78°
  from vertical, depending on the policy. That lets them pick 60–93 % of the cubes placed
  closer than 0.26 m to the post, where the scripted vertical grasp (Section 4) finds no
  solution.

**E6. Can a camera supply the cube position?** The pick policies observe the cube position
with a randomised 5 mm (per axis) error. To check that figure, we render the stage-B head
camera (60° vertical field of view, at 1.3 m) at 720p with Gaussian pixel noise (σ = 2/255).
The scene is a 40 mm cube with a 30 mm ArUco marker [garrido2014automatic] on its top face, at
200 random placements. OpenCV detects the marker. We then intersect the ray through its centre
with the plane of the cube's top face, using the camera pose from the head's forward kinematics.
- *True head angles:* median 0.8 mm horizontal error (90th percentile 1.0 mm); 1.1 mm at
  640x480.
- *Angles as the servos report them* (quantised to one tick and offset by up to the datasheet's
  0.5° backlash): 3.5 mm median, 6.2 mm at the 90th percentile.
- *Full marker pose by PnP*, without the plane: 8 mm horizontal and 11 mm vertical median
  error, because a 30 mm marker at 0.6 m constrains depth poorly.
- *Visibility:* the carriage hides the table within 0.265 m of the post from the head (20 of
  the 21 failed detections).

The randomised 5 mm is therefore of the right order for a head camera. The error budget is set
by the head servos' backlash, not by image resolution. Lens distortion and calibration error,
which are not modelled, would add to it.

*In the loop.* The cube position comes from rendered images at 5 Hz instead of the simulator.
The last estimate is held while the marker is hidden, and the cube is carried with the hand
once the gripper servo reports a hold. Under these conditions the seed-0 policies fall:
- nominal-trained: from 96 % to 40 % with a fixed camera and 32 % with the pan/tilt head;
- randomised: from 84 % to 32 % with either camera.

These are 50 paired episodes. The marker is detected in 11–18 % of frames, because the arm hides
the cube from above during the approach. The policies nudge the cube while closing in, and a
frozen estimate then misses it; in a 16-episode check, perception at 25 Hz did not help. A policy trained on a cheap
model of this pipeline (estimates refreshed every 1–5 steps, held while the hand is within
6–15 cm of the cube or a frame drops out, on the table plane, carried while held) reaches 50 %
with the fixed camera. It gives up 20 points with a perfect cube position (64 %). One seed. For
picking, the twin thus ranks perception, not dynamics, as the gap to close next.

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
- The RL tasks use privileged state: target and cube positions, joint angles. A rendered
  head-camera check (E6) supports the pick task's 5 mm position error, but closing the loop
  through rendered images drops picking to 32–50 %, and no policy sees images. Contacts are rigid apart from MuJoCo's soft-contact parameters, and the TPU pads
  are modelled by friction only.
- The randomised pick policies reach 77 % on the nominal twin, well below the nominal-trained
  91 %. Larger openings, touch sensing from the servo load, or longer training are untested.
- Twin perturbations stand in for an unknown real robot. They show which errors a policy is
  sensitive to, not how large the real errors are.

## 7. Conclusion

A 22-DOF printable mobile manipulator is feasible on one $15 servo if the shoulders are geared
3:1, the elbow 2:1, and the base is limited to gentle accelerations. Generating the parts and the twin from one
source keeps them consistent. The twin also identifies, before any hardware exists, which gaps
to close first:
- Bus latency, not servo gain, friction or mass, is what breaks a reaching or picking policy.
  Randomisation fixes it at little cost for reaching, and at a real cost for picking.
- The planar base twin is good enough to train closed-loop mobile policies, even though its
  odometry is about 7 % off.

A mesh-interference sweep is worth running on any twin built this way: it found a joint range in
v1 that the parts could not reach and that the simulator never noticed.

Next comes building stage A, identifying the servos, measuring the bus latency, and measuring
base odometry against the two twins.

## References

BibTeX in `refs.bib`. Cited keys: todorov2012mujoco, towers2025gymnasium, raffin2021stable,
schulman2017proximal, tobin2017domain, peng2018sim, tan2018sim, hwangbo2019learning,
duclusaud2025extended, zhao2023learning, fu2024mobile, kemp2022design, cadene2024lerobot,
vukobratovic2004zero, siegwart2011introduction, openduckmini, wang2025xlerobot, soarm100,
lekiwi, feetechsts3215, ftservosdk, garrido2014automatic.
