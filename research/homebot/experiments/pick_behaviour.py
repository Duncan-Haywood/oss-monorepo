"""How do the pick policies grasp, and can they reach cubes close to the post?

1. Tilt of the gripper from vertical when both jaws first touch the cube (50 episodes on the
   nominal twin).
2. Success on cubes placed less than 0.26 m in front of the post, where the scripted top-down
   grasp (experiments/scripted_pick.py) finds no IK solution (the first 30 such episodes).

    PYTHONPATH=src python experiments/pick_behaviour.py <run dir> [<run dir> ...]
    # -> results/pick_behaviour.json
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from homebot.envs import ArmPick  # noqa: E402

NEAR = 0.26  # m in front of the post


def _load(run: Path):
    import torch
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

    torch.set_num_threads(1)
    model = PPO.load(run / "policy.zip", device="cpu")
    env = ArmPick(seed=0)
    venv = VecNormalize.load(str(run / "vecnormalize.pkl"), DummyVecEnv([lambda: env]))
    venv.training = False
    return model, env, venv


def _episode(model, env, venv, seed, on_step=None):
    venv.seed(seed)
    obs = venv.reset()
    done = False
    while not done:
        a, _ = model.predict(obs, deterministic=True)
        obs, _, d, info = venv.step(a)
        done = bool(d[0])
        if on_step is not None and not done:
            on_step()
    return info[0]


def grasp_tilts(model, env, venv, episodes=50, seed=10_000) -> list[float]:
    hand = env.model.body("r_hand").id
    out = []
    for ep in range(episodes):
        tilt = []

        def check():
            if not tilt and all(env._touching()):
                down = -env.data.xmat[hand].reshape(3, 3)[:, 2]  # the hand points along its -z
                tilt.append(math.degrees(math.acos(float(np.clip(-down[2], -1, 1)))))

        _episode(model, env, venv, seed + ep, check)
        out += tilt
    return out


def near_post(model, env, venv, n=30, seed=20_000, max_tries=400) -> list[bool]:
    out, ep = [], 0
    while len(out) < n and ep < max_tries:
        venv.seed(seed + ep)
        venv.reset()
        ep += 1
        if env.cube_pos()[0] >= NEAR:
            continue
        out.append(bool(_episode(model, env, venv, seed + ep - 1)["is_success"]))
    return out


def main(runs):
    res = {}
    for r in map(Path, runs):
        model, env, venv = _load(r)
        t = grasp_tilts(model, env, venv)
        near = near_post(model, env, venv)
        res[r.name] = {"grasps": len(t), "tilt_from_vertical_deg_median": float(np.median(t)),
                       "tilt_deg_p10_p90": [float(np.percentile(t, 10)), float(np.percentile(t, 90))],
                       "near_post_episodes": len(near), "near_post_success": float(np.mean(near))}
        print(r.name, res[r.name], flush=True)
    (HERE / "results" / "pick_behaviour.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])
