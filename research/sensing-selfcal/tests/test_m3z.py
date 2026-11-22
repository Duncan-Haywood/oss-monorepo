"""Milestone 3z: projected radius against the distortion term (experiments/m3z_radial)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3z_an", os.path.join(HERE, "..", "experiments", "m3z_radial", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)
BOARD = {"f": 518.28, "k1": 0.2226, "k2": -0.5679, "k3": 0.0}


def test_ray_at_inverts_the_radial_map():
    for r in (50, 200, 350):
        x = an.ray_at(r, BOARD)
        assert abs(an.radial_map(x, 518.28, 0.2226, -0.5679) - r) < 1e-9
    # pinhole: x = r / f
    assert abs(an.ray_at(200, {"f": 500.0, "k1": 0.0, "k2": 0.0}) - 0.4) < 1e-12


def test_errors_vanish_on_the_reference_and_split_f_from_distortion():
    w = {"f": 518.28, "k1": 0.2226, "k2": -0.5679}
    assert abs(an.p_err(200, w, BOARD)) < 1e-9 and abs(an.d_err(200, w, BOARD)) < 1e-12
    # pinhole reference, window 1% long in f and no distortion: P = +1% of r, dD = 0
    ref = {"f": 500.0, "k1": 0.0, "k2": 0.0}
    w = {"f": 505.0, "k1": 0.0, "k2": 0.0}
    assert abs(an.p_err(200, w, ref) - 2.0) < 1e-9 and an.d_err(200, w, ref) == 0.0
    # a longer f with a smaller k1 can cancel P at one radius while dD is negative there
    x = an.ray_at(200, ref)
    k1 = (200 / (505.0 * x) - 1) / x ** 2
    w = {"f": 505.0, "k1": k1, "k2": 0.0}
    assert abs(an.p_err(200, w, ref)) < 1e-9 and an.d_err(200, w, ref) < 0


def test_delta_sd_is_linear_propagation():
    cov = np.diag([4.0, 1e-4, 0.0])
    sd = an.delta_sd(lambda f, a, b: 2 * f + 10 * a, (500.0, 0.1, 0.0), cov)
    assert abs(sd - np.sqrt(4 * 4.0 + 100 * 1e-4)) < 1e-6
    assert abs(an.spearman([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-12
