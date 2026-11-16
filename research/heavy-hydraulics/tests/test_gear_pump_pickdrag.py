"""Milestone 7f: the pick-weighted drag is the w-weighted idle power on GRID, the design matrix puts the drag on the
drag family and the shape on the shape family, and the committed results file reproduces 7e and carries every
verdict."""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_pickdrag_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_pick_weighted_idle_averages_on_grid():
    import numpy as np
    import gear_pump_pickdrag as gd
    from excavator_breakeven_geometry import GRID
    poc = np.asarray(GRID, dtype=float) * 0.01 + 1.0
    q1, q2 = float(GRID[10]), float(GRID[30])
    got = gd.pick_weighted_idle(poc, {q1: 0.25, q2: 0.75})
    assert abs(got - (0.25 * poc[10] + 0.75 * poc[30])) < 1e-12
    assert gd.grid_index(q2) == 30


def test_design_reads_drag_from_g_and_shape_from_f():
    import numpy as np
    import gear_pump_pickdrag as gd
    feat = {"kw": {"a": 2.0, "b": 3.0}, "kww": {"a": 2.2, "b": 3.4},
            "w": {"a": 0.01, "b": -0.02}, "wp": {"a": 0.03, "b": 0.0}}
    assert np.allclose(gd.design([("a", "b")], feat, "dww"), [[1.0, 3.4, 0.01]])
    assert np.allclose(gd.design([("b", "a")], feat, "wp"), [[1.0, 2.0, 0.0]])
    assert gd.design([("a", "b")], feat, "dw").shape == (1, 2)
    assert gd.design([("a", "b")], feat, "one").shape == (1, 1)


def test_lofo_is_exact_on_an_exact_rule():
    import gear_pump_pickdrag as gd
    fams = ["a", "b", "c", "d"]
    feat = {"kww": dict(zip(fams, [2.0, 2.6, 3.1, 3.5])), "w": dict(zip(fams, [0.01, -0.02, 0.0, 0.03]))}
    cells = {(f, g): 0.80 + 0.02 * feat["kww"][g] - 0.4 * feat["w"][f] for f in fams for g in fams}
    err = gd.lofo(cells, fams, {f: f for f in fams}, feat, "dww")
    assert max(abs(v) for v in err.values()) < 1e-9


def test_committed_results_reproduce_7e_and_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 7):
        assert re.search(rf"DP{k} .*: (held|refuted)", text)
    assert "(check against 7e: two +0.0000, w +0.0000)" in text or "(check against 7e: two -0.0000, w +0.0000)" in text \
        or re.search(r"\(check against 7e: two [+-]0\.0000, w [+-]0\.0000\)", text)
    assert "Picks reused from 7e: 2304" in text
