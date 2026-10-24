import sys
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_bak2 import project_k2, run_trial  # noqa: E402
from sensing_recon import orbit_cameras, make_object  # noqa: E402
from sensing_bafocal import project_k  # noqa: E402


def test_k2_zero_matches_bafocal_projection():
    cam = orbit_cameras(4, 360.0)[0]
    pts, _ = make_object(20, seed=0)
    assert np.allclose(project_k2(cam, pts, 800.0, -0.2, 0.0), project_k(cam, pts, 800.0, -0.2))


def test_k2_acts_at_edges_more_than_centre():
    cam = orbit_cameras(4, 360.0)[0]
    pts, _ = make_object(200, seed=0)
    d = np.linalg.norm(project_k2(cam, pts, 800.0, 0, 0.5) - project_k2(cam, pts, 800.0, 0, 0), axis=1)
    pc = pts @ cam.R.T + cam.t
    r2 = (pc[:, 0] ** 2 + pc[:, 1] ** 2) / pc[:, 2] ** 2
    assert np.corrcoef(r2, d)[0, 1] > 0.8


def test_matched_model_recovers_k1():
    # k2 is weakly identified (its estimate is checked in the experiment, not asserted here)
    r = run_trial(k1_true=-0.2, k2_true=0.1, seed=0, n_feat=200)
    assert abs(r["k1_est"] + 0.2) < 0.05


def test_k1k2_not_worse_than_ignoring_distortion():
    r = run_trial(k1_true=-0.2, k2_true=0.1, seed=1, n_feat=200)
    assert r["k1k2"] < r["fixed"]


def test_deterministic():
    a = run_trial(seed=2, n_feat=100, max_nfev=20)
    b = run_trial(seed=2, n_feat=100, max_nfev=20)
    assert a == b
