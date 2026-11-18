"""Independent reference numbers for engine.test.mjs, from lifelines and statsmodels.

Run (any Python 3.10+ with the two packages):
    pip install lifelines==0.30.3 statsmodels==0.15.0
    python eval/reference.py            # writes eval/cases/*.csv and eval/reference.json

The synthetic cases are drawn with a fixed numpy seed, rounded so that event
times tie (the hard case for Efron and Breslow), and written to CSV so the
JavaScript tests read the exact same rows. Nothing here is fitted by our own
code: every number in reference.json comes from lifelines or statsmodels.
"""
import json
import os

import lifelines
import numpy as np
import pandas as pd
import statsmodels
from lifelines import CoxPHFitter, KaplanMeierFitter
from lifelines.statistics import multivariate_logrank_test, proportional_hazard_test
from lifelines.utils import median_survival_times, restricted_mean_survival_time
from statsmodels.duration.hazard_regression import PHReg
from statsmodels.duration.survfunc import survdiff

HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, "cases"), exist_ok=True)


def inf_str(x):
    """JSON has no Infinity: write a median that is never reached as the string "Infinity"."""
    return "Infinity" if np.isinf(x) else float(x)


def synth(seed, n, groups, ncov, cat=False, round_to=1.0):
    rng = np.random.default_rng(seed)
    g = rng.integers(0, groups, n)
    X = rng.normal(size=(n, ncov))
    beta = np.linspace(0.8, -0.5, ncov)
    lin = X @ beta + 0.6 * g
    t_ev = rng.exponential(10 * np.exp(-lin))
    t_c = rng.exponential(14, n)
    t = np.minimum(t_ev, t_c)
    t = np.maximum(round_to, np.round(t / round_to) * round_to)
    e = (t_ev <= t_c).astype(int)
    df = pd.DataFrame({"time": t, "event": e, "arm": [f"arm{k}" for k in g]})
    for j in range(ncov):
        df[f"x{j + 1}"] = np.round(X[:, j], 3)
    if cat:
        df["site"] = rng.choice(["north", "south", "east"], n)
    if seed == 1:  # two binary strata columns for the stratified refit, from their own stream
        r2 = np.random.default_rng(101)
        df["s1"] = r2.choice(["a", "b"], n)
        df["s2"] = r2.integers(0, 2, n)
    return df


CASES = {
    "leukemia": (pd.read_csv(os.path.join(HERE, "..", "data", "leukemia.csv")), "weeks", "relapsed", "treatment", ["logWBC"]),
    "ties3": (synth(1, 120, 3, 2), "time", "event", "arm", ["x1", "x2"]),
    "ties2cat": (synth(2, 200, 2, 3, cat=True, round_to=2.0), "time", "event", "arm", ["x1", "x2", "x3", "site"]),
    "smooth": (synth(3, 80, 2, 1, round_to=0.001), "time", "event", "arm", ["x1"]),
}

# Stratified refits: each case's strata columns (their combinations are the strata).
STRATA = {"leukemia": ["sex"], "ties2cat": ["site"], "ties3": ["s1", "s2"]}


def design(df, group, covs, levels):
    out = pd.DataFrame(index=df.index)
    for lv in levels[1:]:
        out[f"{group}={lv} vs {levels[0]}"] = (df[group] == lv).astype(float)
    for c in covs:
        if pd.api.types.is_numeric_dtype(df[c]):
            out[c] = df[c].astype(float)
        else:
            lv = list(dict.fromkeys(df[c]))
            for l in lv[1:]:
                out[f"{c}={l} vs {lv[0]}"] = (df[c] == l).astype(float)
    return out


