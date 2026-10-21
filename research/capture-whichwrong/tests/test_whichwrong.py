import numpy as np
from capture_whichwrong.scene import W, H, render, stereo_pair
from capture_whichwrong.stereo import match
from capture_whichwrong.hybrid import warped, plain
from capture_whichwrong.learn import features, ideal_weight, Ridge, MLP, FEATURES


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


from capture_whichwrong import which  # noqa: E402


def test_ideal_source_weight_is_exact_when_truth_is_a_mix():
    rng = np.random.default_rng(5)
    c0, c1 = rng.random((H, W, 3)), rng.random((H, W, 3))
    s = rng.random((H, W))
    truth = s[..., None] * c0 + (1 - s[..., None]) * c1
    got, den = which.ideal_source_weight(c0, c1, truth)
    assert np.allclose(got, s, atol=1e-6)


def test_mix_equals_plain_base_when_s_is_one_and_only_changes_overlap():
    ws = warped(sources(), 20.0)
    base, have = plain(ws)
    m = which.mix(ws, have, np.ones((H, W)))
    assert np.allclose(m, base)                      # plain takes source 0 first where valid
    m0 = which.mix(ws, have, np.zeros((H, W)))
    only0 = (ws[0][1] & ~ws[1][1])
    assert np.allclose(m0[only0], base[only0])


def test_new_features_shape_and_finite_and_z_order_zero_outside_overlap():
    src = sources()
    ws = warped(src, 20.0)
    _, have = plain(ws)
    xe = which.cross_errors(src, 20.0)
    X = which.features(ws, have, 12.0, xe)
    assert X.shape == (H, W, len(which.FEATURES)) and np.isfinite(X).all()
    zo = X[..., which.FEATURES.index("z_order")]
    assert (zo[~(ws[0][1] & ws[1][1])] == 0).all()


def test_cross_error_is_small_for_a_flat_consistent_pair_and_larger_with_wrong_depth():
    src = sources(noise=0.0)
    good = np.mean([e[e > 0].mean() for e in which.cross_errors(src, 20.0) if (e > 0).any()])
    bad_src = [(c, z * 1.3, a, k) for c, z, a, k in src]
    bad = np.mean([e[e > 0].mean() for e in which.cross_errors(bad_src, 20.0) if (e > 0).any()])
    assert bad > good
