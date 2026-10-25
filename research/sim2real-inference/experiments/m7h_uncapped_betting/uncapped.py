"""Milestone 7h: hedged-capital betting intervals with the bet cap c/m for c in {0.5, 0.99}, real-only versus twin-assisted (exact twin mean), on the m3 and m7 pools.
python3 uncapped.py [reps]  ->  results/uncapped.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7h)"""
import csv, os, sys
import numpy as np
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
POOLS = {"pendulum": os.path.join(HERE, "..", "m3_benchmark", "results", "pool.csv"),
         "cartpole": os.path.join(HERE, "..", "m7_cartpole", "results", "pool.csv")}
NS, SEED, CAPS, G = (60, 240, 960), 77, (0.5, 0.99), 600
GRID = np.linspace(0.0005, 0.9995, G)


def load(path):
    rows = list(csv.reader(open(path)))
    a = np.array([[float(x) for x in r[1:]] for r in rows[1:]])
    return {n: a[:, j] for j, n in enumerate(rows[0][1:])}


def bets(x, alpha):
    """Predictable plug-in (PrPl-EB) bets of Waudby-Smith and Ramdas (2024): lambda_t from the running variance of x_1..x_{t-1}, prior variance 1/4."""
    n = len(x); t = np.arange(1, n + 1)
    mu = (0.5 + np.cumsum(x)) / (t + 1)  # mu[k] uses x_1..x_{k+1}
    ss = np.concatenate([[0.0], np.cumsum((x - mu) ** 2)[:-1]])
    var = (0.25 + ss) / t
    return np.sqrt(2 * np.log(2 / alpha) / (var * t * np.log(1 + t)))


def interval(x, alpha, cap):
    """Hedged-capital betting confidence interval for the mean of x in [0, 1]: the candidate means m whose final capital stays below 1/alpha."""
    lam = bets(x, alpha)[:, None]
    m = GRID[None, :]
    d = x[:, None] - m
    lp, lm = np.minimum(lam, cap / m), np.minimum(lam, cap / (1 - m))
    kp = np.log1p(lp * d).sum(0); km = np.log1p(-lm * d).sum(0)
    cap_ = np.logaddexp(kp, km) - np.log(2)  # log of theta K+ + (1 - theta) K- with theta = 1/2
    ok = cap_ < np.log(1 / alpha)
    if not ok.any():
        return 0.5, 1.0
    idx = np.flatnonzero(ok)
    step = GRID[1] - GRID[0]
    return GRID[idx[0]] - step / 2, GRID[idx[-1]] + step / 2


def eb(x, rng_width, delta):
    n = len(x)
    return np.sqrt(2 * x.var(ddof=1) * np.log(2 / delta) / n) + 7 * rng_width * np.log(2 / delta) / (3 * (n - 1))


def run(args):
    task, name, n, reps, seed = args
    D = LOADED[task]; R, T = D[name], D["twin"]
    rng = np.random.default_rng(seed)
    truth, tm = R.mean(), T.mean()
    cov = {(a, c): 0 for a in ("real", "ppi") for c in CAPS}
    wid = {k: 0.0 for k in cov}; w_eb = 0.0
    for _ in range(reps):
        i = rng.choice(len(R), n, replace=False)
        r, z = R[i], (R[i] - T[i] + 1) / 2
        w_eb += 2 * eb(r, 1.0, 0.05)
        for c in CAPS:
            lo, hi = interval(r, 0.05, c); cov[("real", c)] += lo <= truth <= hi; wid[("real", c)] += hi - lo
            lo, hi = interval(z, 0.05, c); lo, hi = 2 * lo - 1 + tm, 2 * hi - 1 + tm  # back to the scale of R
            cov[("ppi", c)] += lo <= truth <= hi; wid[("ppi", c)] += hi - lo
    rho = float(np.corrcoef(R, T)[0, 1])
    out = [task, name, n, round(rho, 3), round(w_eb / reps, 4)]
    for c in CAPS:
        out += [round(100 * cov[("real", c)] / reps, 1), round(wid[("real", c)] / reps, 4), round(100 * cov[("ppi", c)] / reps, 1), round(wid[("ppi", c)] / reps, 4)]
    return out


LOADED = {k: load(v) for k, v in POOLS.items()}
HEAD = ["task", "pair", "n", "rho", "w_eb_real"] + [f"{a}_c{c}" for c in CAPS for a in ("cov_real", "w_real", "cov_ppi", "w_ppi")]

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    jobs = [(t, p, n, reps, SEED * 1000 + 13 * j + n) for t in POOLS for j, p in enumerate(k for k in LOADED[t] if k != "twin") for n in NS]
    with Pool(4) as pool:
        rows = pool.map(run, jobs)
    with open(os.path.join(HERE, "results", "uncapped.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(HEAD); w.writerows(rows)
    ix = {h: i for i, h in enumerate(HEAD)}
    L = [f"reps per cell: {reps}; widths are full interval widths on the outcome scale"]
    for t in POOLS:
        s = [r for r in rows if r[0] == t]
        L.append(f"[{t}] min coverage over all cells and variants: {min(min(r[ix[k]] for k in HEAD if k.startswith('cov')) for r in s):.1f}")
        for n in NS:
            q = [r for r in s if r[2] == n]
            a = lambda k: np.array([r[ix[k]] for r in q])
            L.append(f"  n={n}: real betting c=0.99 / c=0.5 median {np.median(a('w_real_c0.99') / a('w_real_c0.5')):.3f}, narrower on {int((a('w_real_c0.99') < a('w_real_c0.5')).sum())}/21; "
                     f"c=0.99 / real EB median {np.median(a('w_real_c0.99') / a('w_eb_real')):.3f}, narrower on {int((a('w_real_c0.99') < a('w_eb_real')).sum())}/21")
            L.append(f"      twin-assisted(exact mean)/real-only betting: c=0.99 median {np.median(a('w_ppi_c0.99') / a('w_real_c0.99')):.3f}, min {np.min(a('w_ppi_c0.99') / a('w_real_c0.99')):.3f}, narrower on {int((a('w_ppi_c0.99') < a('w_real_c0.99')).sum())}/21; "
                     f"c=0.5 median {np.median(a('w_ppi_c0.5') / a('w_real_c0.5')):.3f}, narrower on {int((a('w_ppi_c0.5') < a('w_real_c0.5')).sum())}/21")
        L += [f"    {r[1]:10s} n={r[2]} rho={r[3]:.2f} ratio(c=.99)={r[ix['w_ppi_c0.99']] / r[ix['w_real_c0.99']]:.3f}" for r in sorted(s, key=lambda r: (-r[2], -r[3]))[:8]]
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
