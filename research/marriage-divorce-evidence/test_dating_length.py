"""Dating length before marriage: the committed held-out comparison is internally consistent,
its README states the same numbers, and the app export is aggregates only, never applied."""
import csv
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
LENS = HERE / 'reproducibility' / 'dating_length'


class DatingLengthOutputs(unittest.TestCase):
    def setUp(self):
        with open(LENS / 'heldout_comparison.csv', newline='') as f:
            self.rows = {r['model']: r for r in csv.DictReader(f)}
        self.app = json.loads((HERE / 'app' / 'data' / 'dating_length.json').read_text())

    def test_deltas_are_differences_from_core(self):
        core = float(self.rows['core']['gain_vs_constant_pct'])
        for k in ('core+dating', 'core+band', 'core+known'):
            r = self.rows[k]
            self.assertAlmostEqual(float(r['delta_gain_vs_constant_pct']), float(r['gain_vs_constant_pct']) - core, places=3)
            self.assertLessEqual(float(r['delta_gain_vs_constant_pct_lo']), float(r['delta_gain_vs_constant_pct']))
            self.assertGreaterEqual(float(r['delta_gain_vs_constant_pct_hi']), float(r['delta_gain_vs_constant_pct']))

    def test_readme_matches(self):
        r = self.rows['core+dating']
        readme = (LENS / 'README.md').read_text()
        d = float(r['delta_gain_vs_constant_pct'])
        self.assertIn(f"**{'−' if d < 0 else '+'}{abs(d):.2f} points (95% CI", readme)
        self.assertIn(f"{float(self.rows['core']['gain_vs_constant_pct']):.2f}%", readme)

    def test_app_export(self):
        self.assertFalse(self.app['grade']['applied'])
        self.assertEqual(len(self.app['heldout']), len(self.rows))
        self.assertTrue(all(r['verified'] for r in self.app['literature']))
        self.assertNotIn('caseid', json.dumps(self.app))


if __name__ == '__main__':
    unittest.main()
