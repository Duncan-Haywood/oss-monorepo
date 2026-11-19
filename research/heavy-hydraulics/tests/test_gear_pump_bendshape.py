"""Milestone 7s: every synthetic bend shape hits the target bend, keeps its anchor, and the verdicts match."""
import re
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_bendshape_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


@pytest.mark.parametrize("shape", ["p", "h", "v", "x"])
def test_every_shape_has_the_target_bend(shape):
    import gear_pump_bendshape as bs
    import gear_pump_table as tb
    poc = 1.0 + 0.02 * bs.GRID
    for beta in (1.2, 1.5, 1.781, 1.9):
        assert tb.bend(bs.shaped(poc, beta, shape)) == pytest.approx(beta)
    assert np.allclose(bs.shaped(poc, tb.bend(poc), shape), poc)


def test_anchors_power_is_7r_hinge_keeps_low_end_pivot79_keeps_79():
    import gear_pump_bendshape as bs
    import gear_pump_bendtable as bt
    import gear_pump_pickdrag as gd
    poc = 0.5 + 0.001 * bs.GRID ** 1.5
    assert np.allclose(bs.shaped(poc, 1.8, "p"), bt.bent(poc, 1.8))
    lo = bs.GRID <= 64.0
    assert np.allclose(bs.shaped(poc, 1.8, "h")[lo], poc[lo])
    i79, i64 = gd.grid_index(79.0), gd.grid_index(64.0)
    assert bs.shaped(poc, 1.8, "v")[i79] == pytest.approx(poc[i79])
    assert bs.shaped(poc, 1.8, "x")[i64] == pytest.approx(poc[i64])


def test_test_rows_read_the_shape_feature_training_rows_keep_kws():
    import gear_pump_bendshape as bs
    r = {"kws": 2.2, "kwm": 2.4, "kwtp": 2.3, "kw_p": 2.6, "kw_h": 2.7, "kw_v": 2.5, "kw_x": 2.8,
         "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert bs.row("owdbh", r) == pytest.approx([1.0, 0.1, -0.1])
    assert bs.row("owdbh", r, test=True) == pytest.approx([1.0, 0.35, -0.1])
    assert bs.row("owdbv", r, test=True) == pytest.approx([1.0, 0.25, -0.1])
    assert bs.row("owdbx2", r, test=True) == pytest.approx([1.0, 0.4, -0.1])
    assert bs.row("owdb", r, test=True) == pytest.approx([1.0, 0.3, -0.1])


@pytest.mark.skipif(not RES.exists(), reason="results not generated")
def test_committed_verdicts_match_the_scores():
    text = RES.read_text()
    a = {m.group(1): float(m.group(2)) for m in re.finditer(r"^  (ow\w+)\s+(0\.\d{4})  \(max", text, re.M)}
    assert set(a) == {"owh", "owdm", "owdtp", "owdb", "owdbh", "owdbv", "owdbx2"}
    verdict = dict(re.findall(r"^  (PS\d) .*?: (held|refuted)", text, re.M))
    assert len(verdict) == 8
    assert verdict["PS2"] == ("held" if a["owdbh"] < a["owh"] else "refuted")
    assert verdict["PS3"] == ("held" if a["owdbv"] < a["owh"] else "refuted")
    assert verdict["PS4"] == ("held" if a["owdbx2"] < a["owh"] else "refuted")
    sh = [a[r] for r in ("owdb", "owdbh", "owdbv", "owdbx2")]
    assert verdict["PS5"] == ("held" if round(max(sh) - min(sh), 4) <= 0.0005 else "refuted")