ref = {"generated_with": {"lifelines": lifelines.__version__, "statsmodels": statsmodels.__version__, "numpy": np.__version__, "pandas": pd.__version__}, "cases": {}}
for name, (df, T, E, G, covs) in CASES.items():
    if name != "leukemia":
        df.to_csv(os.path.join(HERE, "cases", f"{name}.csv"), index=False)
    levels = list(dict.fromkeys(df[G]))
    case = {"time": T, "event": E, "group": G, "covariates": covs, "groups": {}}
    tau = min(df[df[G] == lv][T].max() for lv in levels)
    case["tau"] = float(tau)
    for lv in levels:
        sub = df[df[G] == lv]
        kmf = KaplanMeierFitter().fit(sub[T], sub[E])
        sf = kmf.survival_function_["KM_estimate"]
        ci = kmf.confidence_interval_
        cim = median_survival_times(kmf.confidence_interval_)
        case["groups"][lv] = {
            "times": [float(x) for x in sf.index],
            "survival": [float(x) for x in sf.values],
            "lo": [None if np.isnan(x) else float(x) for x in ci.iloc[:, 0]],
            "hi": [None if np.isnan(x) else float(x) for x in ci.iloc[:, 1]],
            "median": inf_str(kmf.median_survival_time_),
            "median_lo": inf_str(cim.iloc[0, 0]),
            "median_hi": inf_str(cim.iloc[0, 1]),
            "rmst": float(restricted_mean_survival_time(kmf, t=tau)),
        }
    lr = multivariate_logrank_test(df[T], df[G], df[E])
    case["logrank"] = {"chi_square": float(lr.test_statistic), "p": float(lr.p_value), "df": int(lr.degrees_of_freedom)}
    gcode = df[G].map({lv: i for i, lv in enumerate(levels)}).values
    case["statsmodels_survdiff"] = {}
    for wt, key in ((None, "logrank"), ("gb", "wilcoxon"), ("tw", "tarone-ware")):
        chi, p = survdiff(df[T].values, df[E].values, gcode, weight_type=wt)
        case["statsmodels_survdiff"][key] = {"chi_square": float(chi), "p": float(p)}

    X = design(df, G, covs, levels)
    fitdf = pd.concat([X, df[[T, E]]], axis=1)
    cph = CoxPHFitter().fit(fitdf, duration_col=T, event_col=E)  # Efron ties
    ph = proportional_hazard_test(cph, fitdf, time_transform="km")
    llr = cph.log_likelihood_ratio_test()
    case["cox_efron_lifelines"] = {
        "names": list(X.columns),
        "coef": [float(cph.params_[c]) for c in X.columns],
        "se": [float(cph.standard_errors_[c]) for c in X.columns],
        "p": [float(cph.summary.loc[c, "p"]) for c in X.columns],
        "log_lik": float(cph.log_likelihood_),
        "lr": float(llr.test_statistic),
        "concordance": float(cph.concordance_index_),
        "ph_km_chi_square": [float(x) for x in np.atleast_1d(ph.test_statistic)],
        "ph_km_p": [float(x) for x in np.atleast_1d(ph.p_value)],
    }
    for ties in ("efron", "breslow"):
        m = PHReg(df[T].values, X.values, status=df[E].values, ties=ties).fit()
        case[f"cox_{ties}_statsmodels"] = {"coef": [float(x) for x in m.params], "se": [float(x) for x in m.bse], "log_lik": float(m.llf)}
    if name in STRATA:
        S = STRATA[name]
        skey = df[S].astype(str).agg("|".join, axis=1)
        scode = skey.map({k: i for i, k in enumerate(dict.fromkeys(skey))}).values
        st = {"strata": S}
        for wt, key in ((None, "logrank"), ("gb", "wilcoxon"), ("tw", "tarone-ware")):
            chi, p = survdiff(df[T].values, df[E].values, gcode, weight_type=wt, strata=scode)
            st[f"survdiff_{key}"] = {"chi_square": float(chi), "p": float(p)}
        Xs = design(df, G, [c for c in covs if c not in S], levels)
        sfit = pd.concat([Xs, df[[T, E]], df[S]], axis=1)
        scph = CoxPHFitter().fit(sfit, duration_col=T, event_col=E, strata=S)
        sph = proportional_hazard_test(scph, sfit, time_transform="km")
        st["cox_efron_lifelines"] = {
            "names": list(Xs.columns),
            "coef": [float(scph.params_[c]) for c in Xs.columns],
            "se": [float(scph.standard_errors_[c]) for c in Xs.columns],
            "log_lik": float(scph.log_likelihood_),
            "concordance": float(scph.concordance_index_),
            "ph_km_chi_square": [float(x) for x in np.atleast_1d(sph.test_statistic)],
            "ph_km_p": [float(x) for x in np.atleast_1d(sph.p_value)],
        }
        for ties in ("efron", "breslow"):
            m = PHReg(df[T].values, Xs.values, status=df[E].values, strata=scode, ties=ties).fit()
            st[f"cox_{ties}_statsmodels"] = {"coef": [float(x) for x in m.params], "se": [float(x) for x in m.bse], "log_lik": float(m.llf)}
        case["stratified"] = st
    ref["cases"][name] = case

with open(os.path.join(HERE, "reference.json"), "w") as f:
    json.dump(ref, f, indent=1, allow_nan=False)
print("wrote", len(ref["cases"]), "cases")
