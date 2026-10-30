"""Milestone 4c: do the m4 intervals survive resampling whole tasks / policies instead of cells?
python3 cluster.py -> results/summary_4c.txt   (pre-registration: ../../LOG.md, 2026-10-26 milestone 4c)
Point estimates are m4's (leave-one-cell-out calibration fixed on the full 36 cells); only the resampling unit changes."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m4_simpler"))
from data import rows, check
from analyse import loo_predictions, stats

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

def summary(R, real, n, sim, raw, cal, ix):
    m_cal, v_real, pq = stats(real[ix], n[ix], cal[ix])
    r = np.corrcoef(real[ix], sim[ix])[0, 1]
    return m_cal, (pq / m_cal if m_cal > 0 else np.inf), r

def main():
    assert not check(), check()
    R = rows()
    n = np.array([x[3] for x in R], float); real = np.array([x[4] for x in R]); sim = np.array([x[5] for x in R])
    raw, cal = loo_predictions(R)
    N = len(R)
    pt = summary(R, real, n, sim, raw, cal, np.arange(N))
    rng = np.random.default_rng(0)
    B = 4000
    tasks = sorted({x[1] for x in R}); pols = sorted({x[2] for x in R})
    tix = {t: np.array([i for i, x in enumerate(R) if x[1] == t]) for t in tasks}
    pix = {p: np.array([i for i, x in enumerate(R) if x[2] == p]) for p in pols}
    def boot(kind):
        out = []
        for _ in range(B):
            if kind == "cell":
                ix = rng.integers(0, N, N)
            elif kind == "task":
                ix = np.concatenate([tix[t] for t in rng.choice(tasks, len(tasks))])
            elif kind == "policy":
                ix = np.concatenate([pix[p] for p in rng.choice(pols, len(pols))])
            else:  # two-way: resample tasks and policies, keep cells in both draws (with multiplicity)
                ts = rng.choice(tasks, len(tasks)); ps = rng.choice(pols, len(pols))
                ix = np.array([i for t in ts for i in tix[t] if R[i][2] in set(ps) for _ in range(list(ps).count(R[i][2]))])
                if len(ix) < 4: continue
            out.append(summary(R, real, n, sim, raw, cal, ix))
        return np.array(out)
    L = ["Milestone 4c: m4 point estimates (%d cells, %d tasks, %d policies) with intervals from four resampling units, %d resamples, 95%% percentile" % (N, len(tasks), len(pols), B),
         "point: MSE_cal %.4f  n* %.1f  r %.3f" % pt, ""]
    L.append("%-8s %-28s %-24s %-24s %s" % ("unit", "MSE_cal", "n*", "r", "share n*>30"))
    for kind in ["cell", "task", "policy", "twoway"]:
        a = boot(kind)
        f = np.isfinite(a[:, 1])
        def ci(k, m=slice(None)):
            v = a[m, k]; v = v[np.isfinite(v)]; return np.percentile(v, [2.5, 97.5])
        c0, c1, c2 = ci(0), ci(1), ci(2)
        L.append("%-8s [%.4f, %.4f]            [%.1f, %.1f]            [%.3f, %.3f]       %.3f (infinite n*: %.3f)" % (kind, *c0, *c1, *c2, np.mean(a[f, 1] > 30), 1 - f.mean()))
    open(os.path.join(OUT, "summary_4c.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))

if __name__ == "__main__":
    main()
