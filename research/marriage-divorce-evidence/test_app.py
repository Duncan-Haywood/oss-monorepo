"""Runs the browser app's JS tests (engine parity with scikit-learn, couple and individual lenses) under Node."""
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

    def test_individual_engine_matches_sklearn(self):
        self.run_node('individuals_engine.test.mjs')

    def test_individual_lens(self):
        self.run_node('individuals.test.mjs')

    def test_nsfg2002_bundle_matches_sklearn(self):
        self.run_node('nsfg2002.test.mjs')

    def test_fair_bundles_match_sklearn(self):
        self.run_node('fair.test.mjs')

    def test_mortality_competing_risks(self):
        self.run_node('mortality.test.mjs')

    def test_lenses_and_scenarios(self):
        self.run_node('lenses.test.mjs')


class Nsfg2002BundleTests(unittest.TestCase):
    def test_bundle_agrees_with_audit_and_beats_baseline(self):
        import json
        src = APP.parent / 'reproducibility' / 'nsfg2002_first_marriage'
        audit = json.loads((src / 'sample_audit.json').read_text())
        bundle = json.loads((APP / 'models' / 'nsfg2002_first_marriage.json').read_text())
        self.assertEqual(audit['respondents_in_file'], 7643)
        self.assertEqual(bundle['training']['respondents'], audit['ever_married'])
        self.assertEqual(bundle['training']['events'], audit['first_marriage_dissolutions'])
        best = max(m['heldout']['deviance_improvement_percent'] for m in bundle['models'])
        self.assertGreater(best, 0)


class RelationshipDatasetTests(unittest.TestCase):
    SRC = APP.parent / 'reproducibility'

    def test_fair_bundles_agree_with_their_tables(self):
        import csv, json
        for key, n, events in [('fair_redbook1974', 6366, 2053), ('fair_pt1969', 601, 150)]:
            bundle = json.loads((APP / 'models' / f'{key}.json').read_text())
            self.assertEqual(bundle['training']['respondents'], n)
            self.assertEqual(bundle['training']['events'], events)
            rows = list(csv.DictReader(open(self.SRC / 'fair_affairs' / f'{key}_affair_by_rating.csv')))
            self.assertEqual(sum(int(r['people']) for r in rows), n)
            self.assertEqual(sum(int(r['any_affair']) for r in rows), events)
            shares = [float(r['share']) for r in rows]
            self.assertGreater(shares[0], shares[-1])  # very poor rating above very good
            best = max(m['heldout']['logloss_improvement_percent'] for m in bundle['models'])
            self.assertGreater(best, 0)

    def test_mortality_table_matches_un_e0(self):
        import csv, json
        rows = list(csv.DictReader(open(self.SRC / 'un_wpp2024_mortality' / 'e0_check.csv')))
        self.assertEqual(len(rows), 24)
        self.assertLess(max(abs(float(r['difference'])) for r in rows), 0.05)
        table = json.loads((APP / 'data' / 'us_mortality_wpp2024.json').read_text())
        self.assertEqual(len(table['mxM']), len(table['years']))
        self.assertEqual(len(table['mxF'][0]), len(table['ages']))

    def test_presex_odds_ratios(self):
        import csv
        rows = list(csv.DictReader(open(self.SRC / 'thornes_collard_presex' / 'odds_ratios.csv')))
        self.assertEqual(len(rows), 8)
        for r in rows:
            self.assertLess(float(r['ci_low']), float(r['odds_ratio']))
            self.assertLess(float(r['odds_ratio']), float(r['ci_high']))
            if r['exposed_divorced']:
                a, b, c, d = (int(r[k]) for k in ('exposed_divorced', 'exposed_married', 'unexposed_divorced', 'unexposed_married'))
                self.assertAlmostEqual(float(r['odds_ratio']), a * d / (b * c), places=3)
        crude = [r for r in rows if r['group'] == 'All (crude)']
        self.assertEqual(sum(int(crude[0][k]) for k in ('exposed_divorced', 'exposed_married', 'unexposed_divorced', 'unexposed_married')), 1036)


if __name__ == '__main__':
    unittest.main()
