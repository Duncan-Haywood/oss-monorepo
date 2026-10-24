import pytest

from buildbot_stance import model as M

DYS = [0.0, 0.1, 0.2, 0.3, 0.4]
ZS = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4]


def box(dy_max, z_lo, z_hi, need=0.0, x=0.4):
    """Synthetic reach data: a rectangle of reachable (dy, z) cells."""
    cells = [{"x": x, "need": need, "dy": dy, "z": z, "ok": dy <= dy_max and z_lo <= z <= z_hi, "slip_mu_min": 0.1}
             for dy in DYS for z in ZS]
    return {"cells": cells, "mirror": []}


def test_reachable_filters_by_need_and_friction():
    d = box(0.3, 0.4, 1.0, need=50.0)
    assert (0.3, 0.4) in M.reachable(d, 0.4, 50.0, 0.6)
    assert (0.4, 0.4) not in M.reachable(d, 0.4, 50.0, 0.6)
    assert M.reachable(d, 0.4, 50.0, 0.05) == set()      # needs mu >= 0.1 to hold the push
    assert M.reachable(d, 0.5, 50.0, 0.6) == set()


def test_covers_needs_all_four_corners():
    ok = M.reachable(box(0.3, 0.4, 1.0), 0.4, 0.0, 0.6)
    assert M.covers(ok, DYS, ZS, 0.15, 0.5)
    assert M.covers(ok, DYS, ZS, -0.15, 0.5)             # mirrored
    assert not M.covers(ok, DYS, ZS, 0.35, 0.5)          # dy 0.4 corner is outside
    assert not M.covers(ok, DYS, ZS, 0.1, 1.1)           # z 1.2 corner is outside
    assert not M.covers(ok, DYS, ZS, 0.1, 0.1)           # below the grid


def test_a_floor_stance_cannot_reach_a_nail_above_the_band():
    ok = M.reachable(box(0.4, 0.0, 1.4), 0.4, 0.0, 0.6)
    pts = M.nails()
    assert max(z for _, z in pts) > 2.4 - 0.1
    stances, covered, left = M.plan(ok, DYS, ZS, pts)
    assert covered < 62 and left
    assert all(pts[i][1] > 1.4 for i in left)


def test_platform_heights_cover_the_whole_sheet():
    ok = M.reachable(box(0.4, 0.0, 1.4), 0.4, 0.0, 0.6)
    pts = M.nails()
    stances, covered, left = M.plan(ok, DYS, ZS, pts, heights=(0.0, 0.6, 1.2))
    assert covered == 62 and not left
    n = M.exact_min(ok, DYS, ZS, pts, heights=(0.0, 0.6, 1.2))
    assert n is not None and n <= len(stances)


def test_greedy_covers_each_nail_once():
    ok = M.reachable(box(0.4, 0.0, 1.4), 0.4, 0.0, 0.6)
    pts = M.nails()
    stances, *_ = M.plan(ok, DYS, ZS, pts, heights=(0.0, 0.6, 1.2))
    seen = [i for _, _, s in stances for i in s]
    assert len(seen) == len(set(seen)) == 62


def test_a_wider_reach_needs_fewer_stances():
    pts = M.nails()
    narrow = M.exact_min(M.reachable(box(0.2, 0.0, 1.4), 0.4, 0.0, 0.6), DYS, ZS, pts[:34] and [p for p in pts if p[1] <= 1.0])
    wide = M.exact_min(M.reachable(box(0.4, 0.0, 1.4), 0.4, 0.0, 0.6), DYS, ZS, [p for p in pts if p[1] <= 1.0])
    assert wide <= narrow


def test_exact_min_none_when_unreachable():
    ok = M.reachable(box(0.4, 0.0, 1.4), 0.4, 0.0, 0.6)
    assert M.exact_min(ok, DYS, ZS, M.nails()) is None


def test_sheet_time_adds_one_stance_change_per_extra_stance():
    ok = M.reachable(box(0.4, 0.0, 1.4), 0.4, 0.0, 0.6)
    pts = M.nails()
    st, *_ = M.plan(ok, DYS, ZS, pts, heights=(0.0, 0.6, 1.2))
    t0 = M.sheet_time(pts, st, 2.0, 5.0, 0.1, 0.0)
    t10 = M.sheet_time(pts, st, 2.0, 5.0, 0.1, 10.0)
    assert t10 - t0 == pytest.approx(10.0 * (len(st) - 1))
    assert M.sheet_time(pts, st, 2.0, 5.0, 0.1, 0.0, t_scan=3.0) == pytest.approx(t0 + 3.0)


def test_mirror_agreement_counts():
    d = box(0.3, 0.4, 1.0, need=50.0)
    d["mirror"] = [{"x": 0.4, "need": 50.0, "dy": -0.2, "z": 0.6, "ok": True, "slip_mu_min": 0.1},
                   {"x": 0.4, "need": 50.0, "dy": -0.4, "z": 0.6, "ok": True, "slip_mu_min": 0.1}]
    assert M.mirror_agreement(d) == (1, 2)


def test_nearest_rule_is_more_generous_than_all():
    ok = M.reachable(box(0.3, 0.2, 1.0), 0.4, 0.0, 0.6)
    assert not M.covers(ok, DYS, ZS, 0.35, 0.5, "all")
    assert M.covers(ok, DYS, ZS, 0.28, 0.5, "nearest")      # nearest point is (0.3, 0.4)
    pts = M.nails()
    a = M.plan(ok, DYS, ZS, pts)[1]
    b = M.plan(ok, DYS, ZS, pts, rule="nearest")[1]
    assert b >= a
