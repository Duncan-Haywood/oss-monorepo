"""No-model baseline: repair injected faults by random mutation + hill climbing.

For each task, take the session's passing round-1 design, inject k random token mutations
(k = 1, 2, 3; keep a mutant only if the checker rejects it), then run `mutation_search`
with a budget of evaluations. Reports, per k, the repair rate and the stage that first
rejected the injected fault. Deterministic: all randomness is seeded.
"""
import random
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_repair_baseline import check, mutation_search, task_names  # noqa: E402
from chip_repair_baseline.mutate import mutate  # noqa: E402

KS = (1, 2, 3)
SEEDS = (0, 1)
BUDGET = 60


def job(args):
    task, k, seed = args
    src = (ROOT / "attempts" / task / "round1.v").read_text()
    rng = random.Random(f"{task}-{k}-{seed}")
    for _ in range(200):  # find a rejected k-fault mutant
        m = src
        for _ in range(k):
            m = mutate(m, rng)
        r = check(task, m)
        if not r["ok"]:
            break
    else:
        return task, k, seed, None, None, None
    solved, used, _ = mutation_search(task, m, BUDGET, seed=seed)
    return task, k, seed, r["stage"], solved, used


def main():
    jobs = [(t, k, s) for t in task_names() for k in KS for s in SEEDS]
    with Pool(4) as p:
        rows = p.map(job, jobs)
    print("task k seed rejected_by repaired evals_used")
    for r in rows:
        print(*r)
    print()
    for k in KS:
        sub = [r for r in rows if r[1] == k and r[3] is not None]
        ok = sum(1 for r in sub if r[4])
        stages = Counter(r[3] for r in sub)
        print(f"k={k}: repaired {ok}/{len(sub)} within {BUDGET} evaluations; rejected by {dict(stages)}")


if __name__ == "__main__":
    main()
