"""Reference numbers from statsmodels' TreatmentEffect (BSD-3), run as an external program.

Writes eval/reference.json. Each case: a dataset, the covariates (used in both
the logit propensity model and the linear outcome models), and for each
estimator the potential-outcome means, the effect and the GMM (HC0) standard
errors that statsmodels reports.
"""
import json
from pathlib import Path
import numpy as np
import statsmodels
import statsmodels.api as sm
from statsmodels.treatment.treatment_effects import TreatmentEffect

here = Path(__file__).resolve().parent
rows = np.genfromtxt(here.parent / "data" / "job-training-simulated.csv", delimiter=",", names=True)

CASES = [
    {"name": "all-covariates", "covariates": ["age", "education_years", "married", "unemployed_last_year", "prior_earnings"]},
    {"name": "two-covariates", "covariates": ["age", "education_years"]},
    {"name": "earnings-only", "covariates": ["prior_earnings", "unemployed_last_year"]},
]

out = {"statsmodels": statsmodels.__version__, "data": "data/job-training-simulated.csv", "treatment": "trained", "outcome": "earnings_after", "cases": []}
y = rows["earnings_after"]
d = rows["trained"].astype(int)
for c in CASES:
    X = sm.add_constant(np.column_stack([rows[k] for k in c["covariates"]]))
    logit = sm.Logit(d, X).fit(disp=False)
    ols = sm.OLS(y, X)
    te = TreatmentEffect(ols, d, results_select=logit)
    case = {"name": c["name"], "covariates": c["covariates"], "logit": {"params": logit.params.tolist(), "bse": logit.bse.tolist()}}
    def grab(res):
        f = res.summary_frame()
        return {k: {"coef": float(f.loc[k, "coef"]), "se": float(f.loc[k, "std err"])} for k in ["ATE", "POM0", "POM1"]}
    for grp in ["all", 1, 0]:
        key = {"all": "ate", 1: "att", 0: "atc"}[grp]
        case[f"ipw_{key}"] = grab(te.ipw(effect_group=grp))
        case[f"ra_{key}"] = grab(te.ra(effect_group=grp))
    case["aipw_ate"] = grab(te.aipw())
    out["cases"].append(case)

(here / "reference.json").write_text(json.dumps(out, indent=1) + "\n")
print(json.dumps(out["cases"][0], indent=1)[:3000])
