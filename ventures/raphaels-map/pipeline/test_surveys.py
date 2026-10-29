"""Tests for survey_stats, build_surveys and proxy_tests on synthetic fixtures with known answers.

    python3 -m pytest -q ventures/raphaels-map/pipeline/test_surveys.py
"""
from __future__ import annotations

import json
import sys
from collections import OrderedDict
from math import sqrt
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_surveys as bs  # noqa: E402
import proxy_tests as pt  # noqa: E402
from survey_stats import Design, estimate_table, kish_n_eff, taylor_se_ratio, weighted_proportion  # noqa: E402

YN = OrderedDict([("Yes", {1}), ("No", {0})])


# ---------------------------------------------------------------- n_eff, pct

def test_kish_equal_weights_is_n():
    assert kish_n_eff(np.ones(57)) == pytest.approx(57)


def test_kish_known_value():
    assert kish_n_eff([1, 1, 2]) == pytest.approx(16 / 6)


def test_kish_empty_is_zero():
    assert kish_n_eff([]) == 0.0


def test_weighted_proportion_known():
    assert weighted_proportion([1, 0, 1], [1, 1, 2]) == pytest.approx(0.75)
    assert weighted_proportion([], []) is None


def test_weighted_pct_in_table():
    codes = np.array([1] * 60 + [0] * 140, float)
    w = np.array([3.0] * 60 + [1.0] * 140)  # weighted share of Yes = 180/320
    t = estimate_table(codes, w, YN)
    yes = t["rows"][0]
    assert yes["category"] == "Yes"
    assert yes["pct"] == pytest.approx(round(100 * 180 / 320, 1))
    assert t["n"] == 200 and t["weighted_base"] == pytest.approx(320)
    assert t["n_eff"] == pytest.approx(round(320 ** 2 / (60 * 9 + 140), 1))


# ------------------------------------------------------------- suppression

def test_suppressed_below_30_keeps_n_and_null_rows():
    codes = np.array([1, 0] * 10, float)
    t = estimate_table(codes, np.ones(20), YN)
    assert t["rows"] is None
    assert "suppressed_small_sample" in t["flags"]
    assert t["n"] == 20 and t["n_eff"] == 20


def test_suppression_uses_n_eff_not_n():
    # n = 100 but one huge weight: n_eff ~ 1.3 -> suppressed
    w = np.ones(100)
    w[0] = 200
    t = estimate_table(np.array([1, 0] * 50, float), w, YN)
    assert t["n"] == 100 and t["n_eff"] < 30 and t["rows"] is None


def test_exploratory_between_30_and_100():
    t = estimate_table(np.array([1, 0] * 25, float), np.ones(50), YN)
    assert t["rows"] is not None and "exploratory_sample" in t["flags"]


def test_no_reliability_flag_at_100_or_more():
    t = estimate_table(np.array([1, 0] * 60, float), np.ones(120), YN)
    assert "exploratory_sample" not in t["flags"] and "suppressed_small_sample" not in t["flags"]


# ---------------------------------------------------------------- missing

def test_dk_refused_iap_excluded_and_counted():
    codes = np.array([1] * 50 + [0] * 50 + [8] * 3 + [9] * 2 + [np.nan] * 10, float)
    kind = np.array([None] * 100 + ["dk"] * 3 + ["refused"] * 2 + ["iap"] * 10, dtype=object)
    t = estimate_table(codes, np.ones(len(codes)), YN, missing_kind=kind)
    assert t["excluded"] == {"dk": 3, "refused": 2, "iap": 10, "missing_unsplit": 0}
    assert t["n"] == 100
    assert t["rows"][0]["pct"] == 50.0  # DK etc. not in the denominator


def test_missing_without_kinds_is_unsplit():
    codes = np.array([1] * 50 + [0] * 50 + [np.nan] * 7, float)
    t = estimate_table(codes, np.ones(len(codes)), YN)
    assert t["excluded"]["missing_unsplit"] == 7 and t["excluded"]["dk"] == 0


def test_nulls_never_zeros():
    # A blank (NaN) answer must never be read as category 0 ("No" / "None").
    codes = np.array([1] * 40 + [np.nan] * 60, float)
    t = estimate_table(codes, np.ones(100), YN)
    assert t["n"] == 40
    no = t["rows"][1]
    assert no["category"] == "No" and no["pct"] == 0.0
    assert t["excluded"]["missing_unsplit"] == 60
    # An empty domain yields null rows, not zeros.
    e = estimate_table(codes, np.ones(100), YN, domain=np.zeros(100, bool))
    assert e["rows"] is None and e["n"] == 0


