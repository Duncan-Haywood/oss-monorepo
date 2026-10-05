# Assembly

> **Status: designed in CAD and simulation, not yet assembled.** The steps follow from the
> part geometry; the first build should be recorded (photos, fit problems, measured masses)
> and fed back into `params.py`.

To see how the parts meet, open the robot in MuJoCo's viewer
(`PYTHONPATH=src python experiments/view.py mobile`). Use the control sliders to move each joint.
The STEP files in `step.zip` open in any CAD tool. Build in this order, and calibrate after each
stage (`WIRING.md`).

## 0. Before you start

- Give every servo its bus id and label it (`WIRING.md`).
- Centre every servo before fitting a horn: power it, enable torque, and command position 2048.
  The calibration step records the real zero, so this centring only keeps each joint's range
  inside the servo's single turn.
- Press the 608ZZ, 625ZZ and 6806ZZ bearings in with a vice or clamp, not a hammer.
- Use an M4 heat-set insert for the wrist-pitch pivot: 1 per arm, in the `forearm` cradle plate.

## 1. Arm (repeat mirrored for the left arm)

Work from the hand up. Each joint is one of three modules.

**Roll module** (upper-arm yaw J3, forearm roll J5, wrist roll J7).
1. Seat the servo in the parent's cradle (output facing down) and fix it with M2 x 6 screws
   into the case's bottom holes.
2. For J3 and J5, press a 6806ZZ bearing into the ring under the cradle.
3. Push the child's hub into the bearing bore, align it with the horn and fix it with
   4 x M3 screws from below. J7 has no bearing.

**Pitch module** (wrist pitch J6).
1. Fix the servo in the cradle of the `forearm` (output pointing outward).
2. Slide the `wrist_clevis` over it.
3. Bolt the outer cheek to the horn (4 x M3).
4. Put an M4 shoulder screw through the inner cheek into the insert on the cradle's pivot boss.
   It should turn freely with no axial play.

**Geared elbow** (J4, 2:1).
1. Bolt an `elbow_pinion` to the elbow servo horn (4 x M3 x 16, heads in the counterbores).
2. Fix the servo in the `upper_arm` cradle, horn outward, case running up the arm. Its near end
   rests on the lobe support.
3. Press two 625ZZ into the elbow lobe at the bottom of the `upper_arm`.
4. Screw the `elbow_gear` to the outboard cheek of the `forearm_clevis` (4 x M3, thread-forming
   into the cheek).
5. Put the clevis around the lobe and push an M5 x 45 bolt through the gear, the outboard cheek,
   the lobe bearings and the inboard cheek. Shim with M5 washers so the cheeks clear the lobe.
6. Set the mesh before tightening: a little play, no binding. Grease the teeth.

**Parallel gripper** (J8).
1. Bolt the `hand` hub to the wrist-roll horn first: 4 x M3 from below, through the side windows
   of the neck with a ball-end hex key.
2. Push the gripper servo into its cradle from below (output down, case running back) and fix it
   with M2 x 6 screws from above (the two near screws through the same windows).
3. Close the jaws: centre the servo, then bolt the `grip_pinion` to the horn (4 x M3, heads in the
   counterbores).
4. Push the two TPU `pad`s onto the pegs of the two `jaw`s (both jaws are the same part).
5. Slide the two 4 mm rods through the +x end wall, through both jaw carriages (one jaw turned
   180 deg so its rack meets the other side of the pinion) and into the blind holes of the -x
   wall. Before the rods go fully home, set both jaws so that the pads touch while the pinion
   meshes with both racks.
6. Run the jaws open and closed by hand; ream the carriage holes (4.4 mm) if they bind. A drop of
   light oil on the rods helps.

**Geared shoulder** (J1, J2).
1. Bolt a `pinion` to the J2 servo horn (4 x M3 x 16).
2. Fix the J2 servo in the `shoulder_block`.
3. Press two 608ZZ into the shoulder lobe.
4. Bolt a `gear42` to the back cheek of the `upper_arm_top` (4 x M3).
5. Put the clevis around the lobe and push an M8 x 60 bolt through the gear, the lobe bearings
   and the front cheek.
6. Before tightening the nut, set the mesh: the gear should turn with a little play and no
   binding. Then grease the teeth.

The J1 gear bolts to the `shoulder_block` plate, and its M8 shaft runs through two 608ZZ in the
carriage (step 2).

## 2. Carriage

1. Fit the two J1 servos (output outward through the side walls) and the lift servo.
2. Bolt pinions to the J1 horns and the GT2 pulley to the lift horn.
3. Fit the four mini V-wheels on M5 bolts. Eccentric spacers go on the front side.
4. Bolt the two halves together around the mast.
5. Adjust the eccentrics until the carriage slides without rocking.

## 3. Mast, head and lift

1. Bolt the `mast_cap` to the top of the 1 m V-slot mast (M5 into T-nuts). Fix the pan servo
   in it, bolt the `neck` to its horn, fix the tilt servo in the neck, and bolt the `head` to
   the tilt horn. Mount the webcam with a 1/4-20 screw or zip ties.
2. Run the GT2 belt down the back of the mast. Clamp it in the `mast_cap` at the top and in the
   `hub` at the bottom. In the carriage, wrap it in an omega: over the upper 623 idler, round
   the pulley, under the lower idler.
3. Fit a stop collar (or a printed block on T-nuts) on the mast under the carriage. Without
   power, the 345:1 servo gearbox holds the carriage, but do not rely on it.

## 4. Base (mobile stage)

1. Push the three 117 mm 2020 spokes into the `hub` and the mast into its socket, and bolt all
   four with M5 T-nuts.
2. Fit a `wheel_mount` on each spoke end. Fix a wheel servo in each (output outward), bolt a
   `wheel_hub` to each horn and the omni wheel to the hub.
3. Lay the six `deck` sectors on the spokes. The half-lap edges overlap, and M3 screws join
   them.
4. Strap the battery to the back of the deck and the Pi and bus adapters to the front.

## 5. Calibrate and check against the twin

1. Run `python experiments/hardware.py calibrate --stage <arm|torso|mobile>`.
2. Weigh the printed parts and compare them with `hardware/mass_properties.json`. Weigh the
   whole arm too.
3. Put one servo on the test pendulum (0.5 kg at 15 cm) and record a step response:
   `python experiments/hardware.py sysid-log --joint r_elbow` then `sysid-fit`. Copy the fitted
   `kp`, `damping` (back-EMF), `armature`, `friction` and stall torque into `STS3215_12V` in
   `params.py`, so the twin matches your servos.
4. Odometry check (mobile): drive a 1 m square at 0.1 m/s and measure the end-point error.
   Compare it with the planar and roller twins (README, base fidelity).
