import os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_seeds import perm_p, runs_needed


def test_perm_p_identical_groups_is_large():
    assert perm_p([0.8, 0.82, 0.84, 0.81], [0.8, 0.82, 0.84, 0.81]) > 0.9


def test_perm_p_separated_groups_is_small():
    a = np.full(10, 0.9) + np.linspace(0, 0.01, 10)
    b = np.full(10, 0.7) + np.linspace(0, 0.01, 10)
    assert perm_p(a, b) < 0.001


def test_perm_p_is_symmetric_and_in_range():
    a, b = [0.1, 0.5, 0.3], [0.2, 0.9, 0.4, 0.6]
    assert abs(perm_p(a, b) - perm_p(b, a)) < 0.03 and 0 < perm_p(a, b) <= 1


def test_runs_needed_textbook_value():
    # sd = delta: n = 2 * (1.96 + 0.84)^2 = 15.7 -> 16
    assert runs_needed(1.0, 1.0) == 16
    assert runs_needed(0.5, 1.0) == 63


def test_runs_needed_scales_with_inverse_square_of_delta():
    assert runs_needed(0.01, 0.05) >= 3.9 * runs_needed(0.02, 0.05) - 2
