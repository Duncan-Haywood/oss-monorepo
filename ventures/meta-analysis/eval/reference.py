"""Reference values for engine.test.mjs, from statsmodels and scipy (independent implementations).

Run from the repository root:  python3 ventures/meta-analysis/eval/reference.py
It writes eval/reference.json.

- DL and Paule-Mandel pooling, Q, I-squared and the Hartung-Knapp interval come from
  statsmodels.stats.meta_analysis.combine_effects (method_re "chi2" is DerSimonian-Laird,
  "iterated" is Paule-Mandel; the "random effect wls" row with use_t=True is Hartung-Knapp).
- REML is found here by maximising the restricted log-likelihood directly with
  scipy.optimize.minimize_scalar (the engine uses Fisher scoring instead), for the
  intercept-only model and for the meta-regression on absolute latitude.
- The Q-profile interval uses scipy.optimize.brentq on the generalised Q.
- Egger's test is an ordinary least squares fit by statsmodels.OLS.
- Hedges' g comes from statsmodels.stats.meta_analysis.effectsize_smd (same J = 1 - 3/(4N - 9));
  its variance there uses N - 3.94, so the Borenstein (2009, eq. 4.20-4.24) variance the engine
  uses is computed here from the formula.
"""
import json
import pathlib

import numpy as np
import scipy
import statsmodels
import statsmodels.api as sm
from scipy import optimize, stats
from statsmodels.stats.meta_analysis import combine_effects, effectsize_smd

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "data" / "bcg-vaccine-trials.csv"


def read_bcg():
    lines = DATA.read_text().strip().splitlines()
    head = lines[0].split(",")
    rows = [line.split(",") for line in lines[1:]]
    col = lambda name, f=float: np.array([f(r[head.index(name)]) for r in rows])
    return col("tpos"), col("tneg"), col("cpos"), col("cneg"), col("ablat")


def wls(y, v, X, tau2):
    w = 1 / (v + tau2)
    XtWX = X.T @ (w[:, None] * X)
    inv = np.linalg.inv(XtWX)
    beta = inv @ (X.T @ (w * y))
    r = y - X @ beta
    return beta, inv, float(np.sum(w * r * r)), XtWX


def reml(y, v, X):
    def nll(t):
        beta, inv, q, XtWX = wls(y, v, X, t)
        return 0.5 * (np.sum(np.log(v + t)) + np.log(np.linalg.det(XtWX)) + q)
    res = optimize.minimize_scalar(nll, bounds=(0, 50), method="bounded", options={"xatol": 1e-12})
    t = res.x if nll(res.x) < nll(0.0) else 0.0
    return float(t)


def dl_mm(y, v, X):
    k, p = X.shape
    w = 1 / v
    beta, inv, q, _ = wls(y, v, X, 0.0)
    W = np.diag(w)
    P = W - W @ X @ inv @ X.T @ W
    return float(max(0.0, (q - (k - p)) / np.trace(P)))


def pm(y, v, X):
    k, p = X.shape
    f = lambda t: wls(y, v, X, t)[2] - (k - p)
    return 0.0 if f(0) <= 0 else float(optimize.brentq(f, 0, 100, xtol=1e-14))


def model(y, v, X, tau2):
    beta, inv, q, _ = wls(y, v, X, tau2)
    se = np.sqrt(np.diag(inv))
    return {"beta": beta.tolist(), "se": se.tolist(), "tau2": tau2, "QE": wls(y, v, X, 0.0)[2]}


def qprofile(y, v, X, conf=0.95):
    k, p = X.shape
    df = k - p
    qhi, qlo = stats.chi2.ppf(1 - (1 - conf) / 2, df), stats.chi2.ppf((1 - conf) / 2, df)
    g = lambda t, target: wls(y, v, X, t)[2] - target
    lower = 0.0 if g(0, qhi) <= 0 else optimize.brentq(g, 0, 100, args=(qhi,), xtol=1e-14)
    upper = 0.0 if g(0, qlo) <= 0 else optimize.brentq(g, 0, 100, args=(qlo,), xtol=1e-14)
    return float(lower), float(upper)


def pooled(y, v):
    k = len(y)
    out = {}
    for name, meth in (("DL", "chi2"), ("PM", "iterated")):
        r = combine_effects(y, v, method_re=meth, use_t=False)
        f = r.summary_frame()
        rt = combine_effects(y, v, method_re=meth, use_t=True).summary_frame()
        out[name] = {
            "tau2": float(r.tau2), "estimate": float(f.loc["random effect", "eff"]), "se": float(f.loc["random effect", "sd_eff"]),
            "lower": float(f.loc["random effect", "ci_low"]), "upper": float(f.loc["random effect", "ci_upp"]),
            "hkLower": float(rt.loc["random effect wls", "ci_low"]), "hkUpper": float(rt.loc["random effect wls", "ci_upp"]),
        }
        out["Q"] = float(r.q)
        out["I2fromQ"] = float(r.i2)
        out["FE"] = {"estimate": float(f.loc["fixed effect", "eff"]), "se": float(f.loc["fixed effect", "sd_eff"])}
    X = np.ones((k, 1))
    t = reml(y, v, X)
    m = model(y, v, X, t)
    w = 1 / (v + t)
    q_t = float(np.sum(w * (y - m["beta"][0]) ** 2))
    se_hk = np.sqrt(q_t / (k - 1) / np.sum(w))
    tq = stats.t.ppf(0.975, k - 1)
    out["REML"] = {"tau2": t, "estimate": m["beta"][0], "se": m["se"][0], "hkLower": m["beta"][0] - tq * se_hk, "hkUpper": m["beta"][0] + tq * se_hk}
    # I-squared from tau2 and the typical within-study variance (Higgins & Thompson 2002).
    wf = 1 / v
    s2 = (k - 1) * wf.sum() / (wf.sum() ** 2 - (wf ** 2).sum())
    out["REML"]["I2"] = t / (t + s2)
    tk2 = stats.t.ppf(0.975, k - 2)
    half = tk2 * np.sqrt(t + m["se"][0] ** 2)
    out["REML"]["prediction"] = [m["beta"][0] - half, m["beta"][0] + half]
    out["tau2CI"] = list(qprofile(y, v, X))
    out["pQ"] = float(stats.chi2.sf(out["Q"], k - 1))
    return out


