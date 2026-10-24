"""Pre-registered analysis of H1, H2, H6 on the benchmark pools (see LOG.md, 2026-10-24 milestone 3).
python3 analyse.py  ->  results/coverage.csv, results/h2.csv, results/h6.csv, results/summary.txt"""
import csv, functools, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
import sim2real_inference.estimators as est

est.t_quantile = functools.lru_cache(maxsize=None)(est.t_quantile)
REPS, BOOT, NS, SEED = 4000, 2000, (30, 60), 7
H1_FLOOR = 93.0


def load():
    with open("results/pool.csv") as f:
        rows = list(csv.reader(f))
    names = rows[0][1:]
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(names)}


def ranks(x):
    o = np.argsort(x, kind="mergesort")
    r = np.empty(len(x))
    r[o] = np.arange(len(x))
    for v in np.unique(x):
        m = x == v
        if m.sum() > 1:
            r[m] = r[m].mean()
    return r


def spearman(a, b):
    return float(np.corrcoef(ranks(np.asarray(a)), ranks(np.asarray(b)))[0, 1])


def ks_distance(a, b):
    z = np.sort(np.concatenate([a, b]))
    return float(np.max(np.abs(np.searchsorted(np.sort(a), z, side="right") / len(a) - np.searchsorted(np.sort(b), z, side="right") / len(b))))


def run_pair(R, T, n, rng):
    m = 9 * n
    truth = R.mean()
    out = {}
    for lab in ("paired", "unpaired"):
        for meth in est.LAMBDAS:
            out[(lab, meth)] = np.zeros((REPS, 3))     # estimate error, covered, width
    for k in range(REPS):
        idx = rng.choice(len(R), 2 * n + m, replace=False)
        r, tp, tu, ex = R[idx[:n]], T[idx[:n]], T[idx[n:2 * n]], T[idx[2 * n:]]
        for lab, t in (("paired", tp), ("unpaired", tu)):
            for meth in est.LAMBDAS:
                if lab == "unpaired" and meth in ("real_only", "ppi"):
                    continue
                lo, hi = est.interval(meth, list(r), list(t), list(ex))
                e = est.estimate(meth, list(r), list(t), list(ex))
                out[(lab, meth)][k] = (e - truth, lo <= truth <= hi, hi - lo)
    return out


def boot_ratio(num_err, den_err, base_err, rng):
    """Bootstrap over replications of E_num / E_den where E = mean-square error of real-only / that of the method."""
    n = len(base_err)
    b = base_err ** 2
    x, y = num_err ** 2, den_err ** 2
    vals = []
    for _ in range(BOOT):
        i = rng.integers(0, n, n)
        vals.append((b[i].mean() / x[i].mean()) / (b[i].mean() / y[i].mean()))
    return np.percentile(vals, [2.5, 97.5])


def main():
    pool = load()
    T = pool["twin"]
    pairs = [k for k in pool if k != "twin"]
    rng = np.random.default_rng(SEED)
    cov_rows, h2_rows, h6 = [], [], []
    for p in pairs:
        R = pool[p]
        rho = float(np.corrcoef(R, T)[0, 1])
        for n in NS:
            o = run_pair(R, T, n, rng)
            base = o[("paired", "real_only")][:, 0]
            for (lab, meth), v in o.items():
                if not v.any():
                    continue
                cov_rows.append([p, n, lab, meth, round(100 * v[:, 1].mean(), 2), round(v[:, 2].mean(), 4), round(float(np.mean(v[:, 0] ** 2) ** -0.5 * np.mean(base ** 2) ** 0.5) ** 2, 3)])
            if n == 30:
                ep = np.mean(base ** 2) / np.mean(o[("paired", "cv")][:, 0] ** 2)
                eu = np.mean(base ** 2) / np.mean(o[("unpaired", "cv")][:, 0] ** 2)
                lo, hi = boot_ratio(o[("paired", "cv")][:, 0], o[("unpaired", "cv")][:, 0], base, rng)
                h2_rows.append([p, round(rho, 3), round(ep, 3), round(eu, 3), round(ep / eu, 3), round(lo, 3), round(hi, 3)])
                h6.append((p, rho, ks_distance(R, T), abs(R.mean() - T.mean()) / R.std(), ep))
        print(p, "rho", round(rho, 3), flush=True)
    os.makedirs("results", exist_ok=True)
    with open("results/coverage.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pair", "n", "twin_runs", "method", "coverage_pct", "mean_width", "E_vs_real_only"])
        w.writerows(cov_rows)
    with open("results/h2.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pair", "rho", "E_paired", "E_unpaired", "ratio", "ratio_lo95", "ratio_hi95"])
        w.writerows(h2_rows)
    with open("results/h6.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pair", "rho", "ks_distance", "std_mean_shift", "E_cv_n30"])
        w.writerows([[a, round(b, 4), round(c, 4), round(d, 4), round(e, 3)] for a, b, c, d, e in h6])
    # H6: Spearman of E with rho and with detectability; bootstrap over pairs for the difference
    E = np.array([h[4] for h in h6]); rh = np.array([h[1] for h in h6]); ks = np.array([h[2] for h in h6]); sh = np.array([h[3] for h in h6])
    diffs = []
    for _ in range(BOOT):
        i = rng.integers(0, len(E), len(E))
        if len(set(E[i])) < 3:
            continue
        diffs.append(abs(spearman(rh[i], E[i])) - abs(spearman(ks[i], E[i])))
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    lines = []
    cv = [r for r in cov_rows if r[2] == "paired" and r[1] == 30]
    lines.append("H1 coverage at n=30, min over pairs (paired twin): " + ", ".join(f"{m}={min(r[4] for r in cv if r[3] == m):.2f}" for m in est.LAMBDAS))
    lines.append("H1 refuted by cv or ppi_pp (<%.1f) on: %s" % (H1_FLOOR, [(r[0], r[3], r[4]) for r in cv if r[3] in ("cv", "ppi_pp") and r[4] < H1_FLOOR]))
    cv60 = [r for r in cov_rows if r[2] == "paired" and r[1] == 60]
    lines.append("H1 coverage at n=60, min over pairs: " + ", ".join(f"{m}={min(r[4] for r in cv60 if r[3] == m):.2f}" for m in est.LAMBDAS))
    sup = [r[0] for r in h2_rows if r[5] >= 2]
    ref = [r[0] for r in h2_rows if r[5] <= 1 <= r[6]]
    lines.append(f"H2: ratio lower bound >= 2 on {len(sup)}/{len(h2_rows)} pairs; interval includes 1 on {len(ref)}/{len(h2_rows)} pairs: {ref}")
    lines.append(f"H6: Spearman(E, rho) = {spearman(rh, E):.3f}; Spearman(E, KS) = {spearman(ks, E):.3f}; Spearman(E, std mean shift) = {spearman(sh, E):.3f}; |rho|-|KS| difference 95% CI over pairs [{lo:.3f}, {hi:.3f}]")
    open("results/summary.txt", "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
