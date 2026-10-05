"""Engineering checks and twin statistics reported in the README.

    PYTHONPATH=src python experiments/analyze.py     # ~8 min; writes results/analysis.json

1. torque budget of the arm joints (own weight + rated payload) vs continuous and peak torque
2. payload capacity at full / 80 % / 60 % horizontal reach
3. tip-over margins and acceleration limits of the mobile robot
4. bill-of-materials totals
5. system identification on synthetic step responses (recovery error over random servos)
6. model sizes and simulation speed of the environments
7. mesh interference of the printed parts and servos over every arm joint's range (needs
   cadquery; ~4 min)
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

import mujoco  # noqa: E402

from homebot.analysis import bom, stability, torque  # noqa: E402
from homebot.envs import ENVS  # noqa: E402
from homebot.mjcf import build_xml  # noqa: E402
from homebot.params import DEFAULT  # noqa: E402
from homebot.sysid import PARAMS, Rig, fit, nominal, synthetic_log  # noqa: E402


def sysid_study(n=8, seed=0, rig=Rig()):
    rng = np.random.default_rng(seed)
    rows = []
    for k in range(n):
        f = np.exp(rng.uniform(np.log(0.5), np.log(2.0), len(PARAMS)))
        true = {p: v * fk for (p, v), fk in zip(nominal().items(), f)}
        cmd, meas = synthetic_log(true, seed=100 + k, rig=rig)
        t0 = time.time()
        est = fit(cmd, meas, rig=rig)
        rows.append({"true": true, "est": {p: est[p] for p in PARAMS}, "rmse_rad": est["rmse_rad"],
                     "rel_err": {p: est[p] / true[p] - 1 for p in PARAMS}, "seconds": time.time() - t0})
        print(f"sysid {k}: max |rel err| {max(abs(v) for v in rows[-1]['rel_err'].values()) * 100:.1f}%", flush=True)
    worst = {p: max(abs(r["rel_err"][p]) for r in rows) for p in PARAMS}
    return {"trials": rows, "worst_rel_err": worst}


def model_stats():
    out = {}
    for variant in ("arm", "torso", "mobile"):
        m = mujoco.MjModel.from_xml_string(build_xml(DEFAULT, variant))
        out[variant] = {"mass_kg": float(m.body_subtreemass[0]), "actuators": int(m.nu), "dof": int(m.nv),
                        "bodies": int(m.nbody)}
    m = mujoco.MjModel.from_xml_string(build_xml(DEFAULT, "mobile", "free"))
    out["mobile_rollers"] = {"mass_kg": float(m.body_subtreemass[0]), "actuators": int(m.nu), "dof": int(m.nv),
                             "bodies": int(m.nbody)}
    speed = {}
    for name, cls in ENVS.items():
        env = cls(seed=0)
        env.reset(seed=0)
        n, t0 = 0, time.time()
        while time.time() - t0 < 5.0:
            _, _, term, trunc, _ = env.step(env.action_space.sample())
            n += 1
            if term or trunc:
                env.reset()
        speed[name] = {"control_steps_per_s": n / (time.time() - t0), "obs_dim": int(env.observation_space.shape[0]),
                       "act_dim": int(env.action_space.shape[0]), "control_hz": 1 / env.dt}
    out["env_speed_single_core"] = speed
    return out


def interference_study():
    try:
        from homebot.cad import interference
    except ImportError:  # cadquery not installed
        return None
    sweep = interference.sweep(DEFAULT, n=25)
    out = {j: {"range": r["range"], "all_free": r["all_free"], "worst_overlap_mm3": max(r["overlap_mm3"])}
           for j, r in sweep.items()}
    for j in ("elbow", "wrist_pitch"):
        out[j]["clear_beyond_range"] = interference.margin(DEFAULT, j)
    for j, r in out.items():
        print(f"interference {j:15s} {'clear' if r['all_free'] else 'INTERFERES'} "
              f"(worst {r['worst_overlap_mm3']:.0f} mm^3) {r.get('clear_beyond_range', '')}", flush=True)
    return out


def main():
    res = {}
    t0 = time.time()
    res["torque_budget"] = torque.budget(DEFAULT, n_samples=20000)
    res["payload_capacity"] = {c: torque.payload_capacity(DEFAULT, c) for c in ("continuous", "peak")}
    print("torque done", flush=True)
    res["stability"] = stability.table(DEFAULT)
    res["bom"] = bom.totals()
    res["sysid"] = sysid_study()
    res["sysid_light_rig"] = sysid_study(rig=Rig(arm_mass=0.10, arm_length=0.10, bar_mass=0.015))
    res["model"] = model_stats()
    res["interference"] = interference_study()
    res["seconds"] = time.time() - t0
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    (out / "analysis.json").write_text(json.dumps(res, indent=1))
    for r in res["torque_budget"]["rows"]:
        unit = "N" if r["joint"] == "gripper" else "N*m"
        print(f"{r['joint']:15s} worst {r['worst_no_payload']:.2f} / {r['worst_payload']:.2f} {unit} "
              f"(cont {r['continuous_limit']:.2f}, peak {r['peak_limit']:.2f})")
    print(json.dumps(res["payload_capacity"], indent=1))
    print(json.dumps(res["bom"], indent=1))
    print(json.dumps(res["model"], indent=1))
    print("sysid worst rel err", res["sysid"]["worst_rel_err"])
    print("sysid (light rig) worst rel err", res["sysid_light_rig"]["worst_rel_err"])


if __name__ == "__main__":
    main()
