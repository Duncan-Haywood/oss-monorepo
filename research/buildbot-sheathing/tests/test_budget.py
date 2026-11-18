import math

import numpy as np
import pytest

from buildbot_sheathing import budget as B

MM = 1e-3


def test_schedule_is_62_nails_and_gap_free_window_is_fasten_s():
    assert B.N_NAILS == 62
    assert B.gap_free_half() / MM == pytest.approx(3.93, abs=0.005)
    # a centred 1/8 in gap takes 1/16 in off the window's width: half-width 3.93 - 0.79 mm
    assert B.joint_half(B.GAP) / MM == pytest.approx(3.93 - 25.4 / 32, abs=0.005)


def test_gap_free_sheet_matches_buildbot_studfind():
    S = pytest.importorskip("buildbot_studfind.model")
    g, z = S.stud_groups()
    assert g[0][0] == pytest.approx(B.gap_free_half())
    assert sorted(z) == pytest.approx(sorted(B.plate_halves()))
    for s_stud, s_robot in [(0.0, 1.24 * MM), (1.0 * MM, 0.9 * MM), (1.5 * MM, 0.9 * MM)]:
        mine = B.success(trials=40000, design_gap=0.0, s_stud=s_stud, s_robot=s_robot)
        theirs = S.sheet_success_analytic(s_stud, s_robot)
        assert mine == pytest.approx(theirs, abs=0.01)


def test_translation_and_rotation_match_closed_forms():
    for s in (1 * MM, 3 * MM):
        assert B.success(trials=40000, s_x=s) == pytest.approx(B.analytic_translation(s), abs=0.01)
    for s in (0.02, 0.1):
        s_rad = math.radians(s)
        assert B.success(trials=40000, s_theta=s_rad) == pytest.approx(B.analytic_rotation(s_rad), abs=0.01)


def test_edge_policy_with_perfect_sensing_only_needs_a_nonempty_window():
    # shift the sheet by 1.5 half-windows (4.7 mm): nominal aiming fails every time,
    # aiming from the measured edge passes while the shifted window is still non-empty
    hw = B.joint_half(B.GAP)
    shift = 1.5 * hw
    p_nom = B.success(trials=2000, offset=shift)
    p_edge = B.success(trials=2000, offset=shift, policy="edge")
    assert p_nom == 0.0
    # the left window shrinks by `shift` and the right grows, so the edge-aimed nails all land
    assert p_edge == 1.0
    # past the far stud face the window is empty and nothing helps
    p, _, feas = B.simulate_sheet(trials=500, offset=2 * hw + 0.1 * MM, policy="edge")
    assert p == 0.0 and feas == 0.0


def test_row_drift_accumulates_one_mismatch_per_sheet():
    rng = np.random.default_rng(0)
    off, _ = B.row_offsets(5, B.MODULE, B.GAP, rng)          # full 48 in panels with 1/8 in gaps
    assert off[0] == pytest.approx(np.arange(5) * B.GAP)
    off, _ = B.row_offsets(5, B.MODULE - B.GAP, B.GAP, rng)  # trimmed by exactly the gap: no drift
    assert off[0] == pytest.approx(np.zeros(5), abs=1e-12)


def test_largest_is_monotone_bisection():
    s = B.largest("s_stud", trials=4000, s_robot=0.9 * MM)
    assert 0.3 * MM < s < 1.0 * MM
    assert B.success(trials=4000, s_robot=0.9 * MM, s_stud=s) >= 0.95
    assert B.success(trials=4000, s_robot=0.9 * MM, s_stud=s * 1.1) < 0.95
