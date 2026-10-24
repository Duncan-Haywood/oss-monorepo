"""Milestone 5a: active selection of real trials (H4) on the m3 pools.
python3 active.py [reps]  ->  results/active.csv, results/summary_5a.txt   (pre-registration: LOG.md, 2026-10-24 milestone 5a)
Estimator: theta = mean(T over all N) + (1/n) sum_i D_i / (N pi_i), D = R - T, contexts drawn with replacement from pi."""
import csv, os, sys
import numpy as np
from multiprocessing import Pool
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import KFold

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv")
SEED_CTX, SEED = 20261024, 55
NS = (30, 60, 120)


def sample_contexts(n, seed):
    """Copy of m3_benchmark/pairs.sample_contexts (that module imports mujoco, which this analysis does not need)."""
    r = np.random.default_rng(seed)
    return np.column_stack([
        r.uniform(0.5, 1.5, n), r.uniform(-0.4, 0.4, n), r.uniform(-1.0, 1.0, n),
        r.uniform(0.2, 0.8, n), r.uniform(0.4, 1.2, n), r.integers(0, 2**31 - 1, n)])


def load():
    rows = list(csv.reader(open(POOL)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    X = sample_contexts(len(a), SEED_CTX)[:, :5]          # five physical context features (the sixth is a noise seed)
    return X, {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def gbr():
    return GradientBoostingRegressor(n_estimators=40, max_depth=2, learning_rate=0.1, subsample=1.0, random_state=0)


def het_r2(X, absD):
    pred = np.zeros_like(absD)
    for tr, te in KFold(5, shuffle=True, random_state=0).split(X):
        pred[te] = gbr().fit(X[tr], absD[tr]).predict(X[te])
    return 1 - np.sum((absD - pred) ** 2) / np.sum((absD - absD.mean()) ** 2)


def ci_cover(terms, base, truth):
    n = len(terms)
    est = base + terms.mean()
    h = 1.96 * terms.std(ddof=1) / np.sqrt(n)
    return est, est - h <= truth <= est + h


def run(args):
    name, n, reps, seed = args
    X, R, T = DATA["X"], DATA[name], DATA["twin"]
    N = len(R)
    D = R - T
    base, truth = T.mean(), R.mean()
    rng = np.random.default_rng(seed)
    pred_or = np.zeros(N)                      # ceiling: the same predictor fit on all N real outcomes (5-fold cross-fitted)
    for tr, te in KFold(5, shuffle=True, random_state=0).split(X):
        pred_or[te] = gbr().fit(X[tr], np.abs(D[tr])).predict(X[te])
    pred_or = np.clip(pred_or, 1e-3, None)
    pi_or = 0.2 * pred_or.mean() + pred_or
    pi_or /= pi_or.sum()
    out = {m: [] for m in ("uniform", "uniform_cv", "active", "oracle")}
    cov = []
    n1 = n // 3
    for _ in range(reps):
        i = rng.integers(0, N, n)
        out["uniform"].append(base + D[i].mean())
        lam = np.clip(np.cov(R[i], T[i])[0, 1] / max(T[i].var(ddof=1), 1e-12), 0, 1)
        out["uniform_cv"].append(R[i].mean() - lam * (T[i].mean() - base))
        i1 = i[:n1]
        pred = np.clip(gbr().fit(X[i1], np.abs(D[i1])).predict(X), 1e-3, None)
        pi = 0.2 * pred.mean() + pred
        pi /= pi.sum()
        i2 = rng.choice(N, n - n1, p=pi)
        terms = np.concatenate([D[i1] / (N * (1.0 / N)), D[i2] / (N * pi[i2])])
        est, c = ci_cover(terms, base, truth)
        out["active"].append(est)
        cov.append(c)
        io = rng.choice(N, n, p=pi_or)
        out["oracle"].append(base + (D[io] / (N * pi_or[io])).mean())
    row = {"pair": name, "n": n, "active_cov": 100 * np.mean(cov)}
    for m, v in out.items():
        v = np.array(v)
        row[m + "_mse"] = float(np.mean((v - truth) ** 2))
        row[m + "_bias"] = float(v.mean() - truth)
    return row


def init():
    global DATA
    DATA = dict(load()[1])
    DATA["X"] = load()[0]


if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    init()
    names = [k for k in DATA if k not in ("X", "twin")]
    X = DATA["X"]
    het = {k: het_r2(X, np.abs(DATA[k] - DATA["twin"])) for k in names}
    jobs = [(k, n, reps, SEED + 1000 * j + n) for j, k in enumerate(names) for n in NS]
    with Pool(4, initializer=init) as p:
        rows = p.map(run, jobs, chunksize=1)
    for r in rows:
        r["het_r2"] = het[r["pair"]]
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    keys = list(rows[0])
    with open(os.path.join(HERE, "results", "active.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, keys)
        w.writeheader()
        w.writerows(rows)
    S = []
    byn = lambda n: [r for r in rows if r["n"] == n]
    hi = lambda r: r["het_r2"] > 0.3
    lo = lambda r: r["het_r2"] < 0.15
    S.append("het_r2 per pair: " + ", ".join(f"{k} {v:.2f}" for k, v in het.items()))
    r120 = byn(120)
    S.append(f"H4-i: min active coverage at n=120 = {min(r['active_cov'] for r in r120):.1f}% (need >= 93)")
    hs = [r for r in r120 if hi(r)]
    ls = [r for r in r120 if lo(r)]
    S.append(f"H4-ii hi-het pairs (n={len(hs)}): active<uniform on {sum(r['active_mse'] < r['uniform_mse'] for r in hs)}; ratios " +
             ", ".join(f"{r['pair']} {r['active_mse']/r['uniform_mse']:.2f}" for r in hs))
    S.append(f"H4-ii lo-het pairs (het_r2 < 0.15, n={len(ls)}): median ratio active/uniform = {np.median([r['active_mse']/r['uniform_mse'] for r in ls]):.2f} (need <= 1.10), max {max(r['active_mse']/r['uniform_mse'] for r in ls):.2f}")
    r60 = [r for r in byn(60) if hi(r)]
    S.append("H4-iii hi-het at n=60: active/oracle MSE " + ", ".join(f"{r['pair']} {r['active_mse']/r['oracle_mse']:.2f}" for r in r60))
    for n in NS:
        rr = byn(n)
        S.append(f"n={n}: median MSE ratio active/uniform {np.median([r['active_mse']/r['uniform_mse'] for r in rr]):.2f}, "
                 f"uniform_cv/uniform {np.median([r['uniform_cv_mse']/r['uniform_mse'] for r in rr]):.2f}, "
                 f"oracle/uniform {np.median([r['oracle_mse']/r['uniform_mse'] for r in rr]):.2f}; "
                 f"active wins on {sum(r['active_mse'] < r['uniform_mse'] for r in rr)}/21")
    open(os.path.join(HERE, "results", "summary_5a.txt"), "w").write("\n".join(S) + "\n")
    print("\n".join(S))
