"""Model-free analysis of a payoff matrix: Nash mixture, best responses, cycles, overfitting.

Payoff A[i][j] is the detector's paired accuracy when detector prompt j judges imitator prompt i's
texts (50% is chance). The detector maximises A, the imitator minimises it: a zero-sum game.
"""
import itertools
import numpy as np
from scipy.optimize import linprog


def solve_zero_sum(A):
    """Nash equilibrium of the game where the column player (detector) maximises A[i][j] and the row
    player (imitator) minimises it. Returns (row_mix, col_mix, value) by linear programming."""
    A = np.asarray(A, float)
    m, n = A.shape
    shift = A.min() - 1e-9  # make all payoffs positive so the value is positive
    P = A - shift
    # row player: min v s.t. sum_i x_i P[i,j] <= v for all j  ->  with y = x/v, max sum y s.t. P^T y <= 1
    res = linprog(-np.ones(m), A_ub=P.T, b_ub=np.ones(n), bounds=[(0, None)] * m, method="highs")
    y = res.x; v = 1 / y.sum(); x = y * v
    res2 = linprog(np.ones(n), A_ub=-P, b_ub=-np.ones(m), bounds=[(0, None)] * n, method="highs")
    z = res2.x; v2 = 1 / z.sum(); w = z * v2
    assert abs(v - v2) < 1e-6, (v, v2)
    return x, w, v + shift


def exploitability(A, x, w):
    """How much each side could gain by best-responding to the other's mixture; both are 0 at equilibrium."""
    A = np.asarray(A, float)
    val = x @ A @ w
    return {"imitator_gain": float(val - (A @ w).min()), "detector_gain": float((x @ A).max() - val)}


def pure_value(A):
    """Lower and upper value over pure strategies: the detector can guarantee max-min, the imitator min-max."""
    A = np.asarray(A, float)
    return {"detector_maxmin": float(A.min(axis=0).max()), "imitator_minmax": float(A.max(axis=1).min())}


def reversals(A, eps=0.0):
    """Non-transitive progress along one run's time order. A is that run's matrix with rows (imitators)
    and columns (detectors) in the order they were produced. A reversal is a quadruple
    (i1<i2, j1<j2) where the later imitator i2 does better than i1 against the newer detector j2
    (detector accuracy lower by more than eps) yet worse against the older detector j1 (higher by more
    than eps): progress against the latest opponent that was bought with a regression against an earlier one.
    Returns (list of quadruples, number of quadruples checked)."""
    A = np.asarray(A, float)
    m, n = A.shape
    found, total = [], 0
    for i1, i2 in itertools.combinations(range(m), 2):
        for j1, j2 in itertools.combinations(range(n), 2):
            total += 1
            if A[i2, j2] - A[i1, j2] < -eps and A[i2, j1] - A[i1, j1] > eps:
                found.append((i1, i2, j1, j2))
    return found, total


def best_responses(A):
    A = np.asarray(A, float)
    return {"det_best_vs_imit": A.argmax(axis=1).tolist(), "imit_best_vs_det": A.argmin(axis=0).tolist()}
