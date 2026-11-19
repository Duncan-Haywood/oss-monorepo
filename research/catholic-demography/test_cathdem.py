"""Tests for the survey estimator and the recodes (no GSS download needed)."""
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cathdem import recode, survey  # noqa: E402


def test_srs_se_matches_classical_formula():
    rng = np.random.default_rng(1)
    y = rng.normal(size=500)
    w = np.ones(500)
    m, se, n = survey.domain_mean(y, w, np.ones(500, bool), np.zeros(500), np.arange(500))
    assert n == 500 and math.isclose(m, y.mean())
    assert math.isclose(se, y.std(ddof=1) / math.sqrt(500), rel_tol=1e-9)


def test_weighted_mean_and_missing_values_dropped():
    y = np.array([1.0, 0.0, np.nan, 1.0])
    w = np.array([1.0, 3.0, 5.0, 0.0])
    m, se, n = survey.domain_mean(y, w, np.ones(4, bool), np.zeros(4), np.arange(4))
    assert n == 2 and math.isclose(m, 0.25)


def test_cluster_design_inflates_se_for_clustered_outcome():
    # 50 PSUs of 20; the outcome is constant within PSU, so the design SE is about sqrt(20) times larger.
    rng = np.random.default_rng(2)
    psu = np.repeat(np.arange(50), 20)
    y = rng.normal(size=50)[psu]
    w = np.ones(1000)
    _, se_c, _ = survey.domain_mean(y, w, np.ones(1000, bool), np.zeros(1000), psu)
    _, se_s, _ = survey.domain_mean(y, w, np.ones(1000, bool), np.zeros(1000), np.arange(1000))
    assert 3.5 < se_c / se_s < 5.5


def test_contrast_of_disjoint_domains_close_to_independent_formula():
    rng = np.random.default_rng(3)
    n = 4000
    g = rng.integers(0, 2, n).astype(bool)
    y = rng.normal(size=n) + g
    w = np.ones(n)
    s, p = np.zeros(n), np.arange(n)
    est, se, na, nb = survey.contrast(y, w, g, ~g, s, p)
    _, sa, _ = survey.domain_mean(y, w, g, s, p)
    _, sb, _ = survey.domain_mean(y, w, ~g, s, p)
    assert math.isclose(est, y[g].mean() - y[~g].mean())
    assert math.isclose(se, math.hypot(sa, sb), rel_tol=0.02)


def test_singleton_strata_are_pooled_not_dropped():
    y = np.array([0.0, 1.0, 2.0, 3.0])
    strata = np.array([1, 2, 3, 4])  # every stratum has one PSU
    _, se, _ = survey.domain_mean(y, np.ones(4), np.ones(4, bool), strata, np.arange(4))
    assert se > 0


def frame():
    return pd.DataFrame({
        'year': [2010, 2010, 2022, 2022, 1980], 'id': [1, 2, 3, 4, 5],
        'relig': [2, 1, 4, 2, 2], 'relig16': [2, 2, 2, 1, 2], 'attend': [7, 0, 4, np.nan, 8],
        'childs': [3, 0, 1, 2, 5], 'age': [50, 30, 70, 45, 60], 'cohort': [1960, 1980, 1952, 1977, 1920],
        'hispanic': [2, 1, 1, 1, np.nan], 'race': [1, 1, 2, 3, 1], 'born': [2, 1, 1, 1, 1],
        'parborn': [8, 0, 1, 0, 0], 'wtssps': [1.0, 2.0, 1.0, 1.0, 1.0], 'vpsu': [1, 2, 1, 2, np.nan],
        'vstrat': [5, 5, 7, 7, np.nan], 'sex': [1, 2, 1, 2, 1], 'degree': [3, 1, 4, 0, np.nan],
        'marital': [1, 5, 2, 1, 1], 'polviews': [6, 2, 4, 5, 7], 'partyid': [5, 0, 7, 3, 6],
        'abany': [2, 1, 1, np.nan, 2], 'postlife': [1, 2, 1, 1, 1], 'bible': [1, 3, 2, 4, 1],
        'pray': [1, 6, 2, 5, 1], 'reliten': [1, 4, 2, 3, 1]})


