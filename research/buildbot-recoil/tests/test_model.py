import numpy as np
import pytest

from buildbot_payload import fetch, model as P
from buildbot_recoil import model as R

pytestmark = pytest.mark.skipif(not fetch.available("g1"), reason="needs the Menagerie G1 model (git + network)")


@pytest.fixture(scope="module")
def g1():
    r = P.load("g1")
    return r, R.setup(r)


def test_hold_stays_put_without_a_shot(g1):
    r, s = g1
    o = R.fire(s, r, 0.0, 6.0, t_end=0.6)
    assert np.abs(o[:, 1:4]).max() < 1.5e-3          # the feed-forward balances gravity, tool and wall force
    assert o[:, 4].min() > 29.0                       # preload kept (30 N)


def test_first_milliseconds_obey_momentum(g1):
    # No wall stiffness, a slow controller: after the pulse the tip moves at J / m_eff, with
    # m_eff the operational-space mass along x, 1 / (j M^-1 j^T).
    r, s = g1
    m = s.model
    import mujoco
    d = mujoco.MjData(m)
    d.qpos[:] = s.q
    mujoco.mj_forward(m, d)
    j = np.mean([P._jac(m, d, P._bid(m, b), p)[0][0] for b, p in r.hands["palm"]], axis=0)[6:]
    m_eff = 1.0 / (j @ np.linalg.solve(s.mass, j))
    J, t_end = 0.5, 0.02
    o = R.fire(s, r, J, 0.1, k_wall=0.0, c_wall=0.0, t_end=t_end)
    x = -o[-1, 1]                                      # backwards travel at t_end
    want = (J / m_eff) * (t_end - 0.004 / 2)
    assert x == pytest.approx(want, rel=0.1)


def test_small_shots_scale_linearly(g1):
    r, s = g1
    base = R.fire(s, r, 0.0, 8.0, t_end=0.5)
    a = R.summarize(R.fire(s, r, 0.1, 8.0, t_end=0.5), base)
    b = R.summarize(R.fire(s, r, 0.2, 8.0, t_end=0.5), base)
    assert b["peak_back_mm"] == pytest.approx(2 * a["peak_back_mm"], rel=0.15)


def test_stiffer_loop_moves_less(g1):
    r, s = g1
    out = {}
    for f in (2.0, 12.0):
        base = R.fire(s, r, 0.0, f, t_end=0.5)
        out[f] = R.summarize(R.fire(s, r, 2.0, f, t_end=0.5), base)["peak_back_mm"]
    assert out[12.0] < out[2.0]


def test_summarize_flags_window():
    t = np.linspace(0, 1, 1001)
    z = np.zeros_like(t)
    base = np.stack([t, z, z, z, z + 30], 1)
    shot = base.copy()
    shot[500, 2] = 5e-3                                # 5 mm sideways blip at one sample
    s = R.summarize(shot, base)
    assert s["peak_yz_mm"] == pytest.approx(5.0) and not s["in_window"]
    assert s["lost_s"] == 0.0
