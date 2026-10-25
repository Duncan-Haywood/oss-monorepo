"""Milestone 3b (LOG.md): the 3a sweep at a 4x longer budget (3,840 inner steps per worker), H in {sync, 4, 16, 64},
inner lr fixed at 3a's picks (picks.json). Usage: python3 long_budget.py   (4 processes; rerun skips finished cells)."""
import json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import h_sweep

h_sweep.STEPS = 3840
HS, SEEDS = [0, 4, 16, 64], [0, 1, 2]

if __name__ == "__main__":
    path = os.path.join(HERE, "long_budget.jsonl")
    done = {(r["H"], r["seed"]) for r in map(json.loads, open(path))} if os.path.exists(path) else set()
    pick = json.load(open(os.path.join(HERE, "picks.json")))
    jobs = [(H, pick[str(H)], s) for H in HS for s in SEEDS if (H, s) not in done]
    with Pool(4) as p, open(path, "a") as f:
        for r in p.imap_unordered(h_sweep.run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
