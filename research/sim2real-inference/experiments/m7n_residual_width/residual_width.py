"""Milestone 7n: width of the betting interval for the residual R - T against the real-only interval, per pair.
python3 residual_width.py [reps]  ->  results/residual_width.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7n)"""
import csv, os, sys, importlib.util
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_uncapped_betting", "uncapped.py"))
m7h = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7h)
LOADED, interval = m7h.LOADED, m7h.interval
NS, FS, CAP, A, SEED = (240, 960), (0.1, 0.5), 0.99, 0.05, 91


def skew(x):
    d = x - x.mean(); return float((d ** 3).mean() / (d ** 2).mean() ** 1.5)


def run(args):
    sysname, name, n, reps, seed = args
    D = LOADED[sysname]; R, T = D[name], D["twin"]
    rng = np.random.default_rng(seed)
    wr = 0.0; wres = {f: 0.0 for f in FS}
    for _ in range(reps):
        i = rng.choice(len(R), n, replace=False)
        lo, hi = interval(R[i], A, CAP); wr += hi - lo
        z = (R[i] - T[i] + 1) / 2
        for f in FS:
            zl, zh = interval(z, A * (1 - f), CAP); wres[f] += 2 * (zh - zl)
    sR, sD = R.std(), (R - T).std()
    row = dict(system=sysname, pair=name, n=n, rho=round(float(np.corrcoef(R, T)[0, 1]), 3), skew_R=round(skew(R), 3), s_res_over_s_R=round(float(sD / sR), 4), w_real=round(wr / reps, 5))
    for f in FS:
        row[f"W_R_f{f}"] = round(wres[f] / reps, 5)
        row[f"q_var_f{f}"] = round(float(sD / sR * np.sqrt(np.log(2 / (A * (1 - f))) / np.log(2 / A))), 4)
    return row


if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    jobs = [(s, p, n, reps, SEED * 1000 + 17 * j + n) for s in ("pendulum", "cartpole") for j, p in enumerate(k for k in LOADED[s] if k != "twin") for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "residual_width.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, list(rows[0])); w.writeheader(); w.writerows(rows)
    from scipy.stats import spearmanr
    L = [f"reps per cell: {reps}; cells {len(rows)} (2 systems x 21 pairs x 2 n)"]
    for f in FS:
        q = np.array([r[f"W_R_f{f}"] / r["w_real"] for r in rows]); qv = np.array([r[f"q_var_f{f}"] for r in rows])
        sk = np.array([r["skew_R"] for r in rows]); err = np.abs(qv - q) / q
        L.append(f"f={f}: q median {np.median(q):.3f} (min {q.min():.3f}, max {q.max():.3f}); q_var median {np.median(qv):.3f}; median |q_var - q|/q {np.median(err):.3f}; Spearman(q/q_var, skew_R) {spearmanr(q / qv, sk)[0]:.3f}")
        for s in ("pendulum", "cartpole"):
            m = np.array([r["system"] == s for r in rows]); L.append(f"   {s}: q median {np.median(q[m]):.3f}, q_var median {np.median(qv[m]):.3f}, median err {np.median(err[m]):.3f}")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
