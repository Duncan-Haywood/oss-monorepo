"""Run policies trained on an earlier version of the robot on the current twin.

The v1 policies (pivoting jaw, direct-drive elbow) are in git history:

    git show c6562c97:research/homebot/experiments/runs/ArmReach_dr_s0/policy.zip > ...
    # or: git worktree add /tmp/v1 c6562c97 and point --runs at its experiments/runs
    PYTHONPATH=src python experiments/cross_version.py --runs /tmp/v1/research/homebot/experiments/runs

Writes results/v1_policies_on_v2.json: success on the nominal, 80 ms latency and combined
twins (100 episodes each, the evaluation seeds of train.py).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))

RUNS = (("ArmReach_dr_s0", "ArmReach"), ("BimanualReach_dr_s0", "BimanualReach"), ("MobileReach_dr_s0", "MobileReach"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", required=True, help="directory holding the old <env>_dr_s0 runs")
    ap.add_argument("--out", default=str(HERE / "results" / "v1_policies_on_v2.json"))
    args = ap.parse_args()

    import torch
    from stable_baselines3 import PPO

    from train import evaluate

    torch.set_num_threads(1)
    out = {}
    for run, env in RUNS:
        d = Path(args.runs) / run
        model = PPO.load(d / "policy.zip", device="cpu")
        print(run, flush=True)
        out[run] = evaluate(model, d / "vecnormalize.pkl", env, 100, gaps=["nominal", "latency_80ms", "combined"])
        Path(args.out).write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
