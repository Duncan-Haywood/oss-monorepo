import numpy as np
from sensing_gatecorr import correlated_mismatch, run_corr
from sensing_epigate import gate
from sensing_baoutlier.outlier import make_object, orbit_cameras, project, visible


def _rig():
    pts, nrm = make_object(200, seed=0)
    cams = orbit_cameras(12, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    return vis, np.array([project(c, pts) for c in cams])


def test_overall_rate_is_held_across_spans():
    vis, clean = _rig()
    for span in (1, 4, 12):
        r = [correlated_mismatch(span, clean, vis, 0.1, np.random.default_rng(s))[1].sum() / vis.sum()
             for s in range(20)]
        assert 0.06 < np.mean(r) < 0.14


def test_offset_is_shared_within_a_feature_and_in_range():
    vis, clean = _rig()
    out, mask = correlated_mismatch(6, clean, vis, 0.1, np.random.default_rng(1))
    d = out - clean
    assert (d[~mask] == 0).all() and not mask[~vis].any()
    for i in np.flatnonzero(mask.any(0)):
        di = d[mask[:, i], i]
        assert np.allclose(di, di[0])
        assert 9.99 <= np.linalg.norm(di[0]) <= 40.01


def test_span_is_a_run_of_consecutive_views():
    vis = np.ones((12, 30), bool)
    clean = np.zeros((12, 30, 2))
    _, mask = correlated_mismatch(5, clean, vis, 0.2, np.random.default_rng(2))
    for i in np.flatnonzero(mask.any(0)):
        assert mask[:, i].sum() == 5
        v = np.flatnonzero(mask[:, i])
        assert len(set(np.diff(np.r_[v, v[0] + 12]))) <= 2  # cyclic run


def test_patch_is_restored_and_trial_runs():
    orig = gate.mismatch
    r = run_corr(4, 0.06, seed=0, n_feat=80, n_views=8)
    assert gate.mismatch is orig and np.isfinite(r["g_cauchy"]) and 0 <= r["recall"] <= 1
