"""Milestone 7k: finite-twin betting interval on the cart-pole score pairs at twin pool N in {20,000, 100,000}, share f of alpha for the twin mean.
python3 large_n.py [reps]  ->  results/large_n.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7k)"""
import csv, os, sys, importlib.util
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_uncapped_betting", "uncapped.py"))
m7h = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7h)
LOADED, interval, bets, GRID = m7h.LOADED, m7h.interval, m7h.bets, m7h.GRID
NS, NTW, FS, CAP, BANK, SEED, A = (240, 960), (20000, 100000), (0.1, 0.5), 0.99, 20, 83, 0.05
T = LOADED["cartpole"]["twin"]
_rng = np.random.default_rng(SEED)


def interval_chunked(x, alpha, cap, chunk=5000, half=0.01, G=600):
    """Betting interval as in m7h.interval, on a fine grid centred on the sample mean (half-width doubled until the edges are rejected), accumulating the log capital over row chunks. The m7h grid (step 1/600) is wider than the interval at N >= 20,000."""
    lam = bets(x, alpha); mu = float(x.mean())
    while True:
        grid = np.clip(np.linspace(mu - half, mu + half, G), 0.0005, 0.9995)
        m = grid[None, :]
        kp = np.zeros(G); km = np.zeros(G)
        for s in range(0, len(x), chunk):
            l = lam[s:s + chunk, None]; d = x[s:s + chunk, None] - m
            kp += np.log1p(np.minimum(l, cap / m) * d).sum(0); km += np.log1p(-np.minimum(l, cap / (1 - m)) * d).sum(0)
        ok = (np.logaddexp(kp, km) - np.log(2)) < np.log(1 / alpha)
        if ok.any() and not (ok[0] or ok[-1]) or half >= 0.5:
            break
        half *= 2
    if not ok.any():
        return 0.0, 1.0
    idx = np.flatnonzero(ok); step = grid[1] - grid[0]
    return grid[idx[0]] - step / 2, grid[idx[-1]] + step / 2


# twin-mean intervals drawn once per (N, f); draws are iid with replacement from the 4,000-context pool (target: the pool mean)
BANKS = {(N, f): np.array([interval_chunked(_rng.choice(T, N, replace=True), A * f, CAP) for _ in range(BANK)]) for N in NTW for f in FS}


def run(args):
    name, n, reps, seed = args
    R = LOADED["cartpole"][name]
    rng = np.random.default_rng(seed); truth = R.mean()
    keys = [(N, f) for N in NTW for f in FS]
    cov = {k: 0 for k in ["real"] + keys}; wid = {k: 0.0 for k in cov}
    for _ in range(reps):
        i = rng.choice(len(R), n, replace=False)
        lo, hi = interval(R[i], A, CAP); cov["real"] += lo <= truth <= hi; wid["real"] += hi - lo
        z = (R[i] - T[i] + 1) / 2
        for f in FS:
            zl, zh = interval(z, A * (1 - f), CAP); zl, zh = 2 * zl - 1, 2 * zh - 1
            for N in NTW:
                tl, th = BANKS[(N, f)][rng.integers(BANK)]
                lo, hi = zl + tl, zh + th; cov[(N, f)] += lo <= truth <= hi; wid[(N, f)] += hi - lo
    return [name, n, round(float(np.corrcoef(R, T)[0, 1]), 3)] + [round(100 * cov[k] / reps, 1) for k in cov] + [round(wid[k] / reps, 4) for k in cov]


HEAD = ["pair", "n", "rho", "cov_real"] + [f"cov_N{N}_f{f}" for N in NTW for f in FS] + ["w_real"] + [f"w_N{N}_f{f}" for N in NTW for f in FS]

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    jobs = [(p, n, reps, SEED * 1000 + 13 * j + n) for j, p in enumerate(k for k in LOADED["cartpole"] if k != "twin") for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "large_n.csv"), "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(HEAD); w.writerows(rows)
    ix = {h: i for i, h in enumerate(HEAD)}
    L = [f"reps per cell: {reps}; twin-interval bank {BANK} per (N, f); cart-pole, {len(rows)//len(NS)} pairs; f = share of alpha for the twin mean",
         f"min coverage over all cells: {min(min(r[ix[h]] for h in HEAD if h.startswith('cov')) for r in rows):.1f}"]
    for n in NS:
        q = [r for r in rows if r[1] == n]
        for N in NTW:
            for f in FS:
                ra = np.array([r[ix[f"w_N{N}_f{f}"]] / r[ix["w_real"]] for r in q])
                L.append(f"  n={n} N={N} f={f}: combined/real-only median {np.median(ra):.3f}, min {ra.min():.3f}, narrower on {int((ra < 1).sum())}/{len(q)}")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
