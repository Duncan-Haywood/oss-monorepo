import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from sensing_bapp import run_trial_pp, project_pp  # noqa: E402
from sensing_recon import orbit_cameras, make_object  # noqa: E402


def test_projection_shift():
    cam = orbit_cameras(1, 360.0)[0]
    pts, _ = make_object(20, seed=0)
    a = project_pp(cam, pts, 800.0, -0.2, 0.1, 0.0, 0.0)
    b = project_pp(cam, pts, 800.0, -0.2, 0.1, 5.0, -3.0)
    assert np.allclose(b - a, [5.0, -3.0])


def test_no_offset_both_fits_agree():
    r = run_trial_pp(dist=2.0, seed=0)
    assert abs(r["pp_free"] - r["pp_held"]) < 0.002
    assert abs(r["dx_est"]) < 3 and abs(r["dy_est"]) < 3


def test_offset_recovered_and_helps():
    r = run_trial_pp(dist=2.0, dx=10.0, dy=-8.0, seed=0)
    assert abs(r["dx_est"] - 10) < 3 and abs(r["dy_est"] + 8) < 3
    assert r["pp_free"] <= r["pp_held"] * 1.05
