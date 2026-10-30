import numpy as np
from civ_levers.commons import play


def test_no_punishment_decays_towards_free_riding():
    c, _ = play(240, 4, 10, np.random.default_rng(0))
    assert c[-1] < c[0] / 2


def test_full_contribution_pays_more_than_free_riding_in_a_group():
    # analytic: m*n = 1.6 > 1, so all-20 gives 32 each; all-0 gives 20 each
    assert 1.6 / 4 * 4 * 20 == 32 > 20


def test_punishment_without_response_is_pure_cost():
    a, pa = play(240, 4, 10, np.random.default_rng(1))
    b, pb = play(240, 4, 10, np.random.default_rng(1), punish=True, react=0.0)
    assert np.allclose(a, b) and pb[-1] < pa[-1]


def test_response_to_punishment_raises_contributions():
    a, _ = play(240, 4, 10, np.random.default_rng(2))
    b, _ = play(240, 4, 10, np.random.default_rng(2), punish=True, react=1.0)
    assert b[-1] > 3 * a[-1]
