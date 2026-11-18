"""Milestone 7q: the bend lookup, donor exclusion, the table weight and the committed verdicts."""
import re
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_table_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_bend_reads_the_two_quartile_flows():
    import gear_pump_table as tb
    import gear_pump_pickdrag as gd
    poc = np.zeros(400)
    poc[gd.grid_index(64.0)] = 2.0
    poc[gd.grid_index(79.0)] = 3.0
    assert tb.bend(poc) == pytest.approx(1.5)


def test_donors_skip_the_own_maker_group_and_sort_by_log_distance():
    import gear_pump_table as tb
    b = {"a": 1.20, "a2": 1.21, "b": 1.10, "c": 1.32, "d": 1.25}
    grp = {"a": "A", "a2": "A", "b": "B", "c": "C", "d": "D"}
    assert tb.donors(b, grp, "a") == ["d", "b", "c"]
    assert tb.donors(b, grp, "a", 1) == ["d"]
    assert "a2" not in tb.donors(b, grp, "a")


def test_mean_weight_is_an_equal_share_mixture():
    import gear_pump_table as tb
    m = tb.mean_weight([{60.0: 1.0}, {60.0: 0.5, 70.0: 0.5}])
    assert m == pytest.approx({60.0: 0.75, 70.0: 0.25})
    assert sum(m.values()) == pytest.approx(1.0)


def test_test_rows_read_the_table_training_rows_keep_kws():
    import gear_pump_table as tb
    r = {"kwo": 3.0, "kww": 2.5, "kws": 2.2, "kwm": 2.4, "kwt1": 2.6, "kwt3": 2.5, "kwtp": 2.3,
         "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert tb.row("owdt1", r) == pytest.approx([1.0, 0.1, -0.1])
    assert tb.row("owdt1", r, test=True) == pytest.approx([1.0, 0.3, -0.1])
    assert tb.row("owdt3", r, test=True) == pytest.approx([1.0, 0.25, -0.1])
    assert tb.row("owdtp", r, test=True) == pytest.approx([1.0, 0.15, -0.1])
    assert tb.row("owdm", r, test=True) == pytest.approx([1.0, 0.2, -0.1])


@pytest.mark.skipif(not RES.exists(), reason="results not generated")
def test_committed_verdicts_match_the_scores():
    text = RES.read_text()
    a = {m.group(1): float(m.group(2)) for m in re.finditer(r"^  (ow\w+)\s+(0\.\d{4})  \(max", text, re.M)}
    assert set(a) == {"owh", "owdw", "owds", "owdm", "owdt1", "owdt3", "owdtp"}
    verdict = dict(re.findall(r"^  (PQ\d) .*?: (held|refuted)", text, re.M))
    assert len(verdict) == 7
    assert verdict["PQ2"] == ("held" if a["owdt1"] < a["owh"] else "refuted")
    assert verdict["PQ3"] == ("held" if a["owdtp"] < a["owh"] else "refuted")
    assert verdict["PQ4"] == ("held" if a["owdt1"] <= a["owdtp"] else "refuted")
    assert verdict["PQ5"] == ("held" if min(a["owdt1"], a["owdt3"], a["owdtp"]) > a["owdm"] else "refuted")
