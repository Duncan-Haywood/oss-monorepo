import numpy as np
from capture_learngate.scene import W, H, render, stereo_pair
from capture_learngate.stereo import match
from capture_learngate.hybrid import warped, plain
from capture_learngate.learn import features, ideal_weight, Ridge, MLP, FEATURES


def sources(gap=12.0, b=0.2, noise=0.01):
    out = []
    for ang, s in ((20 - gap / 2, 0), (20 + gap / 2, 10)):
        lc, _, rc, _ = stereo_pair(ang, b, (), noise, s)
        z, _, _, cost = match(lc, rc, b)
        out.append((lc, z, ang, cost))
    return out


def test_ground_texture_seed_changes_the_render_and_default_is_unchanged():
    a, _ = render(20.0)
    assert np.array_equal(a, render(20.0, tex=1)[0])
    assert np.abs(a - render(20.0, tex=5)[0]).max() > 0.05


def test_ideal_weight_is_exact_when_truth_is_a_blend():
    rng = np.random.default_rng(0)
    base, near = rng.random((H, W, 3)), rng.random((H, W, 3))
    w = rng.random((H, W))
    truth = w[..., None] * near + (1 - w[..., None]) * base
    got, den = ideal_weight(base, near, truth)
    assert np.allclose(got, w, atol=1e-6) and (den > 0).all()


def test_ideal_weight_is_clipped_and_zero_where_sources_agree():
    base = np.zeros((H, W, 3)); near = base.copy(); near[0, 0] = 1.0
    truth = np.full((H, W, 3), 5.0)
    w, den = ideal_weight(base, near, truth)
    assert w.min() >= 0 and w.max() <= 1 and w[0, 0] == 1.0 and w[5, 5] == 0.0


def test_features_have_the_named_shape_and_are_finite():
    ws = warped(sources(), 20.0)
    _, have = plain(ws)
    X = features(ws, have, 12.0)
    assert X.shape == (H, W, len(FEATURES)) and np.isfinite(X).all()
    assert np.allclose(X[..., FEATURES.index("gap")], 12.0 / 30.0)


def test_ridge_recovers_a_linear_target():
    rng = np.random.default_rng(1)
    X = rng.standard_normal((4000, 3))
    y = np.clip(0.5 + 0.1 * X[:, 0] - 0.05 * X[:, 1], 0, 1)
    m = Ridge(1e-3).fit(X, y, np.ones(len(X)))
    assert np.abs(m.predict(X) - y).max() < 0.01


def test_mlp_learns_a_nonlinear_target_better_than_ridge():
    rng = np.random.default_rng(2)
    X = rng.standard_normal((6000, 2))
    y = 1 / (1 + np.exp(-3 * X[:, 0] * X[:, 1]))        # an interaction a linear model cannot express
    sw = np.ones(len(X))
    e_r = np.abs(Ridge(1.0).fit(X, y, sw).predict(X) - y).mean()
    e_m = np.abs(MLP(hidden=16, epochs=80, lr=1e-2, batch=256, seed=0).fit(X, y, sw).predict(X) - y).mean()
    assert e_m < 0.5 * e_r


def test_predictions_are_in_unit_interval():
    X = np.random.default_rng(3).standard_normal((500, 4)) * 10
    y = np.random.default_rng(4).random(500)
    for m in (Ridge().fit(X, y, np.ones(500)), MLP(hidden=4, epochs=3).fit(X, y, np.ones(500))):
        p = m.predict(X)
        assert p.min() >= 0 and p.max() <= 1
