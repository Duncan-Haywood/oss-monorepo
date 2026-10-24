"""Static torque budget of the arms, computed on the MuJoCo twin.

For random arm configurations (and the worst case, arm straight out horizontally), the
holding torque of every joint is ``qfrc_bias + m g J_z^T`` (own weight plus a payload at the
tool centre point). It is compared with what the drive can give continuously (the servo's
*rated* torque, 10 kg*cm at 12 V on the datasheet, times the reduction) and at peak (stall
torque times the torque-limit register, times the reduction).
"""
from __future__ import annotations

import math

import mujoco
import numpy as np

from ..mjcf import build_xml
from ..params import ARM_JOINTS, ARM_RANGES, DEFAULT, Robot
from ..servo import KGCM

RATED_TORQUE = 10.0 * KGCM  # datasheet continuous rating of the 12 V STS3215 at the output


def _model(robot: Robot):
    m = mujoco.MjModel.from_xml_string(build_xml(robot, "arm", meshes=False))
    return m, mujoco.MjData(m)


def holding_torques(robot: Robot, q: dict, payload: float, m=None, d=None) -> dict:
    """Joint torques (N*m) needed to hold configuration ``q`` with ``payload`` kg at the TCP."""
    if m is None:
        m, d = _model(robot)
    mujoco.mj_resetData(m, d)
    for k, v in q.items():
        d.joint(k).qpos[0] = v
    mujoco.mj_forward(m, d)
    tau = d.qfrc_bias.copy()
    if payload:
        jac = np.zeros((3, m.nv))
        mujoco.mj_jacSite(m, d, jac, None, m.site("r_tcp").id)
        tau += payload * 9.81 * jac[2]
    return {j: float(tau[m.joint("r_" + j).dofadr[0]]) for j in ARM_JOINTS}


def limits(robot: Robot) -> dict:
    out = {}
    for j in ARM_JOINTS:
        dr = robot.arm_drive(j)
        cont = RATED_TORQUE * dr.ratio * dr.efficiency
        out[j] = {"continuous": cont, "peak": dr.max_effort}
    return out


def budget(robot: Robot = DEFAULT, payload: float | None = None, n_samples: int = 20000, seed: int = 0) -> dict:
    """Worst-case holding torque per joint over random configurations and over the
    horizontal-reach poses, without and with the rated payload."""
    payload = robot.arm.payload if payload is None else payload
    m, d = _model(robot)
    rng = np.random.default_rng(seed)
    lim = limits(robot)
    worst = {p: {j: 0.0 for j in ARM_JOINTS} for p in ("none", "payload")}
    poses = [
        {"r_shoulder_pitch": math.pi / 2},  # straight forward
        {"r_shoulder_roll": math.pi / 2},  # straight out sideways
        {"r_shoulder_pitch": math.pi / 2, "r_elbow": 0.0, "r_wrist_pitch": 0.0},
        {"r_shoulder_pitch": 0.0, "r_elbow": math.pi / 2},  # forearm horizontal
        {"r_shoulder_pitch": math.pi / 2, "r_wrist_pitch": math.pi / 2},
    ]
    for _ in range(n_samples):
        poses.append({f"r_{j}": rng.uniform(*ARM_RANGES[j]) for j in ARM_JOINTS[:-1]})
    for q in poses:
        for tag, pl in (("none", 0.0), ("payload", payload)):
            t = holding_torques(robot, q, pl, m, d)
            for j in ARM_JOINTS:
                worst[tag][j] = max(worst[tag][j], abs(t[j]))
    rows = []
    for j in ARM_JOINTS:
        rows.append({
            "joint": j,
            "worst_no_payload": worst["none"][j],
            "worst_payload": worst["payload"][j],
            "continuous_limit": lim[j]["continuous"],
            "peak_limit": lim[j]["peak"],
            "payload_vs_continuous": worst["payload"][j] / lim[j]["continuous"],
            "payload_vs_peak": worst["payload"][j] / lim[j]["peak"],
        })
    return {"payload_kg": payload, "samples": n_samples, "rows": rows}


def payload_capacity(robot: Robot = DEFAULT, criterion: str = "continuous", reach_fractions=(1.0, 0.8, 0.6)) -> list[dict]:
    """Largest payload (kg) held with the arm reaching straight forward and horizontal at a
    fraction of full reach (elbow bent to shorten), within the given limit on every joint."""
    m, d = _model(robot)
    lim = limits(robot)
    a = robot.arm
    upper = a.pitch_to_roll + a.roll_to_yaw + a.upper_arm
    lower = a.length - upper
    out = []
    for f in reach_fractions:
        # shoulder pitch and elbow such that the TCP is level with the shoulder at reach f*L
        L = f * a.length
        c = (L ** 2 - upper ** 2 - lower ** 2) / (2 * upper * lower)
        c = max(-1.0, min(1.0, c))
        el = math.acos(c)
        q = {"r_shoulder_pitch": math.pi / 2 - (math.atan2(lower * math.sin(el), upper + lower * math.cos(el))), "r_elbow": el}
        base = holding_torques(robot, q, 0.0, m, d)
        unit = holding_torques(robot, q, 1.0, m, d)
        cap = math.inf
        for j in ARM_JOINTS:
            per_kg = abs(unit[j] - base[j])
            room = lim[j][criterion] - abs(base[j])
            if per_kg > 1e-9:
                cap = min(cap, room / per_kg)
        mujoco.mj_resetData(m, d)
        for k, v in q.items():
            d.joint(k).qpos[0] = v
        mujoco.mj_forward(m, d)
        tcp = d.site("r_tcp").xpos
        sh = d.body("r_shoulder").xpos
        out.append({"reach_fraction": f, "horizontal_reach_m": float(np.hypot(tcp[0] - sh[0], tcp[1] - sh[1])),
                    "tcp_height_rel_shoulder_m": float(tcp[2] - sh[2]), "capacity_kg": max(0.0, cap)})
    return out
