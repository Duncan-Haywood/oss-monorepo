#!/usr/bin/env python3
"""Held-out tests of the SPEC 6.3 proxy hypotheses on GSS microdata.

    python3 -I pipeline/proxy_tests.py --raw RAW_DIR --out ventures/raphaels-map/data [--reps 1000]

Implements pipeline/proxy_tests_prereg.md exactly (written before this was
run). Writes data/surveys/proxy_tests.json. Individual-level only: nothing
here says anything about county (ecological) versions of a proxy.
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_surveys import GSS_WEIGHT, gss_analysis_frame, load_gss  # noqa: E402

SPLIT_A = {"train": [2000, 2002, 2004, 2006, 2008, 2010, 2012], "test": [2014, 2016, 2018]}
SPLIT_B = {"train": [2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018], "test": [2021, 2022, 2024]}
K_Y1, K_Y2 = 7, 2
VERDICTS = ("supported out of sample", "not supported", "insufficient data", "exploratory (no confirmatory verdict)")


# ------------------------------------------------------------------ metrics

def weighted_auc(y, s, w) -> float:
    """P(score_pos > score_neg) over weighted pairs; ties count 1/2."""
    y = np.asarray(y)
    _, idx = np.unique(np.asarray(s), return_inverse=True)
    return _auc_from_idx(idx, y, np.asarray(w, float))


def _auc_from_idx(idx, y, w) -> float:
    P = np.bincount(idx, weights=w * (y == 1))
    N = np.bincount(idx, weights=w * (y == 0))
    tp, tn = P.sum(), N.sum()
    if tp == 0 or tn == 0:
        return float("nan")
    below = np.cumsum(N) - N
    return float((np.sum(P * below) + 0.5 * np.sum(P * N)) / (tp * tn))


def weighted_brier(y, p, w) -> float:
    w = np.asarray(w, float)
    return float(np.sum(w * (np.asarray(p) - np.asarray(y)) ** 2) / np.sum(w))


def calibration(y, p, w) -> dict:
    w = np.asarray(w, float)
    lp = np.log(np.clip(p, 1e-9, 1 - 1e-9) / (1 - np.clip(p, 1e-9, 1 - 1e-9)))
    slope = None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            r = sm.GLM(y, sm.add_constant(lp), family=sm.families.Binomial(), var_weights=w / w.mean()).fit()
        slope = round(float(r.params[1]), 3)
    except Exception:  # noqa: BLE001 - reported as null
        pass
    return {"mean_predicted": round(float(np.sum(w * p) / w.sum()), 4),
            "mean_observed": round(float(np.sum(w * y) / w.sum()), 4), "slope": slope}


def psu_bootstrap_weights(strata, psu, reps: int, rng) -> np.ndarray:
    """reps x n multipliers: PSUs resampled with replacement within strata."""
    keys = pd.Series([f"{a}\x1f{b}" for a, b in zip(strata, psu)])
    pidx, puniq = pd.factorize(keys)
    pstr = pd.factorize(pd.Series([k.split("\x1f")[0] for k in puniq]))[0]
    cnt = np.zeros((reps, len(puniq)))
    rows = np.arange(reps)[:, None]
    for h in range(pstr.max() + 1):
        g = np.flatnonzero(pstr == h)
        draw = g[rng.integers(0, len(g), size=(reps, len(g)))]
        np.add.at(cnt, (np.broadcast_to(rows, draw.shape), draw), 1)
    out = cnt[:, pidx]
    return out


# --------------------------------------------------------------- variables

def outcomes(d: pd.DataFrame) -> dict:
    c = d["chldidel"]
    return {
        "Y1": pd.Series(np.where(c.isin([4, 5, 6, 7]), 1.0, np.where(c.isin([0, 1, 2, 3]), 0.0, np.nan)), d.index),
        "Y1_S1": pd.Series(np.where(c.isin([4, 5, 6, 7, 8]), 1.0, np.where(c.isin([0, 1, 2, 3]), 0.0, np.nan)), d.index),
        "Y2": pd.Series(np.where(d["divlaw"] == 2, 1.0, np.where(d["divlaw"].isin([1, 3]), 0.0, np.nan)), d.index),
        "Y3": pd.Series(np.where(d["fefam"].isin([1, 2]), 1.0, np.where(d["fefam"].isin([3, 4]), 0.0, np.nan)), d.index),
    }


OUTCOME_TEXT = {
    "Y1": "ideal number of children 4+ (CHLDIDEL 4-7 vs 0-3; 'as many as you want' excluded)",
    "Y1_S1": "ideal number of children 4+ or 'as many as you want' (CHLDIDEL 4-8 vs 0-3)",
    "Y2": "divorce should be more difficult to obtain (DIVLAW 2 vs 1 or 3)",
    "Y3": "agrees it is better for the man to work and the woman to tend the home (FEFAM 1-2 vs 3-4); a role norm",
}


def _ind(mask, valid):
    return pd.Series(np.where(valid, mask.astype(float), np.nan), mask.index)


def predictors(d: pd.DataFrame) -> dict:
    a, r = d["attend"], d["relig"]
    pid, pv = d["partyid"], d["polviews"]
    return {
        "weekly": {"weekly": _ind(a.isin([7, 8]), a.notna())},
        "catholic": {"catholic": _ind(r == 2, r.notna())},
        "political": {"republican": _ind(pid.isin([4, 5, 6]), pid.notna()),
                      "conservative": _ind(pv.isin([5, 6, 7]), pv.notna())},
        "rural": {"rural": _ind(d["xnorcsiz"].isin([8, 9, 10]), d["xnorcsiz"].notna())},
        "intact16": {"intact16": _ind(d["family16"] == 1, d["family16"].notna())},
        "hunt": {"hunts": _ind(d["hunt"].isin([1, 3]), d["hunt"].notna())},
    }


PRED_TEXT = {
    "weekly": "attends religious services weekly or more (ATTEND 7-8)",
    "catholic": "Catholic affiliation (RELIG 2), any attendance",
    "political": "Republican incl. leaners (PARTYID 4-6) and conservative (POLVIEWS 5-7), entered together",
    "rural": "lives in a town under 10,000 or open country (XNORCSIZ 8-10)",
    "intact16": "lived with both own parents at 16 (FAMILY16 1)",
    "hunt": "respondent hunts (HUNT 1 or 3)",
}


def baseline_matrix(d: pd.DataFrame) -> pd.DataFrame:
    X = pd.DataFrame(index=d.index)
    X["age"] = (d["age"] - 30) / 10
    X["age2"] = X["age"] ** 2
    X["female"] = (d["sex"] == 2).astype(float).where(d["sex"].notna())
    for k in (1, 2, 3, 4):
        X[f"degree{k}"] = (d["degree"] == k).astype(float).where(d["degree"].notna())
    for k in (2, 3, 4):
        X[f"region{k}"] = (d["region"] == k).astype(float)
    return X


# ------------------------------------------------------------------- tests

def fit(y, X, w):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return sm.GLM(y, sm.add_constant(X, has_constant="add"), family=sm.families.Binomial(),
                      var_weights=w / w.mean()).fit()


def run_pair(d, y, base, extra: dict, split, universe, reps, rng, cache):
    """Fit baseline and baseline+extra on identical complete-case rows."""
    X = base.copy()
    for k, v in extra.items():
        X[k] = v
    ok = universe & y.notna() & X.notna().all(axis=1)
    tr = ok & d["year"].isin(split["train"])
    te = ok & d["year"].isin(split["test"])
    res = {"n_train": int(tr.sum()), "n_test": int(te.sum()),
           "n_test_positive": int((y[te] == 1).sum())}
    if res["n_train"] < 100 or res["n_test"] == 0:
        return res, None
    w_tr, w_te = d.loc[tr, GSS_WEIGHT].to_numpy(), d.loc[te, GSS_WEIGHT].to_numpy()
    m_base = fit(y[tr], base.loc[tr], w_tr)
    m_full = fit(y[tr], X.loc[tr], w_tr)
    p_base = m_base.predict(sm.add_constant(base.loc[te], has_constant="add"))
    p_full = m_full.predict(sm.add_constant(X.loc[te], has_constant="add"))
    yt = y[te].to_numpy()
    key = hash(te.to_numpy().tobytes())
    sub = d.loc[te]
    if key not in cache:
        cache[key] = psu_bootstrap_weights(sub["_stratum"].to_numpy(), sub["_psu"].to_numpy(), reps, rng)
    B = cache[key]
    _, ib = np.unique(np.asarray(p_base), return_inverse=True)
    _, iff = np.unique(np.asarray(p_full), return_inverse=True)
    wb = B * w_te
    boot = {
        "auc": np.array([_auc_from_idx(iff, yt, ww) for ww in wb]),
        "auc_base": np.array([_auc_from_idx(ib, yt, ww) for ww in wb]),
        "brier": np.array([weighted_brier(yt, p_full, ww) for ww in wb]),
        "brier_base": np.array([weighted_brier(yt, p_base, ww) for ww in wb]),
    }
    # odds ratio(s) of the proxy in training, PSU-cluster-robust SE (stratification ignored)
    groups = pd.factorize(d.loc[tr, "_stratum"].astype(str) + "|" + d.loc[tr, "_psu"].astype(str))[0]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        rob = sm.GLM(y[tr], sm.add_constant(X.loc[tr], has_constant="add"), family=sm.families.Binomial(),
                     var_weights=w_tr / w_tr.mean()).fit(cov_type="cluster", cov_kwds={"groups": groups})
    ors = {}
    for k in extra:
        b, se = float(rob.params[k]), float(rob.bse[k])
        ors[k] = {"odds_ratio": round(np.exp(b), 3), "ci_low": round(np.exp(b - 1.96 * se), 3),
                  "ci_high": round(np.exp(b + 1.96 * se), 3)}
    pt = {"auc": weighted_auc(yt, p_full, w_te), "auc_base": weighted_auc(yt, p_base, w_te),
          "brier": weighted_brier(yt, p_full, w_te), "brier_base": weighted_brier(yt, p_base, w_te),
          "cal": calibration(yt, np.asarray(p_full), w_te), "cal_base": calibration(yt, np.asarray(p_base), w_te),
          "prev": float(np.sum(w_te * yt) / w_te.sum()), "or": ors}
    return res, {"pt": pt, "boot": boot}


def q(a, lo, hi):
    return [round(float(np.nanquantile(a, lo)), 4), round(float(np.nanquantile(a, hi)), 4)]


def record(tid, hyp, ykey, pkeys, split, res, out, *, confirmatory, adj_level=None, notes=""):
    rec = {"id": tid, "hypothesis": hyp, "outcome": OUTCOME_TEXT[ykey],
           "predictors": [PRED_TEXT[p] for p in pkeys],
           "controls": "age, age squared, sex, highest degree (5 levels), Census region (4)",
           "train_years": split["train"], "test_years": split["test"], **res,
           "confirmatory": confirmatory}
    if out is None:
        rec.update({"auc": None, "auc_ci": None, "baseline_auc": None, "brier": None, "baseline_brier": None,
                    "verdict": "insufficient data", "notes": notes + " Too few cases to fit."})
        return rec
    pt, bt = out["pt"], out["boot"]
    dauc = bt["auc"] - bt["auc_base"]
    dbr = bt["brier"] - bt["brier_base"]
    rec.update({
        "auc": round(pt["auc"], 4), "auc_ci": q(bt["auc"], 0.025, 0.975),
        "baseline_auc": round(pt["auc_base"], 4), "baseline_auc_ci": q(bt["auc_base"], 0.025, 0.975),
        "brier": round(pt["brier"], 5), "baseline_brier": round(pt["brier_base"], 5),
        "delta_auc": round(pt["auc"] - pt["auc_base"], 4), "delta_auc_ci95": q(dauc, 0.025, 0.975),
        "delta_brier": round(pt["brier"] - pt["brier_base"], 6), "delta_brier_ci95": q(dbr, 0.025, 0.975),
        "test_prevalence_weighted": round(pt["prev"], 4),
        "calibration": pt["cal"], "baseline_calibration": pt["cal_base"],
        "train_odds_ratios": pt["or"],
    })
    verdict = "exploratory (no confirmatory verdict)"
    if res["n_test"] < 300 or res["n_test_positive"] < 30:
        verdict = "insufficient data"
    elif confirmatory:
        a = 0.05 / adj_level
        lo = q(dauc, a / 2, 1 - a / 2)
        rec["delta_auc_ci_adjusted"] = lo
        rec["adjusted_level"] = round(1 - a, 4)
        verdict = ("supported out of sample" if lo[0] > 0 and rec["delta_brier"] <= 0 else "not supported")
    rec["verdict"] = verdict
    rec["notes"] = (notes + " Bootstrap: PSUs resampled within strata on the test set, model held fixed "
                    "(training uncertainty not propagated). Odds ratios: training fit, PSU-cluster-robust SE, "
                    "stratification ignored.").strip()
    return rec


def run(d: pd.DataFrame, reps: int, seed: int = 20261029) -> list:
    rng = np.random.default_rng(seed)
    Y = outcomes(d)
    P = predictors(d)
    base = baseline_matrix(d)
    u18_44 = d["age"].between(18, 44)
    w18_34 = d["age"].between(18, 34) & (d["sex"] == 2)
    cache: dict = {}
    tests = []

    def one(tid, hyp, yk, pk, split, univ, conf, k=None, notes=""):
        extra = {}
        for p in pk:
            extra.update(P[p])
        b = base.drop(columns=["female"]) if univ is w18_34 else base
        res, out = run_pair(d, Y[yk], b, extra, split, univ, reps, rng, cache)
        tests.append(record(tid, hyp, yk, pk, split, res, out, confirmatory=conf, adj_level=k, notes=notes))
        return res, out

    def diff(tid, hyp, yk, split, conf, k):
        # Both models on the rows complete for weekly AND catholic.
        both = u18_44 & P["weekly"]["weekly"].notna() & P["catholic"]["catholic"].notna()
        rw, ow = run_pair(d, Y[yk], base, P["weekly"], split, both, reps, rng, cache)
        rc, oc = run_pair(d, Y[yk], base, P["catholic"], split, both, reps, rng, cache)
        rec = {"id": tid, "hypothesis": hyp, "outcome": OUTCOME_TEXT[yk],
               "predictors": [PRED_TEXT["weekly"], "versus", PRED_TEXT["catholic"]],
               "controls": "age, age squared, sex, highest degree (5 levels), Census region (4)",
               "train_years": split["train"], "test_years": split["test"], **rw, "confirmatory": conf}
        if ow is None or oc is None:
            rec.update({"auc": None, "auc_ci": None, "baseline_auc": None, "brier": None,
                        "baseline_brier": None, "verdict": "insufficient data", "notes": ""})
            tests.append(rec)
            return
        dd = (ow["boot"]["auc"] - ow["boot"]["auc_base"]) - (oc["boot"]["auc"] - oc["boot"]["auc_base"])
        a = 0.05 / k
        adj = q(dd, a / 2, 1 - a / 2)
        pt_d = (ow["pt"]["auc"] - ow["pt"]["auc_base"]) - (oc["pt"]["auc"] - oc["pt"]["auc_base"])
        rec.update({
            "auc": round(ow["pt"]["auc"], 4), "auc_ci": q(ow["boot"]["auc"], 0.025, 0.975),
            "baseline_auc": round(ow["pt"]["auc_base"], 4),
            "brier": round(ow["pt"]["brier"], 5), "baseline_brier": round(ow["pt"]["brier_base"], 5),
            "comparator_auc": round(oc["pt"]["auc"], 4), "comparator_brier": round(oc["pt"]["brier"], 5),
            "delta_auc_weekly": round(ow["pt"]["auc"] - ow["pt"]["auc_base"], 4),
            "delta_auc_catholic": round(oc["pt"]["auc"] - oc["pt"]["auc_base"], 4),
            "difference": round(pt_d, 4), "difference_ci95": q(dd, 0.025, 0.975),
            "difference_ci_adjusted": adj, "adjusted_level": round(1 - a, 4),
            "verdict": ("insufficient data" if rw["n_test"] < 300 or rw["n_test_positive"] < 30 else
                        "supported out of sample" if adj[0] > 0 else "not supported"),
            "notes": "auc/brier fields are the weekly-attendance model; comparator_* the Catholic-affiliation "
                     "model; both fitted on the same rows. Paired bootstrap of the ΔAUC difference.",
        })
        tests.append(rec)

    A, B = SPLIT_A, SPLIT_B
    # Confirmatory, Y1 (k = 7)
    one("H1", "Weekly attendance adds out-of-sample discrimination for ideal 4+ children", "Y1", ["weekly"], A, u18_44, True, K_Y1)
    one("H2", "Catholic affiliation adds out-of-sample discrimination for ideal 4+ children", "Y1", ["catholic"], A, u18_44, True, K_Y1)
    diff("H3", "Weekly attendance adds more discrimination than Catholic affiliation (ideal 4+)", "Y1", A, True, K_Y1)
    one("H4", "Republican/conservative identification adds discrimination for ideal 4+", "Y1", ["political"], A, u18_44, True, K_Y1)
    one("H5", "Rural/small-place residence adds discrimination for ideal 4+", "Y1", ["rural"], A, u18_44, True, K_Y1)
    one("H6", "Intact family at 16 adds discrimination for ideal 4+", "Y1", ["intact16"], A, u18_44, True, K_Y1)
    one("H7", "Hunting adds discrimination for ideal 4+", "Y1", ["hunt"], A, u18_44, True, K_Y1)
    # Secondary confirmatory, Y2 (k = 2)
    one("H8", "Weekly attendance adds discrimination for 'divorce should be more difficult'", "Y2", ["weekly"], A, u18_44, True, K_Y2)
    diff("H9", "Weekly attendance adds more discrimination than Catholic affiliation (divorce law)", "Y2", A, True, K_Y2)
    # Exploratory
    for p in ("weekly", "catholic", "political", "rural", "intact16", "hunt"):
        one(f"E_B_{p}", f"[exploratory] {p} on ideal 4+, transported to the 2021-2024 mode", "Y1", [p], B, u18_44, False,
            notes="Split B crosses the 2021 mode change; a drop here may be mode, not substance.")
    for p in ("weekly", "catholic"):
        one(f"E_S1_{p}", f"[exploratory] {p} on ideal 4+ incl. 'as many as you want'", "Y1_S1", [p], A, u18_44, False)
    for p in ("catholic", "political", "rural", "intact16", "hunt"):
        one(f"E_Y2_{p}", f"[exploratory] {p} on 'divorce should be more difficult'", "Y2", [p], A, u18_44, False)
    for p in ("weekly", "catholic", "political", "rural", "intact16", "hunt"):
        one(f"E_Y3_{p}", f"[exploratory] {p} on agreeing with the male-earner/female-homemaker norm", "Y3", [p], A, u18_44, False)
    for p in ("weekly", "catholic"):
        one(f"E_W_{p}", f"[exploratory] {p} on ideal 4+ among women 18-34", "Y1", [p], A, w18_34, False,
            notes="Women 18-34 only; sex dropped from the baseline.")
    return tests


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--reps", type=int, default=1000)
    a = ap.parse_args(argv)
    df, _ = load_gss(a.raw)
    d, _ = gss_analysis_frame(df)
    tests = run(d, a.reps)
    out = a.out / "surveys" / "proxy_tests.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "generated_by": "pipeline/proxy_tests.py", "preregistration": "pipeline/proxy_tests_prereg.md",
        "dataset_id": "gss", "weight": GSS_WEIGHT, "bootstrap_reps": a.reps,
        "universe": "GSS adults 18-44 (subgroup W: women 18-34) with a valid answer to the outcome",
        "scope_note": "Individual-level associations within the GSS. Not evidence about county or other "
                      "ecological versions of these proxies, which remain unvalidated hypotheses.",
        "tests": tests}, indent=1))
    for t in tests:
        print(f"{t['id']:12s} {t['verdict']:38s} n_test={t['n_test']:5d} "
              f"dAUC={t.get('delta_auc', t.get('difference'))} ci={t.get('delta_auc_ci_adjusted', t.get('difference_ci_adjusted', t.get('delta_auc_ci95')))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
