import numpy as np
from ambient_urgency.sim import (Params, MODES, URGENCY, utilities, best_mode, simulate_utility, p_seen_chime,
                                 contexts, regret, with_, mix_utility)

P = Params()


def test_none_is_zero():
    assert all(utilities(P, 5, 0.1, 0, False, u)["none"] == 0.0 for u in URGENCY)


def test_urgency_mix_sums_to_one():
    assert abs(sum(v[2] for v in URGENCY.values()) - 1.0) < 1e-12


def test_chime_never_worse_seen_than_spontaneous_when_quiet():
    q = with_(P, chime_mask=0.0)
    from ambient_urgency.sim import _rate
    for busy in (False, True):
        assert p_seen_chime(q, 0.5, busy, 20.0) >= 1 - np.exp(-_rate(q, busy) * 20.0)


def test_chime_useless_when_react_zero_and_free_chime_costs_extra():
    q = with_(P, react_rate=0.0)
    u = utilities(q, 6, 0.0, 0, False, "normal")
    assert u["chime_glance"] < u["glance"]


def test_high_urgency_busy_eyes_prefers_chime_over_plain_glance():
    u = utilities(P, 3, 0.0, 0, True, "high")
    assert u["chime_glance"] > u["glance"]


def test_best_mode_is_argmax():
    for c in contexts():
        for u in URGENCY:
            ut = utilities(P, *c, u)
            assert ut[best_mode(P, *c, u)] == max(ut.values())


def test_monte_carlo_matches_closed_form():
    rng = np.random.default_rng(1)
    for u in URGENCY:
        for m in MODES:
            cf = utilities(P, 6, 0.5, 1, False, u)[m]
            assert abs(cf - simulate_utility(P, m, 6, 0.5, 1, False, u, 100000, rng)) < 0.01


def test_regret_zero_when_assumption_true_and_nonnegative_otherwise():
    C = contexts()
    assert regret(P, P, C) == 0.0
    assert regret(with_(P, react_rate=2.0), P, C) >= 0.0


def test_more_modes_never_hurts():
    C = contexts()
    three = ("none", "speech", "glance")
    assert mix_utility(P, lambda c, u: best_mode(P, *c, u), C) >= \
        mix_utility(P, lambda c, u: best_mode(P, *c, u, three), C)
