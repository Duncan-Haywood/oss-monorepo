"""Milestone 3f: failure-rate upper bound, twin-informed vs Clopper-Pearson, on the m3 pools.
python3 failrate.py [reps]  ->  results/failrate.csv, results/summary_3f.txt   (pre-registration: LOG.md, 2026-10-24 milestone 3f)
Failure = outcome < TAU. Twin-informed: p <= P(T fails) + P(R fails, T passes), each bounded by an exact interval."""
import csv, os, sys
import numpy as np
from scipy.stats import beta
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
NS, SEED, TAU, EPS = (30, 60, 120, 240), 37, 0.65, 0.20


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def cp_upper(k, n, delta):
    """One-sided Clopper-Pearson upper bound for k successes in n trials."""
    return 1.0 if k >= n else float(beta.ppf(1 - delta, k + 1, n - k))


def informed_upper(rf, tf, tall_f):
    n = len(rf)
    q10 = int(np.sum(rf & ~tf))
    return cp_upper(int(tall_f.sum()), len(tall_f), 0.025) + cp_upper(q10, n, 0.025)


def run(args):
    name, n, reps, seed = args
    R, T = DATA[name] < TAU, DATA["twin"] < TAU
    rng = np.random.default_rng(seed)
    p = R.mean()
    c0 = c1 = z0 = z1 = 0
    g0 = g1 = 0.0
    for _ in range(reps):
        idx = rng.choice(len(R), 10 * n, replace=False)
        rf, tf = R[idx[:n]], T[idx[:n]]
        u0 = cp_upper(int(rf.sum()), n, 0.05)
        u1 = informed_upper(rf, tf, T[idx])
        c0 += u0 >= p; c1 += u1 >= p
        z0 += u0 < EPS; z1 += u1 < EPS
        g0 += u0 - p; g1 += u1 - p
    rho = float(np.corrcoef(DATA[name], DATA["twin"])[0, 1])
    q10 = float(np.mean(R & ~T))
    return [name, n, round(rho, 3), round(float(p), 4), round(q10, 4), round(100 * c0 / reps, 2), round(100 * c1 / reps, 2),
            round(g0 / reps, 4), round(g1 / reps, 4), round(100 * z0 / reps, 1), round(100 * z1 / reps, 1)]


DATA = load()

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    pairs = [k for k in DATA if k != "twin"]
    jobs = [(q, n, reps, SEED * 1000 + 17 * i + n) for i, q in enumerate(pairs) for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    hdr = ["pair", "n", "rho", "p", "q10", "cov_cp", "cov_informed", "gap_cp", "gap_informed", "cert_cp", "cert_informed"]
    with open(os.path.join(HERE, "results", "failrate.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(hdr); w.writerows(rows)
    out = [f"tau={TAU}, eps={EPS}, reps={reps}"]
    for n in NS:
        s = [r for r in rows if r[1] == n]
        out.append(f"n={n}: min coverage CP {min(r[5] for r in s)}, informed {min(r[6] for r in s)}; "
                   f"informed tighter on {sum(r[8] < r[7] for r in s)}/21 pairs; mean gap CP {np.mean([r[7] for r in s]):.3f}, informed {np.mean([r[8] for r in s]):.3f}")
    for n in (240, 60):
        out.append(f"-- per pair at n={n} (rho, p, q10, gap_cp, gap_informed, cert_cp%, cert_informed%)")
        for r in sorted([r for r in rows if r[1] == n], key=lambda r: -r[2]):
            out.append(f"{r[0]:11s} rho={r[2]:.3f} p={r[3]:.3f} q10={r[4]:.3f} gap {r[7]:.3f} vs {r[8]:.3f}  cert {r[9]} vs {r[10]}")
    open(os.path.join(HERE, "results", "summary_3f.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))
