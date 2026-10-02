"""Tip-over margins of the mobile robot (static and under base acceleration).

The kiwi base stands on three wheel contacts at radius R, so its support polygon is a
triangle whose edges are only R/2 from the centre. The margin in a direction is how far
the centre of mass (projected on the floor) can move before it leaves the triangle; the
largest base acceleration before a wheel lifts is ``g * margin / h_com`` (point-mass ZMP).
"""
from __future__ import annotations

import math

import mujoco
import numpy as np

from ..envs.reach import support_margin_2d
from ..mjcf import build_xml
from ..params import DEFAULT, Robot


def _model(robot):
    m = mujoco.MjModel.from_xml_string(build_xml(robot, "mobile", "planar", meshes=False))
    return m, mujoco.MjData(m)


def com_and_margin(robot: Robot, q: dict, payload: float = 0.0, m=None, d=None):
    """(COM in the base frame, static margin) for a configuration, with ``payload`` kg in
    each hand that reaches."""
    if m is None:
        m, d = _model(robot)
    mujoco.mj_resetData(m, d)
    for k, v in q.items():
        d.joint(k).qpos[0] = v
    mujoco.mj_forward(m, d)
    base = m.body("base").id
    M = m.body_subtreemass[base]
    com = d.subtree_com[base] * M
    for s in ("r", "l"):
        if payload and any(k.startswith(s + "_") for k in q):
            com = com + payload * d.site(f"{s}_tcp").xpos
            M = M + payload
    com = com / M
    b = robot.base
    return com, support_margin_2d(com[:2], b.wheel_distance, b.wheel_angles), M


def accel_limit(robot: Robot, com, direction_deg: float) -> float:
    """Largest base acceleration (m/s^2) along ``direction_deg`` before tipping (ZMP leaves
    the triangle): acceleration a moves the ZMP by -h a / g."""
    b = robot.base
    u = np.array([math.cos(math.radians(direction_deg)), math.sin(math.radians(direction_deg))])
    lo, hi = 0.0, 50.0
    for _ in range(60):
        a = (lo + hi) / 2
        zmp = com[:2] - com[2] / 9.81 * a * u
        if support_margin_2d(zmp, b.wheel_distance, b.wheel_angles) > 0:
            lo = a
        else:
            hi = a
    return lo


POSES = {
    "arms_down": {},
    "both_reach_forward": {"r_shoulder_pitch": math.pi / 2, "l_shoulder_pitch": math.pi / 2},
    "right_reach_side": {"r_shoulder_roll": math.pi / 2},
    "right_reach_forward_low": {"r_shoulder_pitch": 2.2, "l_shoulder_pitch": 0.0},
}


def table(robot: Robot = DEFAULT, payload: float = 0.2) -> list[dict]:
    m, d = _model(robot)
    rows = []
    for lift in (0.0, robot.lift.travel / 2, robot.lift.travel):
        for name, pose in POSES.items():
            q = dict(pose, lift=lift)
            com, margin, M = com_and_margin(robot, q, payload if pose else 0.0, m, d)
            acc = {deg: accel_limit(robot, com, deg) for deg in (0, 90, 180, 270)}
            rows.append({"lift": lift, "pose": name, "mass": float(M), "com": com.round(4).tolist(),
                         "static_margin_m": margin, "accel_limit": acc, "min_accel_limit": min(acc.values())})
    return rows
