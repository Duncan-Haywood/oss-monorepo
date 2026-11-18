"""Milestone 7m: the two-point drag reads, the quantiles, design rows and the committed verdicts."""
import re

import numpy as np
import pytest
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_twopoint_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_weighted_quantile_takes_the_first_size_reaching_p():
    import gear_pump_twopoint as tp
    w = {60.0: 0.2, 72.0: 0.3, 90.0: 0.5}
    assert tp.weighted_quantile(w, 0.25) == 72.0
    assert tp.weighted_quantile(w, 0.2) == 60.0
    assert tp.weighted_quantile(w, 0.75) == 90.0


def test_two_point_and_read_plus_extra_on_the_grid():
    import gear_pump_twopoint as tp
    from excavator_breakeven_geometry import GRID
    g = np.asarray(GRID, float)
    poc_h = 0.02 * g
    poc_g = poc_h + np.where(g > 75.6, 0.5, 0.0)
    q_lo, q_hi = float(g[len(g) // 3]), float(g[2 * len(g) // 3])
    assert tp.two_point(poc_h, q_lo, q_hi) == pytest.approx(0.01 * (q_lo + q_hi))
    w = {float(g[-1]): 0.4, float(g[0]): 0.6}
    expect = float(poc_g[len(g) // 3]) + (0.4 * 0.5 if g[-1] > 75.6 else 0.0)
    assert tp.read_plus_extra(poc_g, poc_h, w, q_lo, 75.6) == pytest.approx(expect)
    assert tp.read_plus_extra(poc_h, poc_h, w, q_lo, 75.6) == pytest.approx(0.02 * q_lo)


def test_design_rows():
    import gear_pump_twopoint as tp
    r = {"kwo": 3.0, "kww": 2.5, "kwq": 2.4, "kw2": 2.6, "kwx": 2.7, "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert tp.row("owh2", r) == pytest.approx([1.0, 1.3, -0.1, 1.0])
    assert tp.row("owd2", r) == pytest.approx([1.0, 0.3, -0.1])
    assert tp.row("owdx", r) == pytest.approx([1.0, 0.35, -0.1])
    assert tp.row("owdq", r) == pytest.approx([1.0, 0.2, -0.1])


def test_committed_results_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 8):
        assert re.search(rf"PT{k} .*: (held|refuted)", text)
    assert re.search(r"q25 = [0-9.]+, q\* \(median\) = [0-9.]+, q75 = [0-9.]+ L/min", text)