def test_recode_groups_and_indicators():
    d = recode.recode(frame())
    assert list(d['rel']) == ['Catholic', 'Protestant', 'None', 'Catholic', 'Catholic']
    assert d['eth'].tolist()[:4] == ['Hispanic', 'NH white', 'NH Black', 'NH other']
    assert pd.isna(d['eth'].iloc[4])  # hispanic not asked before 2000
    assert d['gen'].tolist()[:3] == ['1st gen (foreign-born)', '3rd+ gen', '2nd gen']
    assert d['weekly'].tolist()[:3] == [1.0, 0.0, 0.0] and math.isnan(d['weekly'].iloc[3])
    assert d['still_catholic'].tolist() == [1.0, 0.0, 0.0, 1.0, 1.0]
    assert d['convert'].tolist() == [0.0, 0.0, 0.0, 1.0, 0.0]
    assert d['republican'].tolist()[:2] == [1.0, 0.0]
    assert d['cohort_band'].tolist() == ['Born 1945-64', 'Born 1965-80', 'Born 1945-64', 'Born 1965-80', 'Born 1900-24']
    assert d['period'].tolist() == ['2010-18', '2010-18', '2021-24', '2021-24', '1980-89']
    # design: strata unique within year; no design codes -> own PSU
    assert d['strat'].iloc[0] != d['strat'].iloc[2] and d['psu'].iloc[4] == 5


def test_partyid_other_party_is_missing():
    d = recode.recode(frame())
    assert math.isnan(d['republican'].iloc[2])


def test_wls_cluster_intercept_matches_domain_mean_se():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'm3run', Path(__file__).resolve().parent / 'experiments' / 'm3_mode' / 'run.py')
    m3 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m3)
    rng = np.random.default_rng(5)
    n = 600
    psu = np.repeat(np.arange(60), 10)
    strat = np.repeat(np.arange(6), 100)
    y = rng.normal(size=60)[psu] + rng.normal(size=n)
    w = rng.uniform(0.5, 2.0, size=n)
    b, se = m3.wls_cluster(np.ones((n, 1)), y, w, strat.astype(float), psu.astype(float))
    m, se2, _ = survey.domain_mean(y, w, np.ones(n, bool), strat.astype(float), psu.astype(float))
    assert math.isclose(b[0], m, rel_tol=1e-9) and math.isclose(se[0], se2, rel_tol=1e-9)


def test_logit_intercept_only_matches_weighted_mean():
    rng = np.random.default_rng(3)
    y = (rng.random(400) < 0.3).astype(float)
    w = rng.uniform(0.5, 2, 400)
    b, cov, n = survey.logit(np.ones((400, 1)), y, w, np.ones(400, bool), np.zeros(400), np.arange(400))
    p = (w * y).sum() / w.sum()
    assert n == 400 and math.isclose(b[0], math.log(p / (1 - p)), abs_tol=1e-8)
    # delta method: se(logit p) = se(p) / (p (1 - p))
    _, se, _ = survey.domain_mean(y, w, np.ones(400, bool), np.zeros(400), np.arange(400))
    assert math.isclose(math.sqrt(cov[0, 0]), se / (p * (1 - p)), rel_tol=1e-6)


def test_logit_recovers_coefficients_and_ignores_outside_domain():
    rng = np.random.default_rng(4)
    n = 20000
    x = rng.normal(size=n)
    y = (rng.random(n) < 1 / (1 + np.exp(-(-0.5 + 0.8 * x)))).astype(float)
    X = np.column_stack([np.ones(n), x])
    dom = np.arange(n) < n // 2
    y2 = np.where(dom, y, 1 - y)  # garbage outside the domain must not matter
    b, cov, _ = survey.logit(X, y2, np.ones(n), dom, np.zeros(n), np.arange(n))
    se = np.sqrt(np.diag(cov))
    assert np.all(np.abs(b - [-0.5, 0.8]) < 4 * se)
    stat, df, p = survey.wald(b, cov, [1])
    assert df == 1 and p < 1e-6


def test_equal_fertility_share_inverts_raised_share():
    from cathdem import accounting
    p = np.array([0.05, 0.2, 0.3, 0.6])
    for rho in (0.8, 1.0, 1.15, 1.5):
        R = accounting.raised_share(p, rho)
        assert np.allclose(accounting.equal_fertility_share(R, rho), p)
    # Hand case: p=0.25, rho=1.2 -> R = 0.3 / (0.3 + 0.75) = 2/7
    assert math.isclose(float(accounting.raised_share(0.25, 1.2)), 2 / 7)
    # Equal fertility leaves the share unchanged; higher Catholic fertility raises it.
    assert np.allclose(accounting.raised_share(p, 1.0), p)
    assert np.all(accounting.raised_share(p, 1.2) > p)


def test_panel_agreement_counts_and_kappa():
    from cathdem import panel
    a = np.array([1, 1, 1, 0, 0, 0, 0, 0, np.nan, 1])
    b = np.array([1, 1, 0, 1, 0, 0, 0, 0, 1, np.nan])
    r = panel.agreement(a, b, np.ones(10))
    assert r['n'] == 8
    assert math.isclose(r['p1'], 3 / 8) and math.isclose(r['p2'], 3 / 8) and r['net'] == 0
    assert math.isclose(r['gross'], 2 / 8) and math.isclose(r['stay'], 2 / 3)
    pe = (3 / 8) ** 2 + (5 / 8) ** 2
    assert math.isclose(r['kappa'], (6 / 8 - pe) / (1 - pe))


