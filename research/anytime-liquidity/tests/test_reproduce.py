"""experiments/run.py must reproduce the committed results.txt exactly.

Added after the 2026-11-17 quality audit: the other tests check inequalities against bounds, so a
wrong adversary (attacking the lightest half) or a wrong doubling epoch left every test green while
changing every E2/E3 number. Comparing the run with the committed table catches both.
"""
import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ReproduceTest(unittest.TestCase):
    def test_run_matches_committed_results(self):
        env = dict(os.environ, PYTHONPATH=str(ROOT / "src"))
        out = subprocess.run([sys.executable, str(ROOT / "experiments" / "run.py")], env=env,
                             capture_output=True, text=True, timeout=120, check=True).stdout
        self.assertEqual(out, (ROOT / "experiments" / "results.txt").read_text())


if __name__ == "__main__":
    unittest.main()
