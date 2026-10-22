import numpy as np
from sensing_epigate import mismatch, fundamental_ransac, epipolar_gate, run_trial
from sensing_epigate.gate import sampson
from sensing_baoutlier.outlier import make_object, orbit_cameras, project, visible


def _rig(seed=0, n=200, views=12):
    pts, nrm = make_object(n, seed=seed)
    cams = orbit_cameras(views, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    clean = np.array([project(c, pts) for c in cams])
    return pts, cams, vis, clean


def test_true_fundamental_has_tiny_sampson_error_on_exact_matches():
    _, _, vis, clean = _rig()
    both = np.flatnonzero(vis[0] & vis[1])
    F, inl = fundamental_ransac(clean[0, both], clean[1, both], 0.5, 100, np.random.default_rng(0))
    assert inl.all() and np.sqrt(sampson(F, clean[0, both], clean[1, both])).max() < 1e-6


def test_mismatch_kinds_displace_only_masked_visible_observations():
    pts, cams, vis, clean = _rig()
    for kind in ["uniform", "near", "along"]:
        out, mask = mismatch(kind, clean, vis, 0.2, np.random.default_rng(1), cams, pts)
        assert not mask[~vis].any() and 0.1 < mask.sum() / vis.sum() < 0.3
        assert (out[~mask] == clean[~mask]).all() and (out[mask] != clean[mask]).any()
    d = np.linalg.norm(out[mask] - clean[mask], axis=1)
    assert d.min() >= 9.99 and d.max() <= 40.01


def test_along_mismatch_lies_on_epipolar_line_of_one_view_only():
    pts, cams, vis, clean = _rig()
    rng = np.random.default_rng(2)
    out, mask = mismatch("along", clean, vis, 0.15, rng, cams, pts)
    keep = epipolar_gate(out, vis, 1.0, seed=0)
    uni, mu = mismatch("uniform", clean, vis, 0.15, np.random.default_rng(2), cams, pts)
    ku = epipolar_gate(uni, vis, 1.0, seed=0)
    assert (~ku & mu).sum() / mu.sum() > 0.9
    assert (~ku & mu).sum() / mu.sum() >= (~keep & mask).sum() / mask.sum()


def test_gate_removes_most_uniform_mismatches_and_keeps_good_ones():
    r = run_trial("uniform", 0.1, seed=0, n_feat=200)
    assert r["recall"] > 0.8 and r["lost"] < 0.15
    assert r["g_cauchy"] < 0.5 * r["cauchy"]


def test_deterministic():
    assert run_trial(seed=2, n_feat=80) == run_trial(seed=2, n_feat=80)
