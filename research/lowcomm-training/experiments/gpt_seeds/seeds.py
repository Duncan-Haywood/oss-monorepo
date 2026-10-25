"""Milestone 3e: is 3d's H=16 < synchronous AdamW sign real? Same model, data, budget (3,840 steps) and inner lr (2e-3) as 3d,
sync and H=16 on seeds 3 to 10 (3d had seeds 0 to 2). Usage: python3 seeds.py run   then   python3 seeds.py report.
Results append to seeds.jsonl; report pools with 3d's seeds 0 to 2 (retune.jsonl)."""
import json, math, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gpt_long_budget"))
from long_budget import run  # same model, data, budget and validation batches as 3b and 3d

LR, SEEDS = 2e-3, list(range(3, 11))
PATH = os.path.join(HERE, "seeds.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")


def load(p):
    return [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def report():
    rows = load(PATH) + load(OLD)
    L = {(r["H"], r["seed"]): r["loss"] for r in rows if r["lr"] == LR}
    seeds = sorted(s for s in set(k[1] for k in L) if (0, s) in L and (16, s) in L and s < 100)
    d = [L[(16, s)] - L[(0, s)] for s in seeds]
    n = len(d); m = sum(d) / n; sd = math.sqrt(sum((x - m) ** 2 for x in d) / (n - 1)); se = sd / math.sqrt(n)
    from scipy import stats
    t = stats.t.ppf(0.975, n - 1)
    print("seeds", seeds)
    for H in (0, 16):
        v = [L[(H, s)] for s in seeds]; print(f"H={H}: mean {sum(v)/n:.4f}", [round(x, 4) for x in v])
    print(f"paired gap H16 - sync: mean {m:+.4f} sd {sd:.4f} se {se:.4f} 95% CI [{m - t*se:+.4f}, {m + t*se:+.4f}] n={n}")
    print(f"H16 better on {sum(x < 0 for x in d)} of {n} seeds; paired t p = {stats.ttest_1samp(d, 0).pvalue:.4f}; Wilcoxon p = {stats.wilcoxon(d).pvalue:.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["H"], r["lr"], r["seed"]) for r in load(PATH)}
    jobs = [(H, LR, s) for s in SEEDS for H in (0, 16) if (H, LR, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
