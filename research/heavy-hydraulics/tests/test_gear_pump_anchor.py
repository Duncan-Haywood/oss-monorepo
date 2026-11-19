"""Milestone 7t: the anchor family spans 7r's and 7s's shapes, the slope estimators recover a planted anchor,
and the committed verdicts match the scores."""
import math
import re
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_anchor_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_anchor_family_hits_the_bend_and_spans_shapes_p_and_v():
    import gear_pump_anchor as ga
    import gear_pump_bendshape as bs
    import gear_pump_table as tb
    poc = 0.5 + 0.001 * ga.GRID ** 1.5
    for lam in (-0.5, 0.0, 0.37, 1.0):
        assert tb.bend(ga.anchored(poc, 1.781, lam)) == pytest.approx(1.781)
    assert np.allclose(ga.anchored(poc, 1.8, 0.0), bs.shaped(poc, 1.8, "p"))
    assert np.allclose(ga.anchored(poc, 1.8, 1.0), bs.shaped(poc, 1.8, "v"))
    assert ga.pivot(0.0) == pytest.approx(64.0) and ga.pivot(1.0) == pytest.approx(79.0)


@pytest.mark.parametrize("lam", [-0.3, 0.0, 0.4, 1.0])
def test_estimators_recover_a_planted_anchor(lam):
    import gear_pump_anchor as ga
    q_star = ga.pivot(lam)
    bends = {"a1": 1.25, "a2": 1.40, "b1": 1.30, "b2": 1.60, "c": 1.50}
    grp = {"a1": "a", "a2": "a", "b1": "b", "b2": "b", "c": "c"}
    lvl = {j: 2.0 * (64.0 / q_star) ** (math.log(bj) / math.log(79.0 / 64.0)) for j, bj in bends.items()}
    js = list(bends)
    assert ga.lam_pool(lvl, bends, js) == pytest.approx(lam)
    # a family-specific level offset breaks the pooled read but not the within-family one
    lvl2 = {j: v * (3.0 if grp[j] == "b" else 1.0) for j, v in lvl.items()}
    assert ga.lam_fe(lvl2, bends, grp, js) == pytest.approx(lam)


def test_test_rows_read_the_table_feature_training_rows_keep_kws():
    import gear_pump_anchor as ga
    r = {"kws": 2.2, "kwm": 2.4, "owdbq": 2.6, "owdbf": 2.7, "sw+0.50": 2.8, "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert ga.row("owdbq", r) == pytest.approx([1.0, 0.1, -0.1])
    assert ga.row("owdbq", r, test=True) == pytest.approx([1.0, 0.3, -0.1])
    assert ga.row("owdbf", r, test=True) == pytest.approx([1.0, 0.35, -0.1])
    assert ga.row("sw+0.50", r, test=True) == pytest.approx([1.0, 0.4, -0.1])


@pytest.mark.skipif(not RES.exists(), reason="results not generated")
def test_committed_verdicts_match_the_scores():
    text = RES.read_text()
    a = {m.group(1): float(m.group(2)) for m in re.finditer(r"^  (ow\w+)\s+(0\.\d{4})  \(max", text, re.M)}
    assert set(a) == {"owh", "owdm", "owdb", "owdbv", "owdbq", "owdbf"}
    verdict = dict(re.findall(r"^  (PT\d) .*?: (held|refuted)", text, re.M))
    assert len(verdict) == 8
    assert verdict["PT4"] == ("held" if a["owdbq"] < a["owh"] else "refuted")
    assert verdict["PT5"] == ("held" if a["owdbf"] < a["owh"] else "refuted")
    assert verdict["PT6"] == ("held" if round(abs(a["owdbq"] - a["owdbf"]), 4) <= 0.0003 else "refuted")
