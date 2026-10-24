"""Where does a pick policy fail? Success against each randomised factor.

Runs a trained ArmPick policy deterministically on 300 randomised twins (the training
distribution, fixed seeds) and tabulates success by cube size, mass, pad friction, action
latency, cube-pose error and cube position.

    PYTHONPATH=src python experiments/pick_diagnosis.py experiments/runs/ArmPick_dr_s0
    # -> results/pick_diagnosis_<run>.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from homebot.envs import ArmPick, Randomization  # noqa: E402

BINS = {
    "size": [0.030, 0.035, 0.040, 0.045, 0.050],
    "mass": [0.03, 0.06, 0.10, 0.20],
    "pad_friction": [0.5, 0.7, 0.9, 1.2],
    "latency_steps": [-0.5, 0.5, 1.5, 2.5],
    "pose_error": [0.0, 0.004, 0.008, 0.03],
    "x": [0.24, 0.29, 0.34, 0.40],
    "y": [-0.32, -0.23, -0.14, -0.04],
}


def episodes(run: Path, n: int = 300, seed: int = 5000) -> list[dict]:
    import torch
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

    torch.set_num_threads(1)
    model = PPO.load(run / "policy.zip", device="cpu")
    env = ArmPick(randomize=Randomization(), seed=123)
    venv = VecNormalize.load(str(run / "vecnormalize.pkl"), DummyVecEnv([lambda: env]))
    venv.training = False
    rows = []
    for ep in range(n):
        venv.seed(seed + ep)
        obs = venv.reset()
        m = env.model
        p = {"size": env.half * 2, "mass": float(m.body_mass[env._cube_body]),
             "pad_friction": float(m.geom_friction[env._pads[0], 0]), "latency_steps": env._latency,
             "pose_error": float(np.linalg.norm(env._pose_bias)), "x": float(env.cube_pos()[0]),
             "y": float(env.cube_pos()[1])}
        done = False
        while not done:
            a, _ = model.predict(obs, deterministic=True)
            obs, _, d, info = venv.step(a)
            done = bool(d[0])
        i = info[0]
        p.update(success=bool(i["is_success"]), max_lift=float(i["max_lift"]), dropped=bool(i["dropped"]))
        rows.append(p)
    return rows


def table(rows: list[dict]) -> dict:
    ok = np.array([r["success"] for r in rows])
    out = {"success": float(ok.mean()), "episodes": len(rows),
           "ever_lifted_5cm": float(np.mean([r["max_lift"] >= 0.05 for r in rows])),
           "dropped": float(np.mean([r["dropped"] for r in rows])), "by": {}}
    for k, b in BINS.items():
        v = np.array([r[k] for r in rows])
        out["by"][k] = [{"from": b[j], "to": b[j + 1], "n": int(((v >= b[j]) & (v < b[j + 1])).sum()),
                         "success": float(ok[(v >= b[j]) & (v < b[j + 1])].mean()) if ((v >= b[j]) & (v < b[j + 1])).any()
                         else None} for j in range(len(b) - 1)]
    return out


def main(run_dir: str):
    run = Path(run_dir)
    res = table(episodes(run))
    out = HERE / "results" / f"pick_diagnosis_{run.name}.json"
    out.write_text(json.dumps(res, indent=1))
    print(f"{run.name}: success {res['success']:.2f} on {res['episodes']} randomised twins")
    for k, rows in res["by"].items():
        print(f"  {k:14s} " + "  ".join(f"[{r['from']:g},{r['to']:g}) {r['success']:.2f} (n={r['n']})"
                                        for r in rows if r["success"] is not None))


if __name__ == "__main__":
    main(sys.argv[1])
