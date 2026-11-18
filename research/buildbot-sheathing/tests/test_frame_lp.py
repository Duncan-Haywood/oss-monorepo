"""Milestone 15: the framed-sheet limit analysis (frame_lp)."""
import numpy as np
import pytest

pytest.importorskip("scipy")

from buildbot_sheathing import frame_lp as L  # noqa: E402
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing.budget import EDGE, HEIGHT, IN, SPACING  # noqa: E402

XZ, FR = R.layout()


def test_nds_yield_values_match_the_tables():
    # NDS Table 12N lists Z = 141 lb for a 16d common in 1-1/2 in DF-L side member (G 0.50)
    r = L.nds_rho(0.50, 0.50)
    assert r["z16"] == pytest.approx(141, abs=1.0)
    assert r["mode16"] == "IV"
    assert 60 < r["z8"] < 90
    assert L.fe_dowel(0.50) == pytest.approx(4650, rel=0.01)


def test_rigid_joints_reproduce_milestone_14_without_eccentricity():
    w0 = R.capacity(np.ones((1, 62), bool), XZ, FR)[0][0] / HEIGHT
    f = L.Frame(XZ, FR, studs=np.array([EDGE, SPACING, 2 * SPACING, R.WIDTH - EDGE]), K=256)
    assert f.capacity() == pytest.approx(w0, rel=1e-3)


def test_rigid_joint_ratios_match_milestone_14():
    f = L.Frame(XZ, FR)
    keep = ~(XZ[:, 1] < 12 * IN - 1e-9)
    m = np.ones(62, bool)
    m[[3, 20, 21]] = False
    for mask in (keep, m):
        assert f.capacity(mask) / f.capacity() == pytest.approx(R.relative(mask[None], XZ, FR)[0], rel=5e-3)


def test_weaker_joints_never_add_capacity():
    f = L.Frame(XZ, FR)
    vals = [f.capacity(rho=r) for r in (0.25, 1.0, 4.0)] + [f.capacity()]
    assert all(a <= b + 1e-9 for a, b in zip(vals, vals[1:]))
    assert f.capacity(rho=1.0, holddown=False) <= f.capacity(rho=1.0) + 1e-9


def test_no_holddown_no_bottom_nails_no_withdrawal_carries_nothing():
    f = L.Frame(XZ, FR)
    keep = ~(XZ[:, 1] < 12 * IN - 1e-9)
    assert f.capacity(keep, rho=2.0, omega=0.0, holddown=False) == pytest.approx(0.0, abs=1e-7)
