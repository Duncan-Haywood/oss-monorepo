import sys
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_bak2wide import wide_rig, rig_radius_stats, run_trial_wide  # noqa: E402
import sensing_recon.recon as recon  # noqa: E402
import sensing_bak2.bak2 as bak2  # noqa: E402


def test_rig_restores_constants():
    before = (recon.DIST, recon.F_PX, bak2.F_PX)
    with wide_rig(2.0) as f:
        assert f == 400.0 and recon.DIST == 2.0 and bak2.F_PX == 400.0
    assert (recon.DIST, recon.F_PX, bak2.F_PX) == before


def test_default_distance_is_the_bak2_rig():
    a = run_trial_wide(dist=4.0, k1_true=-0.2, k2_true=0.1, seed=0, n_feat=120)
    b = bak2.run_trial(k1_true=-0.2, k2_true=0.1, seed=0, n_feat=120)
    assert a["k1k2"] == b["k1k2"] and a["f_err"] == b["f_err"]


def test_closer_camera_reaches_larger_radius():
    r4 = rig_radius_stats(4.0, n_feat=100, seeds=1)[0]
    r2 = rig_radius_stats(2.5, n_feat=100, seeds=1)[0]
    assert r2 > 1.3 * r4


def test_wide_rig_identifies_k2_better():
    s = run_trial_wide(dist=2.5, k1_true=-0.2, k2_true=0.1, seed=0, n_feat=200)
    assert abs(s["k2_est"] - 0.1) < 0.1 and np.isfinite(s["k1k2"])
