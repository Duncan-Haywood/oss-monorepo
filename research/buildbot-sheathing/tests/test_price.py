"""Milestone 13: seconds and dollars of the single-2x remedies."""
import numpy as np
import pytest

from buildbot_sheathing import cost as K
from buildbot_sheathing import price as P
from buildbot_sheathing.asbuilt import STUD_LEN


def _t(n=1, **over):
    t = {k: v[:n] for k, v in P.draw_times(n, 0).items()}
    t.update({k: np.full(n, v) for k, v in over.items()})
    return t


def test_read_counts_per_sheet():
    # one new joint stud (17 nail heights) and two new field studs (7) a sheet
    assert P.stud_reads("three") == 9
    assert P.stud_reads("dense") == 51
    assert P.stud_reads("local") == 31


def test_sweep_time_is_length_over_speed():
    assert P.sweep_seconds(0.25) == pytest.approx(3 * STUD_LEN / 0.25)


def test_reads_spec_adds_each_remedy_once():
    t = _t(t_push=20.0, t_ss=10.0, v=0.1)
    base = P.reads_spec("local", "point", False, False, t)
    assert base["n"] == 31 + 2 and np.all(base["extra"] == 0)
    full = P.reads_spec("local", "line", True, True, t)
    assert full["n"] == 2 + 2
    assert full["extra"][0] == pytest.approx(3 * STUD_LEN / 0.1 + 20.0 + 10.0)
    with pytest.raises(ValueError):
        P.reads_spec("three", "line", False, False, t)


def test_pipeline_cost_matches_milestone_7_without_remedies():
    p = K.draw(50, 1)
    t = _t(50)
    a = P.pipeline_cost(p, t, 100, 0.8, "three", "point", False, False)["total"]
    b = K.robot_cost("base", p, 100, 0.8, {"n": 11, "ledger": True}, False)["total"]
    assert np.allclose(a, b)


def test_breakeven_per_nail():
    assert P.breakeven_per_nail(12.0, 7.0, 1.0) == pytest.approx(5.0)
    assert P.breakeven_per_nail(12.0, 7.0, 0.5) == pytest.approx(10.0)
