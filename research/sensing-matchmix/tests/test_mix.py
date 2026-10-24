import numpy as np
from sensing_matchmix import MIXES, mix_mismatch, run_trial
from sensing_baoutlier.outlier import make_object, orbit_cameras, project, visible


def _rig(n=300, views=12):
    pts, nrm = make_object(n, seed=0)
    cams = orbit_cameras(views, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    return pts, cams, vis, np.array([project(c, pts) for c in cams])


def test_mix_shares_are_valid_and_match_source_rows():
    for r, a, n, f in MIXES.values():
        assert 0 < r < 1 and abs(a + n + f - 1) < 0.01
    assert MIXES["stereo 0.7"][0] == 0.061


def test_mix_rate_and_displacement_classes():
    pts, cams, vis, clean = _rig()
    out, mask = mix_mismatch((0.0, 0.0, 1.0), clean, vis, 0.2, np.random.default_rng(0), cams, pts)
    assert abs(mask.sum() / vis.sum() - 0.2) < 0.03
    assert (out[~mask] == clean[~mask]).all()
    d = np.linalg.norm(out[mask] - clean[mask], axis=1)
    assert d.max() > 40  # uniform pixels reach far beyond near_px
    out, mask = mix_mismatch((0.0, 1.0, 0.0), clean, vis, 0.2, np.random.default_rng(0), cams, pts)
    d = np.linalg.norm(out[mask] - clean[mask], axis=1)
    assert d.min() >= 9.99 and d.max() <= 40.01


def test_trial_deterministic_and_clean_floor_is_best():
    a = run_trial("stereo 0.7", seed=1, max_nfev=40)
    assert a == run_trial("stereo 0.7", seed=1, max_nfev=40)
    assert a["clean_ba"] <= min(a["cauchy"], a["ri_cauchy"], a["g_cauchy"], a["g_ri"]) * 1.5
