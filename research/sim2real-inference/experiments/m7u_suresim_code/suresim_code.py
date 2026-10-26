"""Milestone 7u: SureSim's released interval code (irom-princeton/rapid-policy-evaluation, MIT, commit e9e6cb5) run in the m7q setting on our pools.
python3 suresim_code.py [reps]  ->  results/suresim_code.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-26 milestone 7u)
The three functions below are copied from src/suresim/intervals/ppi.py (Copyright (c) 2024 Intelligent Robot Motion Lab, MIT licence); only the shuffle takes a seeded generator."""
import csv, os, sys, importlib.util
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7q", os.path.join(HERE, "..", "m7q_suresim_setting", "suresim_setting.py"))
m7q = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7q)
LOADED, interval = m7q.LOADED, m7q.interval
N_REAL, N_SIM, ALPHA, CAP, SEED, KS = 60, 700, 0.1, 0.99, 83, (1, 5)


def MARTINGALE(m, c, lam_t, Z_norm):
    coeff_plus = np.minimum(lam_t, c / m)
    coeff_minus = np.minimum(lam_t, c / (1 - m))
    M1 = np.cumsum(np.log(1 + coeff_plus * (Z_norm - m)))
    M2 = np.cumsum(np.log(1 - coeff_minus * (Z_norm - m)))
    return np.maximum(M1, M2) - np.log(2)


def mean_ci_acc(Z, alpha, c=0.5, L=0, U=1):
    n = len(Z)
    Z_norm = np.array([(zi - L) / (U - L) for zi in Z])
    initial_mean = np.mean(Z_norm)
    t_n = np.arange(1, n + 1)
    mu_hat = (0.5 + np.cumsum(Z_norm)) / (1.0 + t_n)
    sigma2hat_n = (0.25 + np.cumsum(np.power(Z_norm - mu_hat, 2))) / (1.0 + t_n)
    sigma2hat_tminus1_n = np.append(0.25, sigma2hat_n[:-1])
    lam_t = np.sqrt(2.0 * np.log(2.0 / alpha) / (n * sigma2hat_tminus1_n))
    C = []
    current_lb = initial_mean / 2.0; tightest_valid_lb = 0.0
    gap_lb = np.abs(initial_mean - current_lb)
    while gap_lb > 1e-6:
        gap_lb /= 2.0
        if np.max(MARTINGALE(current_lb, c, lam_t, Z_norm)) >= np.log(1.0 / alpha):
            tightest_valid_lb = float(current_lb); current_lb += gap_lb
        else:
            current_lb -= gap_lb
    C.append(tightest_valid_lb * (U - L) + L)
    current_ub = (1.0 + initial_mean) / 2.0; tightest_valid_ub = 1.0
    gap_ub = np.abs(current_ub - initial_mean)
    while gap_ub > 1e-6:
        gap_ub /= 2.0
        if np.max(MARTINGALE(current_ub, c, lam_t, Z_norm)) >= np.log(1.0 / alpha):
            tightest_valid_ub = float(current_ub); current_ub -= gap_ub
        else:
            current_ub += gap_ub
    C.append(tightest_valid_ub * (U - L) + L)
    return C


def ppi_uniform(Y_gold, Y_gold_sim, Y_sim, rng, alpha=0.1, c=0.5):
    n, N = len(Y_gold), len(Y_sim)
    L, U = -(1 + N / n), 2 + N / n
    Y_rect = Y_gold_sim + (Y_gold - Y_gold_sim) * ((N + n) / n)
    Y = np.concatenate((Y_sim, Y_rect)); rng.shuffle(Y)
    C = mean_ci_acc(Y, alpha, c=c, L=L, U=U)
    return [min(C), max(C)]


def gold_only_est(Y_gold, c=0.5, alpha=0.1):
    C = mean_ci_acc(Y_gold, alpha, c=c, L=0, U=1)
    return [min(C), max(C)]


def run(args):
    task, name, k, reps, seed = args
    D = LOADED[task]; R, T = D[name], D["twin"]
    rng = np.random.default_rng(seed)
    truth = R.mean()
    keys = ("real", "uni", "ours_real")
    cov = dict.fromkeys(keys, 0); wid = dict.fromkeys(keys, 0.0); rho = 0.0
    for _ in range(reps):
        m = N_REAL + N_SIM
        idx = rng.integers(len(R), size=(m, k))
        r, t = R[idx].mean(1), T[idx].mean(1)
        rho += np.corrcoef(r[:N_REAL], t[:N_REAL])[0, 1]
        res = {"real": gold_only_est(r[:N_REAL], alpha=ALPHA),
               "uni": ppi_uniform(r[:N_REAL], t[:N_REAL], t[N_REAL:], rng, alpha=ALPHA),
               "ours_real": interval(r[:N_REAL], ALPHA, CAP)}
        for key, (lo, hi) in res.items():
            cov[key] += lo <= truth <= hi; wid[key] += hi - lo
    return [task, name, k, round(rho / reps, 3)] + [round(100 * cov[x] / reps, 1) for x in keys] + [round(wid[x] / reps, 4) for x in keys]


HEAD = ["task", "pair", "k", "rho", "cov_real", "cov_uni", "cov_ours_real", "w_real", "w_uni", "w_ours_real"]

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    jobs = [(t, p, k, reps, SEED * 1000 + 13 * j + k) for t in LOADED for j, p in enumerate(x for x in LOADED[t] if x != "twin") for k in KS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(os.path.join(HERE, "results", "suresim_code.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(HEAD); w.writerows(rows)
    L = [f"reps per cell {reps}; n={N_REAL}, N={N_SIM}, alpha={ALPHA}; SureSim code (commit e9e6cb5); ratio = their uniform-PPI width / their real-only width"]
    for t in LOADED:
        for k in KS:
            s = np.array([r[3:] for r in rows if r[0] == t and r[2] == k])
            for label, sel in (("all pairs", np.ones(len(s), bool)), ("rho in [0.6,0.85]", (s[:, 0] >= 0.6) & (s[:, 0] <= 0.85))):
                if not sel.any(): L.append(f"[{t}] k={k} {label}: none"); continue
                q = s[sel]
                L.append(f"[{t}] k={k} {label} ({sel.sum()} pairs): rho median {np.median(q[:, 0]):.2f}; min coverage {q[:, 1:4].min():.1f}; "
                         f"uniform/real ratio median {np.median(q[:, 5] / q[:, 4]):.3f}, min {np.min(q[:, 5] / q[:, 4]):.3f} (narrower on {int((q[:, 5] < q[:, 4]).sum())}); "
                         f"their real-only / our real-only width median {np.median(q[:, 4] / q[:, 6]):.3f}")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
