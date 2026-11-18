"""Independent reference for engine.mjs (run: python3 eval/reference.py > eval/reference.json).

Sums of squares come from statsmodels' OLS ANOVA (typ=2, balanced data, so
every type agrees; for the nested design, differences of residual sums of
squares between nested OLS fits), not from the formulas engine.mjs uses. Variance components
are then solved from the expected mean squares by numpy.linalg.solve, and the
chi-square and F quantiles and p-values come from scipy.stats.
"""
import json, sys
import numpy as np
import pandas as pd
import scipy, statsmodels
from scipy import stats
import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm

rng = np.random.default_rng(20261118)

def crossed(p, o, n, sp, so, spo, se):
    P = rng.normal(0, sp, p); O = rng.normal(0, so, o)
    rows = []
    for i in range(o):
        for j in range(p):
            g = rng.normal(0, spo)
            for _ in range(n):
                rows.append({"part": f"P{j+1}", "operator": f"O{i+1}", "y": round(float(50 + P[j] + O[i] + g + rng.normal(0, se)), 4)})
    return rows

def nested(p, o, n, sp, so, se):
    O = rng.normal(0, so, o)
    rows = []
    for i in range(o):
        for j in range(p):
            P = rng.normal(0, sp)
            for _ in range(n):
                rows.append({"part": f"O{i+1}-P{j+1}", "operator": f"O{i+1}", "y": round(float(20 + O[i] + P + rng.normal(0, se)), 4)})
    return rows

out = {"versions": {"numpy": np.__version__, "scipy": scipy.__version__, "statsmodels": statsmodels.__version__, "pandas": pd.__version__}, "cases": [], "quantiles": []}
specs = [("crossed", (10, 3, 3, 2.0, 0.3, 0.2, 0.5)), ("crossed", (10, 2, 2, 1.0, 0.0, 0.0, 0.3)), ("crossed", (5, 4, 3, 0.5, 0.5, 0.4, 0.2)),
         ("crossed", (12, 3, 2, 3.0, 1.0, 0.0, 1.0)), ("crossed", (3, 2, 5, 0.2, 0.1, 0.1, 0.1)),
         ("nested", (5, 3, 2, 1.0, 0.3, 0.4)), ("nested", (4, 2, 3, 0.5, 0.0, 0.5)), ("nested", (10, 4, 2, 2.0, 1.0, 0.2))]
for design, a in specs:
    rows = crossed(*a) if design == "crossed" else nested(*a)
    df = pd.DataFrame(rows)
    if design == "crossed":
        p, o, n = a[0], a[1], a[2]
        t = anova_lm(smf.ols("y ~ C(part) * C(operator)", df).fit(), typ=2)
        ss = {"part": t.loc["C(part)", "sum_sq"], "operator": t.loc["C(operator)", "sum_sq"], "interaction": t.loc["C(part):C(operator)", "sum_sq"], "error": t.loc["Residual", "sum_sq"]}
        dfs = {"part": p - 1, "operator": o - 1, "interaction": (p - 1) * (o - 1), "error": o * p * (n - 1)}
        ms = {k: ss[k] / dfs[k] for k in ss}
        # E(MS) rows: [part, operator, interaction, error] coefficients of (sP, sO, sPO, sE)
        E = np.array([[o * n, 0, n, 1], [0, p * n, n, 1], [0, 0, n, 1], [0, 0, 0, 1]], float)
        v = np.linalg.solve(E, [ms["part"], ms["operator"], ms["interaction"], ms["error"]])
        comps = {"part": v[0], "operator": v[1], "interaction": v[2], "repeatability": v[3]}
        pvals = {"part": stats.f.sf(ms["part"] / ms["interaction"], dfs["part"], dfs["interaction"]),
                 "operator": stats.f.sf(ms["operator"] / ms["interaction"], dfs["operator"], dfs["interaction"]),
                 "interaction": stats.f.sf(ms["interaction"] / ms["error"], dfs["interaction"], dfs["error"])}
        # pooled model
        t2 = anova_lm(smf.ols("y ~ C(part) + C(operator)", df).fit(), typ=2)
        msr = t2.loc["Residual", "sum_sq"] / t2.loc["Residual", "df"]
        E2 = np.array([[o * n, 0, 1], [0, p * n, 1], [0, 0, 1]], float)
        v2 = np.linalg.solve(E2, [ms["part"], ms["operator"], msr])
        pooled = {"part": v2[0], "operator": v2[1], "repeatability": v2[2], "msResidual": msr, "dfResidual": float(t2.loc["Residual", "df"])}
    else:
        # Part labels are unique to an operator, so part(operator) is the drop in
        # residual sum of squares from the operator-only fit to the part fit.
        rss = lambda f: smf.ols(f, df).fit().ssr
        p, o, n = a[0], a[1], a[2]
        r0, r1, r2 = rss("y ~ 1"), rss("y ~ C(operator)"), rss("y ~ C(part)")
        ss = {"operator": r0 - r1, "partInOperator": r1 - r2, "error": r2}
        dfs = {"operator": o - 1, "partInOperator": o * (p - 1), "error": o * p * (n - 1)}
        ms = {k: ss[k] / dfs[k] for k in ss}
        E = np.array([[p * n, n, 1], [0, n, 1], [0, 0, 1]], float)
        v = np.linalg.solve(E, [ms["operator"], ms["partInOperator"], ms["error"]])
        comps = {"operator": v[0], "part": v[1], "repeatability": v[2]}
        pvals = {"operator": stats.f.sf(ms["operator"] / ms["partInOperator"], dfs["operator"], dfs["partInOperator"]),
                 "partInOperator": stats.f.sf(ms["partInOperator"] / ms["error"], dfs["partInOperator"], dfs["error"])}
        pooled = None
    rep = comps["repeatability"]
    out["cases"].append({"design": design, "args": a, "rows": rows, "ss": ss, "df": dfs, "components": comps, "p": pvals, "pooled": pooled,
                         "repeatabilityCI": [ss["error"] / stats.chi2.ppf(0.975, dfs["error"]), ss["error"] / stats.chi2.ppf(0.025, dfs["error"])]})
for pr in [0.005, 0.025, 0.05, 0.5, 0.95, 0.975, 0.995]:
    for d1, d2 in [(1, 1), (1, 30), (2, 18), (9, 18), (18, 60), (3, 4), (40, 120)]:
        out["quantiles"].append({"p": pr, "d1": d1, "d2": d2, "chi2": stats.chi2.ppf(pr, d1), "f": stats.f.ppf(pr, d1, d2), "fsf": stats.f.sf(2.5, d1, d2)})
json.dump(out, sys.stdout, indent=1, default=float)
