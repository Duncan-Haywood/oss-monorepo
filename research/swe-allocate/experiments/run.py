"""Replay four track-allocation policies on the committed project scores.

Input: experiments/scores.csv (copied from swe-value: lines added, pass_A, pass_B per project).
Arms: tracks with at least 6 projects (the pre-track 'other' pool is not a choice).
Value: pass_A or pass_B (1 to 3). Cost: lines added. Budget: 20000 lines, 300 seeds.
"""
import csv, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "swe-ledger", "src"))
from swe_ledger.ledger import track_of
from swe_allocate.policies import *

rows = list(csv.DictReader(open(os.path.join(HERE, "scores.csv"))))
BUDGET, SEEDS = 20000, 300

def pools_for(col):
    p = {}
    for r in rows:
        t = track_of(r["slug"]); c = float(r["lines_added"])
        if t != "other" and c > 0:
            p.setdefault(t, []).append((float(r[col]), c))
    return {t: v for t, v in p.items() if len(v) >= 6}

def spearman(xs, ys):
    def rk(a):
        o = sorted(range(len(a)), key=lambda i: a[i]); r = [0] * len(a)
        for k, i in enumerate(o): r[i] = k
        return r
    a, b = rk(xs), rk(ys); n = len(a); ma = mb = (n - 1) / 2
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return num / (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5

out = []
for col in ("pass_A", "pass_B"):
    pools = pools_for(col)
    cmax = max(c for p in pools.values() for _, c in p)
    out.append(f"== value = {col}; arms: " + ", ".join(f"{t} (n={len(p)}, value/1000 lines {1000*sum(v for v,_ in p)/sum(c for _,c in p):.2f})" for t, p in sorted(pools.items())))
    best, ratio = oracle_ratio(pools)
    out.append(f"oracle (all budget on best arm {best}): {ratio*BUDGET:.1f} value points per {BUDGET} lines")
    for cls in (Uniform, Greedy, Thompson, KnapsackUCB):
        res = [run_once(cls, pools, BUDGET, s, cmax)[0] for s in range(SEEDS)]
        m, lo, hi = mean_ci(res)
        out.append(f"{cls.name:13s} mean {m:6.1f}  95% CI [{lo:6.1f}, {hi:6.1f}]  ({m/(ratio*BUDGET):.0%} of oracle)")
    out.append("")

# Is the stationary-arm assumption plausible? Within each track, does value per 1000 lines fall with commit order?
ordered = sorted(rows, key=lambda r: r["first_added"])
out.append("== drift check: Spearman rho of order vs value per 1000 lines, within track (pass_A); negative = diminishing returns")
for t in sorted(pools_for("pass_A")):
    xs = [r for r in ordered if track_of(r["slug"]) == t and float(r["lines_added"]) > 0]
    ys = [1000 * float(r["pass_A"]) / float(r["lines_added"]) for r in xs]
    out.append(f"{t:10s} n={len(xs):3d} rho={spearman(list(range(len(xs))), ys):+.2f}")
text = "\n".join(out)
open(os.path.join(HERE, "results.txt"), "w").write(text + "\n"); print(text)
