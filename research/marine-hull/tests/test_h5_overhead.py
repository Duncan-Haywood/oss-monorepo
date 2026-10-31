"""run_h5_overhead.py: the closed-form break-even energy matches brute force and d = 0 never swaps."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_overhead_experiment_closed_form_matches():
    out = subprocess.run([sys.executable, str(ROOT / "experiments" / "run_h5_overhead.py")],
                         capture_output=True, text=True, check=True,
                         env={"PYTHONPATH": str(ROOT / "src")}).stdout
    rows = [line for line in out.splitlines() if "extra overhead" in line]
    assert len(rows) == 6
    assert all(line.endswith("disagrees in 0") for line in rows)
    assert "rank swaps    0" in rows[0]
