"""Render a trained policy's episode as a filmstrip (printed-part meshes).

    MUJOCO_GL=egl PYTHONPATH=src python experiments/filmstrip.py experiments/runs/ArmReach_dr_s0
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("MUJOCO_GL", "egl")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

import mujoco  # noqa: E402
import numpy as np  # noqa: E402

from homebot.envs import ENVS  # noqa: E402
from homebot.mjcf import build_xml  # noqa: E402
from homebot.render import montage, save_png, snapshot  # noqa: E402

VIEW = {"ArmReach": (215, -15, 1.1, (0.2, -0.15, 0.95)), "BimanualReach": (155, -22, 1.5, (0.25, 0, 0.95)),
        "MobileReach": (140, -18, 1.9, None), "ArmPick": (205, -18, 0.62, (0.30, -0.16, 0.87))}


def pick_seed(cls, lo=0.28, tries=50):
    """An episode whose target is out in front (over the table / away from the base)."""
    env = cls(seed=0)
    if not hasattr(env, "goals"):  # object tasks: the first seed
        return 0
    for s in range(tries):
        env.reset(seed=s)
        g = env.goals[0]
        far = (g[0] if env.variant != "mobile" else float(np.hypot(g[0], g[1])))
        if far > lo:
            return s
    return 0


def main(run_dir, frames=None, seed=None):
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

    run = Path(run_dir)
    env_name = run.name.split("_")[0]
    cls = ENVS[env_name]
    seed = pick_seed(cls) if seed is None else seed
    venv = VecNormalize.load(str(run / "vecnormalize.pkl"), DummyVecEnv([lambda: cls(seed=seed)]))
    venv.training = False
    model = PPO.load(run / "policy.zip", device="cpu")
    env = venv.venv.envs[0]
    # a mesh model with the same state layout for rendering
    vis = mujoco.MjModel.from_xml_string(build_xml(env.robot, env.variant, env.base_mode, meshes=True,
                                                   extra_world=env._extra_world()))
    vd = mujoco.MjData(vis)
    venv.seed(seed)
    obs = venv.reset()
    steps = env.episode_steps
    frames = frames or (6 if env_name == "ArmPick" else 5)
    keep = set(np.linspace(0, steps - 1, frames).astype(int))
    ims = []
    for t in range(steps):
        if t in keep:
            vd.qpos[:] = env.data.qpos
            vd.mocap_pos[:] = env.data.mocap_pos
            mujoco.mj_forward(vis, vd)
            az, el, dist, look = VIEW[env_name]
            if look is None:
                look = env.data.subtree_com[0].copy()
                look[2] = 0.6
            ims.append(snapshot(vis, vd, 360, 360, az, el, distance=dist, lookat=look, groups=(0, 1, 2),
                                hide_sites=False))
        act, _ = model.predict(obs, deterministic=True)
        obs, _, done, info = venv.step(act)
        if done[0]:
            break
    out = HERE.parent / "paper" / "figures" / f"filmstrip_{env_name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    save_png(montage(ims, cols=len(ims)), out)
    print(out, "final distance", info[0].get("distance"))


if __name__ == "__main__":
    main(sys.argv[1], seed=int(sys.argv[2]) if len(sys.argv) > 2 else None)
