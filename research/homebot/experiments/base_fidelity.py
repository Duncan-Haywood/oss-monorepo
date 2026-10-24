"""How far does the cheap planar base twin drift from the roller-wheel twin?

Both twins get the same random body-frame twist sequences (piecewise constant, 1-2.5 s
segments, ramped at the base acceleration limit, 12 s per trial). The planar twin moves
the base with ideal velocity servos on x, y, yaw; the roller twin spins three omni wheels
(20 passive rollers each, servo speed loop with back-EMF) at the kiwi inverse-kinematics
speeds and lets contact decide the motion. Reported: final position/heading gap, path RMSE,
the fraction of the commanded speed each twin achieves, and simulation speed.

    PYTHONPATH=src python experiments/base_fidelity.py   # ~3 min; writes results/base_fidelity.json
"""
from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import mujoco
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from homebot.hardware.robot import kiwi_wheel_speeds  # noqa: E402
from homebot.mjcf import build_xml  # noqa: E402
from homebot.params import DEFAULT  # noqa: E402

CTRL_DT = 0.04


def commands(rng, seconds=12.0):
    b = DEFAULT.base
    out, t = [], 0.0
    while t < seconds:
        dur = rng.uniform(1.0, 2.5)
        tw = np.array([rng.uniform(-1, 1) * b.max_speed, rng.uniform(-1, 1) * b.max_speed,
                       rng.uniform(-1, 1) * b.max_yaw_rate * 0.6])
        out.append((dur, tw))
        t += dur
    seq = []
    for dur, tw in out:
        seq += [tw] * int(round(dur / CTRL_DT))
    seq = np.array(seq[: int(seconds / CTRL_DT)])
    # acceleration ramp, as in the env and the driver
    ramp = np.zeros_like(seq)
    cur = np.zeros(3)
    step = np.array([b.max_accel, b.max_accel, b.max_yaw_accel]) * CTRL_DT
    for k, w in enumerate(seq):
        cur = cur + np.clip(w - cur, -step, step)
        ramp[k] = cur
    return ramp


def run_planar(seq):
    m = mujoco.MjModel.from_xml_string(build_xml(DEFAULT, "mobile", "planar"))
    d = mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m, d, 0)
    ids = [m.actuator(n).id for n in ("base_x", "base_y", "base_yaw")]
    qa = [m.joint(n).qposadr[0] for n in ("base_x", "base_y", "base_yaw")]
    n_sub = int(round(CTRL_DT / m.opt.timestep))
    path = []
    t0 = time.time()
    for vx, vy, wz in seq:
        yaw = d.qpos[qa[2]]
        c, s = math.cos(yaw), math.sin(yaw)
        d.ctrl[ids] = [c * vx - s * vy, s * vx + c * vy, wz]
        mujoco.mj_step(m, d, n_sub)
        path.append([d.qpos[qa[0]], d.qpos[qa[1]], d.qpos[qa[2]]])
    return np.array(path), len(seq) * CTRL_DT / (time.time() - t0)


def run_rollers(seq, robot=DEFAULT):
    m = mujoco.MjModel.from_xml_string(build_xml(robot, "mobile", "free", timestep=0.001))
    d = mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m, d, 0)
    wid = [m.actuator(f"wheel_{i}").id for i in range(3)]
    n_sub = int(round(CTRL_DT / m.opt.timestep))
    path, tilt = [], 0.0
    t0 = time.time()
    for tw in seq:
        d.ctrl[wid] = kiwi_wheel_speeds(DEFAULT, *tw)
        mujoco.mj_step(m, d, n_sub)
        q = d.qpos[3:7]
        yaw = math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] ** 2 + q[3] ** 2))
        tilt = max(tilt, 2 * math.asin(min(1.0, float(np.linalg.norm(q[1:3])))))
        path.append([d.qpos[0], d.qpos[1], yaw])
    return np.array(path), len(seq) * CTRL_DT / (time.time() - t0), tilt


def ideal(seq):
    x = np.zeros(3)
    out = []
    for vx, vy, wz in seq:
        c, s = math.cos(x[2]), math.sin(x[2])
        x = x + CTRL_DT * np.array([c * vx - s * vy, s * vx + c * vy, wz])
        out.append(x.copy())
    return np.array(out)


