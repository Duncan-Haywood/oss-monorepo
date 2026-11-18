"""Milestone 7k: the idle charge depends on standby minus drag only, the kappa diagnostic, rows and verdicts."""
import re
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_ratio_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_fcurve_sees_only_the_standby_minus_drag_difference():
    from excavator_idle_standby import fcurve
    rng = np.random.default_rng(3)
    row = {"sm": rng.uniform(0.5, 2.0, 50), "tau": rng.uniform(1.1, 3.0, 50), "s0": 0.2}
    poc = rng.uniform(2.0, 4.0, 50)
    a = fcurve(row, poc + 0.5, 3.0 + 0.5, 0.38)
    b = fcurve(row, poc, 3.0, 0.38)
    assert np.allclose(a, b, atol=1e-12)


def test_kappa_with_condition_fixed_effects():
    import gear_pump_ratio as gr
    pairs = {0: [(2.0, 1.7), (3.0, 2.5), (4.0, 3.3)], 1: [(1.0, 5.8), (2.0, 6.6)]}
    assert abs(gr.kappa(pairs) - 0.8) < 1e-12


def test_design_rows():
    import gear_pump_ratio as gr
    r = {"kwo": 3.0, "kww": 2.5, "kw": -0.1, "pls": 2.0, "h": 0.5}
    assert gr.row("owh", r) == [1.0, 1.5, -0.1, 1.0]
    assert gr.row("owhw", r) == [1.0, 1.25, -0.1, 1.0]
    assert gr.row("owdw", r) == [1.0, 0.25, -0.1]


def test_committed_results_check_and_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 7):
        assert re.search(rf"RW{k} .*: (held|refuted)", text)
    m = re.search(r"at once moves no diagonal's E50 \(largest \|change\| ([0-9.e+-]+)\)", text)
    assert m and float(m.group(1)) == 0.0
