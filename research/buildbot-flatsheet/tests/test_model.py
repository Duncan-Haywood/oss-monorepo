import pytest

from buildbot_flatsheet import model as M

XS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
DYS = [0.0, 0.1, 0.2, 0.3, 0.4]


def box(x_lo, x_hi, dy_max, z=1.0, need=0.0):
    """Synthetic reach data: a rectangle of held (x, dy) cells at one hand height."""
    cells = [{"x": x, "z": z, "need": need, "dy": dy, "ok": x_lo <= x <= x_hi and dy <= dy_max, "slip_mu_min": 0.1}
             for x in XS for dy in DYS]
    return {"cells": cells, "mirror": [], "zs": [z]}


def test_reachable_filters_by_height_need_and_friction():
    d = box(0.3, 0.5, 0.3, need=50.0)
    assert (0.3, 0.3) in M.reachable(d, 1.0, 50.0, 0.6)
    assert (0.3, 0.4) not in M.reachable(d, 1.0, 50.0, 0.6)
    assert M.reachable(d, 1.0, 50.0, 0.05) == set()     # needs mu >= 0.1 to hold the push
    assert M.reachable(d, 0.9, 50.0, 0.6) == set()


def test_covers_needs_all_four_corners_and_mirrors():
    ok = M.reachable(box(0.3, 0.5, 0.3), 1.0, 0.0, 0.6)
    assert M.covers(ok, XS, DYS, 0.35, 0.15)
    assert M.covers(ok, XS, DYS, 0.35, -0.15)            # mirrored
    assert not M.covers(ok, XS, DYS, 0.25, 0.15)         # x 0.2 corner is outside
    assert not M.covers(ok, XS, DYS, 0.35, 0.35)         # dy 0.4 corner is outside
    assert M.covers(ok, XS, DYS, 0.31, 0.29, "nearest")


def test_nails_lie_on_the_table_top():
    pts = M.nails()
    assert len(pts) == 62
    assert all(0 <= u <= M.L and 0 <= v <= M.W for u, v in pts)


def test_to_reach_geometry():
    assert M.to_reach("A", 1.0, 0.25, 1.5, 0.2) == pytest.approx((0.45, 0.5))
    assert M.to_reach("B", 1.0, 0.25, 1.5, 0.2) == pytest.approx((0.25 + M.W - 0.2, 0.5))
    assert M.to_reach("C", 0.3, 0.25, 1.5, 0.2) == pytest.approx((1.75, -0.1))
    assert M.to_reach("D", 0.3, 0.25, 1.5, 0.2) == pytest.approx((0.25 + M.L - 1.5, -0.1))


def test_plan_covers_everything_with_a_wide_reach():
    d = box(0.2, 0.8, 0.4)
    ok = M.reachable(d, 1.0, 0.0, 0.6)
    st, cov, left = M.plan(ok, XS, DYS, M.nails(), 0.25)
    assert cov == 62 and not left
    assert sum(len(s[2]) for s in st) == 62
    assert len(st) < 62


def test_plan_covers_nothing_when_nothing_is_held():
    ok = M.reachable(box(9, 9, 0), 1.0, 0.0, 0.6)
    st, cov, left = M.plan(ok, XS, DYS, M.nails(), 0.25)
    assert st == [] and cov == 0 and len(left) == 62


def test_sheet_time_adds_restance_between_stances_only():
    pts = M.nails()
    st = [("A", 0.0, {0, 1}), ("A", 1.0, {2, 3})]
    t0 = M.sheet_time(pts, st, 1.0, 3.0, 0.1, 0.0)
    assert M.sheet_time(pts, st, 1.0, 3.0, 0.1, 7.0) == pytest.approx(t0 + 7.0)
    assert M.sheet_time(pts, st[:1], 1.0, 3.0, 0.1, 7.0) == pytest.approx(M.sheet_time(pts, st[:1], 1.0, 3.0, 0.1, 0.0))


def test_mirror_agreement_counts_matching_cells():
    d = box(0.3, 0.5, 0.3)
    d["mirror"] = [{"x": 0.4, "z": 1.0, "dy": -0.2, "ok": True, "slip_mu_min": 0.1},
                   {"x": 0.4, "z": 1.0, "dy": -0.4, "ok": True, "slip_mu_min": 0.1}]
    assert M.mirror_agreement(d, 0.0, 0.6) == (1, 2)
