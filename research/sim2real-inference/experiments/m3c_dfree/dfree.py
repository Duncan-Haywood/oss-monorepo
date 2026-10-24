"""Milestone 3c: empirical-Bernstein (distribution-free) intervals for the control-variate estimand vs real-only, on the m3 pools.
python3 dfree.py [reps]  ->  results/dfree.csv, results/summary_3c.txt   (pre-registration: LOG.md, 2026-10-24 milestone 3c)"""
import csv, os, sys
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
NS, SEED = (30, 60), 23


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def eb(x, rng_width, delta):
    """Maurer and Pontil (2009) empirical Bernstein half-width for the mean of n iid values in an interval of width rng_width."""
    n = len(x)
    return np.sqrt(2 * x.var(ddof=1) * np.log(2 / delta) / n) + 7 * rng_width * np.log(2 / delta) / (3 * (n - 1))


def intervals(r, t, ex):
    n = len(r)
    e0 = r.mean()
    h0 = eb(r, 1.0, 0.05)
    n1 = n // 3
    dt = t[:n1] - t[:n1].mean()
    lam = float(np.clip((dt * (r[:n1] - r[:n1].mean())).sum() / max((dt ** 2).sum(), 1e-12), 0, 1))
    z = r[n1:] - lam * t[n1:]
    tall = np.concatenate([t, ex])
    e1 = z.mean() + lam * tall.mean()
    h1 = eb(z, 1 + lam, 0.025) + lam * eb(tall, 1.0, 0.025)
    return (e0 - h0, e0 + h0), (e1 - h1, e1 + h1)


def run(args):
    name, n, reps, seed = args
    R, T = DATA[name], DATA["twin"]
    rng = np.random.default_rng(seed)
    truth, m = R.mean(), 9 * n
    c0 = c1 = 0
    w0 = w1 = 0.0
    for _ in range(reps):
        idx = rng.choice(len(R), n + m, replace=False)
        a, b = intervals(R[idx[:n]], T[idx[:n]], T[idx[n:]])
        c0 += a[0] <= truth <= a[1]; c1 += b[0] <= truth <= b[1]
        w0 += a[1] - a[0]; w1 += b[1] - b[0]
    rho = float(np.corrcoef(R, T)[0, 1])
    return [name, n, round(rho, 3), round(100 * c0 / reps, 2), round(100 * c1 / reps, 2), round(w0 / reps, 4), round(w1 / reps, 4), round(w1 / w0, 3)]


DATA = load()

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    pairs = [k for k in DATA if k != "twin"]
    jobs = [(p, n, reps, SEED * 1000 + 17 * i + n) for i, p in enumerate(pairs) for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "dfree.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pair", "n", "rho", "cov_real_eb", "cov_cv_eb", "width_real_eb", "width_cv_eb", "width_ratio"])
        w.writerows(rows)
    L = [f"reps per cell: {reps}"]
    for n in NS:
        s = [r for r in rows if r[1] == n]
        L.append(f"n={n}: coverage min real-EB {min(r[3] for r in s):.2f}, cv-EB {min(r[4] for r in s):.2f}; "
                 f"width ratio cv/real mean {np.mean([r[7] for r in s]):.3f}, min {min(r[7] for r in s):.3f}, max {max(r[7] for r in s):.3f}")
    L.append("H3b-i (all coverages >= 95.0): " + ("supported" if all(min(r[3], r[4]) >= 95.0 for r in rows) else "refuted: " + str([(r[0], r[1]) for r in rows if min(r[3], r[4]) < 95.0])))
    hi = [r for r in rows if r[1] == 60 and r[2] >= 0.85]
    lo = [r for r in rows if r[1] == 60 and r[2] < 0.3]
    a = all(r[7] < 1 for r in hi); b = all(r[7] > 1 for r in lo)
    L.append(f"H3b-ii high-rho pairs (n=60, rho>=0.85, {len(hi)} pairs) ratio<1 on all: {a}; low-rho pairs ({len(lo)} pairs, rho<0.3) ratio>1 on all: {b} -> " + ("supported" if a and b else "refuted"))
    L += [f"  {r[0]:12s} n={r[1]} rho={r[2]:.2f} ratio={r[7]:.3f}" for r in sorted(rows, key=lambda r: (r[1], r[2]))]
    open(os.path.join(HERE, "results", "summary_3c.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
