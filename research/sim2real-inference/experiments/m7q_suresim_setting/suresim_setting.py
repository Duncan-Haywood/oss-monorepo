"""Milestone 7q: twin-assisted betting intervals in SureSim's setting (alpha 0.1, n 60, N 700, objects averaged over k contexts), real-only vs uniform-PPI vs 2-stage.
python3 suresim_setting.py [reps]  ->  results/suresim_setting.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-26 milestone 7q)"""
import csv, os, sys, importlib.util
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_uncapped_betting", "uncapped.py"))
m7h = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7h)
LOADED, interval = m7h.LOADED, m7h.interval
N_REAL, N_SIM, ALPHA, CAP, SEED, KS = 60, 700, 0.1, 0.99, 79, (1, 5)


def run(args):
    task, name, k, reps, seed = args
    D = LOADED[task]; R, T = D[name], D["twin"]
    rng = np.random.default_rng(seed)
    truth = R.mean(); a = (N_REAL + N_SIM) / N_REAL
    keys = ("real", "uni", "two")
    cov = dict.fromkeys(keys, 0); wid = dict.fromkeys(keys, 0.0); rho = 0.0
    for _ in range(reps):
        m = N_REAL + N_SIM
        idx = rng.integers(len(R), size=(m, k))
        r, t = R[idx].mean(1), T[idx].mean(1)
        rho += np.corrcoef(r[:N_REAL], t[:N_REAL])[0, 1]
        lo, hi = interval(r[:N_REAL], ALPHA, CAP); res = {"real": (lo, hi)}
        xi = np.zeros(m); xi[:N_REAL] = 1
        d = rng.permutation(a * (r - t) * xi + t)  # betting needs an exchangeable order
        lo, hi = interval((d + a) / (2 * a + 1), ALPHA, CAP); res["uni"] = (lo * (2 * a + 1) - a, hi * (2 * a + 1) - a)
        zl, zh = interval((r[:N_REAL] - t[:N_REAL] + 1) / 2, 0.9 * ALPHA, CAP); zl, zh = 2 * zl - 1, 2 * zh - 1
        tl, th = interval(t[N_REAL:], 0.1 * ALPHA, CAP); res["two"] = (zl + tl, zh + th)
        for key, (lo, hi) in res.items():
            cov[key] += lo <= truth <= hi; wid[key] += hi - lo
    return [task, name, k, round(rho / reps, 3)] + [round(100 * cov[x] / reps, 1) for x in keys] + [round(wid[x] / reps, 4) for x in keys]


HEAD = ["task", "pair", "k", "rho", "cov_real", "cov_uni", "cov_two", "w_real", "w_uni", "w_two"]

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    jobs = [(t, p, k, reps, SEED * 1000 + 13 * j + k) for t in LOADED for j, p in enumerate(x for x in LOADED[t] if x != "twin") for k in KS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "suresim_setting.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(HEAD); w.writerows(rows)
    L = [f"reps per cell {reps}; n={N_REAL}, N={N_SIM}, alpha={ALPHA}; ratio = width / real-only betting width"]
    for t in LOADED:
        for k in KS:
            s = np.array([r[3:] for r in rows if r[0] == t and r[2] == k])
            for label, sel in (("all pairs", np.ones(len(s), bool)), ("rho in [0.6,0.85]", (s[:, 0] >= 0.6) & (s[:, 0] <= 0.85))):
                if not sel.any(): L.append(f"[{t}] k={k} {label}: none"); continue
                q = s[sel]
                L.append(f"[{t}] k={k} {label} ({sel.sum()} pairs): rho median {np.median(q[:, 0]):.2f}; min coverage {q[:, 1:4].min():.1f}; "
                         f"uniform ratio median {np.median(q[:, 5] / q[:, 4]):.3f} (narrower on {int((q[:, 5] < q[:, 4]).sum())}); "
                         f"2-stage ratio median {np.median(q[:, 6] / q[:, 4]):.3f}, min {np.min(q[:, 6] / q[:, 4]):.3f} (narrower on {int((q[:, 6] < q[:, 4]).sum())})")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
