"""Milestone 6o: the digitised Marzocchi ALP3 curves give the per-size efficiencies the committed results report,
and the three makers' 85 L/min crossings sit within 0.02 of each other."""
import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
sys.path.insert(0, str(HERE / "src"))


def test_alp3_curves_reproduce_the_committed_size_table():
    from heavy_hydraulics.measured import gear_pump_point
    with open(EXP / "data" / "marzocchi_alp3_curves.csv") as fh:
        rows = [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]
    res = (EXP / "excavator_gear_pump_marzocchi_results.txt").read_text().splitlines()
    start = next(i for i, l in enumerate(res) if l.strip().startswith("size  V cm3/r  Q20 L/min  Q25/(Vn)"))
    table = []
    for l in res[start + 1:]:
        t = l.split()
        if not t or not t[0].isdigit():
            break
        table.append((int(t[0]), float(t[2]), float(t[6])))
    assert [s for s, _, _ in table] == [30, 33, 40, 50, 60, 66, 80, 94, 110, 120, 135]
    for size, q20, eta150 in table:
        fl, pw = gear_pump_point(rows, size, 2100.0)
        assert abs(fl(20.0) - q20) < 0.006
        assert abs(fl(150.0) * 150.0 / (600.0 * pw(150.0)) - eta150) < 0.0006
        assert 0.75 < eta150 < 0.95                    # a gear pump's overall efficiency, not a drafting slip


def test_three_makers_cross_within_002_at_85_l_min():
    res = (EXP / "excavator_gear_pump_marzocchi_results.txt").read_text()
    line = next(l for l in res.splitlines() if l.strip().startswith("index 2: casappa"))
    assert float(line.split("spread")[1]) < 0.02
