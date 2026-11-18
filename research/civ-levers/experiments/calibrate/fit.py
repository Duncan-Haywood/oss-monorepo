"""Fit the mean-field Deffuant map to GSS panel cross-tables (reads crosstabs.json, writes results.txt).

Model: E[x1 | x0] = x0 + kappa * sum_j p_j (x_j - x0) 1{|x_j - x0| <= eps}, p the wave-1 distribution,
x rescaled to [0, 1] by equal spacing of the answer codes. eps >= 1 is the unbounded pull to the mean
(also what regression to the mean and measurement error give). Needs numpy only.
"""
import json, sys
import numpy as np

EPS = np.round(np.arange(0.1, 1.0001, 0.05), 2)   # 1.0 = unbounded
NB, SEED = 400, 20261108


def gfun(x, p, eps):
    d = x[None, :] - x[:, None]                       # d[i, j] = x_j - x_i
    return ((np.abs(d) <= eps + 1e-9) * d * p[None, :]).sum(1)


def fit_one(x, p, ybar, w, grid=EPS):
    """Least squares over eps; kappa is linear so closed form. Returns sse per eps, kappa per eps."""
    delta = ybar - x
    sse, kap = [], []
    for e in grid:
        g = gfun(x, p, e)
        den = (w * g * g).sum()
        k = (w * g * delta).sum() / den if den > 0 else 0.0
        sse.append((w * (delta - k * g) ** 2).sum()); kap.append(k)
    return np.array(sse), np.array(kap)


def summarise(tab, x):
    n_i = tab.sum(1); keep = n_i > 0
    p = tab.sum(0) / tab.sum()
    ybar = np.where(keep, (tab * x[None, :]).sum(1) / np.maximum(n_i, 1), 0)
    var = np.where(keep, (tab * (x[None, :] - ybar[:, None]) ** 2).sum(1) / np.maximum(n_i - 1, 1), 0)
    return n_i, keep, p, ybar, var


def run(key, v, rng):
    lev = np.array(v["levels"]); k = len(lev)
    x = np.arange(k) / (k - 1)
    tab = np.array(v["table"], float)
    n_i, keep, p0, ybar, var = summarise(tab, x)
    p = tab.sum(1) / tab.sum()                         # wave-1 distribution (rows)
    xs, ps, ys, ws = x[keep], p[keep], ybar[keep], n_i[keep]
    # the model's population is the wave-1 distribution over kept bins
    ps = ps / ps.sum()
    sse, kap = fit_one(xs, ps, ys, ws)
    j = int(np.argmin(sse)); jinf = len(EPS) - 1
    obs_gain = sse[jinf] - sse[j]
    mean = (p * x).sum()
    # bootstrap: resample respondents cell-wise (multinomial over the table)
    flat = tab.ravel() / tab.sum(); n = int(tab.sum())
    boots = []
    for _ in range(NB):
        t = rng.multinomial(n, flat).reshape(tab.shape).astype(float)
        ni, kp, _, yb, _ = summarise(t, x)
        pp = t.sum(1) / t.sum(); kp = kp & (ni > 0)
        if kp.sum() < 3: continue
        s, _ = fit_one(x[kp], pp[kp] / pp[kp].sum(), yb[kp], ni[kp])
        boots.append(EPS[int(np.argmin(s))])
    boots = np.array(boots)
    # null: eps = infinity is true; bin means get Gaussian noise of their own standard error
    se = np.sqrt(var / np.maximum(n_i, 1))[keep]
    fitted = xs + kap[jinf] * gfun(xs, ps, 1.0)
    gains = []
    for _ in range(NB):
        yb = fitted + rng.normal(0, 1, len(fitted)) * se
        s, _ = fit_one(xs, ps, yb, ws)
        gains.append(s[jinf] - s.min())
    pval = (np.sum(np.array(gains) >= obs_gain - 1e-12) + 1) / (NB + 1)
    # repulsion: bins >= 0.3 from the mean that move away from it
    rep = []
    for xi, yi, ni, si in zip(xs, ys, ws, np.sqrt(var[keep] / np.maximum(n_i[keep], 1))):
        if abs(xi - mean) >= 0.3 and ni >= 30 and si > 0:
            toward = np.sign(mean - xi) * (yi - xi)
            rep.append((round(float(xi), 2), int(ni), round(float(toward), 3), round(float(toward / si), 2)))
    return dict(item=v["item"], pair=v["pair"], n=v["n"], k=k, eps_hat=float(EPS[j]), kappa_at_hat=float(kap[j]),
                kappa_inf=float(kap[jinf]), gain=float(obs_gain), p_finite=float(pval),
                eps_lo=float(np.percentile(boots, 2.5)), eps_hi=float(np.percentile(boots, 97.5)),
                share_boot_finite=float(np.mean(boots < 0.999)), rep=rep)


def main():
    data = json.load(open("crosstabs.json"))
    rng = np.random.default_rng(SEED)
    res = [run(k, v, rng) for k, v in data.items()]
    json.dump(res, open("fit.json", "w"), indent=1)
    L = []
    L.append(f"GSS 2016-2020 panel, mean-field Deffuant fit; {len(res)} item x wave-pair tables, {NB} bootstrap draws, seed {SEED}")
    L.append("item pair n k eps_hat [95% boot] kappa_hat kappa_inf p(finite beats inf)")
    for r in res:
        L.append(f"{r['item']:9s} {r['pair']} {r['n']:5d} {r['k']:2d} {r['eps_hat']:.2f} [{r['eps_lo']:.2f},{r['eps_hi']:.2f}] "
                 f"{r['kappa_at_hat']:+.3f} {r['kappa_inf']:+.3f} p={r['p_finite']:.3f}")
    sig = [r for r in res if r["p_finite"] < 0.05]
    fin = [r for r in res if r["eps_hi"] < 0.999]
    L.append(f"H1: finite eps beats unbounded at 5% in {len(sig)} of {len(res)} tables ({len(sig)/len(res):.0%}); "
             f"95% bootstrap interval entirely below the scale range in {len(fin)}")
    ident = [r for r in res if r["p_finite"] < 0.05]
    if ident:
        L.append(f"H2: median eps_hat among those {len(ident)} tables = {np.median([r['eps_hat'] for r in ident]):.2f}; "
                 f"range {min(r['eps_hat'] for r in ident):.2f} to {max(r['eps_hat'] for r in ident):.2f}")
    L.append(f"all tables: median eps_hat {np.median([r['eps_hat'] for r in res]):.2f}; share with eps_hat = unbounded "
             f"{np.mean([r['eps_hat']>=0.999 for r in res]):.0%}; median kappa_inf {np.median([r['kappa_inf'] for r in res]):+.3f}")
    rep = [(r["item"], r["pair"], b) for r in res for b in r["rep"] if b[3] <= -2.0]
    L.append(f"H3: tail bins moving away from the mean with z <= -2: {len(rep)} of {sum(len(r['rep']) for r in res)} tail bins")
    for t in rep: L.append("   " + str(t))
    open("results.txt", "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
