"""Milestone 7j: finite-twin betting interval over twin pool size N and the share f of alpha given to the twin-mean interval, pendulum pairs.
python3 n_sweep.py [reps]  ->  results/n_sweep.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7j)"""
import csv, os, sys, importlib.util
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_uncapped_betting", "uncapped.py"))
m7h = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7h)
LOADED, interval = m7h.LOADED, m7h.interval
NS, NTW, FS, CAP, BANK, SEED, A = (240, 960), (4000, 20000), (0.1, 0.5), 0.99, 40, 79, 0.05
T = LOADED["pendulum"]["twin"]
_rng = np.random.default_rng(SEED)
# twin-mean intervals are drawn once per (N, f); N = 20,000 exceeds the 4,000-context pool, so draws are iid with replacement (target: the pool mean)
BANKS = {(N, f): np.array([interval(_rng.choice(T, N, replace=True), A * f, CAP) for _ in range(BANK)]) for N in NTW for f in FS}


def run(args):
    name, n, reps, seed = args
    R = LOADED["pendulum"][name]
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
    jobs = [(p, n, reps, SEED * 1000 + 13 * j + n) for j, p in enumerate(k for k in LOADED["pendulum"] if k != "twin") for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "n_sweep.csv"), "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(HEAD); w.writerows(rows)
    ix = {h: i for i, h in enumerate(HEAD)}
    L = [f"reps per cell: {reps}; twin-interval bank {BANK} per (N, f); pendulum, 21 pairs; f = share of alpha for the twin mean",
         f"min coverage over all cells: {min(min(r[ix[h]] for h in HEAD if h.startswith('cov')) for r in rows):.1f}"]
    for n in NS:
        q = [r for r in rows if r[1] == n]
        for N in NTW:
            for f in FS:
                ra = np.array([r[ix[f"w_N{N}_f{f}"]] / r[ix["w_real"]] for r in q])
                L.append(f"  n={n} N={N} f={f}: combined/real-only median {np.median(ra):.3f}, min {ra.min():.3f}, narrower on {int((ra < 1).sum())}/21")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
