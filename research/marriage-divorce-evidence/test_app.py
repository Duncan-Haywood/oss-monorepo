"""Runs the browser app's JS tests (engine parity with scikit-learn, couple layer) under Node."""
from pathlib import Path
import shutil, subprocess, unittest

APP = Path(__file__).resolve().parent / 'app'


@unittest.skipUnless(shutil.which('node'), 'node not installed')
class AppTests(unittest.TestCase):
    def run_node(self, name):
        r = subprocess.run(['node', str(APP / 'tests' / name)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_engine_matches_sklearn(self):
        self.run_node('engine.test.mjs')

    def test_couple_layer(self):
        self.run_node('couple.test.mjs')

    def test_lenses_and_scenarios(self):
        self.run_node('lenses.test.mjs')


if __name__ == '__main__':
    unittest.main()
