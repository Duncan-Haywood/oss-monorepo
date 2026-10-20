"""Satisfaction by years married: the app JSON matches the committed CSVs, holds aggregates only
(no person-level rows), intervals bracket their estimates, and the build helpers compute
weighted shares and bootstrap intervals correctly on synthetic data."""
import csv
import importlib.util
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
LENS = HERE / 'reproducibility' / 'satisfaction_by_duration'
APP_JSON = HERE / 'app' / 'data' / 'satisfaction_by_duration.json'


def rows(name):
    with open(LENS / name, newline='') as f:
        return list(csv.DictReader(f))


class SatisfactionOutputs(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(APP_JSON.read_text())

    def test_series_match_csv(self):
        csv_rows = rows('satisfaction_by_duration.csv')
        for s in self.data['series']:
            mine = [r for r in csv_rows if r['source'] == s['source'] and r['group'] == s['group']]
            self.assertEqual(len(mine), len(s['points']), s['group'])
            for r, p in zip(mine, s['points']):
                self.assertEqual(r['level'], p['level'])
                self.assertEqual(int(r['n']), p['n'])
                self.assertAlmostEqual(float(r['very_happy']), p['very_happy'], places=3)

    def test_aggregates_only_and_intervals_bracket(self):
        for s in self.data['series']:
            for p in s['points']:
                self.assertGreaterEqual(p['n'], 50, 'cells under 50 respondents are not published')
                self.assertTrue(0 <= p['very_happy'] <= 1)
                self.assertLessEqual(p['very_happy_lo'], p['very_happy'] + 1e-9)
                self.assertGreaterEqual(p['very_happy_hi'], p['very_happy'] - 1e-9)
        t = self.data['trajectory']['rows']
        self.assertEqual(t[0]['level'], 'All')
        self.assertEqual(sum(r['n'] for r in t[1:]), t[0]['n'])
        for r in t:
            self.assertLessEqual(r['mean_change_lo'], r['mean_change'] + 1e-9)
            self.assertGreaterEqual(r['mean_change_hi'], r['mean_change'] - 1e-9)
        text = APP_JSON.read_text()
        for banned in ('caseid', '"id"', 'respondent_id'):
            self.assertNotIn(banned, text)

    def test_headline_numbers_in_readme(self):
        gss = next(s for s in self.data['series'] if s['source'] == 'GSS 1973-1994' and s['group'] == 'All')
        first = gss['points'][0]
        readme = (LENS / 'README.md').read_text()
        self.assertIn(f"**{round(100 * first['very_happy'])}%**", readme)
        self.assertIn(f"{self.data['audit']['gss']['analysed']:,}", readme)
        allrow = self.data['trajectory']['rows'][0]
        self.assertIn(f"**{abs(allrow['mean_change']):.2f} points lower**", readme)


@unittest.skipUnless(importlib.util.find_spec('pandas') and importlib.util.find_spec('numpy'), 'pandas/numpy not installed')
class BuildHelpers(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('sat_build', LENS / 'scripts' / 'build.py')
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)

    def test_duration_band(self):
        import pandas as pd
        b = self.m.duration_band(pd.Series([0, 2.9, 3, 10.5, 41, 79]), self.m.DUR_BINS, self.m.DUR_LABELS)
        self.assertEqual(list(b), ['0-2', '0-2', '3-5', '6-10', '41+', '41+'])

    def test_weighted_cells_and_bootstrap(self):
        import numpy as np
        import pandas as pd
        df = pd.DataFrame({'band': ['a'] * 4 + ['b'] * 4, 'y': [1, 0, 0, 0, 1, 1, 1, 0], 'weight': [3, 1, 1, 1, 1, 1, 1, 1]})
        out = {r['level']: r for r in self.m.boot_cells(df, 'band', {'share': 'y'}, np.random.default_rng(1), b=200)}
        self.assertAlmostEqual(out['a']['share'], 0.5)
        self.assertAlmostEqual(out['b']['share'], 0.75)
        self.assertLessEqual(out['a']['share_lo'], 0.5)
        self.assertGreaterEqual(out['a']['share_hi'], 0.5)
        self.assertEqual(out['b']['n'], 4)


if __name__ == '__main__':
    unittest.main()
