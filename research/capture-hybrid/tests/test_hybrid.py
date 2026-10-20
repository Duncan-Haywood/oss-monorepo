import numpy as np
from capture_hybrid.scene import W, H, SKY, render, stereo_pair
from capture_hybrid.stereo import match
from capture_hybrid.synth import psnr
from capture_hybrid.hybrid import make, row_fill, _dilate, disagreement, warped


def sources(gap=15.0, b=0.2, noise=0.01):
    out = []
    for ang, s in ((20 - gap / 2, 0), (20 + gap / 2, 10)):
        lc, _, rc, _ = stereo_pair(ang, b, (), noise, s)
        z, _, _ = match(lc, rc, b)
        out.append((lc, z, ang))
    return out


def test_row_fill_takes_the_farther_neighbour():
    img = np.zeros((H, W, 3)); have = np.ones((H, W), bool); z = np.ones((H, W))
    img[:, :4] = 0.2; z[:, :4] = 1.0       # near on the left
    img[:, 6:] = 0.8; z[:, 6:] = 5.0       # far on the right
    have[:, 4:6] = False
    out = row_fill(img, have, z)
    assert np.allclose(out[:, 4:6], 0.8)


def test_row_fill_leaves_valid_pixels_alone():
    rng = np.random.default_rng(0)
    img = rng.random((H, W, 3)); have = rng.random((H, W)) > 0.3; z = rng.random((H, W)) + 1
    out = row_fill(img, have, z)
    assert np.array_equal(out[have], img[have])


def test_dilate_grows_by_one_pixel():
    m = np.zeros((H, W), bool); m[10, 10] = True
    assert _dilate(m, 1).sum() == 5 and _dilate(m, 0).sum() == 1


def test_disagreement_zero_with_identical_exact_sources():
    c, z = render(20)
    ws = warped([(c, z, 20.0), (c, z, 20.0)], 20.0)
    assert disagreement(ws).max() < 1e-9


def test_plain_equals_stereodepth_style_result_and_strategies_keep_shape():
    srcs = sources()
    for k in ("plain", "fill", "fallback", "gate"):
        assert make(k, srcs, 20.0).shape == (H, W, 3)


def test_oracle_is_upper_bound_and_repairs_beat_plain():
    srcs = sources()
    truth, _ = render(20.0)
    sc = {k: psnr(make(k, srcs, 20.0, truth=truth), truth) for k in ("plain", "fill", "fallback", "gate", "oracle")}
    assert sc["oracle"] >= max(sc.values()) - 1e-9
    assert sc["fill"] > sc["plain"] and sc["fallback"] > sc["plain"]
