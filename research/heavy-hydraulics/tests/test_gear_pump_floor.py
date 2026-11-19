"""Milestone 7zb: the drag-free bend b0 is the valve reading's, and the six-setting table reproduces 7za at the centre."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_floor_is_algebra_of_the_neutral_reading():
    import gear_pump_floor as f
    assert abs(f.floor("PVG32", 1.0) - 79 * (8.5 + 7.5 * 79 / 140) / (64 * (8.5 + 7.5 * 64 / 140))) < 1e-12
    for r in ("Salami-text", "Salami-curve"):          # p_n ~ q^2: b0 = (79/64)^3 at either speed ratio
        for n in (1.0, 0.5):
            assert abs(f.floor(r, n) - (79 / 64) ** 3) < 1e-12


def test_drag_proportional_to_flow_pulls_b_below_the_floor():
    # P(q) = c q + q p_n(q) / (600 eta): b lies between 79/64 (all drag) and b0 (no drag), whatever c and eta
    import gear_pump_floor as f
    from excavator_idle_standby import READINGS
    for r in READINGS:
        pn = READINGS[r]
        b0 = f.floor(r, 1.0)
        for c in (0.0, 0.005, 0.02, 0.1):
            P = {q: c * q + q * pn(q) / (600 * 0.85) for q in (64.0, 79.0)}
            b = P[79.0] / P[64.0]
            assert 79 / 64 - 1e-12 <= b <= b0 + 1e-12


def test_central_setting_reproduces_7za_and_gp3_sits_below_the_floor():
    import gear_pump_floor as f
    t = f.table()[("PVG32", 1.0)]
    assert abs(t["argo GP3"][2] - 1.263) < 5e-4 and abs(t["danfoss SNP3"][2] - 1.781) < 5e-4
    assert abs(t["casappa KP30"][2] - 1.373) < 5e-4 and abs(t["casappa PLP30"][2] - 1.272) < 5e-4
    assert abs(f.floor("PVG32", 1.0) - 1.318) < 5e-4
    assert t["argo GP3"][2] < f.floor("PVG32", 1.0)          # its negative intercepts, not a floor


def test_committed_results_reproduce():
    import subprocess
    out = subprocess.run([sys.executable, str(EXP / "gear_pump_floor.py")], capture_output=True, text=True,
                         check=True).stdout
    assert out == (EXP / "gear_pump_floor_results.txt").read_text()
