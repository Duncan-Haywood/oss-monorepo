"""No quantile of the per-candidate excess g bounds halving regret in general (milestone 43).
Runs no flow. Writes quantile_counterexample_results.txt. Usage: python3 quantile_counterexample.py"""
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound  # noqa: E402


def g_values(s, y, k):
    ly = [math.log(v) for v in y]
    out = []
    for x in range(len(s)):
        vals = sorted((max(0.0, ly[z] - ly[x]) for z in range(len(s)) if z != x and s[z] <= s[x]), reverse=True)
        out.append(vals[k - 1] if len(vals) >= k else 0.0)
    return out


def quantile(v, q):
    v = sorted(v)
    return v[min(len(v) - 1, math.ceil(q * len(v)) - 1)]


def instance(n, c):
    """n candidates, one cut to n // 3. Candidate 0 is the pool optimum (y = 1) and the rung ranks it last; the rest
    have y = c and are ranked by index. Every other candidate has only equal-y rivals ahead of it, so its g is 0."""
    y = [1.0] + [c] * (n - 1)
    s = [n] + list(range(n - 1))
    return s, y


def row(n, c, qs=(0.5, 0.9, 0.95, 0.99)):
    s, y = instance(n, c)
    keep = n // 3
    reg = math.log(bound.halve([s], y, [keep], random.Random(0))) - math.log(min(y))
    g = g_values(s, y, keep)
    return reg, {q: quantile(g, q) for q in qs}, g[0], max(g)


if __name__ == "__main__":
    out = ["n, c, realised regret (log), quantile bound at q=0.5/0.9/0.95/0.99, g at the optimum, max g"]
    for n, c in ((30, 2.0), (30, 10.0), (60, 2.0), (300, 2.0), (3000, 2.0)):
        reg, qb, g0, gm = row(n, c)
        out.append(f"{n}, {c}, {reg:.3f}, " + "/".join(f"{qb[q]:.3f}" for q in qb) + f", {g0:.3f}, {gm:.3f}")
    text = "\n".join(out)
    print(text)
    (HERE / "quantile_counterexample_results.txt").write_text(text + "\n")
