"""run_h5_glider.py: equal overhead never swaps the glider/AUV order across 150 to 250 Wh/kg."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_glider_h5_zero_overhead_has_no_swaps():
    out = subprocess.run([sys.executable, str(ROOT / "experiments" / "run_h5_glider.py")],
                         capture_output=True, text=True, check=True,
                         env={"PYTHONPATH": str(ROOT / "src")}).stdout
    rows = [line for line in out.splitlines() if "glider extra overhead" in line]
    assert len(rows) == 5
    assert rows[0].split()[-1] == "0"
    assert not rows[-1].split()[-1] == "0"
