# Wiring and bus ids

> **Status: not yet built.** The ids, directions and power plan below are what the software
> (`homebot.layout.SERVO_IDS`, `homebot.hardware`) expects.

All 22 actuators are Feetech STS3215 12 V serial bus servos. Each has two 3-pin connectors
(GND, V+, signal), so servos are daisy-chained. A USB bus adapter (Waveshare Bus Servo Adapter
(A) or Feetech FE-URT-1) turns USB into the half-duplex TTL bus at 1 Mbps (the servos' factory
baud rate) and feeds 12 V into the chain.

## Bus ids

New servos ship with id 1. Connect **one servo at a time** and give it its id:

```bash
python experiments/hardware.py set-id --port /dev/ttyACM0 --joint r_elbow
```

| Joint | Left arm id | Right arm id | Notes |
|---|---|---|---|
| shoulder_pitch | 1 | 9 | geared 3:1, in the carriage |
| shoulder_roll | 2 | 10 | geared 3:1, in the shoulder block |
| upper_arm_yaw | 3 | 11 | 6806 bearing |
| elbow | 4 | 12 | geared 2:1, in the upper arm |
| forearm_roll | 5 | 13 | 6806 bearing |
| wrist_pitch | 6 | 14 | |
| wrist_roll | 7 | 15 | |
| gripper | 8 | 16 | rack and pinion: the joint is the opening of one jaw, in metres |

| Joint | id | Mode |
|---|---|---|
| head_pan | 17 | position |
| head_tilt | 18 | position |
| lift | 19 | constant speed (the host closes the position loop over ~7 servo turns) |
| wheel_0 (front), wheel_1 (rear left), wheel_2 (rear right) | 20, 21, 22 | constant speed |

Speed mode is set once in EEPROM by `RealHomebot.configure_speed_mode()`.

## Chains and power

- **Bus 1 (adapter 1):** left arm (ids 1-8) and right arm (ids 9-16) as two chains, each starting
  at its shoulder-pitch servo in the carriage.
- **Bus 2 (adapter 2, mobile only):** head, lift, wheels.
- **Power:** 12 V. On the desk, use the 8.5 A Mean Well LRS-100-12. On the robot, use a 3S LiPo
  (12.6 V when full). Do **not** use a 4S pack: it charges to 16.8 V, and the servos cut out
  above 14 V. Fit an inline fuse (10 A) and a switch at the battery.
- **Compute:** a 12 V to 5 V 5 A buck converter powers the Raspberry Pi 5. On the desk, use a laptop.

Typical draw is far below stall: the datasheet gives 0.18 A at no load and 2.7 A at stall per
servo. With 22 servos, all at stall at once would be about 60 A, which a holding robot never
reaches. The torque budget (README) keeps static loads near or below the rated 0.9 A point.

## Directions and zero pose

The software never assumes which way a servo turns. `calibrate` asks you to pose the robot at
its zero pose and then nudge each joint in its positive direction:

```bash
python experiments/hardware.py calibrate --port /dev/ttyACM0 --stage arm   # or torso / mobile
```

The **zero pose** is:
- arms hanging straight down beside the mast;
- elbow and wrist-pitch axes side to side;
- gripper closed (pads touching);
- head facing forward and level;
- lift at its lowest stop.

Positive directions (the same anatomical motion on both arms):

| Joint | Positive direction |
|---|---|
| shoulder_pitch | raises the arm forward |
| shoulder_roll | lifts the arm out to the side (away from the body) |
| upper_arm_yaw | internal rotation (with the elbow bent, the forearm swings toward the body) |
| elbow | bends the forearm forward and up |
| forearm_roll, wrist_roll | right arm: anticlockwise seen from above when hanging; left arm: clockwise |
| wrist_pitch | bends the hand forward |
| gripper | opens (both jaws move apart) |
| head_pan | turns left |
| head_tilt | looks down |
| lift | up |

The geared joints must stay within one servo turn (position mode is single-turn, 4096
counts). That is 120° of joint motion at 3:1. Shoulder pitch is therefore limited to
-0.25...1.80 rad, which is about 14° behind to 103° in front of hanging. The 2:1 elbow uses
4.2 rad of servo turn for its -0.1...2.0 rad, and the gripper's 32 mm of jaw travel is 2.8 rad
of servo turn (an 18-tooth module 1.25 pinion, 11.25 mm pitch radius).

The gripper and elbow torque limits are set by the software (`torque_limit` register): 35 % on
the gripper (about 37 N per jaw at stall) and 75 % on the geared joints, to spare the printed
teeth.
