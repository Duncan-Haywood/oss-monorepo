"""Milestone 6p: the bench-measured Casappa KP30 (Frosina et al. 2017) reproduces its committed results file and
sits above the 0.83 crux, and its digitised figures are internally consistent."""
import contextlib
import csv
import io
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
sys.path.insert(0, str(EXP))


def test_results_file_is_reproduced_exactly():
    import kp30_bench
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        kp30_bench.main()
    assert buf.getvalue() == (EXP / "kp30_bench_results.txt").read_text()


def test_bench_pump_is_above_the_crux_in_every_variant():
    res = (EXP / "kp30_bench_results.txt").read_text()
    line = next(l for l in res.splitlines() if l.strip().startswith("central"))
    central, lowest = float(line.split()[1].rstrip(";")), float(line.split()[-1])
    assert 0.88 < lowest <= central < 0.95
    assert lowest > 0.8309                          # the highest of the three makers' crossings


def test_digitised_figures_are_consistent():
    with open(EXP / "data" / "frosina2017_kp30_bench.csv") as fh:
        rows = [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]
    t = {(r[1], int(r[3]), float(r[4])): float(r[5]) for r in rows if r[0] == "fig11_torque_Nm"}
    q = {(int(r[3]), float(r[4])): float(r[5]) for r in rows if r[0] == "fig13_normalised_flow"}
    for n in (1000, 1500, 2500):
        for p in (50.0, 150.0, 250.0):
            ideal = 44.0 * p / (20.0 * 3.141592653589793)
            assert t[("model", n, p)] < t[("measured", n, p)]      # friction only adds torque
            assert 0.85 < ideal / t[("measured", n, p)] < 0.98
    for p in (50.0, 150.0, 250.0):                   # flow falls with pressure; the base is about V x 2500 r/min
        assert 2400 < 1000.0 / (q[(2500, p)] - q[(1500, p)]) < 2600
    assert q[(2500, 50.0)] > q[(2500, 150.0)] > q[(2500, 250.0)]
