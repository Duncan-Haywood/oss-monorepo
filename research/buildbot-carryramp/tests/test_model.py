import numpy as np
import pytest

from buildbot_carryramp import model as M
from buildbot_carryphase import model as C

G = 9.81


def test_zero_ramp_matches_carryphase_orbit():
    t = np.linspace(0, 0.8, 9)
    assert np.allclose(M.lipm_x_ramp(0.2, 0.8, 0.7, t, 0.0, 0.0), C.lipm_x(0.2, 0.8, 0.7, t), atol=1e-12)


@pytest.mark.parametrize("c0,c1", [(-0.04, 0.04), (0.0, 0.05), (0.03, -0.02), (0.02, 0.02)])
def test_endpoints_and_equation_of_motion(c0, c1):
    L, T, zc = 0.25, 0.7, 0.71
    t = np.linspace(0, T, 2001)
    x = M.lipm_x_ramp(L, T, zc, t, c0, c1)
    assert x[0] == pytest.approx(-L / 2) and x[-1] == pytest.approx(L / 2)
    h = t[1] - t[0]
    p = c0 + (c1 - c0) * t / T
    acc = (x[2:] - 2 * x[1:-1] + x[:-2]) / h ** 2
    assert np.allclose(acc, G / zc * (x[1:-1] - p[1:-1]), rtol=1e-3, atol=1e-3)


def test_constant_ramp_equals_carrycop_orbit():
    from buildbot_carrycop import model as K  # noqa: WPS433
    t = np.linspace(0, 0.7, 8)
    assert np.allclose(M.lipm_x_ramp(0.2, 0.7, 0.7, t, 0.03, 0.03), K.lipm_x_cop(0.2, 0.7, 0.7, t, 0.03), atol=1e-12)


def test_context_restores_orbit():
    orig = C.lipm_x
    with M.cop_ramp(-0.02, 0.04):
        assert C.lipm_x is not orig
    assert C.lipm_x is orig
