"""Milestone 7i: twin-assisted betting interval with a finite twin pool (N iid twin runs), combined with the pair-residual interval by a union bound, versus real-only betting.
python3 finite_twin.py [reps]  ->  results/finite_twin.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7i)"""
import csv, os, sys, importlib.util
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_uncapped_betting", "uncapped.py"))
m7h = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7h)
LOADED, interval = m7h.LOADED, m7h.interval
NS, NTW, CAP, BANK, SEED = (60, 240, 960), (500, 4000), 0.99, 200, 78


def twin_bank(task):
    T = LOADED[task]["twin"]; rng = np.random.default_rng(SEED)
    return {N: np.array([interval(rng.choice(T, N, replace=True), 0.025, CAP) for _ in range(BANK)]) for N in NTW}


BANKS = {t: twin_bank(t) for t in LOADED}


def run(args):
    task, name, n, reps, seed = args
    D = LOADED[task]; R, T = D[name], D["twin"]
    rng = np.random.default_rng(seed)
    truth, tm = R.mean(), T.mean()
    cov = {k: 0 for k in ("real",) + NTW}; wid = {k: 0.0 for k in cov}
    for _ in range(reps):
        i = rng.choice(len(R), n, replace=False)
        lo, hi = interval(R[i], 0.05, CAP); cov["real"] += lo <= truth <= hi; wid["real"] += hi - lo
        zl, zh = interval((R[i] - T[i] + 1) / 2, 0.025, CAP); zl, zh = 2 * zl - 1, 2 * zh - 1
        for N in NTW:
            tl, th = BANKS[task][N][rng.integers(BANK)]
            lo, hi = zl + tl, zh + th
            cov[N] += lo <= truth <= hi; wid[N] += hi - lo
    return [task, name, n, round(float(np.corrcoef(R, T)[0, 1]), 3)] + [round(100 * cov[k] / reps, 1) for k in cov] + [round(wid[k] / reps, 4) for k in cov]


HEAD = ["task", "pair", "n", "rho", "cov_real", "cov_N500", "cov_N4000", "w_real", "w_N500", "w_N4000"]

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    jobs = [(t, p, n, reps, SEED * 1000 + 13 * j + n) for t in LOADED for j, p in enumerate(k for k in LOADED[t] if k != "twin") for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "finite_twin.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(HEAD); w.writerows(rows)
    L = [f"reps per cell: {reps}; twin-interval bank {BANK} per N; widths on the outcome scale"]
    for t in LOADED:
        s = [r for r in rows if r[0] == t]
        L.append(f"[{t}] min coverage over cells: {min(min(r[4:7]) for r in s):.1f}")
        for n in NS:
            q = np.array([r[3:] for r in s if r[2] == n])
            for N, col in ((500, 5), (4000, 6)):
                ratio = q[:, col] / q[:, 4]
                L.append(f"  n={n} N={N}: combined/real-only median {np.median(ratio):.3f}, min {ratio.min():.3f}, narrower on {int((ratio < 1).sum())}/{len(ratio)}")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
