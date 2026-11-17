import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import cycle as C  # noqa: E402

MM = 1e-3


def test_reads_per_sheet():
    assert C.reads_per_sheet("single") == 3 * 1 + 2
    assert C.reads_per_sheet("three") == 3 * 3 + 2
    assert C.reads_per_sheet("dense") == 3 * 17 + 2


def test_tool_scatter():
    assert C.tool_scatter("none") == pytest.approx(0.9 * MM)
    assert C.tool_scatter("wait") == pytest.approx(0.9 * MM)
    assert C.tool_scatter("nowait") == pytest.approx(math.hypot(0.9, 0.37) * MM)
    with pytest.raises(ValueError):
        C.tool_scatter("other")


def test_seconds_add_up():
    s = C.seconds(0.5, policy="three", framing="2x2x", recoil="wait", t_nail=54, t_place=30,
                  t_ledger=10, t_read=2, t_fix=30, t_frame=60)
    assert s["place"] == 40
    assert s["sense"] == 22
    assert s["nail"] == pytest.approx(54 + C.WAIT_FAST)
    assert s["rework"] == 15
    assert s["frame"] == 60
    assert s["total"] == pytest.approx(40 + 22 + 56.4 + 15 + 60)
    # single 2x carries no framing charge; lift-tack no ledger; slow arm no wait
    s2 = C.seconds(0.0, policy="single", framing="2x", placement="lift-tack", recoil="wait",
                   fast_arm=False, t_frame=60)
    assert s2["frame"] == 0 and s2["place"] == 30 and s2["nail"] == 54


def test_perfect_inputs_are_clean():
    r = C.clean_cell(framing="2x", policy="single", placement="lift-tack", warp="straight", s_x=0.0,
                     s_theta=0.0, s_read=0.0, s_edge=0.0, trials=2000)
    # only the 0.9 mm tool scatter is left; milestone 1 gave 0.98-1.00 with stud and pose perfect
    assert r["clean"] > 0.97
    assert r["feasible"] == 1.0


def test_matches_milestone3_doubled_joint_cell():
    # milestone 3 F: two 2x, lower warp, three reads, ledger at 0.5 mm a corner, PS 2 limits,
    # s_x 3 mm -> 1.0000 clean
    r = C.clean_cell(framing="2x2x", policy="three", placement="ledger", warp="low", s_x=3 * MM,
                     trials=4000, seed=5)
    assert r["clean"] > 0.995


def test_wilson():
    lo, hi = C.wilson(0.5, 100)
    assert lo < 0.5 < hi
    assert hi - lo == pytest.approx(0.19, abs=0.01)