def test_zero_or_missing_weight_out_of_scope():
    codes = np.array([1] * 60 + [0] * 60, float)
    w = np.ones(120)
    w[:10] = np.nan
    w[10:20] = 0
    t = estimate_table(codes, w, YN)
    assert t["n"] == 100


# ---------------------------------------------------------------- variance

def _hand_design():
    # Stratum A: PSU1 {(1,w1),(0,w1)}, PSU2 {(1,w2)}; stratum B: PSU3 {(0,w1)}, PSU4 {(1,w1),(0,w2)}
    y = np.array([1, 0, 1, 0, 1, 0], float)
    w = np.array([1, 1, 2, 1, 1, 2], float)
    strata = np.array(["A", "A", "A", "B", "B", "B"])
    psu = np.array([1, 1, 2, 3, 4, 4])
    return y, w, Design(strata, psu)


def test_taylor_se_matches_hand_computation():
    # p = 4/8 = .5; PSU totals of u = w(y-p)/N: 0, .125, -.0625, -.0625
    # v = 2/1*((0-.0625)^2+(.125-.0625)^2) + 0 = .015625 -> se = .125
    y, w, des = _hand_design()
    assert taylor_se_ratio(y, w, np.ones(6, bool), des) == pytest.approx(0.125)


def test_taylor_srs_reduces_to_binomial_n_minus_1():
    rng = np.random.default_rng(1)
    y = (rng.random(200) < 0.3).astype(float)
    p = y.mean()
    des = Design(np.zeros(200), np.arange(200))
    se = taylor_se_ratio(y, np.ones(200), np.ones(200, bool), des)
    assert se == pytest.approx(sqrt(p * (1 - p) / 199))


def test_domain_estimation_keeps_empty_psus():
    # Domain = the first three cases (stratum A only). Stratum B's PSUs have u = 0
    # but still exist; with only stratum A they would not change the answer, so
    # test against an explicit formula including them.
    y, w, des = _hand_design()
    dom = np.array([1, 1, 1, 0, 0, 0], bool)
    p = (1 + 2) / 4
    t1 = (1 * (1 - p) + 1 * (0 - p)) / 4
    t2 = 2 * (1 - p) / 4
    v = 2 * ((t1 - (t1 + t2) / 2) ** 2 + (t2 - (t1 + t2) / 2) ** 2)
    assert taylor_se_ratio(y, w, dom, des) == pytest.approx(sqrt(v))


def test_lonely_psu_centred_on_grand_mean():
    y = np.array([1, 0, 1], float)
    w = np.ones(3)
    des = Design(np.array(["A", "A", "B"]), np.array([1, 2, 3]))
    p = 2 / 3
    u = (y - p) / 3
    grand = u.mean()
    v = 2 * ((u[0] - u[:2].mean()) ** 2 + (u[1] - u[:2].mean()) ** 2) + (u[2] - grand) ** 2
    assert taylor_se_ratio(y, w, np.ones(3, bool), des) == pytest.approx(sqrt(v))


def test_naive_fallback_flagged_approx_ci():
    codes = np.array([1] * 30 + [0] * 90, float)
    t = estimate_table(codes, np.ones(120), YN)
    assert "approx_ci" in t["flags"]
    assert t["rows"][0]["se"] == pytest.approx(round(100 * sqrt(0.25 * 0.75 / 120), 2))


def test_design_table_not_flagged_approx_and_logit_ci_asymmetric():
    rng = np.random.default_rng(2)
    n = 400
    codes = (rng.random(n) < 0.04).astype(float)
    des = Design(np.repeat(np.arange(20), 20), np.tile(np.repeat([1, 2], 10), 20))
    t = estimate_table(codes, np.ones(n), YN, design=des)
    assert "approx_ci" not in t["flags"]
    r = t["rows"][0]
    assert 0 < r["ci_low"] < r["pct"] < r["ci_high"] < 100
    assert (r["ci_high"] - r["pct"]) > (r["pct"] - r["ci_low"])  # logit interval is asymmetric near 0


def test_wilson_at_boundary():
    t = estimate_table(np.zeros(150), np.ones(150), YN)
    yes = t["rows"][0]
    assert yes["pct"] == 0.0 and yes["ci_low"] == 0.0 and yes["ci_high"] > 0
    assert "ci_wilson_at_boundary" in t["flags"]


# ------------------------------------------------------------ GSS helpers

def _gss_frame():
    return pd.DataFrame({
        "year": [2018] * 6, "ballot": [1, 1, 1, 2, 2, 2],
        "chldidel": [2, np.nan, 4, np.nan, np.nan, np.nan],
        "sex": [2, 2, 1, 2, 2, 1], "age": [22, 25, 40, 19, 33, 50],
        "relig": [2, 2, 1, 2, 4, 2], "attend": [7, 3, 8, 8, 0, 7], "marital": [5, 5, 1, 5, 1, 5],
        "region": [1, 2, 3, 4, 1, 2],
    })


