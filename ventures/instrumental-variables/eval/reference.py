"""Reference numbers from linearmodels 7.1 (NCSA licence), run as an external program.

Writes eval/reference.json, which reference.test.mjs checks engine.mjs against.
None of linearmodels' code is copied into the tool. The Anderson-Rubin checks
use statistics computed here with linearmodels' OLS (IV2SLS with no endogenous
regressors) and set endpoints found with scipy's brentq, independently of the
engine's closed form and grid.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
from scipy import optimize, stats
import linearmodels
from linearmodels.iv import IV2SLS, IVLIML, IVGMM

here = Path(__file__).resolve().parent
d = pd.read_csv(here.parent / "data" / "schooling-simulated.csv")
d["const"] = 1.0

CASES = [
    dict(name="main overidentified", endog=["education_years"], instr=["college_nearby", "tuition"],
         exog=["experience", "experience_sq", "black", "south", "urban"]),
    dict(name="just identified", endog=["education_years"], instr=["college_nearby"],
         exog=["experience", "experience_sq", "black", "south", "urban"]),
    dict(name="two endogenous", endog=["education_years", "experience"], instr=["college_nearby", "tuition", "age"],
         exog=["black", "south", "urban"]),
]
d["age"] = d["education_years"] + d["experience"] + 6 + (d["person"] % 3)  # an instrument for experience, built here only


def fitdict(res):
    return {"params": res.params.tolist(), "se": res.std_errors.tolist(), "names": list(res.params.index)}


def cov_kwargs(cov):
    return {"cov_type": "clustered", "clusters": d["county"]} if cov == "clustered" else {"cov_type": cov}


out = {"linearmodels": linearmodels.__version__, "scipy": scipy.__version__, "numpy": np.__version__,
       "data": "data/schooling-simulated.csv", "outcome": "log_wage", "cluster": "county", "cases": []}
for c in CASES:
    case = {**c, "fits": []}
    exog = d[["const"] + c["exog"]]
    for cov in ["unadjusted", "robust", "clustered"]:
        for debiased in [False, True]:
            kw = {**cov_kwargs(cov), "debiased": debiased}
            ols = IV2SLS(d.log_wage, d[["const"] + c["exog"] + c["endog"]], None, None).fit(**kw)
            tsls = IV2SLS(d.log_wage, exog, d[c["endog"]], d[c["instr"]]).fit(**kw)
            liml = IVLIML(d.log_wage, exog, d[c["endog"]], d[c["instr"]]).fit(**kw)
            fuller = IVLIML(d.log_wage, exog, d[c["endog"]], d[c["instr"]], fuller=1).fit(**kw)
            fs = tsls.first_stage.diagnostics
            f = {"se": cov, "debiased": debiased, "ols": fitdict(ols), "tsls": fitdict(tsls), "liml": fitdict(liml), "fuller": fitdict(fuller),
                 "kappa_liml": float(liml.kappa), "kappa_fuller": float(fuller.kappa),
                 "first_stage": {v: {k: (float(fs.loc[v, k]) if k != "f.dist" else str(fs.loc[v, k])) for k in fs.columns} for v in fs.index},
                 "first_stage_coefs": {v: {"params": r.params.tolist(), "se": r.std_errors.tolist()} for v, r in tsls.first_stage.individual.items()},
                 "durbin": float(tsls.durbin().stat), "wu_hausman": float(tsls.wu_hausman().stat),
                 "wooldridge_regression": float(tsls.wooldridge_regression.stat)}
            if len(c["instr"]) > len(c["endog"]):
                f["sargan"] = float(tsls.sargan.stat)
                if cov != "unadjusted":
                    gmm = IVGMM(d.log_wage, exog, d[c["endog"]], d[c["instr"]], weight_type=cov, **({"clusters": d["county"]} if cov == "clustered" else {})).fit(iter_limit=2, **kw)
                    f["hansen_j"] = float(gmm.j_stat.stat)
                    f["gmm_params"] = gmm.params.tolist()
            case["fits"].append(f)
    # Anderson-Rubin, one endogenous regressor: statistic at several b0 and set endpoints
    if len(c["endog"]) == 1:
        x = d[c["endog"][0]]
        Zfull = d[["const"] + c["exog"] + c["instr"]]
        q = len(c["instr"])
        ar = {}
        for cov in ["unadjusted", "robust", "clustered"]:
            def stat(b0, cov=cov):
                kw = {**cov_kwargs(cov), "debiased": cov == "unadjusted"}
                r = IV2SLS(d.log_wage - b0 * x, Zfull, None, None).fit(**kw)
                p = r.params[c["instr"]].to_numpy()
                V = r.cov.loc[c["instr"], c["instr"]].to_numpy()
                w = float(p @ np.linalg.solve(V, p))
                return w / q if cov == "unadjusted" else w
            n, kz = len(d), Zfull.shape[1]
            crit = stats.f.ppf(0.95, q, n - kz) if cov == "unadjusted" else stats.chi2.ppf(0.95, q)
            b2 = float(IV2SLS(d.log_wage, exog, d[c["endog"]], d[c["instr"]]).fit(**cov_kwargs(cov)).params[c["endog"][0]])
            grid = np.linspace(b2 - 0.5, b2 + 0.5, 2001)
            inside = np.array([stat(b) <= crit for b in grid])
            ends = []
            for i in range(1, len(grid)):
                if inside[i] != inside[i - 1]:
                    ends.append(optimize.brentq(lambda b: stat(b) - crit, grid[i - 1], grid[i], xtol=1e-13))
            ar[cov] = {"at": {str(b0): stat(b0) for b0 in [0.0, 0.05, 0.08, 0.12]}, "crit": float(crit),
                       "endpoints": ends, "inside_at_grid_edges": [bool(inside[0]), bool(inside[-1])]}
        case["anderson_rubin"] = ar
    out["cases"].append(case)

(here / "reference.json").write_text(json.dumps(out, indent=1))
print("wrote", here / "reference.json")
for c in out["cases"]:
    f = c["fits"][2]
    print(c["name"], "2SLS", f["tsls"]["params"][-len(c["endog"]):], "AR", {k: v["endpoints"] for k, v in c.get("anderson_rubin", {}).items()})
