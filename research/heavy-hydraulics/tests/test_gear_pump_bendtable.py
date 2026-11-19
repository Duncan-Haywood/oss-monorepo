"""Milestone 7r: the synthetic bend, the grid lookup, test-row features and the committed verdicts."""
import re
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_bendtable_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_bent_curve_has_the_target_bend_and_keeps_the_level_at_64():
    import gear_pump_bendtable as bt
    import gear_pump_table as tb
    import gear_pump_pickdrag as gd
    poc = 1.0 + 0.02 * bt.GRID
    for beta in (1.2, 1.5, 1.781, 1.9):
        out = bt.bent(poc, beta)
        assert tb.bend(out) == pytest.approx(beta)
        assert out[gd.grid_index(64.0)] == pytest.approx(poc[gd.grid_index(64.0)])


def test_bent_curve_at_its_own_bend_is_unchanged():
    import gear_pump_bendtable as bt
    import gear_pump_table as tb
    poc = 0.5 + 0.001 * bt.GRID ** 1.5
    assert np.allclose(bt.bent(poc, tb.bend(poc)), poc)


def test_grid_beta_is_nearest_on_the_0_1_grid():
    import gear_pump_bendtable as bt
    assert bt.BETAS == (1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9)
    assert bt.nearest_beta(1.781) == 1.8
    assert bt.nearest_beta(1.281) == 1.3
    assert bt.nearest_beta(1.0) == 1.2
    assert bt.nearest_beta(2.4) == 1.9


def test_test_rows_read_the_bend_table_training_rows_keep_kws():
    import gear_pump_bendtable as bt
    r = {"kwo": 3.0, "kww": 2.5, "kws": 2.2, "kwm": 2.4, "kwtp": 2.3, "kwb": 2.6, "kwbx": 2.5,
         "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert bt.row("owdb", r) == pytest.approx([1.0, 0.1, -0.1])
    assert bt.row("owdb", r, test=True) == pytest.approx([1.0, 0.3, -0.1])
    assert bt.row("owdbx", r, test=True) == pytest.approx([1.0, 0.25, -0.1])
    assert bt.row("owdtp", r, test=True) == pytest.approx([1.0, 0.15, -0.1])
    assert bt.row("owdm", r, test=True) == pytest.approx([1.0, 0.2, -0.1])


@pytest.mark.skipif(not RES.exists(), reason="results not generated")
def test_committed_verdicts_match_the_scores():
    text = RES.read_text()
    a = {m.group(1): float(m.group(2)) for m in re.finditer(r"^  (ow\w+)\s+(0\.\d{4})  \(max", text, re.M)}
    assert set(a) == {"owh", "owdm", "owdtp", "owdb", "owdbx"}
    verdict = dict(re.findall(r"^  (PR\d) .*?: (held|refuted)", text, re.M))
    assert len(verdict) == 8
    assert verdict["PR3"] == ("held" if a["owdb"] < a["owh"] else "refuted")
    assert verdict["PR4"] == ("held" if a["owdb"] < a["owdtp"] else "refuted")
    assert verdict["PR6"] == ("held" if a["owdb"] > a["owdm"] else "refuted")
    assert verdict["PR8"] == ("held" if round(abs(a["owdb"] - a["owdbx"]), 4) <= 0.0003 else "refuted")
