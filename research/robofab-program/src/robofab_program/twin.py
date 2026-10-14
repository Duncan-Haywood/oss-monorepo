"""A kinematic digital twin of a SCARA pick-and-place cell at four fidelity levels.

Levels L0, L1, L2 are what a program is *checked* against. REF is a held-out
parameter set with extra effects (hidden calibration offset, lower friction and
grip force, reach-dependent payload) standing in for "what happens when the
program runs for real". It is still a model: see README.md.
"""
from __future__ import annotations
import math
from dataclasses import dataclass
import numpy as np

L1, L2 = 0.30, 0.25                 # link lengths (m)
Q1_MAX, Q2_MAX = math.radians(160), math.radians(140)
HOME = (0.25, 0.25, 0.12)
Z_MAX = 0.15
G = 9.81
CUBE = 0.03


@dataclass(frozen=True)
class Task:
    name: str
    obj: tuple          # (x, y)
    mass: float         # kg
    goal: tuple         # (x, y)
    tol: float          # m
    deadline: float     # s
    walls: tuple = ()   # ((x0, y0, x1, y1, height), ...)


TASKS = {
    "move":  Task("move",  (0.30, 0.10), 0.20, (0.15, 0.30), 0.005, 8.0),
    "wall":  Task("wall",  (0.35, -0.05), 0.20, (0.35, 0.20), 0.005, 10.0, ((0.25, 0.07, 0.45, 0.09, 0.06),)),
    "heavy": Task("heavy", (0.30, 0.10), 0.50, (0.15, 0.30), 0.005, 6.0),
    "far":   Task("far",   (0.30, -0.10), 0.25, (0.45, 0.25), 0.005, 8.0),
}


@dataclass(frozen=True)
class Level:
    name: str
    joint_checks: bool       # joint limits, joint speed, payload, deadline
    stochastic: bool         # grasp jaw clearance, placement noise, slip, grip build-up
    grasp_radius: float      # m: how far from the cube the tip may be at GRIP
    jaw: float = 0.006       # m, stochastic levels
    cal_sigma: float = 0.0   # std of calibration offset the checker believes (m)
    cal_fixed: tuple = (0.0, 0.0)  # hidden fixed offset (m), REF only
    repeat_sigma: float = 0.0
    mu: float = 0.5
    grip_force: float = 20.0
    grip_wait: float = 0.10  # s needed after GRIP before moving
    payload: str = "flat"    # 'flat' (1.0 kg) or 'derated' with reach


LEVELS = {
    "L0": Level("L0", False, False, 0.008),
    "L1": Level("L1", True, False, 0.008),
    "L2": Level("L2", True, True, 0.008, cal_sigma=0.001, repeat_sigma=0.0005),
    "REF": Level("REF", True, True, 0.008, cal_fixed=(0.0015, -0.0010), repeat_sigma=0.0008,
                 mu=0.4, grip_force=18.0, grip_wait=0.15, payload="derated"),
}
JOINT_SPEED = 4.0       # rad/s, L1 and above
GRIP_TIME = 0.2         # s, GRIP and RELEASE
P_PASS = 0.95
N_MC = 200


def parse_program(text: str):
    """Lines: MOVE x y z t | GRIP | RELEASE | WAIT t ; '#' starts a comment."""
    ops = []
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.split("#")[0].strip()
        if not line:
            continue
        w = line.split()
        op = w[0].upper()
        if op == "MOVE" and len(w) == 5:
            ops.append(("MOVE", tuple(float(v) for v in w[1:]), n))
        elif op in ("GRIP", "RELEASE") and len(w) == 1:
            ops.append((op, (), n))
        elif op == "WAIT" and len(w) == 2:
            ops.append(("WAIT", (float(w[1]),), n))
        else:
            raise ValueError(f"line {n}: cannot parse {raw!r}")
    return ops


def ik(x, y):
    """Elbow-positive inverse kinematics; None if out of reach."""
    r2 = x * x + y * y
    c2 = (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2)
    if abs(c2) > 1:
        return None
    q2 = math.acos(c2)
    q1 = math.atan2(y, x) - math.atan2(L2 * math.sin(q2), L1 + L2 * math.cos(q2))
    return q1, q2


def _minjerk(tau):
    return 10 * tau**3 - 15 * tau**4 + 6 * tau**5


def _payload_max(level: Level, r):
    return 1.0 if level.payload == "flat" else 1.0 - 0.9 * (r / (L1 + L2)) ** 2


def _in_wall(x, y, z, walls):
    for x0, y0, x1, y1, h in walls:
        m = CUBE / 2
        if x0 - m <= x <= x1 + m and y0 - m <= y <= y1 + m and z < h + 0.005:
            return True
    return False


