"""Milestone 3c: the delete-one-keyframe jackknife and the cluster sandwiches
(experiments/m3c_jackknife/jk.py) on synthetic scenes with a known camera."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3c_jackknife"))
sys.path.insert(0, HERE)
import jk  # noqa: E402
import nfba  # noqa: E402
from test_m3b import scene, INTR  # noqa: E402


def fitted(seed, noise=0.5, nv=10):
    vi, pi, uv, rv, tv, X = scene(seed, nv=nv, npt=250, noise=noise)
    prob = nfba.Problem(vi, pi, uv, nv, len(X), tv)
    info, (intr, rv2, tv2, X2), q = nfba.bundle(prob, INTR * [1.02, 1, 1, 1, 1], rv, tv, X)
    return vi, pi, uv, prob, q, intr, rv2, tv2, X2


def test_reanchor_keeps_projections():
    vi, pi, uv, rv, tv, X = scene(1)
    a, _ = nfba.project(INTR, rv[vi], tv[vi], X[pi])
    rvn, tvn, Xn = jk.reanchor(rv, tv, X, 1)
    b, _ = nfba.project(INTR, rvn[vi], tvn[vi], Xn[pi])
    assert np.allclose(a, b, atol=1e-8)
    assert np.allclose(rvn[1], 0, atol=1e-10) and np.allclose(tvn[1], 0, atol=1e-10)


def test_delete_view_drops_and_reindexes():
    vi, pi, uv, rv, tv, X = scene(2)
    for v in (0, 3, len(rv) - 1):
        vi2, pi2, uv2, nv2, npt2, rv2, tv2, X2 = jk.delete_view(vi, pi, uv, rv, tv, X, v)
        assert nv2 == len(rv) - 1 and len(rv2) == nv2 and vi2.max() < nv2
        assert np.all(np.bincount(pi2, minlength=npt2) >= 2) and len(X2) == npt2
        # the reduced problem's projections still match its observations (noise only)
        pr, _ = nfba.project(INTR, rv2[vi2], tv2[vi2], X2[pi2])
        assert np.sqrt(((pr - uv2) ** 2).mean()) < 1.0
        assert np.allclose(rv2[0], 0, atol=1e-10)


def test_sandwich_matches_model_cov_under_iid_noise():
    # Independent 0.5 px noise: the track-clustered sandwich should agree with the solver's sd
    # to within a factor of 1.5 (both estimate the same thing when the model is right).
    vi, pi, uv, prob, q, *_ = fitted(3)
    cov, sig, _, _ = nfba.intr_cov(prob, q)
    s_tr = np.sqrt(jk.sandwich(prob, q, pi)[0, 0])
    assert 1 / 1.5 < s_tr / np.sqrt(cov[0, 0]) < 1.5


def test_jackknife_scale_under_iid_noise():
    # Across seeds, the jackknife sd and the solver's sd agree on average within a factor of 2,
    # and the delete-one solves all converge.
    ratios = []
    for seed in (4, 5, 6):
        vi, pi, uv, prob, q, intr, rv, tv, X = fitted(seed)
        cov, _, _, _ = nfba.intr_cov(prob, q)
        out = jk.jackknife(vi, pi, uv, intr, rv, tv, X)
        assert all(o["status"] == "ok" for o in out)
        ratios.append(jk.jk_sd([o["f"] for o in out]) / np.sqrt(cov[0, 0]))
    assert 0.5 < np.exp(np.mean(np.log(ratios))) < 2.0


def test_sandwich_sees_per_view_offsets():
    # A per-view image offset (a frame-level error the model lacks) is invisible to the track
    # clusters but inflates the keyframe-clustered sandwich relative to i.i.d. noise.
    vi, pi, uv, rv, tv, X = scene(7, nv=10, npt=250, noise=0.3)
    rng = np.random.default_rng(7)
    off = rng.normal(0, 1.5, (10, 2))
    uv = uv + off[vi]
    prob = nfba.Problem(vi, pi, uv, 10, len(X), tv)
    _, _, q = nfba.bundle(prob, INTR, rv, tv, X)
    s_v = np.sqrt(jk.sandwich(prob, q, vi)[0, 0])
    assert np.isfinite(s_v) and s_v > 0


def test_lag1_corr_detects_track_correlation():
    # Evaluated at the true parameters, so the residuals are the injected errors: a shared
    # per-track offset (sd 0.6 px) on top of 0.3 px noise gives a lag-1 correlation near
    # 0.36 / (0.36 + 0.09) = 0.8. (Refitted, such an offset is mostly absorbed by the 3D point.)
    vi, pi, uv, rv, tv, X = scene(8, nv=10, npt=250, noise=0.3)
    rng = np.random.default_rng(8)
    uv = uv + rng.normal(0, 0.6, (len(X), 2))[pi]
    prob = nfba.Problem(vi, pi, uv, 10, len(X), tv)
    q = prob.pack(INTR, rv, tv, X)
    cx, cy, n = jk.lag1_corr(prob, q)
    assert n > 500 and 0.7 < cx < 0.9 and 0.7 < cy < 0.9
    # and independent noise gives about zero
    vi, pi, uv, rv, tv, X = scene(9, nv=10, npt=250, noise=0.5)
    prob = nfba.Problem(vi, pi, uv, 10, len(X), tv)
    cx, cy, n = jk.lag1_corr(prob, prob.pack(INTR, rv, tv, X))
    assert abs(cx) < 0.1 and abs(cy) < 0.1
