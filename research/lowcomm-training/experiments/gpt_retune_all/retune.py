"""Milestone 3d (3c tuned only H=16 and 64): re-tune the inner lr at the 3,840-step budget of 3b for H in {sync, 4, 16, 64}, then report seeds 0 to 2 at the picks.
Usage: python3 retune.py tune   (24 runs, tuning seeds 100, 101)   then   python3 retune.py report   (seeds 0 to 2 at the picks;
reuses 3b's runs where the pick equals 3b's lr). Results append to retune.jsonl."""
import json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gpt_long_budget"))
from long_budget import run, HS, TUNE_SEEDS, REPORT_SEEDS  # same model, data, budget and validation batches as 3b

LRS = [1e-3, 2e-3, 4e-3]
PATH = os.path.join(HERE, "retune.jsonl")
OLD = os.path.join(HERE, "..", "gpt_long_budget", "long_budget.jsonl")


def load(p):
    return [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def mean_loss(rows, H, lr, seeds):
    v = [r["loss"] for r in rows if r["H"] == H and r["lr"] == lr and r["seed"] in seeds]
    return sum(v) / len(v) if len(v) == len(seeds) else None


def picks(rows):
    out = {}
    for H in HS:
        sc = {lr: mean_loss(rows, H, lr, TUNE_SEEDS) for lr in LRS}
        out[H] = min(sc, key=lambda lr: sc[lr])
    return out


if __name__ == "__main__":
    rows = load(PATH)
    have = {(r["H"], r["lr"], r["seed"]) for r in rows} | {(r["H"], r["lr"], r["seed"]) for r in load(OLD)}
    if sys.argv[1] == "tune":
        jobs = [(H, lr, s) for H in HS for lr in LRS for s in TUNE_SEEDS]
    else:
        pk = picks(rows)
        print("picks", pk)
        jobs = [(H, pk[H], s) for H in HS for s in REPORT_SEEDS]
    jobs = [j for j in jobs if j not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
