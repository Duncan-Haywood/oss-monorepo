"""Can the gripper pick something up? A scripted top-down pick in the twin (no learning).

A 4 cm, 60 g cube is placed at random on the table in front of the single-arm build.
Damped-least-squares IK on the 7 arm joints (position + orientation, gripper pointing down,
jaws across the cube) gives waypoints; the servos are driven through them: pre-grasp 8 cm
above, open to 60 mm, descend, close (target fully closed, so the servo squeezes at its torque
limit), lift 12 cm. The tool centre point is midway between the pads.
Success = cube held clear of the table (>= 5 cm up) and between the jaws after the lift. The
servos' proportional position loop droops under load, so the hand ends below the commanded
lift height; that droop is reported too.

    PYTHONPATH=src python experiments/scripted_pick.py    # ~1 min; writes results/scripted_pick.json
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import mujoco
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from homebot.mjcf import build_xml  # noqa: E402
from homebot.params import ARM_JOINTS, ARM_RANGES, DEFAULT  # noqa: E402

TABLE_TOP = 0.75
CUBE = 0.02  # half size
CUBE_XML = (f'<body name="cube" pos="0.25 -0.2 {TABLE_TOP + CUBE}"><freejoint/>'
            f'<geom name="cube" type="box" size="{CUBE} {CUBE} {CUBE}" mass="0.06" rgba="0.2 0.5 0.9 1" '
            f'friction="1.0 0.01 0.001"/></body>')
JOINTS = [f"r_{j}" for j in ARM_JOINTS[:-1]]
OPEN = 0.030  # per jaw: 60 mm between the pads


def ik(m, d, pos, yaw, q0, restarts=8, seed=0):
    """Best of several damped-least-squares solves (from ``q0`` and random seeds)."""
    rng = np.random.default_rng(seed)
    best = None
    for k in range(restarts):
        q = q0.copy()
        if k:
            for j in JOINTS:
                lo, hi = ARM_RANGES[j[2:]]
                q[m.joint(j).qposadr[0]] = rng.uniform(lo, hi)
        sol, err = _ik(m, pos, yaw, q)
        if best is None or err < best[1]:
            best = (sol, err)
        if err < 1e-3:
            break
    return best


def _ik(m, pos, yaw, q0, iters=400, damping=0.05):
    """Joint angles putting the TCP at ``pos`` with the gripper pointing down, rotated ``yaw``."""
    d = mujoco.MjData(m)
    d.qpos[:] = q0
    site = m.site("r_tcp").id
    dofs = [m.joint(j).dofadr[0] for j in JOINTS]
    qadr = [m.joint(j).qposadr[0] for j in JOINTS]
    c, s = math.cos(yaw), math.sin(yaw)
    R_goal = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])  # hand frame = world frame at zero pose
    jp = np.zeros((3, m.nv))
    jr = np.zeros((3, m.nv))
    for _ in range(iters):
        mujoco.mj_kinematics(m, d)
        mujoco.mj_comPos(m, d)
        ep = pos - d.site_xpos[site]
        R = d.site_xmat[site].reshape(3, 3)
        Re = R_goal @ R.T
        er = 0.5 * np.array([Re[2, 1] - Re[1, 2], Re[0, 2] - Re[2, 0], Re[1, 0] - Re[0, 1]])
        if np.linalg.norm(ep) < 5e-4 and np.linalg.norm(er) < 5e-3:
            break
        mujoco.mj_jacSite(m, d, jp, jr, site)
        J = np.vstack([jp[:, dofs], 0.3 * jr[:, dofs]])
        e = np.concatenate([ep, 0.3 * er])
        dq = J.T @ np.linalg.solve(J @ J.T + damping ** 2 * np.eye(6), e)
        for k, a in enumerate(qadr):
            lo, hi = ARM_RANGES[JOINTS[k][2:]]
            d.qpos[a] = np.clip(d.qpos[a] + dq[k], lo, hi)
    mujoco.mj_kinematics(m, d)
    err = float(np.linalg.norm(pos - d.site_xpos[site]))
    return np.array([d.qpos[a] for a in qadr]), err


def drive(m, d, act, q_from, q_to, grip, seconds):
    n = int(seconds / (m.opt.timestep * 20))
    for k in range(1, n + 1):
        q = q_from + (q_to - q_from) * min(1.0, k / (0.7 * n))
        d.ctrl[act] = q
        d.ctrl[m.actuator("r_gripper").id] = grip
        mujoco.mj_step(m, d, 20)


def trial(rng, m):
    d = mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m, d, 0)
    cx, cy = rng.uniform(0.18, 0.34), rng.uniform(-0.30, -0.08)
    yaw_cube = rng.uniform(-0.6, 0.6)
    cj = m.joint(m.body("cube").jntadr[0]).qposadr[0]
    d.qpos[cj:cj + 3] = [cx, cy, TABLE_TOP + CUBE]
    d.qpos[cj + 3:cj + 7] = [math.cos(yaw_cube / 2), 0, 0, math.sin(yaw_cube / 2)]
    mujoco.mj_forward(m, d)
    act = np.array([m.actuator(j).id for j in JOINTS])
    q_home = np.array([d.joint(j).qpos[0] for j in JOINTS])
    # Jaws close along x of the hand frame; align them with a pair of cube faces.
    yaw = yaw_cube
    above, e1 = ik(m, d, np.array([cx, cy, TABLE_TOP + CUBE + 0.08]), yaw, d.qpos.copy())
    q_tmp = d.qpos.copy()
    for k, j in enumerate(JOINTS):
        q_tmp[m.joint(j).qposadr[0]] = above[k]
    grasp, e2 = ik(m, d, np.array([cx, cy, TABLE_TOP + CUBE + 0.003]), yaw, q_tmp)
    for k, j in enumerate(JOINTS):
        q_tmp[m.joint(j).qposadr[0]] = grasp[k]
    lift, e3 = ik(m, d, np.array([cx, cy, TABLE_TOP + CUBE + 0.12]), yaw, q_tmp)
    if max(e1, e2, e3) > 0.01:
        return {"ok": False, "reason": "ik", "ik_err": max(e1, e2, e3), "pos": [cx, cy]}
    drive(m, d, act, q_home, above, OPEN, 2.0)
    drive(m, d, act, above, grasp, OPEN, 1.5)
    drive(m, d, act, grasp, grasp, 0.0, 1.5)
    drive(m, d, act, grasp, lift, 0.0, 2.0)
    z = float(d.qpos[cj + 2])
    tcp = d.site("r_tcp").xpos
    held = z > TABLE_TOP + CUBE + 0.05 and np.linalg.norm(tcp[:2] - d.qpos[cj:cj + 2]) < 0.04
    droop = float(TABLE_TOP + CUBE + 0.12 - tcp[2])
    opening = 2 * float(d.joint("r_gripper").qpos[0])
    slip = float(TABLE_TOP + CUBE + 0.12 - droop - z)  # how far the cube sits below where the hand put it
    return {"ok": bool(held), "cube_z_above_table": z - TABLE_TOP - CUBE, "tcp_droop_m": droop,
            "slip_m": slip, "pos": [cx, cy], "yaw": yaw_cube, "jaw_opening_m": opening,
            "gripper_force_n": float(d.actuator("r_gripper").force[0])}


def main(n=40, seed=0):
    m = mujoco.MjModel.from_xml_string(build_xml(DEFAULT, "arm", extra_world=CUBE_XML))
    rng = np.random.default_rng(seed)
    rows = [trial(rng, m) for _ in range(n)]
    ok = sum(r["ok"] for r in rows)
    ik_fail = sum(r.get("reason") == "ik" for r in rows)
    droop = [r["tcp_droop_m"] for r in rows if "tcp_droop_m" in r]
    slip = [r["slip_m"] for r in rows if r["ok"]]
    print(f"picked {ok}/{n} (IK out of reach: {ik_fail}); hand droop at the lift pose: median "
          f"{np.median(droop) * 1000:.1f} mm, max {np.max(droop) * 1000:.1f} mm; slip of held cubes: median "
          f"{np.median(slip) * 1000:.1f} mm, max {np.max(slip) * 1000:.1f} mm")
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    (out / "scripted_pick.json").write_text(json.dumps({"success": ok, "trials": n, "ik_fail": ik_fail,
                                                        "droop_median_m": float(np.median(droop)),
                                                        "droop_max_m": float(np.max(droop)),
                                                        "slip_median_m": float(np.median(slip)),
                                                        "slip_max_m": float(np.max(slip)), "rows": rows}, indent=1))


if __name__ == "__main__":
    main()