def egger(y, v):
    se = np.sqrt(v)
    fit = sm.OLS(y / se, sm.add_constant(1 / se)).fit()
    return {"intercept": float(fit.params[0]), "se": float(fit.bse[0]), "p": float(fit.pvalues[0])}


def main():
    a, b, c, d, ablat = read_bcg()
    n1, n2 = a + b, c + d
    out = {"statsmodels": statsmodels.__version__, "scipy": scipy.__version__}

    y_rr = np.log(a / n1) - np.log(c / n2)
    v_rr = 1 / a - 1 / n1 + 1 / c - 1 / n2
    y_or = np.log(a * d / (b * c))
    v_or = 1 / a + 1 / b + 1 / c + 1 / d
    p1, p2 = a / n1, c / n2
    y_rd = p1 - p2
    v_rd = p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2

    out["RR"] = {"yi": y_rr.tolist(), "vi": v_rr.tolist(), **pooled(y_rr, v_rr), "egger": egger(y_rr, v_rr)}
    out["OR"] = {"yi": y_or.tolist(), "vi": v_or.tolist(), **pooled(y_or, v_or)}
    out["RD"] = {"yi": y_rd.tolist(), "vi": v_rd.tolist(), **pooled(y_rd, v_rd)}

    # Leave-one-out with DL (statsmodels).
    loo = []
    for i in range(len(y_rr)):
        keep = np.arange(len(y_rr)) != i
        r = combine_effects(y_rr[keep], v_rr[keep], method_re="chi2")
        loo.append({"estimate": float(r.summary_frame().loc["random effect", "eff"]), "tau2": float(r.tau2)})
    out["RR"]["leaveOneOutDL"] = loo

    # Meta-regression on absolute latitude.
    X = np.column_stack([np.ones(len(y_rr)), ablat])
    reg = {}
    for name, est in (("REML", reml), ("DL", dl_mm), ("PM", pm)):
        t = est(y_rr, v_rr, X)
        m = model(y_rr, v_rr, X, t)
        reg[name] = {"tau2": t, "intercept": m["beta"][0], "slope": m["beta"][1], "seSlope": m["se"][1], "QE": m["QE"]}
    t0 = reml(y_rr, v_rr, np.ones((len(y_rr), 1)))
    reg["REML"]["R2"] = (t0 - reg["REML"]["tau2"]) / t0
    out["regressionAblat"] = reg

    # A zero-cell case: 0.5 added to every cell of a table with a zero (computed here by hand).
    zc = np.array([[0, 20, 3, 17], [2, 48, 6, 44], [1, 29, 0, 30], [5, 95, 9, 91]], float)
    za, zb, zcc, zd = (zc[:, j] + 0.5 * (zc == 0).any(axis=1) for j in range(4))
    out["zeroCells"] = {"table": zc.tolist(), "yi_or": np.log(za * zd / (zb * zcc)).tolist(), "vi_or": (1 / za + 1 / zb + 1 / zcc + 1 / zd).tolist()}

    # Continuous outcomes: Hedges' g against statsmodels, MD and pooled REML by formula here.
    rng = np.random.default_rng(20261116)
    k = 9
    n1c, n2c = rng.integers(12, 80, k).astype(float), rng.integers(12, 80, k).astype(float)
    m1, m2 = rng.normal(10.5, 1.2, k).round(2), rng.normal(10.0, 1.2, k).round(2)
    s1, s2 = rng.uniform(1.5, 3.5, k).round(2), rng.uniform(1.5, 3.5, k).round(2)
    g, _ = effectsize_smd(m1, s1, n1c, m2, s2, n2c)
    sp = np.sqrt(((n1c - 1) * s1 ** 2 + (n2c - 1) * s2 ** 2) / (n1c + n2c - 2))
    dd = (m1 - m2) / sp
    J = 1 - 3 / (4 * (n1c + n2c - 2) - 1)
    vg = J ** 2 * ((n1c + n2c) / (n1c * n2c) + dd ** 2 / (2 * (n1c + n2c)))
    out["continuous"] = {
        "rows": [[float(m1[i]), float(s1[i]), int(n1c[i]), float(m2[i]), float(s2[i]), int(n2c[i])] for i in range(k)],
        "g": g.tolist(), "vg": vg.tolist(), "smd": pooled(g, vg),
        "md": (m1 - m2).tolist(), "vmd": (s1 ** 2 / n1c + s2 ** 2 / n2c).tolist(),
    }

    (HERE / "reference.json").write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", HERE / "reference.json")


if __name__ == "__main__":
    main()
