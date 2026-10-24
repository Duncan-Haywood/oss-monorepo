"""Train a PPO policy on a homebot task and evaluate it against twin perturbations.

    PYTHONPATH=src python experiments/train.py --env ArmReach --steps 2000000 --dr --seed 0
    PYTHONPATH=src python experiments/train.py --env ArmReach --eval-only runs/ArmReach_dr_s0

Writes runs/<env>_<nominal|dr>_s<seed>/ with the policy, the observation normaliser,
the learning curve (progress.csv) and eval.json: success rate and final distance on the
nominal twin and on every perturbed twin in ``homebot.envs.GAPS``.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from homebot.envs import ENVS, GAPS, Randomization  # noqa: E402


def make_env(name, randomize, gap=None, seed=0, camera_model=False):
    def thunk():
        from stable_baselines3.common.monitor import Monitor

        R = Randomization(camera_model=camera_model) if randomize else None
        env = ENVS[name](randomize=R, gap=gap, seed=seed)
        return Monitor(env, info_keywords=("is_success",))

    return thunk


def evaluate(model, vecnorm_path, name, episodes=100, seed=10_000, gaps=None):
    """Deterministic rollouts on fixed twin perturbations; returns {gap: metrics}."""
    from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize

    out = {}
    all_gaps = getattr(ENVS[name], "gaps", GAPS)
    for gap in gaps or all_gaps:
        venv = DummyVecEnv([make_env(name, False, all_gaps[gap], seed)])
        venv = VecNormalize.load(str(vecnorm_path), venv)
        venv.training = False
        venv.norm_reward = False
        succ, dist, tipped, lift = [], [], 0, []
        venv.seed(seed)
        obs = venv.reset()
        done_eps = 0
        while done_eps < episodes:
            act, _ = model.predict(obs, deterministic=True)
            obs, _, dones, infos = venv.step(act)
            if dones[0]:
                info = infos[0]
                succ.append(bool(info.get("is_success", False)))
                dist.append(float(info.get("distance", np.nan)))
                tipped += int(info.get("tipped", False))
                if "max_lift" in info:
                    lift.append(float(info["max_lift"]))
                done_eps += 1
        venv.close()
        n = len(succ)
        out[gap] = {
            "episodes": n,
            "success_rate": float(np.mean(succ)),
            "success_ci95": float(1.96 * np.sqrt(max(np.mean(succ) * (1 - np.mean(succ)), 1e-12) / n)),
            "final_distance_median_m": float(np.median(dist)),
            "final_distance_mean_m": float(np.mean(dist)),
            "tipped": tipped,
        }
        if lift:
            out[gap]["ever_lifted_5cm"] = float(np.mean(np.array(lift) >= 0.05))
        print(f"  {gap:16s} success {out[gap]['success_rate']:.2f} ± {out[gap]['success_ci95']:.2f}  "
              f"median dist {out[gap]['final_distance_median_m'] * 1000:.1f} mm  tipped {tipped}", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default="ArmReach", choices=list(ENVS))
    ap.add_argument("--steps", type=int, default=2_000_000)
    ap.add_argument("--dr", action="store_true", help="train with domain randomisation")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--n-envs", type=int, default=8)
    ap.add_argument("--eval-episodes", type=int, default=100)
    ap.add_argument("--out", default=str(HERE / "runs"))
    ap.add_argument("--eval-only", default=None)
    ap.add_argument("--eval-also", nargs="*", default=[],
                    help="other envs with the same spaces to evaluate on (e.g. MobileReachRollers)")
    ap.add_argument("--eval-also-gaps", nargs="*", default=["nominal", "combined"])
    ap.add_argument("--gaps", nargs="*", default=None,
                    help="with --eval-only: evaluate only these twins and merge them into eval.json")
    ap.add_argument("--ent-coef", type=float, default=0.0, help="PPO entropy bonus")
    ap.add_argument("--variant", default="", help="label for a training-setting ablation (part of the run tag)")
    ap.add_argument("--camera-model", action="store_true",
                    help="ArmPick: train on the camera observation model (Randomization.camera_model)")
    args = ap.parse_args()

    import torch
    from stable_baselines3 import PPO
    from stable_baselines3.common.logger import configure
    from stable_baselines3.common.vec_env import SubprocVecEnv, VecNormalize

    torch.set_num_threads(1)
    if args.eval_only:
        run = Path(args.eval_only)
        model = PPO.load(run / "policy.zip", device="cpu")
        out = json.loads((run / "eval.json").read_text()) if (run / "eval.json").exists() else {}
        for name in [args.env] + args.eval_also:
            print(f"eval on {name}", flush=True)
            gaps = None if name == args.env else args.eval_also_gaps
            out.setdefault("cross_eval" if name != args.env else "eval", {})
            if name == args.env and args.gaps:
                gaps = args.gaps
            res = evaluate(model, run / "vecnormalize.pkl", name, args.eval_episodes, gaps=gaps)
            if name == args.env:
                out["eval"] = {**out.get("eval", {}), **res} if args.gaps else res
            else:
                out["cross_eval"][name] = res
        (run / "eval.json").write_text(json.dumps(out, indent=2))
        return

    tag = f"{args.env}_{'dr' if args.dr else 'nominal'}{'_' + args.variant if args.variant else ''}_s{args.seed}"
    run = Path(args.out) / tag
    run.mkdir(parents=True, exist_ok=True)
    venv = SubprocVecEnv([make_env(args.env, args.dr, None, args.seed * 1000 + i, args.camera_model)
                          for i in range(args.n_envs)])
    venv = VecNormalize(venv, norm_obs=True, norm_reward=True, gamma=0.98, clip_obs=10.0)
    episode_steps = ENVS[args.env].episode_steps
    model = PPO(
        "MlpPolicy", venv, seed=args.seed, device="cpu", verbose=0,
        n_steps=512, batch_size=1024, n_epochs=10, learning_rate=3e-4, gamma=0.98 if episode_steps <= 100 else 0.99,
        gae_lambda=0.95, clip_range=0.2, ent_coef=args.ent_coef, max_grad_norm=0.5,
        policy_kwargs=dict(net_arch=dict(pi=[256, 256], vf=[256, 256]), log_std_init=-0.5),
    )
    model.set_logger(configure(str(run), ["csv"]))
    t0 = time.time()
    model.learn(total_timesteps=args.steps, progress_bar=False)
    wall = time.time() - t0
    model.save(run / "policy.zip")
    venv.save(str(run / "vecnormalize.pkl"))
    venv.close()
    print(f"{tag}: trained {args.steps} steps in {wall / 60:.1f} min", flush=True)
    res = evaluate(model, run / "vecnormalize.pkl", args.env, args.eval_episodes)
    meta = {"env": args.env, "dr": args.dr, "variant": args.variant, "ent_coef": args.ent_coef,
            "camera_model": args.camera_model,
            "seed": args.seed, "steps": args.steps, "wall_minutes": wall / 60,
            "n_envs": args.n_envs, "torch_threads": 1, "cpu_count": os.cpu_count()}
    out = {"meta": meta, "eval": res, "cross_eval": {}}
    for name in args.eval_also:
        print(f"cross-eval on {name}", flush=True)
        out["cross_eval"][name] = evaluate(model, run / "vecnormalize.pkl", name, args.eval_episodes,
                                           gaps=args.eval_also_gaps)
    (run / "eval.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
