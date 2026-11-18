"""Milestone 4h: a reference distribution for the robust-jackknife update test that comes from a model.

    python3 experiments/m4h_modelref/analyse.py      # about a minute; no new solve

Milestone 4g scored z^2 = (f_new - f_old)^2 / (v_old + v_new) against chi^2_1 at 1%, with v the plain
(J) or robust, MAD-based (R) leave-one-view-out variance of f. chi^2_1 was never derived for R. Here
the reference is the 99th percentile of z^2 when each view adds an independent offset to f (the model
of milestone 4f's A13 reference), by Monte Carlo over the same delete-one construction. The statistic
is scale-free, so the reference depends only on the two set sizes, and a robot can compute it for any
design with nothing borrowed. Scores H56-H58 (LOG.md, 2026-11-14, milestone 4h planned) on milestone
4g's splits and writes summary.json and reference.png.
"""
import importlib.util, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
_spec = importlib.util.spec_from_file_location("m4g", os.path.join(ROOT, "experiments", "m4g_allsplits", "analyse.py"))
m4g = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4g)

CAMS, DESIGNS, SCEN, CHI2 = m4g.CAMS, m4g.DESIGNS, m4g.SCEN, m4g.CHI2_1_99
DISTS = ("normal", "t5", "t3")
N_DRAWS = 1_000_000
CHUNK = 200_000
SEED = 20261114
LARGE_N = (4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40)     # n_old = k = n, model only


def set_variances(e):
    """Vectorised m4g.variances for rows of per-view offsets e (N, n), all n delete-one sets usable.
    Returns the set's f (mean offset) and its J and R."""
    n = e.shape[1]
    f = e.mean(1)
    loo = (e.sum(1, keepdims=True) - e) / (n - 1)
    J = (n - 1) / n * ((loo - loo.mean(1, keepdims=True)) ** 2).sum(1)
    med = np.median(loo, 1, keepdims=True)
    R = (n - 1) ** 2 / n * (m4g.MAD * np.median(np.abs(loo - med), 1)) ** 2
    return f, J, R


def draw(rng, dist, shape):
    if dist == "normal":
        return rng.standard_normal(shape)
    return rng.standard_t(int(dist[1:]), shape)


def model_z2(n_old, k, dist="normal", n_draws=N_DRAWS, seed=SEED):
    """z^2 under J and under R for n_draws unchanged updates of the independent-offset model."""
    rng = np.random.default_rng([seed, n_old, k, DISTS.index(dist)])
    zJ, zR = [], []
    for start in range(0, n_draws, CHUNK):
        m = min(CHUNK, n_draws - start)
        fo, Jo, Ro = set_variances(draw(rng, dist, (m, n_old)))
        fn, Jn, Rn = set_variances(draw(rng, dist, (m, k)))
        d2 = (fn - fo) ** 2
        with np.errstate(divide="ignore", invalid="ignore"):
            zJ.append(np.where(Jo + Jn > 0, d2 / (Jo + Jn), np.inf))
            zR.append(np.where(Ro + Rn > 0, d2 / (Ro + Rn), np.inf))
    return np.concatenate(zJ), np.concatenate(zR)


def references():
    """q[dist][design] = {'J': 99th pct, 'R': 99th pct, 'pR_chi2': P(z_R^2 > chi2), 'pJ_chi2': ...}."""
    q = {}
    for dist in DISTS:
        q[dist] = {}
        for des in DESIGNS:
            zJ, zR = model_z2(*des, dist=dist)
            q[dist][des] = dict(J=float(np.quantile(zJ, 0.99)), R=float(np.quantile(zR, 0.99)),
                                pJ_chi2=float(np.mean(zJ > CHI2)), pR_chi2=float(np.mean(zR > CHI2)))
    return q


def large_sets(n_draws=400_000):
    out = {}
    for n in LARGE_N:
        zJ, zR = model_z2(n, n, n_draws=n_draws)
        out[n] = dict(qR=float(np.quantile(zR, 0.99)), qJ=float(np.quantile(zJ, 0.99)),
                      pR_chi2=float(np.mean(zR > CHI2)), pJ_chi2=float(np.mean(zJ > CHI2)))
    return out


def rates(D, q):
    """Detection counts for every design, camera, scenario and reference."""
    res = {}
    for des, dd in D.items():
        for (cam, name, s), row in dd.items():
            refs = {"R_chi2": row["z2_R"] > CHI2, "J_chi2": row["z2_J"] > CHI2}
            for dist in DISTS:
                refs[f"R_{dist}"] = row["z2_R"] > q[dist][des]["R"]
                refs[f"J_{dist}"] = row["z2_J"] > q[dist][des]["J"]
            for ref, f in refs.items():
                res[(des, cam, name, s, ref)] = dict(n=int(len(f)), det=int(f.sum()),
                                                     harm=int(m4g.harmful(row, f).sum()))
    return res


rate = m4g.rate


def score(res, large):
    pm2 = (0.98, 1.02)
    H = {}
    h = {cam: rate(res, "R_normal", cams=(cam,)) for cam in CAMS}
    h["holds"] = bool(all(h[c] <= 0.010 for c in CAMS))
    H["H56"] = h
    h = dict(R_normal_pm2_k6=rate(res, "R_normal", design=(7, 6), scen="S1", s_set=pm2))
    h["holds"] = bool(0.15 <= h["R_normal_pm2_k6"] <= 0.35)
    H["H57"] = h
    h = {f"n{n}": large[n]["pR_chi2"] for n in LARGE_N if n <= 20}
    h["holds"] = bool(all(v > 0.02 for v in h.values()))
    H["H58"] = h
    return H


