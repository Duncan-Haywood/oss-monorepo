import numpy as np
from capture_softgate.scene import W, H, render, stereo_pair
from capture_softgate.stereo import match
from capture_softgate.synth import psnr
from capture_softgate.hybrid import make, ramp, weight, warped, plain, match_cost, _grow_max, _smooth


def sources(gap=15.0, b=0.2, noise=0.01):
    out = []
    for ang, s in ((20 - gap / 2, 0), (20 + gap / 2, 10)):
        lc, _, rc, _ = stereo_pair(ang, b, (), noise, s)
        z, _, _, cost = match(lc, rc, b)
        out.append((lc, z, ang, cost))
    return out


def test_ramp_is_clipped_linear():
    x = np.array([0.0, 0.1, 0.3, 0.5, 2.0])
    assert np.allclose(ramp(x, 0.1, 0.5), [0, 0, 0.5, 1, 1])


def test_grow_max_and_smooth_keep_range_and_mean_order():
    a = np.zeros((H, W)); a[10, 10] = 1.0
    g = _grow_max(a, 1)
    assert g.sum() == 5 and g.max() == 1.0
    s = _smooth(g, 1)
    assert 0 <= s.min() and s.max() <= 1.0 and abs(s.sum() - g.sum()) < 1e-6


def test_matcher_returns_a_cost_for_every_pixel():
    lc, _, rc, _ = stereo_pair(20.0, 0.2, (), 0.01, 0)
    z, disp, ok, cost = match(lc, rc, 0.2)
    assert cost.shape == (H, W) and np.isfinite(cost).all() and cost.min() >= 0


def test_identical_exact_sources_have_zero_cost_and_zero_weight_off_holes():
    c, z = render(20)
    srcs = [(c, z, 20.0, np.zeros((H, W))), (c, z, 20.0, np.zeros((H, W)))]
    ws = warped(srcs, 20.0)
    _, have = plain(ws)
    assert match_cost(ws).max() < 1e-9
    for k in ("hard", "soft", "cost", "softcost"):
        w = weight(k, ws, have, 0.15, 0.5, 0.1, 1, 1)
        assert np.allclose(w[have], 0.0) and np.allclose(w[~have], 1.0)


def test_weights_are_in_unit_range_and_holes_take_the_nearest_camera():
    srcs = sources()
    ws = warped(srcs, 20.0)
    _, have = plain(ws)
    for k in ("hard", "soft", "cost", "softcost"):
        w = weight(k, ws, have, 0.15, 0.5, 0.1, 1, 1)
        assert w.min() >= 0 and w.max() <= 1 and np.allclose(w[~have], 1.0)


def test_soft_with_equal_thresholds_nearly_matches_hard_before_smoothing():
    srcs = sources()
    ws = warped(srcs, 20.0)
    _, have = plain(ws)
    hard = weight("hard", ws, have, 0.3, 0.5, 0.1, 1, 1)
    soft = weight("soft", ws, have, 0.3, 0.3000001, 0.1, 1, 0)
    assert np.abs(hard - soft).max() < 1e-6


def test_oracle_is_upper_bound_on_every_strategy():
    srcs = sources()
    truth, _ = render(20.0)
    sc = {k: psnr(make(k, srcs, 20.0, truth=truth), truth) for k in ("fill", "hard", "soft", "cost", "softcost", "oracle")}
    assert sc["oracle"] >= max(sc.values()) - 1e-9
