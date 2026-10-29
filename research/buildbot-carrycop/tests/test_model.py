import sys
from pathlib import Path

import numpy as np
import pytest

from buildbot_carrycop import model as M
from buildbot_carryphase import model as C

G = 9.81


def test_zero_offset_matches_carryphase_orbit():
    t = np.linspace(0, 0.8, 9)
    assert np.allclose(M.lipm_x_cop(0.2, 0.8, 0.7, t, 0.0), C.lipm_x(0.2, 0.8, 0.7, t), atol=1e-12)


@pytest.mark.parametrize("c", [-0.04, 0.0, 0.05])
def test_endpoints_and_equation_of_motion(c):
    L, T, zc = 0.25, 0.7, 0.71
    t = np.linspace(0, T, 2001)
    x = M.lipm_x_cop(L, T, zc, t, c)
    assert x[0] == pytest.approx(-L / 2) and x[-1] == pytest.approx(L / 2)
    h = t[1] - t[0]
    acc = (x[2:] - 2 * x[1:-1] + x[:-2]) / h ** 2
    assert np.allclose(acc, G / zc * (x[1:-1] - c), rtol=1e-3, atol=1e-3)


def test_context_restores_orbit():
    orig = C.lipm_x
    with M.cop_offset(0.03):
        assert C.lipm_x is not orig
    assert C.lipm_x is orig


def test_offset_moves_the_orbit_the_right_way():
    t = np.array([0.35])
    a = M.lipm_x_cop(0.2, 0.7, 0.7, t, 0.0)
    b = M.lipm_x_cop(0.2, 0.7, 0.7, t, 0.05)
    assert b[0] > a[0]  # a CoP ahead of the foot centre pulls the mid-phase COM ahead


def test_ramp_reduces_to_constant_offset():
    t = np.linspace(0, 0.8, 9)
    assert np.allclose(M.lipm_x_ramp(0.2, 0.8, 0.7, t, 0.03, 0.03), M.lipm_x_cop(0.2, 0.8, 0.7, t, 0.03), atol=1e-12)


@pytest.mark.parametrize("c0,c1", [(-0.06, 0.06), (0.0, 0.09), (0.04, -0.02)])
def test_ramp_endpoints_and_equation_of_motion(c0, c1):
    L, T, zc = 0.25, 0.7, 0.71
    t = np.linspace(0, T, 2001)
    x = M.lipm_x_ramp(L, T, zc, t, c0, c1)
    assert x[0] == pytest.approx(-L / 2) and x[-1] == pytest.approx(L / 2)
    h = t[1] - t[0]
    acc = (x[2:] - 2 * x[1:-1] + x[:-2]) / h ** 2
    c = c0 + (c1 - c0) * t[1:-1] / T
    assert np.allclose(acc, G / zc * (x[1:-1] - c), rtol=1e-3, atol=1e-3)
