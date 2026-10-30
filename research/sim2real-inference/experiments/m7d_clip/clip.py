"""Milestone 7d: real-only empirical-Bernstein lower bound on E[min(R, c)] with c a twin quantile, on the m7c cost pools.
python3 clip.py [reps]  ->  results/clip.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7d)"""
import csv, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m7c_cost", "results", "pool.csv")
NS, QS, SEED = (30, 60, 120, 240), (0.99, 0.999), 71


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def eb_lower(x, delta):
    """One-sided empirical-Bernstein lower bound (Maurer and Pontil 2009, Thm 11), values in [0, 1]."""
    n = len(x)
    return x.mean() - np.sqrt(2 * x.var(ddof=1) * np.log(2 / delta) / n) - 7 * np.log(2 / delta) / (3 * (n - 1))


def run(R, c, n, reps, rng):
    y = np.minimum(R, c) / c
    truth_clip = y.mean() * c
    cov = gap = 0.0
    for _ in range(reps):
        x = y[rng.choice(len(y), n, replace=False)]
        L = eb_lower(x, 0.05) * c
        cov += L <= truth_clip
        gap += R.mean() - L
    return 100 * cov / reps, gap / reps


if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    D = load(); T = D["twin"]
    rng = np.random.default_rng(SEED)
    rows = []
    for name, R in D.items():
        if name == "twin":
            continue
        for q in QS:
            c = float(np.quantile(T, q))
            above = 100 * float((R > c).mean())
            bias = (R.mean() - np.minimum(R, c).mean()) / R.mean()
            for n in NS:
                cov, gap = run(R, c, n, reps, rng)
                rows.append([name, q, n, round(R.mean(), 4), round(c, 3), round(above, 2), round(bias, 4),
                             round(cov, 2), round(gap / R.mean(), 3)])
    hdr = ["pair", "q", "n", "mean_R", "c", "pct_R_above_c", "clip_bias_rel", "cov_clip", "rel_gap"]
    with open(os.path.join(HERE, "results", "clip.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(hdr); w.writerows(rows)
    out = []
    s = [r for r in rows if r[1] == 0.99 and r[2] == 240]
    out.append(f"H7d-i: q=0.99, real share above c > 3% on {sum(r[5] > 3 for r in s)}/21 pairs; max {max(r[5] for r in s)}%, median {np.median([r[5] for r in s])}%")
    s = [r for r in rows if r[1] == 0.999 and r[2] == 240]
    out.append(f"H7d-ii: q=0.999, clip bias < 5% on {sum(r[6] < 0.05 for r in s)}/21 pairs; median {np.median([r[6] for r in s]):.4f}, max {max(r[6] for r in s):.4f}")
    for q in QS:
        for n in NS:
            s = [r for r in rows if r[1] == q and r[2] == n]
            out.append(f"q={q} n={n}: median rel gap {np.median([r[8] for r in s]):.3f} (min {min(r[8] for r in s):.3f}, max {max(r[8] for r in s):.3f}); min coverage of E[min(R,c)] {min(r[7] for r in s)}%")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))
