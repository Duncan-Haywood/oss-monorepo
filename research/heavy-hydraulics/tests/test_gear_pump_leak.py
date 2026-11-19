"""Milestone 7p: leak-free pick efficiencies, the swapped test-row design and the committed verdicts."""
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_leak_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_nearest_snaps_to_the_grid_and_clamps():
    import gear_pump_leak as lk
    import gear_pump_chosen as gc
    assert lk.nearest(0.8009) == pytest.approx(0.8)
    assert lk.nearest(0.5) == pytest.approx(float(gc.E_GRID[0]))
    assert lk.nearest(1.2) == pytest.approx(float(gc.E_GRID[-1]))


def test_others_mean_never_sees_the_own_group():
    import gear_pump_leak as lk
    e50 = {"a": 0.80, "a2": 0.90, "b": 0.84, "c": 0.86}
    grp = {"a": "A", "a2": "A", "b": "B", "c": "C"}
    assert lk.others_mean(e50, grp, "a") == pytest.approx(0.85)
    e50["a"] = 0.10  # the own cell's E50 cannot move its own pick efficiency
    assert lk.others_mean(e50, grp, "a") == pytest.approx(0.85)
    assert lk.others_mean(e50, grp, "b") == pytest.approx((0.10 + 0.90 + 0.86) / 3)


def test_test_rows_read_the_swapped_feature_training_rows_keep_kws():
    import gear_pump_leak as lk
    r = {"kwo": 3.0, "kww": 2.5, "kws": 2.2, "kwm": 2.4, "kwc": 2.6, "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert lk.row("owdm", r) == pytest.approx([1.0, 0.1, -0.1])
    assert lk.row("owdm", r, test=True) == pytest.approx([1.0, 0.2, -0.1])
    assert lk.row("owdc", r, test=True) == pytest.approx([1.0, 0.3, -0.1])
    assert lk.row("owdcc", r) == pytest.approx([1.0, 0.3, -0.1])
    assert lk.row("owds", r, test=True) == pytest.approx([1.0, 0.1, -0.1])


@pytest.mark.skipif(not RES.exists(), reason="results not generated")
def test_committed_verdicts_match_the_scores():
    text = RES.read_text()
    a = {m.group(1): float(m.group(2)) for m in re.finditer(r"^  (ow\w+)\s+(0\.\d{4})  \(max", text, re.M)}
    assert set(a) == {"owh", "owdw", "owds", "owdm", "owdc", "owdcc"}
    verdict = dict(re.findall(r"^  (PX\d) .*?: (held|refuted)", text, re.M))
    assert len(verdict) == 6
    assert verdict["PX2"] == ("held" if a["owdm"] <= 0.0049 else "refuted")
    assert verdict["PX3"] == ("held" if a["owdc"] <= 0.0049 else "refuted")
    assert verdict["PX4"] == ("held" if a["owdm"] < a["owh"] and a["owdc"] < a["owh"] else "refuted")
    assert verdict["PX5"] == ("held" if a["owdcc"] < a["owh"] else "refuted")
