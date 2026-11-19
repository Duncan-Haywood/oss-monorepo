"""Milestone 7za: the Argo-Hytos GP3 lines read as the datasheet prints them, and the committed results reproduce."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_flow_lines_built_from_the_table_give_its_nominal_flow():
    import gear_pump_argo as ga
    import digitise_argo_gp3 as ag
    from heavy_hydraulics.measured import gear_pump_point
    rows = ga.argo_rows()
    for s, (V, _, _, p2n, _, qn, _) in ag.TABLE.items():
        fl, _ = gear_pump_point(rows, s, 1500.0, skip_short=True)
        assert abs(fl(p2n) - qn) < 0.01                       # the construction reproduces Q_n at p2n
        assert 0.97 < fl(20.0) / (V * 1.5) <= 1.0              # and leaks under 3% at 20 bar


def test_every_size_has_a_line_per_pressure_rising_with_pressure():
    import gear_pump_argo as ga
    import digitise_argo_gp3 as ag
    rows = ga.argo_rows()
    for s in ag.SIZES:
        L = ga.lines(rows, s)
        assert min(L) == 20 and max(L) == ag.TABLE[s][3] and len(L) in (6, 7)
        ps = sorted(L)
        at = [float(__import__("numpy").interp(1500.0, *L[p])) for p in ps]
        assert all(a < b for a, b in zip(at, at[1:]))


def test_lines_are_one_efficiency_through_the_origin():
    # the finding of 7za: drawn slope / (V p / (600000 x 0.85)) sits near one constant at every pressure, and
    # the lines meet n = 0 near zero power (no zero-pressure drag), except GP3 22,5, which is 19% steep
    import gear_pump_argo as ga
    import numpy as np
    fc = ga.formula_check(ga.argo_rows())
    r = np.array([v[0] for (s, p), v in fc.items() if s != 22])
    assert 1.0 < np.median(r) < 1.1 and r.max() - r.min() < 0.11
    assert abs(np.median([v[1] for v in fc.values()])) < 0.3


def test_committed_results_reproduce():
    out = subprocess.run([sys.executable, str(EXP / "gear_pump_argo.py")], capture_output=True, text=True,
                         check=True).stdout
    assert out == (EXP / "gear_pump_argo_results.txt").read_text()
