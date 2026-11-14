"""Milestone 6n: the crux script reproduces its committed results from the committed 6k and 6m results."""
import subprocess
import sys
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"


def test_gear_pump_crux_reproduces_committed_results():
    out = subprocess.run([sys.executable, str(EXP / "gear_pump_crux.py")], capture_output=True, text=True,
                         check=True).stdout
    assert out == (EXP / "gear_pump_crux_results.txt").read_text()
    # both makers' 50% crossings on the 85 L/min index lie within 0.01 of each other
    line = next(l for l in out.splitlines() if l.strip().startswith("index 2 crossings"))
    gap = float(line.split("gap")[1].split()[0])
    assert abs(gap) < 0.01
