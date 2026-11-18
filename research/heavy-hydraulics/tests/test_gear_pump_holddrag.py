"""Milestone 7g: kW_o is the held reading's kW_85 plus the pick-weighted extra drag above Q_L only, it equals kW_85
when the reading is its own held curve, and the committed results file reproduces 7f and carries every verdict."""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_holddrag_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_extra_drag_counts_only_picks_above_q_l():
    import numpy as np
    import gear_pump_holddrag as gh
    from excavator_breakeven_geometry import GRID
    h = np.asarray(GRID, dtype=float) * 0.02 + 1.0
    g = h + 0.5
    q_lo, q_hi = float(GRID[10]), float(GRID[40])
    w = {q_lo: 0.6, q_hi: 0.4}
    got = gh.held_plus_extra(2.5, g, h, w, q_l=float(GRID[20]))
    assert abs(got - (2.5 + 0.4 * 0.5)) < 1e-12


def test_held_reading_gives_kw85_unchanged():
    import numpy as np
    import gear_pump_holddrag as gh
    from excavator_breakeven_geometry import GRID
    h = np.asarray(GRID, dtype=float) * 0.03
    w = {float(GRID[5]): 0.5, float(GRID[50]): 0.5}
    assert gh.held_plus_extra(2.61, h, h, w, q_l=0.0) == 2.61


def test_rules_registered_on_the_shared_design():
    import gear_pump_holddrag  # noqa: F401
    import gear_pump_pickdrag as gd
    import numpy as np
    feat = {"kwo": {"a": 2.0, "b": 3.0}, "w": {"a": 0.01, "b": -0.02}}
    assert np.allclose(gd.design([("a", "b")], feat, "ow"), [[1.0, 3.0, 0.01]])
    assert gd.design([("a", "b")], feat, "o").shape == (1, 2)


def test_committed_results_reproduce_7f_and_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 7):
        assert re.search(rf"OD{k} .*: (held|refuted)", text)
    assert re.search(r"\(check against 7f: two [+-]0\.0000, w [+-]0\.0000, dw [+-]0\.0000, dww [+-]0\.0000\)", text)
    assert re.search(r"held panel by construction: o - two [+-]0\.0000, ow - w [+-]0\.0000", text)
