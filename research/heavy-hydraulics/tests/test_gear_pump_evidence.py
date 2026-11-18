"""Milestone 6r: the pooled three-maker fit reproduces its committed results and behaves on known cases."""
import math
import subprocess
import sys
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
sys.path.insert(0, str(EXP))
import gear_pump_evidence as ge  # noqa: E402


def test_gear_pump_evidence_reproduces_committed_results():
    out = subprocess.run([sys.executable, str(EXP / "gear_pump_evidence.py")], capture_output=True, text=True,
                         check=True).stdout
    assert out == (EXP / "gear_pump_evidence_results.txt").read_text()


def test_readers_find_every_sweep_point():
    assert len(ge.casappa()) == 11 and len(ge.danfoss()) == 7 and len(ge.marzocchi()) == 11
    # the unscaled catalogue points are in the sweeps
    assert (0.7590, 9.9) in ge.casappa() and (0.8975, 99.5) in ge.marzocchi()


def test_fit_recovers_a_known_logistic():
    pts = [(0.76 + 0.01 * i, ge.logistic(0.76 + 0.01 * i, 0.8250, 0.0200)) for i in range(15)]
    e50, w = ge.fit(pts)
    assert math.isclose(e50, 0.8250, abs_tol=2e-4) and math.isclose(w, 0.0200, abs_tol=2e-4)


def test_own_crossing_interpolates_linearly():
    assert math.isclose(ge.own_crossing([(0.80, 40.0), (0.82, 60.0)]), 0.81)