def kv_sweep(gains=(0.5, 2.0, 8.0, 32.0), trials=8, seed=1):
    """Sensitivity of the roller-vs-planar gap to the wheel servos' speed-loop gain (not on
    any datasheet; 0.5 N*m*s/rad is the default estimate)."""
    rng = np.random.default_rng(seed)
    seqs = [commands(rng) for _ in range(trials)]
    plan = [run_planar(s)[0] for s in seqs]
    out = {}
    for kv in gains:
        robot = DEFAULT.with_servo(kv=kv)
        gaps = []
        for s, P in zip(seqs, plan):
            Rr = run_rollers(s, robot)[0]
            dist = float(np.sum(np.linalg.norm(np.diff(ideal(s)[:, :2], axis=0), axis=1)))
            gaps.append((float(np.linalg.norm(Rr[-1, :2] - P[-1, :2])) / dist,
                         float(abs((Rr[-1, 2] - P[-1, 2] + np.pi) % (2 * np.pi) - np.pi))))
        g = np.array(gaps)
        out[str(kv)] = {"final_pos_per_m_mean": float(g[:, 0].mean()), "final_yaw_rad_mean": float(g[:, 1].mean())}
        print(f"kv {kv:5.1f}: final gap {100 * g[:, 0].mean():.1f}% of distance, heading {math.degrees(g[:, 1].mean()):.1f} deg",
              flush=True)
    return out


def main(trials=12, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for k in range(trials):
        seq = commands(rng)
        P, sp_planar = run_planar(seq)
        Rr, sp_roll, tilt = run_rollers(seq)
        I = ideal(seq)

        def gap(A, B):
            dpos = np.linalg.norm(A[:, :2] - B[:, :2], axis=1)
            dyaw = np.abs((A[:, 2] - B[:, 2] + np.pi) % (2 * np.pi) - np.pi)
            return float(dpos[-1]), float(np.sqrt(np.mean(dpos ** 2))), float(dyaw[-1])

        dist = float(np.sum(np.linalg.norm(np.diff(I[:, :2], axis=0), axis=1)))
        row = {"trial": k, "commanded_path_m": dist,
               "planar_vs_ideal": gap(P, I), "rollers_vs_ideal": gap(Rr, I), "rollers_vs_planar": gap(Rr, P),
               "planar_realtime_x": sp_planar, "rollers_realtime_x": sp_roll, "rollers_max_tilt_rad": tilt}
        rows.append(row)
        print(f"trial {k}: path {dist:.2f} m | final gap rollers-planar {row['rollers_vs_planar'][0] * 100:.1f} cm, "
              f"heading {math.degrees(row['rollers_vs_planar'][2]):.1f} deg | planar-ideal "
              f"{row['planar_vs_ideal'][0] * 100:.2f} cm | speed planar {sp_planar:.0f}x rollers {sp_roll:.1f}x", flush=True)
    summ = {}
    for key in ("planar_vs_ideal", "rollers_vs_ideal", "rollers_vs_planar"):
        arr = np.array([r[key] for r in rows])
        summ[key] = {"final_pos_m_mean": float(arr[:, 0].mean()), "final_pos_m_max": float(arr[:, 0].max()),
                     "path_rmse_m_mean": float(arr[:, 1].mean()), "final_yaw_rad_mean": float(arr[:, 2].mean()),
                     "final_pos_per_m_travelled": float(np.mean(arr[:, 0] / [r["commanded_path_m"] for r in rows]))}
    summ["planar_realtime_x"] = float(np.mean([r["planar_realtime_x"] for r in rows]))
    summ["rollers_realtime_x"] = float(np.mean([r["rollers_realtime_x"] for r in rows]))
    summ["rollers_max_tilt_rad"] = float(max(r["rollers_max_tilt_rad"] for r in rows))
    summ["kv_sweep"] = kv_sweep()
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    (out / "base_fidelity.json").write_text(json.dumps({"summary": summ, "trials": rows}, indent=1))
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main()
