"""Tests for plaw.py, the anticipatory power-law family (numpy only)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import plaw as P  # noqa: E402


@pytest.mark.parametrize("off", [0.1, 0.3, -0.2])
def test_force_is_minus_energy_gradient(off):
    pos = np.array([[0.0, 0.0], [3.0, off]])
    vel = np.array([[1.3, 0.1], [-1.2, 0.0]])
    f = P.forces(pos, vel, np.full(2, P.RADIUS))
    x, v, R, h = pos[0] - pos[1], vel[0] - vel[1], 2 * P.RADIUS, 1e-6
    g = np.array([(P.energy(x + h * e, v, R) - P.energy(x - h * e, v, R)) / (2 * h) for e in np.eye(2)])
    assert np.allclose(f[0], -g, rtol=1e-5, atol=1e-8)
    assert np.allclose(f[0], -f[1])          # equal and opposite
    assert abs(f[0, 0]) > 0.1                # the pair is on collision course: a real force


def test_exact_head_on_has_no_side():
    pos = np.array([[0.0, 1.8], [3.0, 1.8]])
    vel = np.array([[1.3, 0.0], [-1.3, 0.0]])
    f = P.forces(pos, vel, np.full(2, P.RADIUS))
    assert f[0, 0] < 0 and f[0, 1] == 0.0    # slows down, no built-in side


def test_no_force_when_diverging_or_beyond_horizon():
    vel = np.array([[-1.0, 0.0], [1.0, 0.0]])
    assert not P.forces(np.array([[0.0, 0.0], [2.0, 0.0]]), vel, np.full(2, P.RADIUS)).any()
    slow = np.array([[0.1, 0.0], [0.0, 0.0]])  # tau about 45 s > tau0
    assert not P.forces(np.array([[0.0, 0.0], [5.0, 0.0]]), slow, np.full(2, P.RADIUS)).any()


def test_corridor_runs_and_keeps_walkers_inside():
    r = P.simulate(30, 3.6, 16.0, 1.0, 0.1, 3, duration=50.0, warmup=20.0)
    assert r["failed"] == 0 and r["walkers"] > 20
    assert 0.0 <= r["share"] <= 1.0 and 0.6 < r["speed"] < 2.0
