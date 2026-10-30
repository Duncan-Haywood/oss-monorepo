"""Milestone 4f: real trials per policy needed to rank two policies as well as the SIMPLER twin does.
python3 ranking.py -> results/summary_4f.txt   (pre-registration: ../../LOG.md, 2026-10-26 milestone 4f)
Published real rates are treated as the truth for the real-trial arm (plug-in)."""
import itertools, os, sys
import numpy as np
from math import comb
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m4_simpler"))
from data import rows, check

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
MS = np.arange(1, 201)

def pmf(m, p):
    k = np.arange(m + 1)
    return np.array([comb(m, int(i)) for i in k], float) * p ** k * (1 - p) ** (m - k)

def acc_real(p_hi, p_lo, m, cache={}):
    """P(order of m-trial rates matches the true order), ties count 1/2."""
    key = (round(p_hi, 6), round(p_lo, 6), m)
    if key not in cache:
        a, b = pmf(m, p_hi), pmf(m, p_lo)
        cdf_b = np.cumsum(b)
        below = np.concatenate([[0], cdf_b[:-1]])
        cache[key] = float(np.sum(a * below) + 0.5 * np.sum(a * b))
    return cache[key]

def pairs(R, min_gap):
    out = []
    for t in sorted({x[1] for x in R}):
        cells = [x for x in R if x[1] == t]
        for a, b in itertools.combinations(cells, 2):
            gap = abs(a[4] - b[4])
            if gap < max(min_gap, 1e-9):
                continue
            hi, lo = (a, b) if a[4] > b[4] else (b, a)
            tw = 1.0 if hi[5] > lo[5] else 0.5 if hi[5] == lo[5] else 0.0
            out.append((t, hi[4], lo[4], tw))
    return out

def mrank(tw, cv):
    ok = np.nonzero(cv >= tw)[0]
    return int(MS[ok[0]]) if len(ok) else np.inf

def run(R, min_gap, rng):
    prs = pairs(R, min_gap)
    A = np.array([[acc_real(h, l, int(m)) for m in MS] for _, h, l, _ in prs])   # pair x m
    T = np.array([p[3] for p in prs]); task = np.array([p[0] for p in prs])
    pt = (len(prs), T.mean(), mrank(T.mean(), A.mean(0)))
    tasks = sorted(set(task)); ix = {t: np.nonzero(task == t)[0] for t in tasks}
    vals = []
    for _ in range(4000):
        sel = np.concatenate([ix[t] for t in rng.choice(tasks, len(tasks))])
        vals.append((T[sel].mean(), mrank(T[sel].mean(), A[sel].mean(0))))
    v = np.array(vals); fin = v[np.isfinite(v[:, 1])]
    return pt, np.percentile(v[:, 0], [2.5, 97.5]), np.percentile(fin[:, 1], [2.5, 97.5]), 1 - len(fin) / len(v), A.mean(0)

def main():
    assert not check(), check()
    R = rows(); rng = np.random.default_rng(0)
    lines = ["Milestone 4f: SIMPLER twin pairwise ranking accuracy versus real trials per policy; interval = 4,000 resamples of tasks, 95% percentile"]
    for gap in (0.0, 0.15):
        pt, ci_tw, ci_m, inf, cv = run(R, gap, rng)
        lines.append("real-gap >= %.2f: %d pairs, twin accuracy %.3f [%.3f, %.3f], m_rank %s [%.0f, %.0f] (infinite in %.3f of resamples)" % (
            gap, pt[0], pt[1], ci_tw[0], ci_tw[1], pt[2], ci_m[0], ci_m[1], inf))
        lines.append("   real-trial accuracy at m = 5, 10, 20, 30, 50, 100: " + ", ".join("%.3f" % cv[m - 1] for m in (5, 10, 20, 30, 50, 100)))
    open(os.path.join(OUT, "summary_4f.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