def _simulate(ops, task: Task, level: Level):
    """Deterministic pass: returns violations, and grasp/release events."""
    viol = []   # (code, line)
    pos = np.array(HOME, float)
    t_now, held, placed = 0.0, False, False
    obj_pos = np.array(task.obj, float)
    since_grip = None
    grasp = release = None
    for op, a, line in ops:
        if op == "WAIT":
            t_now += a[0]
            if since_grip is not None:
                since_grip += a[0]
        elif op == "GRIP":
            t_now += GRIP_TIME
            if held:
                viol.append(("double_grip", line))
            elif np.hypot(*(pos[:2] - obj_pos)) <= level.grasp_radius and pos[2] <= 0.02 and not placed:
                held, since_grip = True, 0.0
                grasp = (pos[:2].copy(), line)
            else:
                viol.append(("grip_miss", line))
        elif op == "RELEASE":
            t_now += GRIP_TIME
            if not held:
                viol.append(("release_empty", line))
            else:
                held = False
                if pos[2] > 0.03:
                    viol.append(("drop", line))
                release = (pos[:2].copy(), line)
                placed = True
                obj_pos = pos[:2].copy()
        else:  # MOVE
            tgt = np.array(a[:3]); T = a[3]
            if T <= 0:
                viol.append(("bad_duration", line)); continue
            if not (0.0 <= tgt[2] <= Z_MAX):
                viol.append(("z_range", line))
            tau = np.linspace(0, 1, 41)
            pts = pos[None, :] + _minjerk(tau)[:, None] * (tgt - pos)[None, :]
            q = []
            ok = True
            for p in pts:
                s = ik(p[0], p[1])
                if s is None:
                    ok = False; break
                q.append(s)
            if not ok:
                viol.append(("unreachable", line))
            else:
                q = np.array(q)
                if level.joint_checks:
                    if np.any(np.abs(q[:, 0]) > Q1_MAX) or np.any(q[:, 1] > Q2_MAX):
                        viol.append(("joint_limit", line))
                    dq = np.abs(np.diff(q, axis=0)) / (T / 40)
                    if dq.max() > JOINT_SPEED:
                        viol.append(("joint_speed", line))
                    if held:
                        rmax = np.hypot(pts[:, 0], pts[:, 1]).max()
                        if task.mass > _payload_max(level, rmax):
                            viol.append(("payload", line))
            if any(_in_wall(p[0], p[1], p[2], task.walls) for p in pts):
                viol.append(("collision", line))
            if held and level.stochastic:
                if since_grip is not None and since_grip < level.grip_wait:
                    viol.append(("premature_move", line))
                d = tgt - pos
                a_xy = 5.77 * np.hypot(d[0], d[1]) / T**2
                a_z = 5.77 * d[2] / T**2
                load = task.mass * math.hypot(G + a_z, a_xy)
                if load > 2 * level.mu * level.grip_force:
                    viol.append(("slip", line))
            if held:
                obj_pos = tgt[:2].copy()
            since_grip = None if since_grip is None or not held else since_grip + T
            t_now += T
            pos = tgt
    if not placed:
        viol.append(("not_placed", 0))
    if held:
        viol.append(("still_held", 0))
    if level.joint_checks and t_now > task.deadline:
        viol.append(("deadline", 0))
    return viol, grasp, release, t_now


def check(text: str, task_name: str, level_name: str, seed: int = 0):
    """Return dict(pass, p_success, violations, time). Pass needs no violation and p >= 0.95."""
    task, level = TASKS[task_name], LEVELS[level_name]
    ops = parse_program(text)
    viol, grasp, release, t = _simulate(ops, task, level)
    codes = sorted({c for c, _ in viol})
    p = None
    if not level.stochastic:
        if release is not None and not any(c in ("grip_miss", "drop", "not_placed") for c in codes):
            if np.hypot(*(release[0] - np.array(task.goal))) > task.tol:
                codes.append("wrong_place")
        p = None if codes else 1.0
    else:
        if grasp is not None and release is not None and not codes:
            rng = np.random.default_rng(seed)
            cal = rng.normal(0, level.cal_sigma, (N_MC, 2)) if level.cal_sigma else np.zeros((N_MC, 2))
            cal = cal + np.array(level.cal_fixed)
            eg = grasp[0] + cal + rng.normal(0, level.repeat_sigma, (N_MC, 2)) - np.array(task.obj)
            ep = release[0] + cal + rng.normal(0, level.repeat_sigma, (N_MC, 2)) - np.array(task.goal)
            ok = (np.hypot(eg[:, 0], eg[:, 1]) <= level.jaw) & (np.hypot(ep[:, 0], ep[:, 1]) <= task.tol)
            p = float(ok.mean())
            if p < P_PASS:
                codes.append("grasp_or_place_error")
        else:
            p = None  # not computed: a deterministic violation already failed the program
    return {"pass": not codes, "p_success": p, "violations": codes, "time": t}
