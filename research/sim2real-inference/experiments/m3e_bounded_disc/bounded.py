"""Milestone 3e: bounded-discrepancy one-sided lower bound on E[R] vs real-only empirical Bernstein, on the m3 pools.
python3 bounded.py [reps]  ->  results/bounded.csv, results/summary_3e.txt   (pre-registration: LOG.md, 2026-10-24 milestone 3e)"""
import csv, os, sys
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
NS, SEED = (30, 60, 120, 240), 31


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def eb_lower(x, delta):
    """One-sided empirical-Bernstein lower bound (Maurer and Pontil 2009, Thm 11), values in [0, 1]."""
    n = len(x)
    return x.mean() - np.sqrt(2 * x.var(ddof=1) * np.log(2 / delta) / n) - 7 * np.log(2 / delta) / (3 * (n - 1))


def bounded_lower(r, t, tall):
    n = len(r)
    k = n // 3
    d = r - t
    b = float(np.abs(d[:k]).max())
    gamma = 1 - 0.01 ** (1 / k)
    dc = np.clip(d[k:], -b, b)
    h_d = 2 * b * np.sqrt(np.log(1 / 0.02) / (2 * len(dc)))
    h_t = np.sqrt(np.log(1 / 0.02) / (2 * len(tall)))
    return tall.mean() - h_t + dc.mean() - h_d - gamma, b, gamma


def run(args):
    name, n, reps, seed = args
    R, T = DATA[name], DATA["twin"]
    rng = np.random.default_rng(seed)
    truth, m = R.mean(), 9 * n
    c0 = c1 = 0
    g0 = g1 = bs = gs = 0.0
    for _ in range(reps):
        idx = rng.choice(len(R), n + m, replace=False)
        r, t = R[idx[:n]], T[idx[:n]]
        l0 = eb_lower(r, 0.05)
        l1, b, gam = bounded_lower(r, t, T[idx])
        c0 += l0 <= truth; c1 += l1 <= truth
        g0 += truth - l0; g1 += truth - l1; bs += b; gs += gam
    rho = float(np.corrcoef(R, T)[0, 1])
    return [name, n, round(rho, 3), round(100 * c0 / reps, 2), round(100 * c1 / reps, 2),
            round(g0 / reps, 4), round(g1 / reps, 4), round(bs / reps, 3), round(gs / reps, 3)]


DATA = load()

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    pairs = [k for k in DATA if k != "twin"]
    jobs = [(p, n, reps, SEED * 1000 + 17 * i + n) for i, p in enumerate(pairs) for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    hdr = ["pair", "n", "rho", "cov_real_eb", "cov_bounded", "gap_real_eb", "gap_bounded", "mean_b", "mean_gamma"]
    with open(os.path.join(HERE, "results", "bounded.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(hdr); w.writerows(rows)
    out = []
    for n in NS:
        s = [r for r in rows if r[1] == n]
        out.append(f"n={n}: min coverage real-EB {min(r[3] for r in s)}, bounded {min(r[4] for r in s)}; "
                   f"bounded tighter on {sum(r[6] < r[5] for r in s)}/21 pairs; mean gap real-EB {np.mean([r[5] for r in s]):.3f}, "
                   f"bounded {np.mean([r[6] for r in s]):.3f}; mean gamma {np.mean([r[8] for r in s]):.3f}")
        hi = [r for r in s if r[2] >= 0.85]
        out.append(f"   rho>=0.85 ({len(hi)} pairs): bounded tighter on {sum(r[6] < r[5] for r in hi)}")
    open(os.path.join(HERE, "results", "summary_3e.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))
