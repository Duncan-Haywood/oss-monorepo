"""Milestone 3f: is sync under-tuned relative to H=16? Finer inner-lr grid {1.4e-3, 2.8e-3} (3d had {1e-3, 2e-3, 4e-3}) for
sync and H=16, tuning seeds 100, 101, then the same lrs on report seeds 0 to 2. The pick uses tuning seeds only.
Usage: python3 fine.py run   then   python3 fine.py report. Results append to fine.jsonl; report merges 3d's retune.jsonl."""
import json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gpt_long_budget"))
from long_budget import run  # same model, data, budget and validation batches as 3b, 3d, 3e

NEW_LRS, HS = [1.4e-3, 2.8e-3], [0, 16]
SEEDS = [100, 101, 0, 1, 2]
PATH = os.path.join(HERE, "fine.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def report():
    L = {(r["H"], r["lr"], r["seed"]): r["loss"] for r in load(PATH) + load(OLD)}
    lrs = sorted({k[1] for k in L if k[0] in HS and k[1] <= 4e-3})
    pick = {}
    for H in HS:
        tune = {lr: sum(L[(H, lr, s)] for s in (100, 101)) / 2 for lr in lrs if all((H, lr, s) in L for s in (100, 101))}
        pick[H] = min(tune, key=tune.get)
        print(f"H={H} tuning means:", {f"{lr:g}": round(v, 4) for lr, v in sorted(tune.items())}, "pick", f"{pick[H]:g}")
    for H in HS:
        v = [L[(H, pick[H], s)] for s in (0, 1, 2)]
        print(f"H={H} at pick: seeds 0-2", [round(x, 4) for x in v], f"mean {sum(v)/3:.4f}")
    d = [L[(16, pick[16], s)] - L[(0, pick[0], s)] for s in (0, 1, 2)]
    print("paired gap H16 - sync at own picks:", [round(x, 4) for x in d], f"mean {sum(d)/3:+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["H"], r["lr"], r["seed"]) for r in load(PATH)}
    jobs = [(H, lr, s) for s in SEEDS for lr in NEW_LRS for H in HS if (H, lr, s) not in have]
    jobs.sort(key=lambda j: j[2] not in (100, 101))  # tuning seeds first
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
