"""Milestone 7o: does moving the outcome away from the ceiling change the residual-to-real interval ratio q = W_R / w_real?
Scales: raw R; flipped 1-R; power g(R) = R**p with p = ln(1/2)/ln(mean R) (mean moved to 1/2), applied to R and T alike.
python3 ceiling.py [reps]  ->  results/ceiling.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7o)"""
import csv, os, sys, importlib.util
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_uncapped_betting", "uncapped.py"))
m7h = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7h)
LOADED, interval = m7h.LOADED, m7h.interval
NS, F, CAP, A, SEED = (240, 960), 0.1, 0.99, 0.05, 93


def widths(R, T, i):
    lo, hi = interval(R[i], A, CAP); wr = hi - lo
    z = (R[i] - T[i] + 1) / 2
    zl, zh = interval(z, A * (1 - F), CAP)
    return wr, 2 * (zh - zl)


def run(args):
    sysname, name, n, reps, seed = args
    D = LOADED[sysname]; R, T = D[name], D["twin"]
    p = np.log(0.5) / np.log(R.mean())
    scales = {"raw": (R, T), "flip": (1 - R, 1 - T), "power": (R ** p, T ** p)}
    row = dict(system=sysname, pair=name, n=n, mean_R=round(float(R.mean()), 4), p=round(float(p), 3))
    rng = np.random.default_rng(seed)
    idx = [rng.choice(len(R), n, replace=False) for _ in range(reps)]
    for k, (r, t) in scales.items():
        w = np.array([widths(r, t, i) for i in idx]).mean(0)
        row[f"w_real_{k}"] = round(float(w[0]), 5); row[f"W_R_{k}"] = round(float(w[1]), 5)
        row[f"q_{k}"] = round(float(w[1] / w[0]), 4)
    return row


if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    jobs = [(s, p, n, reps, SEED * 1000 + 17 * j + n) for s in ("pendulum", "cartpole") for j, p in enumerate(k for k in LOADED[s] if k != "twin") for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "ceiling.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, list(rows[0])); w.writeheader(); w.writerows(rows)
    from scipy.stats import spearmanr
    L = [f"reps per cell: {reps}; cells {len(rows)}; f={F}"]
    for s in ("pendulum", "cartpole"):
        m = [r for r in rows if r["system"] == s]
        L.append(f"{s}: " + "; ".join(f"q_{k} median {np.median([r['q_' + k] for r in m]):.3f}, share q>1 {np.mean([r['q_' + k] > 1 for r in m]):.2f}" for k in ("raw", "flip", "power")))
    qr = np.array([r["q_raw"] for r in rows]); qp = np.array([r["q_power"] for r in rows]); mu = np.array([r["mean_R"] for r in rows])
    L.append(f"Spearman(q_raw, mean_R) {spearmanr(qr, mu)[0]:.3f}; Spearman(q_power, mean_R) {spearmanr(qp, mu)[0]:.3f}")
    L.append(f"max |q_flip - q_raw| {np.max(np.abs(np.array([r['q_flip'] for r in rows]) - qr)):.3f}")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
