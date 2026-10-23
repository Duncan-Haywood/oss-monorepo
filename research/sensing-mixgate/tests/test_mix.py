import numpy as np
from sensing_mixgate import MIXES, mixed_mismatch
from sensing_mixgate.mix import gate
from sensing_baoutlier.outlier import make_object, orbit_cameras, project, visible


def _rig():
    pts, nrm = make_object(200, seed=0)
    cams = orbit_cameras(12, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    return pts, cams, vis, np.array([project(c, pts) for c in cams])


def test_mixes_are_distributions():
    for rate, a, n, f in MIXES.values():
        assert 0 < rate < 1 and abs(a + n + f - 1) < 0.01


def test_mixed_mismatch_hits_rate_and_only_visible():
    pts, cams, vis, clean = _rig()
    out, mask = mixed_mismatch((0.4, 0.3, 0.3), clean, vis, 0.2, np.random.default_rng(0), cams, pts)
    assert not mask[~vis].any() and 0.15 < mask.sum() / vis.sum() < 0.25
    assert (out[~mask] == clean[~mask]).all() and (out[mask] != clean[mask]).any()


def test_shares_control_the_kind_of_displacement():
    pts, cams, vis, clean = _rig()
    for shares, lo, hi in [((0, 1, 0), 9.99, 40.01), ((1, 0, 0), 9.99, 40.01)]:
        out, mask = mixed_mismatch(shares, clean, vis, 0.2, np.random.default_rng(1), cams, pts)
        d = np.linalg.norm(out[mask] - clean[mask], axis=1)
        assert d.min() >= lo and d.max() <= hi
    out, mask = mixed_mismatch((0, 0, 1), clean, vis, 0.2, np.random.default_rng(1), cams, pts)
    assert np.linalg.norm(out[mask] - clean[mask], axis=1).max() > 60


def test_run_mixed_restores_gate_and_scores():
    from sensing_mixgate import run_mixed
    orig = gate.mismatch
    r = run_mixed("0.7", seed=0, n_feat=80, max_nfev=30)
    assert gate.mismatch is orig and r["recall"] >= 0 and np.isfinite(r["g_cauchy"])
