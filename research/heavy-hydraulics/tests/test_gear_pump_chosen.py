"""Milestone 7e: the pick is the argmax of f_t on GRID, the design matrix carries the new shape features, and the
committed results file reproduces 7d's checks and carries every verdict."""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_chosen_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_design_carries_w_and_above_features():
    import numpy as np
    import gear_pump_chosen as gc
    kw = {"a": 2.0, "b": 3.0}
    feat = {"w": {"a": 0.01, "b": -0.02}, "above": {"a": 0.5, "b": 0.0}}
    assert np.allclose(gc.design([("a", "b")], kw, feat, "w"), [[1.0, 3.0, 0.01]])
    assert np.allclose(gc.design([("b", "a")], kw, feat, "above"), [[1.0, 2.0, 0.0]])
    assert gc.design([("a", "b")], kw, feat, "two").shape == (1, 2)


def test_pick_is_the_grid_flow_with_the_largest_break_even_rate():
    import numpy as np
    import gear_pump_chosen as gc
    from excavator_breakeven_geometry import GRID
    n = len(GRID)
    tau = np.full(n, 2.0)
    sm = np.zeros(n)
    j = n // 3
    sm[j] = 5.0                                   # only one size has a positive saving
    row = {"i": 0, "A": sm, "Bv": np.zeros(n), "tau": tau, "s0": 0.0}
    pk, flat = gc.picks([row], [np.ones(n)], 0.8, (0.0, 0.0))
    assert flat == 0 and pk[0] == GRID[j]


def test_fit_recovers_an_exact_linear_rule():
    import numpy as np
    import gear_pump_chosen as gc
    fams = ["a", "b", "c", "d"]
    kw = dict(zip(fams, [2.0, 2.5, 3.0, 3.5]))
    feat = {"w": dict(zip(fams, [0.01, -0.02, 0.0, 0.03]))}
    cells = {(f, g): 0.82 + 0.017 * (kw[g] - 3.57) - 0.4 * feat["w"][f] for f in fams for g in fams}
    b = gc.gt_fit(cells, kw, feat, "w")
    assert np.allclose([b[1], b[2]], [0.017, -0.4])
    err = gc.lofo(cells, fams, {f: f for f in fams}, kw, feat, "w")
    assert max(abs(v) for v in err.values()) < 1e-9


def test_committed_results_reproduce_7d_and_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 7):
        assert re.search(rf"WS{k} .*: (held|refuted)", text)
    assert "(check: two -0.0000, lo +0.0000 against 7d)" in text
    assert text.count("check against 7d: two") == 3
    assert "pooled 2304 picks" in text
