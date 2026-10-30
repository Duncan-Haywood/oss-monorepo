"""Milestone 7g: fixed-weight PPI empirical-Bernstein interval versus real-only at larger n, on the m3 (pendulum) and m7 (cart-pole score) pools.
python3 largen.py [reps]  ->  results/largen.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7g)"""
import csv, os, sys
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
POOLS = {"pendulum": os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv"),
         "cartpole": os.path.join(HERE, "..", "m7_cartpole", "results", "pool.csv")}
NS, SEED = (240, 480, 960, 1920), 91


def load(path):
    rows = list(csv.reader(open(path)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def eb(x, rng_width, delta):
    """Maurer and Pontil (2009) empirical Bernstein half-width for the mean of n iid values in an interval of width rng_width."""
    n = len(x)
    return np.sqrt(2 * x.var(ddof=1) * np.log(2 / delta) / n) + 7 * rng_width * np.log(2 / delta) / (3 * (n - 1))


def run(args):
    task, name, n, reps, seed = args
    D = LOADED[task]; R, T = D[name], D["twin"]
    rng = np.random.default_rng(seed)
    truth = R.mean()
    h_tw = eb(T, 1.0, 0.025)  # twin mean from the whole twin pool (4,000 runs)
    c0 = c1 = c2 = 0
    w0 = w1 = w2 = 0.0
    for _ in range(reps):
        i = rng.choice(len(R), n, replace=False)
        r, t = R[i], T[i]
        e0, h0 = r.mean(), eb(r, 1.0, 0.05)
        z = r - t
        e1, h1 = z.mean() + T.mean(), eb(z, 2.0, 0.025) + h_tw
        h2 = eb(z, 2.0, 0.05)  # twin mean treated as exact (unlimited twin runs): the most favourable case
        c0 += abs(e0 - truth) <= h0; c1 += abs(e1 - truth) <= h1; c2 += abs(e1 - truth) <= h2
        w0 += 2 * h0; w1 += 2 * h1; w2 += 2 * h2
    rho = float(np.corrcoef(R, T)[0, 1])
    return [task, name, n, round(rho, 3), round(100 * c0 / reps, 2), round(100 * c1 / reps, 2), round(w0 / reps, 4), round(w1 / reps, 4), round(w1 / w0, 3), round(100 * c2 / reps, 2), round(w2 / w0, 3)]


def spearman(a, b):
    rank = lambda x: np.argsort(np.argsort(x, kind="stable"), kind="stable").astype(float)  # ties broken by order; adequate for a screen
    return float(np.corrcoef(rank(a), rank(b))[0, 1])


def crossover(R, T, delta=0.05):
    """Smallest n at which the EB half-width of the exact-twin-mean PPI interval is below real-only, using population standard deviations (n up to 10**6)."""
    L = np.log(2 / delta)
    sR, sZ = R.std(ddof=1), (R - T).std(ddof=1)
    n = np.arange(2, 10 ** 6)
    ok = np.sqrt(2 * sZ ** 2 * L / n) + 14 * L / (3 * (n - 1)) < np.sqrt(2 * sR ** 2 * L / n) + 7 * L / (3 * (n - 1))
    return int(n[np.argmax(ok)]) if ok.any() else None


LOADED = {k: load(v) for k, v in POOLS.items()}

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    jobs = [(t, p, n, reps, SEED * 1000 + 13 * j + n) for t in POOLS for j, p in enumerate(k for k in LOADED[t] if k != "twin") for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "largen.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["task", "pair", "n", "rho", "cov_real", "cov_ppi", "width_real", "width_ppi", "width_ratio", "cov_ppi_inf", "width_ratio_inf"])
        w.writerows(rows)
    L = [f"reps per cell: {reps}"]
    for t in POOLS:
        s = [r for r in rows if r[0] == t]
        L.append(f"[{t}] min coverage real {min(r[4] for r in s):.2f}, ppi {min(r[5] for r in s):.2f}  (H7g-ii: " + ("supported" if min(min(r[4], r[5]) for r in s) >= 95 else "refuted") + ")")
        L.append(f"  min coverage with the twin mean exact: {min(r[9] for r in s):.2f}")
        for n in NS:
            q = [r for r in s if r[2] == n]
            L.append(f"  n={n}: ppi (N=4,000 twin runs) narrower on {sum(r[8] < 1 for r in q)} of {len(q)} pairs, ratio median {np.median([r[8] for r in q]):.3f}, min {min(r[8] for r in q):.3f}; "
                     f"twin mean exact: narrower on {sum(r[10] < 1 for r in q)}, ratio median {np.median([r[10] for r in q]):.3f}, min {min(r[10] for r in q):.3f}")
        win = {}
        for r in s:
            if r[10] < 1:
                win[r[1]] = min(win.get(r[1], 1e9), r[2])
        rho = {r[1]: r[3] for r in s}
        if len(win) >= 3:
            rs = spearman([rho[k] for k in win], [win[k] for k in win])
            L.append(f"  crossing pairs {len(win)}; Spearman(rho, smallest winning n) = {rs:.3f}")
        else:
            L.append(f"  crossing pairs {len(win)} (too few for the Spearman test)")
        L += [f"    {r[1]:10s} n={r[2]} rho={r[3]:.2f} ratio={r[8]:.3f} exact={r[10]:.3f}" for r in sorted(s, key=lambda r: (-r[2], -r[3]))[:12]]
    L.append("analytic crossover n* (population sd, twin mean exact, plug-in not simulated):")
    for t in POOLS:
        cr = {k: crossover(LOADED[t][k], LOADED[t]["twin"]) for k in LOADED[t] if k != "twin"}
        v = sorted(x for x in cr.values() if x)
        L.append(f"  [{t}] n* exists on {len(v)} of {len(cr)} pairs; min {v[0] if v else None}, median {v[len(v) // 2] if v else None}, max {v[-1] if v else None}; "
                 f"n* <= 700 on {sum(1 for x in v if x <= 700)}; best pairs: " + ", ".join(f"{k} ({x})" for k, x in sorted(cr.items(), key=lambda kv: kv[1] or 10 ** 9)[:4]))
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
