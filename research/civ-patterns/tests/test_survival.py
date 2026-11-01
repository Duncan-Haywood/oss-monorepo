import csv
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from civ_patterns import polities, regimes, survival as sv  # noqa: E402


def test_km_without_censoring_is_one_minus_empirical_cdf():
    t = np.array([1, 2, 2, 3, 5, 8])
    ts, S = sv.kaplan_meier(t, np.ones(6))
    assert list(ts) == [1, 2, 3, 5, 8]
    assert np.allclose(S, [5 / 6, 3 / 6, 2 / 6, 1 / 6, 0])
    assert sv.km_median(t, np.ones(6)) == 2


def test_km_handles_censoring_by_hand():
    # Classic example: times 3, 4+, 5, 7+, 8; S(3) = 4/5, S(5) = 4/5 * 2/3, S(8) = 0
    ts, S = sv.kaplan_meier([3, 4, 5, 7, 8], [1, 0, 1, 0, 1])
    assert np.allclose(S, [0.8, 0.8 * 2 / 3, 0.0])


def test_exponential_mle_is_events_over_exposure():
    rng = np.random.default_rng(1)
    t = rng.exponential(20, 400)
    e = (t < 30).astype(int)
    t = np.minimum(t, 30)
    f = sv.fit_weibull(t, e, shape=1.0)
    assert abs(1 / f["lam"] - e.sum() / t.sum()) < 1e-4


def test_weibull_recovers_shape_with_censoring_and_truncation():
    rng = np.random.default_rng(2)
    t = 30 * rng.weibull(0.7, 5000)
    entry = rng.uniform(0, 5, 5000)
    keep = t > entry                     # delayed entry: only units alive at entry are seen
    t, entry = t[keep], entry[keep]
    e = (t < 60).astype(int)
    t = np.minimum(t, 60)
    f = sv.fit_weibull(t, e, entry=entry)
    lo, hi = sv.shape_ci(f)
    assert lo < 0.7 < hi and abs(f["lam"] - 30) < 3


def test_weibull_covariate_hazard_ratio():
    rng = np.random.default_rng(3)
    x = rng.integers(0, 2, 4000)
    # Exponential with rate 0.05 * 2**x: hazard ratio 2
    t = rng.exponential(1 / (0.05 * 2.0 ** x))
    f = sv.fit_weibull(t, np.ones_like(t), X=x[:, None])
    assert abs(np.exp(f["beta"][0]) - 2) < 0.15 and abs(f["k"] - 1) < 0.05


def test_prob_end_within_exponential_is_memoryless():
    f = {"k": 1.0, "lam": 10.0, "beta": np.zeros(0)}
    p = sv.prob_end_within(f, np.array([0.0, 50.0]), 10)
    assert np.allclose(p, 1 - np.exp(-1))


def test_piecewise_rates_and_forecast():
    # Two units: one ends at 3, one censored at 12. Band 0-5 exposure 3+5=8, 1 event; 5-20 exposure 7, 0 events
    m = sv.PiecewiseHazard((0, 5, 20)).fit([3, 12], [1, 0])
    assert np.allclose(m.rates[0], [1 / 8, 0])
    assert np.allclose(m.prob_end_within([0.0], 5), 1 - np.exp(-5 / 8))
    assert np.allclose(m.prob_end_within([6.0], 5), 0)


def test_scores():
    y = np.array([1, 0, 1, 0])
    assert sv.brier([1, 0, 1, 0], y) == 0 and sv.auc([0.9, 0.1, 0.8, 0.2], y) == 1
    assert sv.auc([0.5] * 4, y) == 0.5


def test_regime_type_cutpoints():
    assert [regimes.regime_type(x) for x in (10, 6, 5, -5, -6, -10)] == \
        ["democracy", "democracy", "anocracy", "anocracy", "autocracy", "autocracy"]


def test_window_censors_at_cutoff_and_drops_unknown_age():
    sp = [{"start": 1800.0, "end": 1900.0, "event": 1, "left_truncated": True, "type": "autocracy"},
          {"start": 1950.0, "end": 2001.0, "event": 1, "left_truncated": False, "type": "democracy"},
          {"start": 1990.0, "end": 1995.0, "event": 1, "left_truncated": False, "type": "anocracy"}]
    w = regimes.window(sp, 1996.0)
    assert len(w) == 2 and w[0]["end"] == 1996.0 and w[0]["event"] == 0 and w[1]["event"] == 1
    alive = regimes.alive_at(sp, 1996.0)
    assert len(alive) == 1 and alive[0]["age"] == 46.0


def test_polity_lifespan_first_continuous_run(tmp_path):
    f = tmp_path / "rows.csv"
    rows = [("A", -3400, -3001), ("A", -3000, -2001),            # left-truncated
            ("B", 100, 199), ("B", 200, 299), ("B", 500, 599),   # gap after 299: first run 100-300
            ("C", 1990, 2024)]                                   # censored in 2024
    with open(f, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["Name", "FromYear", "ToYear", "Area", "Type"])
        for n, a, b in rows:
            w.writerow([n, a, b, 1000, "POLITY"])
    L = {x["name"]: x for x in polities.lifespans(f)}
    assert L["A"]["left_truncated"]
    assert L["B"]["duration"] == 200 and L["B"]["event"] == 1 and L["B"]["returns_later"]
    assert L["B"]["span_all"] == 500
    assert L["C"]["event"] == 0 and L["C"]["duration"] == 35
