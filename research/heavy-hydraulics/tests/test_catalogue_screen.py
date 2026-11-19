"""Milestone 7y: the top-band cut keeps what it should, and the committed results file reproduces."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_top_band_keeps_curves_within_band_and_at_least_two():
    import catalogue_screen as cs
    rows = [(10, "power", p, 1000, 1.0) for p in (50, 100, 150, 250, 280)] + \
           [(20, "power", p, 1000, 1.0) for p in (50, 100, 250)] + [(10, "flow", 20, 1000, 9.0)]
    cut, keep = cs.top_band(rows)
    assert keep[10] == {250, 280}
    assert keep[20] == {100, 250}              # only 250 lies in the band: the top two are kept
    assert (10, "flow", 20, 1000, 9.0) in cut  # flow lines are never cut
    assert all(r[1] != "power" or r[2] in keep[r[0]] for r in cut)


def test_full_band_reproduces_the_model_reading():
    import catalogue_screen as cs
    from excavator_gear_pump import Gear
    rows, sizes = cs.families()["danfoss SNP3"]
    cut, _ = cs.top_band(rows, band=1e9)
    a, b = cs.idle_curve(Gear(rows, sizes=sizes)), cs.idle_curve(Gear(cut, sizes=sizes))
    assert a == b
    assert abs(a[cs.Q_HI] / a[cs.Q_LO] - 1.781) < 0.0005   # 7t's measured Danfoss bend


def test_committed_results_reproduce():
    out = subprocess.run([sys.executable, str(EXP / "catalogue_screen.py")], capture_output=True, text=True,
                         check=True).stdout
    assert out == (EXP / "catalogue_screen_results.txt").read_text()