def test_rake_hits_margins_and_keeps_total():
    from cathdem import rake
    rng = np.random.default_rng(3)
    n = 2000
    a = rng.integers(0, 3, n)
    b = rng.integers(0, 2, n)
    w = rng.uniform(0.5, 2.0, n)
    ta = {0: 0.5, 1: 0.3, 2: 0.2}
    tb = {0: 0.7, 1: 0.3}
    r, gap, it = rake.rake(w, [a, b], [ta, tb])
    assert gap < 1e-8 and math.isclose(r.sum(), w.sum())
    for c, t in ((a, ta), (b, tb)):
        m = rake.margins(c, r)
        assert all(math.isclose(m[k], v, abs_tol=1e-8) for k, v in t.items())


def test_rake_one_covariate_is_poststratification():
    # With one covariate, raking is post-stratification: within-cell weights scale by target/actual share,
    # so a cell mean outcome reweighted to the target gives the target-weighted mean of cell means.
    from cathdem import rake
    c = np.array([0] * 80 + [1] * 20)
    y = np.array([1.0] * 40 + [0.0] * 40 + [1.0] * 2 + [0.0] * 18)  # cell means 0.5 and 0.1
    r, gap, _ = rake.rake(np.ones(100), [c], [{0: 0.25, 1: 0.75}])
    assert math.isclose((r * y).sum() / r.sum(), 0.25 * 0.5 + 0.75 * 0.1)
    # The selection the covariate carries is removed exactly: target-group mean is matched when outcome depends
    # only on the covariate.
    assert rake.kish_deff(np.ones(10)) == 1.0 and rake.kish_deff(r) > 1.0


def test_mother_nativity_from_parborn():
    # gssrdoc codes: 0 both US-born, 1 mother yes / father no, 2 mother no / father yes, 3 mother yes / father DK,
    # 4 mother no / father DK, 5 mother DK / father yes, 6 mother DK / father no, 7 both DK, 8 neither US-born.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'm5m', Path(__file__).parent / 'experiments' / 'm5m_mothers_nativity' / 'run.py')
    m5m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m5m)
    got = m5m.mother_nativity([0, 1, 2, 3, 4, 5, 6, 7, 8, np.nan])
    assert list(got) == ['US mother', 'US mother', 'FB mother', 'US mother', 'FB mother', '', '', '', 'FB mother', '']


def test_sibling_size_bias_recovers_mothers():
    # Mothers with 1-6 children (below the top-code); each child is one respondent. Weighting children by 1/k must give
    # back the mothers' Catholic share and the Catholic / other ratio of mean children (Preston 1976), and when the
    # women's tables hold those true values the gap and both of its parts are zero.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'm5n', Path(__file__).resolve().parent / 'experiments' / 'm5n_siblings' / 'run.py')
    m5n = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m5n)
    mothers = [(1, 4)] * 30 + [(1, 2)] * 10 + [(0, 2)] * 60 + [(0, 1)] * 40 + [(0, 3)] * 20
    X = np.array([c for c, k in mothers for _ in range(k)], float)
    k = np.array([k for c, k in mothers for _ in range(k)], float)
    w = np.ones(len(k))
    s = np.ones(len(k), bool)
    p_true = 40 / 160
    rho_true = (140 / 40) / (220 / 120)
    L = m5n.L
    tab = {'P_m': np.full(L, p_true), 'rho_m': np.full(L, rho_true), 'SBw_C': np.zeros(L), 'SBw_N': np.zeros(L)}
    out = m5n.children_side(w, k, X, s, tab, np.zeros(len(k), int))
    assert math.isclose(out['M_mothers'], p_true)
    assert math.isclose(out['rho_sib'], rho_true)
    assert abs(out['gap M - f(P_m, rho_m)']) < 1e-12 and abs(out['ratio part']) < 1e-12
    assert math.isclose(m5n.f(p_true, rho_true), X.mean())


def test_within_cohort_slope_and_band_difference():
    # y = cohort effect + slope * age exactly: the fixed-effects slope recovers the slope whatever the cohort effects,
    # and the cohort-standardised (25-44) - (45+) difference equals slope x the age difference.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'm5p', Path(__file__).resolve().parent / 'experiments' / 'm5p_recall_drift' / 'run.py')
    m5p = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m5p)
    rng = np.random.default_rng(0)
    c = rng.integers(0, 20, 2000)
    age = rng.uniform(25, 64, 2000)
    y = 0.3 * np.sin(c) + (-0.002) * age
    w = rng.uniform(0.5, 2.0, 2000)
    assert math.isclose(m5p.within_slope(y, age, c, w), -0.002, rel_tol=1e-9)
    bd = m5p.band_diff(y, age, c, w)
    assert math.isclose(bd['y'], -0.002 * bd['age'], rel_tol=1e-9)
