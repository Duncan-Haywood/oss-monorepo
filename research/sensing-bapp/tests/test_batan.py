import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from sensing_bapp import run_trial_tan, project_tan  # noqa: E402
from sensing_recon import orbit_cameras, make_object  # noqa: E402


def test_zero_tangential_matches_radial_only():
    cam = orbit_cameras(1, 360.0)[0]
    pts, _ = make_object(20, seed=0)
    a = project_tan(cam, pts, 800.0, -0.2, 0.1, 0.0, 0.0)
    pc = pts @ cam.R.T + cam.t
    x, y = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    r2 = x * x + y * y
    s = 1 + -0.2 * r2 + 0.1 * r2 * r2
    from sensing_recon.recon import CX, CY
    assert np.allclose(a, np.stack([800 * x * s + CX, 800 * y * s + CY], axis=1))


def test_tangential_displacement_is_brown():
    cam = orbit_cameras(1, 360.0)[0]
    pts, _ = make_object(20, seed=0)
    d = project_tan(cam, pts, 1.0, 0, 0, 0.01, 0.0) - project_tan(cam, pts, 1.0, 0, 0, 0.0, 0.0)
    pc = pts @ cam.R.T + cam.t
    x, y = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    r2 = x * x + y * y
    assert np.allclose(d, 0.01 * np.stack([2 * x * y, r2 + 2 * y * y], axis=1))


def test_no_tangential_both_fits_agree():
    r = run_trial_tan(dist=2.0, seed=0)
    assert abs(r["tan_free"] - r["tan_held"]) < 0.002
    assert abs(r["p1_est"]) < 0.005 and abs(r["p2_est"]) < 0.005


def test_tangential_recovered_and_helps():
    r = run_trial_tan(dist=2.0, p1_true=0.01, p2_true=-0.008, seed=0)
    assert abs(r["p1_est"] - 0.01) < 0.004 and abs(r["p2_est"] + 0.008) < 0.004
    assert r["tan_free"] <= r["tan_held"] * 1.05
