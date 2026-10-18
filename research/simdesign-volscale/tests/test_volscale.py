import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_volscale import binarise, fit_power, fe_compliance, cantilever_problem, simp


def test_fit_power_recovers_exponent():
    v = np.array([0.2, 0.4, 0.8])
    k, A = fit_power(v, 3.0 * v ** -1.5)
    assert abs(k - 1.5) < 1e-9 and abs(A - 3.0) < 1e-9


def test_binarise_keeps_requested_share():
    x = np.random.default_rng(0).random((10, 20))
    assert binarise(x, 0.3).sum() == 60
    assert binarise(x, 1.0).all()


def test_compliance_scales_inversely_with_stiffness():
    # E_min is negligible, so a plate with all densities 1 is the p-independent reference;
    # halving the load must quarter the compliance (linearity).
    f, fixed = cantilever_problem(12, 4)
    c1 = fe_compliance(np.ones((4, 12)), 12, 4, f, fixed)[0]
    c2 = fe_compliance(np.ones((4, 12)), 12, 4, 0.5 * f, fixed)[0]
    assert abs(c2 / c1 - 0.25) < 1e-9


def test_simp_beats_uniform_density_and_meets_volume():
    r = simp(24, 8, 0.4, 3.0, 1.2, cantilever_problem, max_iter=60)
    f, fixed = cantilever_problem(24, 8)
    cu = fe_compliance(np.full((8, 24), 0.4), 24, 8, f, fixed)[0]
    assert r["compliance"] < cu and abs(r["volume"] - 0.4) < 1e-3
