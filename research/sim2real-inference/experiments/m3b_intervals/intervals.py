"""Milestone 3b: coverage and width of t, percentile-bootstrap and studentised-bootstrap intervals for cv and ppi_pp on the m3 pools.
python3 intervals.py [reps]  ->  results/coverage_3b.csv, results/summary_3b.txt   (pre-registration: LOG.md, 2026-10-24 milestone 3b)"""
import csv, os, sys
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import sim2real_inference.estimators as est

POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
NS, B, SEED, FLOOR = (30, 60), 399, 11, 93.0
METHODS = ("cv", "ppi_pp")


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def stats(method, R, Tp, Ex):
    """Vectorised over a leading batch axis: R, Tp (b, n) paired; Ex (b, m) twin-only. Returns (estimate, plug-in se),
    identical to estimators.estimate / interval (se from the t interval before the quantile)."""
    n, m = R.shape[-1], Ex.shape[-1]
    N = n + m
    mr, mt = R.mean(-1), Tp.mean(-1)
    Tall = np.concatenate([Tp, Ex], -1)
    vt_all = Tall.var(-1, ddof=1)
    dT, dR = Tp - mt[:, None], R - mr[:, None]
    cov = (dR * dT).sum(-1) / (n - 1)
    if method == "cv":
        sxx = (dT ** 2).sum(-1)
        lam = np.where(sxx > 0, (dR * dT).sum(-1) / np.where(sxx > 0, sxx, 1), 0.0)
        dof = n - 2
    else:
        lam = np.where(vt_all > 0, cov / ((1 + n / m) * np.where(vt_all > 0, vt_all, 1)), 0.0)
        dof = n - 1
    e = mr - lam * (mt - Tall.mean(-1))
    res = R - lam[:, None] * Tp
    se2 = res.var(-1, ddof=1) * (n - 1) / dof / n + lam ** 2 * vt_all / N
    return e, np.sqrt(se2)


def intervals(method, r, t, ex, rng):
    n, m = len(r), len(ex)
    e, se = (x[0] for x in stats(method, r[None], t[None], ex[None]))
    q = est.t_quantile(0.975, n - 2 if method == "cv" else n - 1)
    out = {"t": (e - q * se, e + q * se)}
    ip = rng.integers(0, n, (B, n))
    ie = rng.integers(0, m, (B, m))
    eb, sb = stats(method, r[ip], t[ip], ex[ie])
    out["boot_pct"] = tuple(np.percentile(eb, [2.5, 97.5]))
    ok = sb > 0
    tb = (eb[ok] - e) / sb[ok]
    lo_q, hi_q = np.percentile(tb, [2.5, 97.5])
    out["boot_t"] = (e - hi_q * se, e - lo_q * se)
    return out


def run(args):
    name, n, reps, seed = args
    R, T = POOL_DATA[name], POOL_DATA["twin"]
    rng = np.random.default_rng(seed)
    truth, m = R.mean(), 9 * n
    cover, width = {}, {}
    for _ in range(reps):
        idx = rng.choice(len(R), n + m, replace=False)
        r, t, ex = R[idx[:n]], T[idx[:n]], T[idx[n:]]
        for meth in METHODS:
            for k, (lo, hi) in intervals(meth, r, t, ex, rng).items():
                cover.setdefault((meth, k), []).append(lo <= truth <= hi)
                width.setdefault((meth, k), []).append(hi - lo)
    rho = float(np.corrcoef(R, T)[0, 1])
    return [[name, n, round(rho, 3), meth, k, round(100 * np.mean(c), 2), round(float(np.mean(width[(meth, k)])), 4)]
            for (meth, k), c in cover.items()]


POOL_DATA = load()

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    pairs = [k for k in POOL_DATA if k != "twin"]
    jobs = [(p, n, reps, SEED * 1000 + 17 * i + n) for i, p in enumerate(pairs) for n in NS]
    rows = []
    with Pool(4) as pool:
        for part in pool.imap(run, jobs):
            rows += part
            print(part[0][0], part[0][1], flush=True)
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(os.path.join(HERE, "results", "coverage_3b.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pair", "n", "rho", "method", "interval", "coverage_pct", "mean_width"])
        w.writerows(rows)
    L = [f"reps per cell: {reps}; B = {B}; MC s.e. of coverage about {100 * (0.95 * 0.05 / reps) ** 0.5:.2f} points"]
    for n in NS:
        for meth in METHODS:
            for k in ("t", "boot_pct", "boot_t"):
                c = [r for r in rows if r[1] == n and r[3] == meth and r[4] == k]
                L.append(f"n={n} {meth:6s} {k:8s} coverage min {min(r[5] for r in c):.2f} mean {np.mean([r[5] for r in c]):.2f}; "
                         f"pairs below {FLOOR}: {sum(r[5] < FLOOR for r in c)}/{len(c)}")
    c = [r for r in rows if r[1] == 30 and r[3] == "cv" and r[4] == "boot_t"]
    L.append("H1b (cv boot_t n=30 >= 93.0 on all pairs): " + ("supported" if all(r[5] >= FLOOR for r in c) else "refuted; below: " + str([(r[0], r[5]) for r in c if r[5] < FLOOR])))
    wt = {(r[0], r[1], r[3]): r[6] for r in rows if r[4] == "t"}
    ratios = [(r[6] / wt[(r[0], r[1], r[3])], r[0], r[1], r[3]) for r in rows if r[4] == "boot_t" and r[3] == "cv" and r[1] == 30]
    mx = max(ratios)
    L.append(f"H1c (cv boot_t / t width <= 1.15 on all pairs, n=30): max ratio {mx[0]:.3f} on {mx[1]} -> " + ("supported" if mx[0] <= 1.15 else "refuted"))
    open(os.path.join(HERE, "results", "summary_3b.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
