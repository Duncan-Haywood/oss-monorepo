"""Milestone 3i: pinning the principal point (experiments/m3i_principal)."""
import json, os, sys
import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
M3I = os.path.join(HERE, "..", "experiments", "m3i_principal")
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3h_linear"))
sys.path.insert(0, HERE)
import pinned  # noqa: E402
import nfba  # noqa: E402
from test_m3h import setup  # noqa: E402
from test_m3b import INTR  # noqa: E402


def test_pinned_principal_point_stays_and_true_c_recovers_f():
    prob, rv, tv, X = setup()
    start = np.array([INTR[0] * 1.08, INTR[1], INTR[2], 0.0, 0.0])
    info, (intr, *_), q = pinned.bundle_pinned(prob, start, rv, tv, X, pinned=(1, 2))
    assert info["status"] > 0
    assert intr[1] == INTR[1] and intr[2] == INTR[2]
    cov, free, _ = pinned.intr_cov_pinned(prob, q, pinned=(1, 2))
    assert free == [0, 3, 4]
    assert abs(intr[0] - INTR[0]) < 4 * np.sqrt(cov[0, 0])


def test_small_principal_point_step_matches_conditioning():
    prob, rv, tv, X = setup()
    start = np.array([INTR[0] * 1.08, 320.0, 240.0, 0.0, 0.0])
    _, (intr, rv1, tv1, X1), q = nfba.bundle(prob, start, rv, tv, X)
    cov, *_ = nfba.intr_cov(prob, q)
    ct = intr[1:3] + np.sqrt(np.diag(cov))[1:3] * np.array([1.5, -1.0])
    fc, ratio = pinned.condition(intr, cov, (1, 2), ct)
    i0 = intr.copy(); i0[1:3] = ct
    _, (ip, *_), qp = pinned.bundle_pinned(prob, i0, rv1, tv1, X1, pinned=(1, 2))
    dc, dp = fc - intr[0], ip[0] - intr[0]
    assert abs(dc) > 1e-3
    # a 1.5-sd step re-solves about 5% longer than first order here (k's 0.5-sd step in test_m3h met 5%)
    assert abs(dp - dc) < 0.10 * abs(dc)


def test_four_term_conditioning_is_joint_gaussian():
    rng = np.random.default_rng(5)
    A = rng.normal(size=(5, 5)); cov = A @ A.T + 5 * np.eye(5)
    intr = np.array([500.0, 320, 240, 0.1, -0.2]); ref = np.array([318.0, 245.0, 0.2, -0.5])
    fc, r = pinned.condition(intr, cov, (1, 2, 3, 4), ref)
    x = rng.multivariate_normal(intr, cov, size=400000)
    # E[f | rest = ref] by least squares of f on the rest (exact for a Gaussian)
    Z = np.c_[np.ones(len(x)), x[:, 1:] - intr[1:]]
    b = np.linalg.lstsq(Z, x[:, 0], rcond=None)[0]
    assert abs(b[0] + b[1:] @ (ref - intr[1:]) - fc) < 0.05
    assert abs(np.std(x[:, 0] - Z @ b) / np.sqrt(cov[0, 0]) - r) < 0.01


def test_board_reference_reproduces_milestone_4n():
    pytest.importorskip("cv2")
    sys.path.insert(0, M3I)
    import tum
    z = json.load(open(os.path.join(M3I, "..", "m4n_k2", "summary.json")))["zhang"]
    for u in ("fr1", "fr3"):
        r = tum.board_ref(u)
        assert abs(r["f"] - z[u]["k1k2"]["f"]) < 1e-6 * r["f"]
        assert 300 < r["cx"] < 340 and 230 < r["cy"] < 270
