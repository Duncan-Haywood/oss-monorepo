"""Milestone 7n: the own-pick weight, design rows and the committed verdicts."""
import re

import numpy as np
import pytest
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_ownpick_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_weight_is_the_share_of_picks_per_flow():
    import gear_pump_ownpick as ow
    w = ow.weight(np.array([60.0, 72.0, 72.0, 90.0]))
    assert w == pytest.approx({60.0: 0.25, 72.0: 0.5, 90.0: 0.25})
    assert sum(w.values()) == pytest.approx(1.0)


def test_own_pick_read_of_a_linear_curve_is_the_curve_at_the_mean_pick():
    import gear_pump_ownpick as ow
    import gear_pump_pickdrag as gd
    from excavator_breakeven_geometry import GRID
    g = np.asarray(GRID, float)
    poc = 0.5 + 0.02 * g
    pk = np.array([g[10], g[20], g[20], g[40]])
    assert gd.pick_weighted_idle(poc, ow.weight(pk)) == pytest.approx(0.5 + 0.02 * pk.mean())


def test_design_rows():
    import gear_pump_ownpick as ow
    r = {"kwo": 3.0, "kww": 2.5, "kw2": 2.6, "kws": 2.2, "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert ow.row("owhs", r) == pytest.approx([1.0, 1.1, -0.1, 1.0])
    assert ow.row("owds", r) == pytest.approx([1.0, 0.1, -0.1])
    assert ow.row("owdw", r) == pytest.approx([1.0, 0.25, -0.1])
    assert ow.row("owd2", r) == pytest.approx([1.0, 0.3, -0.1])


def test_committed_results_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 8):
        assert re.search(rf"PV{k} .*: (held|refuted)", text)
    assert text.count("own picks") >= 1
