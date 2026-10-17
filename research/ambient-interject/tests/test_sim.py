import numpy as np

from ambient_interject.sim import (WINDOWS_PER_HOUR, World, fit_logistic, prob, score_policy,
                                    simulate, speak_keyword, speak_threshold, speak_wake,
                                    threshold_theory, tune_to_budget)


def test_prevalence_and_length():
    d = simulate(World(), 200, np.random.default_rng(0))
    assert len(d["need"]) == 200 * WINDOWS_PER_HOUR
    assert abs(d["need"].mean() - 0.03) < 0.004


def test_threshold_matches_theory():
    w = World()
    d = simulate(w, 2000, np.random.default_rng(1))
    s = speak_threshold(d, 1.5)
    fp, tp = threshold_theory(w, 1.5)
    assert abs(np.mean(s[~d["need"]]) - fp) < 0.004
    assert abs(np.mean(s[d["need"]]) - tp) < 0.02


def test_wake_only_is_precise_but_misses():
    d = simulate(World(), 500, np.random.default_rng(2))
    m = score_policy(d, speak_wake(d))
    # theory: precision = .15*.03 / (.15*.03 + .002*.97) = 0.70
    assert abs(m["precision"] - 0.70) < 0.05 and 0.1 < m["recall"] < 0.2


def test_keyword_beats_wake_on_recall_but_costs_precision():
    d = simulate(World(), 500, np.random.default_rng(3))
    a, b = score_policy(d, speak_wake(d)), score_policy(d, speak_keyword(d))
    assert b["recall"] > a["recall"] and b["precision"] < a["precision"]


def test_never_speaking_misses_everything():
    d = simulate(World(), 50, np.random.default_rng(4))
    m = score_policy(d, np.zeros(len(d["need"]), bool))
    assert m["recall"] == 0 and m["fp"] == 0


def test_annoyance_weights_others_talking():
    d = simulate(World(), 50, np.random.default_rng(5))
    m = score_policy(d, ~d["need"])  # speak in every no-need window
    mult = np.where(d["others"], d["others_cost"], 1.0)[~d["need"]].sum()
    assert abs(m["annoyance_per_hour"] * d["hours"] - mult) < 1e-6


def test_logistic_recovers_signal():
    d = simulate(World(), 400, np.random.default_rng(6))
    X = np.column_stack([d["score"], np.ones(len(d["need"]))])
    w = fit_logistic(X, d["need"].astype(float))
    assert abs(w[0] - 2.0) < 0.3  # log-odds slope equals d' for unit-variance Gaussians


def test_tune_respects_budget():
    d = simulate(World(), 100, np.random.default_rng(7))
    t = tune_to_budget(d, lambda x: x["score"], 1.0, np.linspace(-1, 6, 141))
    assert score_policy(d, speak_threshold(d, t))["fp_per_hour"] <= 1.0
    assert prob(np.zeros(5), d).shape == d["need"].shape


def test_null_sd_theory():
    w = World(null_sd=1.5)
    d = simulate(w, 2000, np.random.default_rng(8))
    fp, _ = threshold_theory(w, 2.0)
    assert abs(np.mean(speak_threshold(d, 2.0)[~d["need"]]) - fp) < 0.004
