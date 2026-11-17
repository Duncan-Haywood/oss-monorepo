import math

import numpy as np
import pytest

from buildbot_sheathing import asbuilt as A
from buildbot_sheathing import budget as B

MM = 1e-3
BAND = A.Band()


def test_untwisted_band_is_the_stud_face_less_the_shank():
    lo, hi = BAND(0.0)
    assert hi == pytest.approx(B.FACE / 2 - B.R, abs=0.02 * MM)
    assert lo == pytest.approx(-(B.FACE / 2 - B.R), abs=0.02 * MM)


def test_band_is_mirror_symmetric_and_shrinks_with_twist():
    widths = []
    for deg in (0.5, 1, 2, 4, 8):
        p = math.radians(deg)
        lo, hi = BAND(p)
        lo_m, hi_m = BAND(-p)
        assert lo == pytest.approx(-hi_m, abs=0.03 * MM)
        widths.append(hi - lo)
    assert all(a >= b - 1e-6 for a, b in zip(widths, widths[1:]))
    assert widths[-1] < (B.FACE - 2 * B.R)


def test_small_twist_moves_one_band_edge_by_about_the_penetration_times_the_angle():
    # tilt the long sides by phi: the side the nail runs toward cuts it off after p_req of wood,
    # so that band edge moves in by roughly (nail length in the stud) * tan(phi), at most
    p = math.radians(1.0)
    lo, hi = BAND(p)
    h0 = B.FACE / 2 - B.R
    shrink = max(h0 - hi, lo + h0)
    assert 0 < shrink <= (A.NAIL_LEN - A.SHEATHING) * math.tan(p) + B.FACE / 2 * (1 - math.cos(p)) + 0.05 * MM


def test_straight_studs_and_perfect_sensing_reduce_to_robot_scatter_only():
    # no warp, no read or edge error: each joint nail sits mid-window (half-window h), so
    # P = product of erf over the 62 nails' half-windows
    s = 1.2 * MM
    h = B.joint_half(B.GAP)
    hf = B.FACE / 2 - B.R
    halves = [h] * 34 + [hf] * 14 + B.plate_halves()
    expect = np.prod([math.erf(x / (s * math.sqrt(2))) for x in halves])
    got = A.success(trials=40000, policy="single", s_read=0, s_edge=0, s_robot=s, band=BAND)
    assert got == pytest.approx(expect, abs=0.01)


def test_three_reads_recover_a_parabolic_bow_exactly():
    # a fixed 6 mm (wall) bow with no noise: the parabola fit sees it, so every nail lands;
    # a single mid read puts the edge reference at the bow's crest: the ends then sit 6 mm off,
    # beyond the 3.14 mm half-window, on the side the bow points away from. Each joint stud
    # fails for one of its two bow signs, so exactly a quarter of sheets pass
    b8 = 6 * MM / (A.STUD_LEN / A.GRADE_LEN) ** 2
    kw = dict(trials=2000, bow=b8, s_read=0, s_edge=0, s_robot=0, band=BAND)
    assert A.success(policy="three", **kw) == 1.0
    assert A.success(policy="dense", **kw) == 1.0
    assert A.success(policy="single", **kw) == pytest.approx(0.25, abs=0.04)


def test_bow_feasibility_matches_the_arithmetic():
    lim = A.max_feasible_bow()
    assert lim == pytest.approx(4 * B.joint_half(B.GAP))
    assert A.max_feasible_bow(reference="plates") == pytest.approx(lim / 2)
    kw = dict(trials=400, s_read=0, s_edge=0, s_robot=0, policy="dense", band=BAND)
    scale = (A.STUD_LEN / A.GRADE_LEN) ** 2
    assert A.simulate(bow=0.97 * lim / scale, **kw)[2] == 1.0
    assert A.simulate(bow=1.03 * lim / scale, **kw)[2] == 0.0


def test_truncated_draws_respect_the_limit_and_mean():
    rng = np.random.default_rng(0)
    v = A.draw_magnitude(rng, (200000,), 0.11 * B.IN, A.BOW_LIMIT)
    assert np.abs(v).max() <= A.BOW_LIMIT
    assert np.abs(v).mean() == pytest.approx(0.11 * B.IN, rel=0.02)    # truncation is far out
    assert abs(v.mean()) < 0.01 * B.IN
    assert np.all(A.draw_magnitude(rng, (5,), 0.0, A.BOW_LIMIT) == 0)


def test_wider_joint_framing_widens_the_window_and_the_bow_budget():
    # a 3x (2.5 in face) joint stud: the window is 1/2 in wider on each side of the joint
    wide = A.Band(face=2.5 * B.IN, step_deg=0.5)
    lo, hi = wide(0.0)
    assert hi == pytest.approx(1.25 * B.IN - B.R, abs=0.02 * MM)
    assert A.max_feasible_bow(face=2.5 * B.IN) - A.max_feasible_bow() == pytest.approx(2 * 0.5 * B.IN)
    kw = dict(trials=4000, bow_mean=0.11 * B.IN, twist_mean=0.08 * B.IN, policy="single", band=BAND)
    assert A.success(joint_band=wide, **kw) > A.success(**kw) + 0.2
