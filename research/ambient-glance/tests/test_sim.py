import numpy as np
from ambient_glance.sim import (Params, utilities, best_mode, simulate_utility, p_look,
                                regret, with_, glance_utility, speech_utility)

P = Params()


def test_none_is_zero():
    assert utilities(P, 5, 0.1, 0, False)["none"] == 0.0


def test_p_look_limits():
    assert 0 < p_look(P, True) < p_look(P, False) < 1
    assert p_look(with_(P, look_rate=1e-9), False) < 1e-6


def test_short_quiet_alone_prefers_speech_or_glance_not_none():
    assert best_mode(P, 4, 0.0, 0, False) in ("speech", "glance")


def test_loud_with_others_prefers_glance():
    assert best_mode(P, 6, 0.9, 1, False) == "glance"


def test_busy_eyes_quiet_prefers_speech():
    assert best_mode(P, 6, 0.0, 0, True) == "speech"


def test_medium_message_alone_and_quiet_prefers_speech():
    assert best_mode(P, 15, 0.0, 0, False) == "speech"


def test_glance_truncation_reduces_value():
    short = glance_utility(P, 8, False)
    long_ = glance_utility(P, 16, False)
    assert long_ < short


def test_speech_past_deadline_is_worthless():
    p = with_(P, deadline=2.0)
    assert speech_utility(p, 30, 0.0, 0) < 0


def test_monte_carlo_matches_closed_form():
    rng = np.random.default_rng(0)
    for mode, ctx in [("speech", (10, 0.5, 1, False)), ("glance", (6, 0.2, 0, False)),
                      ("glance", (6, 0.2, 0, True))]:
        u = utilities(P, *ctx)[mode]
        mc = simulate_utility(P, mode, *ctx, 200000, rng)
        assert abs(u - mc) < 0.01


def test_regret_zero_when_model_correct_and_positive_when_wrong():
    ctxs = [(w, n, o, e) for w in (4, 8, 16) for n in (0.0, 0.5, 1.0) for o in (0, 1) for e in (False, True)]
    assert regret(P, P, ctxs) == 0.0
    assert regret(P, with_(P, look_rate=0.0001), ctxs) > 0