def test_gss_missing_kind_uses_ballot():
    d = _gss_frame()
    k = bs.gss_missing_kind(d, "chldidel", set(range(9)))
    assert list(k) == ["missing_unsplit"] * 3 + ["iap"] * 3


def test_domain_mask_target_subgroup():
    d = _gss_frame()
    f = {"sex": "female", "age_band": "18-29", "relig": "catholic", "attend": "weekly", "marital": "never_married"}
    assert list(bs.domain_mask(d, f)) == [True, False, False, True, False, False]
    all_f = {"sex": "male", "age_band": "18+", "relig": "any", "attend": "any", "marital": "any"}
    assert list(bs.domain_mask(d, all_f)) == [False, False, True, False, False, True]


# ------------------------------------------------------------------- NSFG

def _nsfg_frame(n=400):
    rng = np.random.default_rng(3)
    return pd.DataFrame({
        "AGE_R": rng.integers(15, 50, n), "WGT2022_2023": rng.uniform(1000, 3000, n),
        "VEST": np.repeat(np.arange(20), n // 20), "VECL": np.tile([1, 2], n // 2),
        "ADDEXP": rng.choice([0, 10, 20, 30, 40], n), "RELIGION": rng.integers(1, 5, n),
        "FMARITAL": rng.integers(1, 6, n),
    })


def _codings(confirmed: bool):
    c = {"variables": {"ADDEXP": {
        "role": "outcome", "concept": "expected_additional_births", "alignment": "partial",
        "label_text": "x", "text_kind": "variable_name_only", "scale_divisor": 10,
        "candidate_categories": {"None": [0], "One": [1], "Two": [2], "Three+": [3, 4]},
        "coding_source": "test", "confirmed_from": "test codebook" if confirmed else None}}}
    return c


def test_nsfg_unconfirmed_coding_publishes_no_estimate():
    tables, qs, _ = bs.build_nsfg(_nsfg_frame(), _codings(False))
    assert tables and all(t["rows"] is None and "coding_unconfirmed" in t["flags"] for t in tables)
    assert all(t["n"] > 0 and t["n_eff"] > 0 for t in tables)
    assert qs[0]["coding_unconfirmed"] is True


def test_nsfg_confirmed_coding_publishes_design_based_rows():
    tables, qs, _ = bs.build_nsfg(_nsfg_frame(), _codings(True))
    t = next(t for t in tables if t["filters"]["age_band"] == "18-49")
    assert t["rows"] is not None and "approx_ci" not in t["flags"]
    assert sum(r["pct"] for r in t["rows"]) == pytest.approx(100, abs=0.3)
    assert qs[0]["coding_unconfirmed"] is False


# ------------------------------------------------------------- proxy tests

def test_weighted_auc_known_values():
    assert pt.weighted_auc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9], [1, 1, 1, 1]) == 1.0
    assert pt.weighted_auc([0, 1], [0.5, 0.5], [1, 1]) == 0.5
    # pos A(s=.6,w=2), pos B(s=.3,w=1); neg C(s=.4,w=1), neg D(s=.2,w=3)
    # pairs won: A>C 2, A>D 6, B>D 3, B<C 0 -> 11 / (3*4)
    assert pt.weighted_auc([1, 1, 0, 0], [0.6, 0.3, 0.4, 0.2], [2, 1, 1, 3]) == pytest.approx(11 / 12)


def test_weighted_brier():
    assert pt.weighted_brier([1, 0], [0.8, 0.4], [1, 3]) == pytest.approx((0.04 + 3 * 0.16) / 4)


def test_psu_bootstrap_preserves_psu_count_per_stratum():
    strata = np.array(["a"] * 6 + ["b"] * 4)
    psu = np.array([1, 1, 2, 2, 3, 3, 1, 1, 2, 2])
    B = pt.psu_bootstrap_weights(strata, psu, 50, np.random.default_rng(0))
    # each case's multiplier is its PSU's draw count; stratum a draws 3 PSUs, b draws 2
    assert np.allclose(B[:, [0, 2, 4]].sum(axis=1), 3)
    assert np.allclose(B[:, [6, 8]].sum(axis=1), 2)
    assert np.all(B[:, 0] == B[:, 1])


def test_prereg_exists_and_fixes_decision_rule():
    text = (HERE / "proxy_tests_prereg.md").read_text()
    for needle in ("Split A (confirmatory)", "Bonferroni", "insufficient data", "same-session"):
        assert needle in text
