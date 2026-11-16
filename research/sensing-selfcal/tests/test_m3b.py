"""Milestone 3b: the natural-feature BA (experiments/m3b_natural/nfba.py) on synthetic scenes with a
known camera."""
import os, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3b_natural"))
import nfba  # noqa: E402

INTR = np.array([520.0, 315.0, 250.0, 0.2, -0.5])


def scene(seed, nv=8, npt=300, noise=0.5):
    rng = np.random.default_rng(seed)
    X = np.column_stack([rng.uniform(-1.5, 1.5, npt), rng.uniform(-1, 1, npt), rng.uniform(3, 6, npt)])
    rv = np.zeros((nv, 3))
    tv = np.zeros((nv, 3))
    for v in range(1, nv):
        rv[v] = rng.normal(0, 0.12, 3)
        tv[v] = rng.normal(0, 0.4, 3)
    vi, pi, uv = [], [], []
    for v in range(nv):
        u, z = nfba.project(INTR, np.tile(rv[v], (npt, 1)), np.tile(tv[v], (npt, 1)), X)
        ok = (z > 0) & (u[:, 0] > 0) & (u[:, 0] < 640) & (u[:, 1] > 0) & (u[:, 1] < 480)
        for p in np.nonzero(ok)[0]:
            vi.append(v); pi.append(p); uv.append(u[p] + rng.normal(0, noise, 2))
    return np.array(vi), np.array(pi), np.array(uv), rv, tv, X


def test_project_matches_opencv():
    rng = np.random.default_rng(0)
    X = rng.uniform(-1, 1, (20, 3)) + [0, 0, 4]
    r, t = np.array([0.1, -0.2, 0.05]), np.array([0.3, -0.1, 0.2])
    u, _ = nfba.project(INTR, np.tile(r, (20, 1)), np.tile(t, (20, 1)), X)
    K = np.array([[INTR[0], 0, INTR[1]], [0, INTR[0], INTR[2]], [0, 0, 1]])
    ref, _ = cv2.projectPoints(X, r, t, K, np.array([INTR[3], INTR[4], 0, 0, 0]))
    assert np.allclose(u, ref.reshape(-1, 2), atol=1e-8)


def test_undistort_inverts_model():
    xn = np.array([[0.1, -0.2], [0.3, 0.25], [-0.4, 0.1]])
    r2 = (xn ** 2).sum(1, keepdims=True)
    uv = INTR[0] * xn * (1 + INTR[3] * r2 + INTR[4] * r2 ** 2) + INTR[1:3]
    assert np.allclose(nfba.undistort_px(uv, INTR, iters=60), xn, atol=1e-9)


def test_bundle_recovers_camera_and_sd_is_sane():
    vi, pi, uv, rv, tv, X = scene(1)
    npt = X.shape[0]
    used = np.unique(pi)
    remap = -np.ones(npt, int); remap[used] = np.arange(len(used))
    pi, X = remap[pi], X[used]
    # start from a perturbed truth: f 8% high, distortion zero, poses and points jittered
    rng = np.random.default_rng(2)
    start = np.array([INTR[0] * 1.08, 320.0, 240.0, 0.0, 0.0])
    prob = nfba.Problem(vi, pi, uv, len(rv), len(X), tv)
    info, (intr, _, _, _), q = nfba.bundle(prob, start, rv + rng.normal(0, 0.01, rv.shape),
                                           tv * 1.0, X + rng.normal(0, 0.02, X.shape))
    cov, sig, rms_in, inl = nfba.intr_cov(prob, q)
    sd_f = np.sqrt(cov[0, 0])
    assert info["status"] > 0
    assert abs(sig - 0.5) < 0.1          # 0.5 px noise per coordinate
    assert inl > 0.99
    assert 0 < sd_f < 0.02 * INTR[0]
    assert abs(intr[0] - INTR[0]) < 4 * sd_f


def test_tracks_keep_one_feature_per_view():
    pts = np.zeros((4, 2))
    feats = [(pts, None)] * 3
    pairs = {(0, 1): (np.array([0, 1]), np.array([0, 1])),
             (1, 2): (np.array([0, 1]), np.array([0, 0]))}   # view 2 feature 0 joins two chains
    tracks = nfba.build_tracks(feats, pairs)
    # the merged component holds view 0 twice (features 0 and 1) and must be dropped
    assert tracks == []
    pairs[(1, 2)] = (np.array([0, 1]), np.array([0, 1]))
    tracks = nfba.build_tracks(feats, pairs)
    assert sorted(sorted(t.items()) for t in tracks) == [[(0, 0), (1, 0), (2, 0)], [(0, 1), (1, 1), (2, 1)]]
