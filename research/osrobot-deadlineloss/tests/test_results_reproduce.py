"""results.txt must be exactly what experiments/run.py prints (quality audit 2026-11-20 found a literal '\\n' in run.py)."""
import os, subprocess, sys, unittest

ROOT = os.path.join(os.path.dirname(__file__), "..")


class TestResultsReproduce(unittest.TestCase):
    def test_run_matches_committed_results(self):
        env = dict(os.environ, PYTHONPATH=os.path.join(ROOT, "src"))
        out = subprocess.run([sys.executable, os.path.join(ROOT, "experiments", "run.py")],
                             capture_output=True, text=True, check=True, env=env).stdout
        with open(os.path.join(ROOT, "experiments", "results.txt")) as f:
            self.assertEqual(out, f.read())


if __name__ == "__main__":
    unittest.main()