def table(res):
    rows = []
    refs = ["R_chi2", "J_chi2"] + [f"{e}_{d}" for d in DISTS for e in ("R", "J")]
    for des in DESIGNS:
        for name, s in SCEN:
            for ref in refs:
                r = dict(design=f"{des[0]}+{des[1]}", scen=name, s=s, ref=ref)
                for cam in CAMS:
                    x = res[(des, cam, name, s, ref)]
                    r[cam] = x["det"] / x["n"] if x["n"] else float("nan")
                    r[f"harm_{cam}"] = x["harm"] / x["n"] if x["n"] else float("nan")
                r["pooled"] = rate(res, ref, design=des, scen=name, s_set=(s,))
                rows.append(r)
    return rows


def figure(res, q, large, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2))
    ax = axes[0]
    ns = sorted(large)
    ax.plot(ns, [100 * large[n]["pR_chi2"] for n in ns], "o-", color="#c0392b", label="robust (MAD) jackknife")
    ax.plot(ns, [100 * large[n]["pJ_chi2"] for n in ns], "s-", color="#1b2f6b", label="plain jackknife")
    ax.axhline(1.0, color="grey", lw=0.8, ls=":")
    for k, mk in ((4, "^"), (5, "v"), (6, "D")):
        real = 100 * rate(res, "R_chi2", design=(7, k))
        ax.plot([k], [real], mk, color="#c08a3e", ms=7, label=f"real views, robust, 7 + {k}" if k == 4 else f"7 + {k}")
    ax.set_xscale("log")
    ax.set_xticks(ns)
    ax.set_xticklabels([str(n) for n in ns], fontsize=7)
    ax.set_xlabel("views in each set (old = new = n; real points: new views k)")
    ax.set_ylabel("false alarms against χ²₁ at 1% (%)")
    ax.set_title("Independent-offset model: χ²₁ is too lenient for the robust jackknife", fontsize=9)
    ax.legend(fontsize=7, frameon=False)
    ax = axes[1]
    xs = sorted(set(m4g.S_LIST) | {1.0})
    style = {"R_chi2": ("#c0392b", "--", "robust, χ²₁ (milestone 4g)"), "R_normal": ("#c0392b", "-", "robust, model reference"),
             "J_chi2": ("#1b2f6b", "--", "plain, χ²₁"), "J_normal": ("#1b2f6b", "-", "plain, model reference")}
    for ref, (c, ls, lab) in style.items():
        ys = [rate(res, ref, design=(7, 6), scen="S0" if s == 1.0 else "S1", s_set=(s,)) for s in xs]
        ax.plot([100 * (s - 1) for s in xs], ys, "o", ls=ls, color=c, label=lab, ms=4)
    ax.axhline(0.01, color="grey", lw=0.8, ls=":")
    ax.set_xlabel("focal change applied to the new views (%)")
    ax.set_ylabel("share of splits where the test fires (both cameras)")
    ax.set_title("Real views, 7 old + 6 new, 3,432 splits per point", fontsize=9)
    ax.set_ylim(-0.02, 1.02)
    ax.legend(fontsize=7, frameon=False)
    fig.suptitle("Milestone 4h: a model reference for the f-alone update test, 5×5 corners", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


def main():
    q = references()
    large = large_sets()
    sols = m4g.load()
    T = {cam: m4g.per_set(sols[cam]) for cam in CAMS}
    D = {des: m4g.decisions(T, *des) for des in DESIGNS}
    res = rates(D, q)
    H = score(res, large)
    tab = table(res)
    real_fa = {f"7+{k}": {cam: rate(res, "R_chi2", design=(7, k), cams=(cam,)) for cam in CAMS} for k in (4, 5, 6)}
    harm = {ref: sum(res[(des, c, n, s, ref)]["harm"] for des in DESIGNS for c in CAMS for n, s in SCEN)
            / sum(res[(des, c, n, s, ref)]["n"] for des in DESIGNS for c in CAMS for n, s in SCEN)
            for ref in ("R_chi2", "R_normal", "R_t5", "R_t3", "J_chi2", "J_normal")}
    S = dict(hypotheses=H, references={d: {f"{a}+{b}": v for (a, b), v in q[d].items()} for d in q},
             large_sets=large, real_false_alarms_R_chi2=real_fa, harmful=harm, table=tab,
             n_draws=N_DRAWS, seed=SEED)
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1)
    for d in DISTS:
        print(d, {f"{a}+{b}": {x: round(y, 4) for x, y in v.items()} for (a, b), v in q[d].items()})
    print("large sets", json.dumps({n: {x: round(y, 4) for x, y in v.items()} for n, v in large.items()}))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    print("real R vs chi2 false alarms", json.dumps(real_fa))
    print("harmful", json.dumps(harm))
    for r in tab:
        if r["design"] in ("7+5", "7+6", "9+4") and (r["scen"] in ("S0", "S3") or r["s"] in (0.98, 1.02, 0.99, 1.01, 0.96, 1.04)):
            print(f"{r['design']} {r['scen']} {r['s']:.3f} {r['ref']:9s} left {r['left']:.3f} right {r['right']:.3f} pooled {r['pooled']:.3f}")
    for k in (4, 5, 6):
        print(f"S0 7+{k}", {ref: {c: round(rate(res, ref, design=(7, k), cams=(c,)), 4) for c in CAMS}
                           for ref in ("R_normal", "R_t5", "R_t3", "J_normal")})
    figure(res, q, large, os.path.join(HERE, "reference.png"))


if __name__ == "__main__":
    main()
