import os, sys, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from scipy.linalg import eigh
from simdesign_webbuckle import ltb


def _cantilever_ltb(load, n=2000):
    """Independent numeric check of the closed-form coefficients: solve GJ phi'' + q(x)^2/(E Iy) phi = 0,
    phi(0)=0, phi'(L)=0 with q = M (end moment, constant) or q = P (l - x) (tip load), unit properties."""
    l = 1.0
    x = np.linspace(0, l, n + 1)[1:]
    h = l / n
    K = (np.diag(2 * np.ones(n)) - np.diag(np.ones(n - 1), 1) - np.diag(np.ones(n - 1), -1)) / h ** 2
    K[-1, -1] = 1 / h ** 2          # phi'(l)=0 via ghost node phi_{n+1}=phi_n
    m = np.ones(n) if load == "moment" else np.maximum((l - x) ** 2, 1e-8)   # q^2 shape (floored: B must be positive definite)
    lam = eigh(K, np.diag(m), eigvals_only=True)[0]        # = (q_cr scale)^2
    return np.sqrt(lam)


def test_coefficients_match_numeric():
    assert abs(_cantilever_ltb("moment") - np.pi / 2) < 2e-3
    assert abs(_cantilever_ltb("tip") - 4.013) < 5e-3


def test_widerweb_geometry_not_governed_by_buckling():
    assert ltb.governing_factor(16.0, 2.0) > 1.0
    assert ltb.governing_factor(20.0, 2.0) > ltb.governing_factor(16.0, 2.0)


def test_thicker_sheet_buckles_later():
    assert ltb.governing_factor(16.0, 3.0) > ltb.governing_factor(16.0, 2.0)


def test_thin_rectangle_torsion_limit():
    assert abs(ltb.torsion_j(1000.0, 1.0) / (1000.0 / 3) - 1) < 1e-3
