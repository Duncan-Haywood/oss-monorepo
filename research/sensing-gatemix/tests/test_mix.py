import numpy as np
from sensing_gatemix import measured_mixes, mixed_mismatch, run_mixed
from sensing_epigate.gate import mismatch
from sensing_baoutlier.outlier import make_object, orbit_cameras, project, visible


def _rig():
    pts, nrm = make_object(200, seed=0)
    cams = orbit_cameras(12, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    return pts, cams, vis, np.array([project(c, pts) for c in cams])


def test_parses_the_committed_measurements():
    m = measured_mixes()
    rate, sh = m[("A", 0.7, False)]
    assert abs(rate - 0.061) < 1e-9 and abs(sum(sh.values()) - 1) < 0.01 and sh["along"] > 0.6
    assert m[("A", 1.0, False)][1]["far"] > 0.8
    assert ("B", 0.8, False) in m and ("A", 0.6, True) in m


def test_mixed_mismatch_masks_and_shift_ranges():
    pts, cams, vis, clean = _rig()
    out, mask = mixed_mismatch({"along": 1.0, "near": 0.0, "far": 0.0}, clean, vis, 0.2,
                               np.random.default_rng(0), cams, pts)
    assert not mask[~vis].any() and 0.1 < mask.sum() / vis.sum() < 0.3
    assert (out[~mask] == clean[~mask]).all()
    d = np.linalg.norm(out[mask] - clean[mask], axis=1)
    assert d.min() >= 9.99 and d.max() <= 40.01


def test_mix_shares_are_respected():
    pts, cams, vis, clean = _rig()
    out, mask = mixed_mismatch({"along": 0.0, "near": 0.5, "far": 0.5}, clean, vis, 0.5,
                               np.random.default_rng(1), cams, pts)
    d = np.linalg.norm(out[mask] - clean[mask], axis=1)
    assert 0.35 < (d <= 40.01).mean() < 0.65


def test_patch_is_restored_and_pure_far_matches_uniform_trial():
    from sensing_epigate import gate
    orig = gate.mismatch
    a = run_mixed({"along": 0, "near": 0, "far": 1}, 0.05, n_views=8, n_feat=120, max_nfev=30, seed=2)
    assert gate.mismatch is orig
    assert 0.5 < a["recall"] <= 1.0 and a["cauchy"] > 0
