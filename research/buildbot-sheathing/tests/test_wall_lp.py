"""Milestone 17: the wall limit analysis (wall_lp) on Weiss's two-sheet wall."""
import numpy as np
import pytest

pytest.importorskip("scipy")

from buildbot_sheathing import frame_lp as L  # noqa: E402
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import wall_lp as W  # noqa: E402
from buildbot_sheathing.budget import IN  # noqa: E402

XZ, FR = R.layout()


def test_one_sheet_matches_milestone_15_frame():
    f = L.Frame(XZ, FR)
    w = W.Wall([(XZ, FR)], studs=L.STUDS, nails=np.ones(4), width=R.WIDTH)
    keep = W.decay_mask(XZ)
    for rho in (None, 1.5):
        for m in (None, keep):
            assert w.capacity(m, lat=rho, top="free") == pytest.approx(f.capacity(m, rho=rho), rel=1e-7)
            assert w.capacity(m, lat=rho, top="slide") == pytest.approx(
                f.capacity(m, rho=rho, top_slide_only=True), rel=1e-7)


def test_two_pinned_sheets_are_twice_one():
    # with pinned joints and a sliding top plate every stud racks as a parallelogram, so sheets add
    one = R.capacity(np.ones((1, 62), bool), XZ, FR)[0][0]
    w = W.weiss_wall(6.0)
    ref = W.Wall([(XZ, FR)], studs=np.array([1.5, 16, 32, 48]) * IN, nails=np.ones(4), width=R.WIDTH)
    assert w.capacity(lat=None, top="slide") == pytest.approx(2 * ref.capacity(lat=None, top="slide"), rel=1e-6)
    assert ref.capacity(lat=None, top="slide") > 0.95 * one / R.HEIGHT


def test_decayed_wall_never_exceeds_frame_sliding_capacity():
    w = W.weiss_wall(3.0)
    keep = W.decay_mask(w.xz)
    for lat in (0.3, 0.6, 1.2):
        assert w.capacity(keep, lat=lat) <= w.nails.sum() * lat + 1e-7


def test_weaker_joints_and_fewer_nails_never_add_capacity():
    w = W.weiss_wall(6.0)
    keep = W.decay_mask(w.xz)
    vals = [w.capacity(keep, lat=x) for x in (0.2, 0.6, 1.3)] + [w.capacity(keep, lat=None)]
    assert all(a <= b + 1e-9 for a, b in zip(vals, vals[1:]))
    assert w.capacity(keep, lat=1.3) <= w.capacity(lat=1.3) + 1e-9
    assert w.capacity(lat=1.3, use_holddowns=False) <= w.capacity(lat=1.3) + 1e-9
    assert w.capacity(lat=1.3, holddown=5.0) <= w.capacity(lat=1.3) + 1e-9


def test_decay_mask_counts():
    w = W.weiss_wall(6.0)
    z = w.xz[:, 1]
    assert (~W.decay_mask(w.xz)).sum() == (z < 12 * IN - 1e-9).sum()
    assert (~W.decay_mask(w.xz, inclusive=True)).sum() > (~W.decay_mask(w.xz)).sum()
    assert w.n == 124
