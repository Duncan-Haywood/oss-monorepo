"""Milestone 7l: the one-point drag read, the weighted median, design rows and the committed verdicts."""
import re

import pytest
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_onepoint_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_weighted_median_takes_the_first_size_reaching_half():
    import gear_pump_onepoint as op
    assert op.weighted_median({60.0: 0.2, 72.0: 0.3, 90.0: 0.5}) == 72.0
    assert op.weighted_median({60.0: 0.6, 72.0: 0.4}) == 60.0


def test_design_rows():
    import gear_pump_onepoint as op
    r = {"kwo": 3.0, "kww": 2.5, "kwq": 2.4, "kw80": 2.8, "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert op.row("owhq", r) == pytest.approx([1.0, 1.2, -0.1, 1.0])
    assert op.row("owdq", r) == pytest.approx([1.0, 0.2, -0.1])
    assert op.row("owdq", r, "kw80") == pytest.approx([1.0, 0.4, -0.1])
    assert op.row("owdw", r) == pytest.approx([1.0, 0.25, -0.1])


def test_committed_results_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 8):
        assert re.search(rf"PX{k} .*: (held|refuted)", text)
    assert re.search(r"weighted median q\* = [0-9.]+ L/min", text)
