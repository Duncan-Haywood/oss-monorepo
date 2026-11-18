import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import straighten as S  # noqa: E402
from buildbot_sheathing import tack as K  # noqa: E402
from buildbot_sheathing.budget import HEIGHT, IN, Z_JOINT  # noqa: E402

U = Z_JOINT / HEIGHT


@pytest.mark.parametrize("ends,c", [("pinned", 48.0), ("fixed", 192.0)])
def test_mid_push_matches_beam_tables(ends, c):
    cf, final, x = S.mid_push_fe(ends)
    assert cf == pytest.approx(c, rel=1e-6)
    assert np.allclose(final, S.residual(x, ends), atol=1e-8)


def test_residual_peaks():
    u = np.linspace(0, 1, 60001)
    assert S.residual(u, "pinned").max() == pytest.approx(2 / 27, rel=1e-6)    # b u (1-2u)^2 at u = 1/6
    assert S.residual(u, "fixed").max() == pytest.approx(8 / 27, rel=1e-6)
    assert u[np.argmax(S.residual(u, "pinned"))] == pytest.approx(1 / 6, abs=1e-4)


def test_force_units():
    # 48 E I b / L^3 by hand for E = 1.2e6 psi, b = 0.33 in: about 23.5 lbf
    f = S.force(48, 1.2e6 * S.PSI, 0.33 * IN)
    assert f / 4.44822 == pytest.approx(48 * 1.2e6 * (3.5 * 1.5 ** 3 / 12) * 0.33 / 92.625 ** 3, rel=1e-6)


def test_three_point_is_symmetric_and_small():
    f, final, _ = S.simultaneous([1 / 6, 0.5, 5 / 6])
    assert f[0] == pytest.approx(f[2], rel=1e-6)
    assert np.abs(final).max() < 0.02


def test_nails_leave_tolerance_and_symmetry():
    st = S.Straightener("nails", U, "pinned", tol=0.5e-3)
    b = np.array([-12e-3, -3e-3, 3e-3, 12e-3])
    left = st.left(b)
    assert np.abs(left).max() <= 0.5e-3 + 1e-9
    assert np.allclose(left[0], -left[3]) and np.allclose(left[1], -left[2])
    # a small bow needs no push after the mid one: same force as mid
    m = S.Straightener("mid", U, "pinned")
    assert st.force(2e-3, 8e9) == pytest.approx(m.force(2e-3, 8e9), rel=1e-6)


def test_e_draw_mean_and_cov():
    e = S.e_draw(np.random.default_rng(0), 400000, "SPF")
    assert e.mean() / S.PSI == pytest.approx(1.2e6, rel=0.01)
    assert e.std() / e.mean() == pytest.approx(S.COV_E, rel=0.02)


def test_straightening_recovers_straight_studs():
    """With no read error and the three-point push, bowed studs score as straight ones."""
    kw = dict(trials=4000, seed=1, policy="three", s_read=0.0, s_robot=0.0, s_edge=0.0)
    straight = K.simulate(**kw)["clean"]
    bowed = K.simulate(bow_mean=0.21 * IN, **kw)["clean"]
    fixed = K.simulate(bow_mean=0.21 * IN, straighten=S.Straightener("three", U), **kw)["clean"]
    assert bowed < straight
    assert fixed == pytest.approx(straight, abs=0.01)


def test_straightening_needs_a_bow_estimate():
    with pytest.raises(ValueError):
        K.simulate(trials=10, policy="single", straighten=S.Straightener("mid", U))
