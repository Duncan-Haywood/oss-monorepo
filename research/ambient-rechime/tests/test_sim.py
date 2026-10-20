import numpy as np
from ambient_rechime.sim import Params, URGENCY, utility, simulate, p_unseen, expected_tones, chime_times, mean_utility, with_

P = Params()


def test_zero_tones_is_plain_glance():
    d, w, _ = URGENCY["normal"]
    seen = 1 - np.exp(-P.look_rate * d)
    glance = w * seen * 6 / 6 - (P.c_glance + P.c_glance_per_s * 6 / P.read_rate)
    assert abs(utility(P, 0, 6, 0.5, 0, False, d, w) - glance) < 1e-12


def test_urgency_mix_sums_to_one():
    assert abs(sum(v[2] for v in URGENCY.values()) - 1.0) < 1e-12


def test_more_tones_never_less_seen():
    for busy in (False, True):
        s = [1 - p_unseen(P, 20.0, chime_times(P, n, 20.0), 0.5, busy) for n in range(5)]
        assert all(b >= a - 1e-12 for a, b in zip(s, s[1:]))


def test_no_noise_one_tone_equals_boosted_rate():
    q = with_(P, chime_mask=0.5)
    got = p_unseen(q, 10.0, [0.0], 0.0, False)
    assert abs(got - np.exp(-(q.look_rate + q.react_rate) * 10.0)) < 1e-12


def test_expected_tones_bounds():
    for stop in (True, False):
        q = with_(P, stop_on_look=stop)
        e = expected_tones(q, 4, 0.5, False, 20.0)
        assert 1.0 <= e <= 4.0
    assert expected_tones(with_(P, stop_on_look=False), 4, 0.5, False, 20.0) == 4.0


def test_short_deadline_truncates_tones():
    assert chime_times(P, 4, 6.0) == [0.0, 3.0]


def test_monte_carlo_agrees():
    rng = np.random.default_rng(1)
    for stop in (True, False):
        q = with_(P, stop_on_look=stop)
        d, w, _ = URGENCY["high"]
        for n in (1, 3):
            assert abs(utility(q, n, 6, 0.5, 1, False, d, w) - simulate(q, n, 6, 0.5, 1, False, d, w, 200000, rng)) < 0.01


def test_allowing_more_choices_never_hurts():
    assert mean_utility(P, (0, 1, 2)) >= mean_utility(P, (0, 1)) - 1e-12


def test_zero_react_makes_tones_pure_cost():
    q = with_(P, react_rate=0.0)
    d, w, _ = URGENCY["high"]
    assert utility(q, 2, 6, 0.0, 0, False, d, w) < utility(q, 0, 6, 0.0, 0, False, d, w)
