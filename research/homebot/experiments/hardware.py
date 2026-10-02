"""Bring-up tools for the real robot (untested on hardware here; ``--mock`` runs them on the
simulated bus).

    python experiments/hardware.py set-id --port /dev/ttyACM0 --joint r_elbow
        one servo connected at a time: give it the bus id of a joint (new servos are id 1)
    python experiments/hardware.py calibrate --port /dev/ttyACM0 --stage arm
        torque off, pose the robot at its zero pose, then nudge each joint in its positive
        direction; writes hardware/calibration.json (zero ticks and direction per joint)
    python experiments/hardware.py sysid-log --port /dev/ttyACM0 --joint r_elbow --out log.npz
        servo on the test pendulum: play the step schedule of homebot.sysid at 100 Hz and log
        commanded and measured positions; then ``python experiments/hardware.py sysid-fit log.npz``
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from homebot.hardware.feetech import TICKS_PER_REV, FeetechBus, MockSerial  # noqa: E402
from homebot.hardware.robot import Calibration, JointCal, joint_ratio  # noqa: E402
from homebot.layout import SERVO_IDS  # noqa: E402
from homebot.params import ARM_JOINTS, DEFAULT  # noqa: E402

STAGE_JOINTS = {
    "arm": [f"r_{j}" for j in ARM_JOINTS],
    "torso": [f"{s}_{j}" for s in ("r", "l") for j in ARM_JOINTS] + ["head_pan", "head_tilt"],
    "mobile": [f"{s}_{j}" for s in ("r", "l") for j in ARM_JOINTS] + ["head_pan", "head_tilt", "lift"],
}


def open_bus(args, ids=None) -> FeetechBus:
    if args.mock:
        return FeetechBus(serial=MockSerial(ids=ids or list(SERVO_IDS.values())))
    return FeetechBus(args.port)


def cmd_set_id(args):
    bus = open_bus(args, ids=[1])
    new = SERVO_IDS[args.joint]
    found = [i for i in range(1, 30) if bus.ping(i)]
    if len(found) != 1:
        raise SystemExit(f"connect exactly one servo (found ids {found})")
    bus.write_eeprom(found[0], "id", new)
    print(f"servo id {found[0]} -> {new} ({args.joint}); label it now")


def cmd_calibrate(args, ask=None):
    ask = ask or input
    joints = STAGE_JOINTS[args.stage]
    bus = open_bus(args, ids=[SERVO_IDS[j] for j in joints])
    missing = [j for j in joints if not bus.ping(SERVO_IDS[j])]
    if missing:
        raise SystemExit(f"no answer from {missing}")
    bus.sync_write("torque_enable", {SERVO_IDS[j]: 0 for j in joints})
    ask("Torque is off. Put the robot in its zero pose (arms hanging straight down, palms facing in, "
        "grippers closed, head level and forward), then press Enter.")
    zero = bus.sync_read("present_position", [SERVO_IDS[j] for j in joints])
    cal = Calibration()
    for j in joints:
        sid = SERVO_IDS[j]
        ask(f"Move {j} a little (10-30 deg) in its POSITIVE direction (see README), then press Enter.")
        now = bus.read(sid, "present_position")
        d = now - zero[sid]
        if d > TICKS_PER_REV / 2:
            d -= TICKS_PER_REV
        elif d < -TICKS_PER_REV / 2:
            d += TICKS_PER_REV
        if abs(d) < 20 and not args.mock:
            raise SystemExit(f"{j}: no motion seen ({d} ticks); try again")
        cal.joints[j] = JointCal(sid, int(zero[sid]), 1 if d >= 0 else -1, joint_ratio(DEFAULT, j))
    out = Path(args.out)
    cal.save(out)
    print(f"wrote {out}")
    return cal


def cmd_sysid_log(args):
    from homebot.sysid import schedule

    bus = open_bus(args, ids=[SERVO_IDS[args.joint]])
    sid = SERVO_IDS[args.joint]
    cmd = schedule(seed=args.seed)
    centre = bus.read(sid, "present_position")
    bus.write(sid, "torque_enable", 1)
    meas, t_log = [], []
    t0 = time.monotonic()
    for k, q in enumerate(cmd):
        bus.write(sid, "goal_position", int(round(centre + q * TICKS_PER_REV / (2 * math.pi))), wait_status=False)
        meas.append((bus.read(sid, "present_position") - centre) * 2 * math.pi / TICKS_PER_REV)
        t_log.append(time.monotonic() - t0)
        time.sleep(max(0.0, (k + 1) * 0.01 - (time.monotonic() - t0)))
    bus.write(sid, "torque_enable", 0)
    np.savez(args.out, cmd=cmd, meas=np.array(meas), t=np.array(t_log))
    print(f"wrote {args.out}: {len(cmd)} samples, mean period {np.mean(np.diff(t_log)) * 1000:.1f} ms")


def cmd_sysid_fit(args):
    from homebot.sysid import Rig, fit

    d = np.load(args.log)
    est = fit(d["cmd"], d["meas"], Rig(args.mass, args.length, args.bar_mass))
    print(json.dumps(est, indent=1))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", default="/dev/ttyACM0")
    ap.add_argument("--mock", action="store_true", help="simulated bus, no hardware")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("set-id")
    s.add_argument("--joint", required=True, choices=sorted(SERVO_IDS))
    s = sub.add_parser("calibrate")
    s.add_argument("--stage", default="arm", choices=list(STAGE_JOINTS))
    s.add_argument("--out", default=str(HERE.parent / "hardware" / "calibration.json"))
    s = sub.add_parser("sysid-log")
    s.add_argument("--joint", required=True, choices=sorted(SERVO_IDS))
    s.add_argument("--seed", type=int, default=0)
    s.add_argument("--out", default="sysid_log.npz")
    s = sub.add_parser("sysid-fit")
    s.add_argument("log")
    s.add_argument("--mass", type=float, default=0.5)
    s.add_argument("--length", type=float, default=0.15)
    s.add_argument("--bar-mass", type=float, default=0.03)
    args = ap.parse_args(argv)
    {"set-id": cmd_set_id, "calibrate": cmd_calibrate, "sysid-log": cmd_sysid_log,
     "sysid-fit": cmd_sysid_fit}[args.cmd](args)


if __name__ == "__main__":
    main()
