"""Milestone 7o: the tilted pick weight, its calibration, design rows and the committed verdicts."""
import re
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_tilt_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def _grid():
    from excavator_breakeven_geometry import GRID
    return np.asarray(GRID, float)


def test_zero_tilt_is_the_published_weight_and_a_flat_excess_does_nothing():
    import gear_pump_tilt as tl
    g = _grid()
    w = {float(g[10]): 0.25, float(g[20]): 0.5, float(g[40]): 0.25}
    poc, pbar = 0.5 + 0.02 * g, np.full_like(g, 1.0)
    assert tl.tilt(w, poc, pbar, 0.0) == pytest.approx(w)
    assert tl.tilt(w, pbar + 0.7, pbar, 3.0) == pytest.approx(w)


def test_positive_tilt_moves_weight_away_from_high_drag():
    import gear_pump_tilt as tl
    import gear_pump_pickdrag as gd
    g = _grid()
    w = {float(g[10]): 0.25, float(g[20]): 0.5, float(g[40]): 0.25}
    poc, pbar = 0.5 + 0.02 * g, np.full_like(g, 1.0)
    t = tl.tilt(w, poc, pbar, 2.0)
    assert sum(t.values()) == pytest.approx(1.0)
    assert t[float(g[10])] > w[float(g[10])] and t[float(g[40])] < w[float(g[40])]
    assert gd.pick_weighted_idle(poc, t) < gd.pick_weighted_idle(poc, w)


def test_calibration_recovers_the_lambda_that_made_the_target():
    import gear_pump_tilt as tl
    import gear_pump_pickdrag as gd
    g = _grid()
    w = {float(g[k]): 1 / 5 for k in (5, 15, 25, 35, 45)}
    pbar = 1.0 + 0.01 * g
    poc = {"a": 0.5 + 0.03 * g, "b": 2.0 - 0.005 * g}
    target = {f: gd.pick_weighted_idle(poc[f], tl.tilt(w, poc[f], pbar, 1.5)) for f in poc}
    assert tl.calibrate(w, poc, pbar, target, ["a", "b"]) == pytest.approx(1.5)


def test_design_rows():
    import gear_pump_tilt as tl
    r = {"kwo": 3.0, "kww": 2.5, "kws": 2.2, "kwt": 2.3, "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert tl.row("owht", r) == pytest.approx([1.0, 1.15, -0.1, 1.0])
    assert tl.row("owdt", r) == pytest.approx([1.0, 0.15, -0.1])
    assert tl.row("owds", r) == pytest.approx([1.0, 0.1, -0.1])


def test_committed_results_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 8):
        assert re.search(rf"PL{k} .*: (held|refuted)", text)
