"""Tests for orca.py, the ORCA family (numpy; numba optional)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import orca as O  # noqa: E402


def _vel(P, V, pref, width=0.0, vmax=2.0):
    n = len(P)
    return O.orca_velocities(np.asarray(P, float), np.asarray(V, float), np.asarray(pref, float),
                             np.full(n, vmax), np.full(n, O.RADIUS), width, O.TAU, O.TAU_OBST,
                             0.1, O.RANGE, O.MAX_NEIGHBORS)


def test_free_walker_keeps_its_preferred_velocity():
    v = _vel([[0.0, 0.0], [10.0, 5.0]], [[1.3, 0.0], [0.0, 0.0]], [[1.3, 0.0], [0.0, 0.0]])
    assert np.allclose(v[0], [1.3, 0.0])


def test_new_velocity_satisfies_the_half_plane_and_is_reciprocal():
    P = np.array([[0.0, 0.0], [3.0, 0.1]])
    V = np.array([[1.3, 0.0], [-1.3, 0.0]])
    v = _vel(P, V, V)
    line = np.empty(4)
    for i, j in ((0, 1), (1, 0)):
        O._agent_line(P[i, 0], P[i, 1], V[i, 0], V[i, 1], P[j, 0], P[j, 1], V[j, 0], V[j, 1],
                      2 * O.RADIUS, O.TAU, 0.1, line)
        assert O._det(line[2], line[3], line[0] - v[i, 0], line[1] - v[i, 1]) <= 1e-9
    # each takes half the effort: lateral changes equal and opposite
    assert abs(v[0, 1] + v[1, 1]) < 1e-6 and abs(v[0, 1]) > 0.01
    # resulting relative velocity no longer leads to contact within the horizon
    rv, rp = v[0] - v[1], P[1] - P[0]
    t = np.clip(rp @ rv / (rv @ rv), 0, O.TAU)
    assert np.linalg.norm(rp - rv * t) >= 2 * O.RADIUS - 1e-6


def test_walls_bound_the_lateral_velocity():
    v = _vel([[0.0, 0.3]], [[0.0, 0.0]], [[0.0, -1.0]], width=3.6)
    assert v[0, 1] >= -(0.3 - O.RADIUS) / O.TAU_OBST - 1e-9


def test_infeasible_program_returns_bounded_velocity():
    P = [[0.0, 0.0], [0.3, 0.0], [-0.3, 0.0], [0.0, 0.3], [0.0, -0.3]]   # all overlapping
    V = [[0.0, 0.0]] * 5
    v = _vel(P, V, [[1.0, 0.0]] * 5)
    assert np.isfinite(v).all() and (np.linalg.norm(v, axis=1) <= 2.0 + 1e-6).all()


def test_pair_on_collision_course_never_overlaps():
    P = np.array([[0.0, 1.8], [6.0, 1.85]])
    V = np.array([[1.3, 0.0], [-1.3, 0.0]])
    pref = V.copy()
    gap = []
    for _ in range(80):
        V = _vel(P, V, pref, width=3.6)
        P = P + V * 0.1
        gap.append(np.linalg.norm(P[0] - P[1]))
    assert min(gap) >= 2 * O.RADIUS - 0.02 and P[0, 0] > P[1, 0]   # they passed


def test_corridor_runs_and_keeps_walkers_inside():
    r = O.simulate(30, 3.6, 16.0, 1.0, 0.1, 3, duration=50.0, warmup=20.0)
    assert r["failed"] == 0 and r["walkers"] > 20
    assert 0.0 <= r["share"] <= 1.0 and 0.6 < r["speed"] < 2.0
