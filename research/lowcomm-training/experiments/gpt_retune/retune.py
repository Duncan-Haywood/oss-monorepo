"""Milestone 3c: re-tune the inner lr at the 3,840-step budget for H = 16 and 64 (3b reused 3a's picks, tuned at 960 steps), then
re-report with fresh picks on seeds 0 to 2. Usage: python3 retune.py tune | report   (4 processes; results appended to retune.jsonl)."""
import json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gpt_long_budget"))
from long_budget import run  # same model, data, M, B, STEPS as 3b

HS = [16, 64]
LRS = [3e-4, 1e-3, 3e-3]
TUNE_SEEDS, REPORT_SEEDS = [100, 101], [0, 1, 2]
PATH = os.path.join(HERE, "retune.jsonl")


def rows():
    return [json.loads(l) for l in open(PATH)] if os.path.exists(PATH) else []


if __name__ == "__main__":
    mode = sys.argv[1]
    done = {(r["H"], r["lr"], r["seed"]) for r in rows()}
    if mode == "tune":
        jobs = [(H, lr, s) for H in HS for lr in LRS for s in TUNE_SEEDS]
    else:
        tune = [r for r in rows() if r["seed"] in TUNE_SEEDS]
        pick = {}
        for H in HS:
            m = {lr: sum(r["loss"] for r in tune if r["H"] == H and r["lr"] == lr) / len(TUNE_SEEDS) for lr in LRS}
            pick[H] = min(m, key=m.get)
        json.dump({str(k): v for k, v in pick.items()}, open(os.path.join(HERE, "picks.json"), "w"))
        jobs = [(H, pick[H], s) for H in HS for s in REPORT_SEEDS]
    jobs = [j for j in jobs if j not in done]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
