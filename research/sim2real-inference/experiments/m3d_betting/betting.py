"""Milestone 3d: betting (hedged-capital) confidence intervals for the control-variate estimand vs real-only, on the m3 pools.
python3 betting.py [reps]  ->  results/betting.csv, results/summary_3d.txt   (pre-registration: LOG.md, 2026-10-24 milestone 3d)
Method: Waudby-Smith and Ramdas (2024), hedged capital with predictable plug-in bets, inverted over a grid of means."""
import csv, os, sys
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
NS, SEED, GRID = (30, 60), 29, np.linspace(0.0005, 0.9995, 400)
PRIOR = float(os.environ.get('PRIOR', 0.25))  # variance pseudo-observation: 0.25 is the paper default; 0.005 is the small-prior variant


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def betting_ci(x, delta):
    """Two-sided betting CI for the mean of values in [0, 1] (order matters; caller permutes). Returns (lo, hi)."""
    n = len(x)
    t = np.arange(1, n + 1)
    mu = (0.5 + np.cumsum(x)) / (t + 1)
    sig2 = (PRIOR + np.cumsum((x - mu) ** 2)) / (t + 1)
    sp = np.concatenate([[PRIOR], sig2[:-1]])
    lam = np.minimum(np.sqrt(2 * np.log(2 / delta) / (sp * t * np.log(t + 1))), 1.0)
    m = GRID[:, None]
    d = x[None, :] - m
    lp = np.minimum(lam[None, :], 0.5 / m) ; lm = np.minimum(lam[None, :], 0.5 / (1 - m))
    kp = np.cumprod(1 + lp * d, axis=1)[:, -1]
    km = np.cumprod(1 - lm * d, axis=1)[:, -1]
    keep = 0.5 * kp + 0.5 * km < 1 / delta
    # intersect with running-max rejection is unnecessary for a fixed-n interval; take the unrejected hull
    if not keep.any():
        return float(x.mean()), float(x.mean())
    g = GRID[keep]
    return float(g.min()), float(g.max())


def intervals(r, t, ex, rng):
    n = len(r)
    p = rng.permutation(n); r, t = r[p], t[p]
    lo0, hi0 = betting_ci(r, 0.05)
    n1 = n // 3
    dt = t[:n1] - t[:n1].mean()
    lam = float(np.clip((dt * (r[:n1] - r[:n1].mean())).sum() / max((dt ** 2).sum(), 1e-12), 0, 1))
    z = (r[n1:] - lam * t[n1:] + lam) / (1 + lam)
    a, b = betting_ci(z, 0.025)
    za, zb = a * (1 + lam) - lam, b * (1 + lam) - lam
    tall = rng.permutation(np.concatenate([t, ex]))
    c, d = betting_ci(tall, 0.025)
    return (lo0, hi0), (za + lam * c, zb + lam * d)


def run(args):
    name, n, reps, seed = args
    R, T = DATA[name], DATA["twin"]
    rng = np.random.default_rng(seed)
    truth, m = R.mean(), 9 * n
    c0 = c1 = 0
    w0 = w1 = 0.0
    for _ in range(reps):
        idx = rng.choice(len(R), n + m, replace=False)
        a, b = intervals(R[idx[:n]], T[idx[:n]], T[idx[n:]], rng)
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
    with open(os.path.join(HERE, "results", f"betting_prior{PRIOR}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pair", "n", "rho", "cov_real_bet", "cov_cv_bet", "width_real_bet", "width_cv_bet", "width_ratio"])
        w.writerows(rows)
    L = [f"reps per cell: {reps}; variance prior {PRIOR}"]
    for n in NS:
        s = [r for r in rows if r[1] == n]
        L.append(f"n={n}: coverage min real {min(r[3] for r in s):.2f}, cv {min(r[4] for r in s):.2f}; "
                 f"width real mean {np.mean([r[5] for r in s]):.3f}; ratio cv/real mean {np.mean([r[7] for r in s]):.3f}, min {min(r[7] for r in s):.3f}, max {max(r[7] for r in s):.3f}")
    L.append("H3d-i (all coverages >= 95.0): " + ("supported" if all(min(r[3], r[4]) >= 95.0 for r in rows) else "refuted: " + str([(r[0], r[1]) for r in rows if min(r[3], r[4]) < 95.0])))
    hi = [r for r in rows if r[1] == 60 and r[2] >= 0.85]
    lo = [r for r in rows if r[1] == 60 and r[2] < 0.3]
    a = all(r[7] < 1 for r in hi); b = all(r[7] > 1 for r in lo)
    L.append(f"H3d-ii high-rho pairs (n=60, rho>=0.85, {len(hi)} pairs) ratio<1 on all: {a}; low-rho pairs ({len(lo)} pairs, rho<0.3) ratio>1 on all: {b} -> " + ("supported" if a and b else "refuted"))
    L += [f"  {r[0]:12s} n={r[1]} rho={r[2]:.2f} cov={r[3]}/{r[4]} ratio={r[7]:.3f}" for r in sorted(rows, key=lambda r: (r[1], r[2]))]
    open(os.path.join(HERE, "results", f"summary_3d_prior{PRIOR}.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
