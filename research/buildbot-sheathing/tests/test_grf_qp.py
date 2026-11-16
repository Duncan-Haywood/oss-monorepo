"""Milestone 32: contact-force QPs over the sole points (cones, base balance, sign holding)."""
import numpy as np

from buildbot_sheathing import grf_qp as GQ


def _box(mu=0.5, w=100.0, mx=0.0):
    """A planar-ish toy: four sole points at z 0, the 'base' is a rigid body with weight w and a moment mx
    about x to balance, and one 'joint' torque equal to the y-moment of the left pair about its centre."""
    P = np.array([[0.1, 0.1, 0], [-0.1, 0.1, 0], [0.1, -0.1, 0], [-0.1, -0.1, 0]], float)
    k = len(P)
    Jc = np.zeros((3 * k, 7))
    for i, p in enumerate(P):
        Jc[3 * i:3 * i + 3, :3] = np.eye(3)
        # rotational base dofs: d(point)/d(omega) = -[p]x, so Jc^T f gives the moment p x f
        Jc[3 * i:3 * i + 3, 3:6] = -np.array([[0, -p[2], p[1]], [p[2], 0, -p[0]], [-p[1], p[0], 0]])
        if p[1] > 0:
            Jc[3 * i + 2, 6] = p[0]               # the joint feels the left pair's pitch moment
    h = np.zeros(7)
    h[2] = w
    h[3] = mx
    return GQ.Contact(h, Jc, mu), P


def test_cones_and_balance_hold_for_every_controller():
    c, _ = _box()
    for kind in ("force", "torque"):
        f, info = GQ.solve(c, kind, [0])
        eq, cone = c.residuals(f)
        assert info["feasible"] and eq < 1e-8 and cone < 1e-8


def test_force_controller_splits_evenly():
    c, _ = _box()
    f, _ = GQ.solve(c, "force", [0])
    assert np.allclose(f[2::3], 25.0, atol=1e-6) and np.allclose(f[0::3], 0, atol=1e-6)


def test_hold_reaches_the_margin_the_lp_says_and_no_further():
    c, _ = _box()
    m, _ = GQ.margin_lp(c, [0], [1.0])
    assert m > 0
    f, info = GQ.solve(c, "hold", [0], [1.0], tau_f=0.9 * m)
    assert info["feasible"] and c.tau(f)[0] >= 0.9 * m - 1e-6
    f, info = GQ.solve(c, "hold", [0], [1.0], tau_f=1.1 * m)
    assert f is None and not info["feasible"]


def test_a_moment_beyond_the_sole_is_infeasible_and_cop_is_split_independent():
    c, P = _box(mx=0.05 * 100)                  # centre of pressure 0.05 m to one side: inside
    assert GQ.margin_lp(c, [], [])[1] is not None
    x, y = GQ.cop(c, [(0, p) for p in P])
    assert abs(x) < 1e-9 and abs(abs(y) - 0.05) < 1e-9
    c2, _ = _box(mx=0.15 * 100)                 # 0.15 m: outside the 0.1 m half-width
    assert GQ.margin_lp(c2, [], [])[1] is None
