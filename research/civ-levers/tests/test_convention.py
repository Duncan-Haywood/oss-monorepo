import math

import numpy as np

from civ_levers.convention import (
    complete_csr, mf_fc, says_new_prob, simulate, xie_pc, xie_rhs, xie_sim)


def test_xie_pc_matches_published():
    # Xie et al. (2011), Phys. Rev. E 84, 011130: p_c about 0.0979 (mean field)
    assert abs(xie_pc() - 0.0979) < 5e-4


def test_xie_rhs_consensus_is_fixed_point():
    # everyone uncommitted on A is absorbing for any p
    p = 0.1
    dA, dB = xie_rhs(1 - p, 0.0, p)
    assert abs(dA) < 1e-12 and abs(dB) < 1e-12


def test_xie_sim_flips_above_not_below():
    assert xie_sim(400, 0.16, 200, np.random.default_rng(1)) > 0.9
    assert xie_sim(400, 0.04, 200, np.random.default_rng(1)) < 0.2


def test_majority_prob_analytic():
    # M = 3: P(at least 2 of 3) = 3q^2 - 2q^3; M = 1: q
    for q in (0.1, 0.3, 0.7):
        assert math.isclose(says_new_prob(3, q), 3 * q * q - 2 * q ** 3)
        assert math.isclose(says_new_prob(1, q), q)


def test_even_memory_equals_odd_below():
    # a random tie-break makes memory 2m behave like 2m - 1
    for m in (2, 4, 6, 12):
        assert math.isclose(mf_fc(m), mf_fc(m - 1), abs_tol=1e-4)


def test_mf_fc_m3_closed_form():
    # M = 3: the lower fixed point of x = g(f + (1 - f) x), g(q) = 3q^2 - 2q^3,
    # vanishes at f = 1/9 (tangency), so f_c = 1/9
    assert abs(mf_fc(3) - 1 / 9) < 1e-3


def test_simulate_all_committed_new_flips_everyone():
    n = 20
    com = np.zeros(n, bool)
    com[:15] = True
    assert simulate(complete_csr(n), com, 5, 60, np.random.default_rng(0)) == 1.0


def test_simulate_no_committed_stays_old():
    n = 20
    com = np.zeros(n, bool)
    assert simulate(complete_csr(n), com, 5, 60, np.random.default_rng(0)) == 0.0
