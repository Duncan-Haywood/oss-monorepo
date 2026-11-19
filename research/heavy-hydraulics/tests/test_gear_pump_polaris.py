"""Milestone 7z: the Polaris 30 curves read as the catalogue prints them, and the committed results reproduce."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_flow_slopes_match_printed_displacement():
    import gear_pump_polaris as gp
    import digitise_casappa_polaris30 as pl
    from heavy_hydraulics.measured import gear_pump_point
    rows = gp.polaris_rows()
    for s in pl.SIZES:
        fl, _ = gear_pump_point(rows, s, 2100.0)
        assert abs(fl(20.0) / (pl.DISPLACEMENT[s] * 2.1) - 1.0) < 0.002   # 20-bar flow = V n within 0.2%


def test_every_size_has_its_printed_pressures():
    import gear_pump_polaris as gp
    import digitise_casappa_polaris30 as pl
    rows = gp.polaris_rows()
    for s, (_, _, _, press) in pl.CHARTS.items():
        got = {int(float(r[2])) for r in rows if int(r[0]) == s and r[1] == "power"}
        assert got == set(press)
        flows = {int(float(r[2])) for r in rows if int(r[0]) == s and r[1] == "flow"}
        assert flows == {20, pl.PMAX[s]}


def test_power_rises_with_pressure_and_hydraulic_power_below_input():
    import gear_pump_polaris as gp
    import digitise_casappa_polaris30 as pl
    from heavy_hydraulics.measured import gear_pump_point
    rows = gp.polaris_rows()
    for s in pl.SIZES:
        fl, pw = gear_pump_point(rows, s, 1500.0)
        ps = sorted(pl.CHARTS[s][3])
        assert all(pw(a) < pw(b) for a, b in zip(ps, ps[1:]))
        assert all(0.55 < fl(p) * p / 600.0 / pw(p) < 0.95 for p in ps)


def test_committed_results_reproduce():
    out = subprocess.run([sys.executable, str(EXP / "gear_pump_polaris.py")], capture_output=True, text=True,
                         check=True).stdout
    assert out == (EXP / "gear_pump_polaris_results.txt").read_text()
