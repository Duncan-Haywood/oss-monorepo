"""Census lenses (ACS multi-year PUMS, SIPP marital histories): JS parity under Node, and the
bundles agree with the audit files and aggregate tables written beside their code."""
from pathlib import Path
import csv, json, shutil, subprocess, unittest

ROOT = Path(__file__).resolve().parent
APP = ROOT / 'app'
ACS = ROOT / 'reproducibility' / 'acs_pums_multiyear'
SIPP = ROOT / 'reproducibility' / 'sipp_marital_history'


@unittest.skipUnless(shutil.which('node'), 'node not installed')
class CensusParityTests(unittest.TestCase):
    def run_node(self, name):
        r = subprocess.run(['node', '--test', str(APP / 'tests' / name)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_acs_bundle_and_baselines(self):
        self.run_node('acs.test.mjs')

    def test_sipp_bundles(self):
        self.run_node('sipp.test.mjs')


class AcsTests(unittest.TestCase):
    def test_downloads_are_recorded_and_counts_match(self):
        downloads = json.loads((ACS / 'downloads.json').read_text())
        years = {d['year'] for d in downloads}
        self.assertTrue({2019, 2021, 2022, 2023, 2024} <= years)
        for d in downloads:
            self.assertEqual(len(d['sha256']), 64)
            self.assertTrue(d['url'].startswith('https://www2.census.gov/programs-surveys/acs/'))
            self.assertLess(d['kept_married_past_year'], d['person_rows'])
        base = json.loads((APP / 'data' / 'acs_divorce_baselines.json').read_text())
        series = {(int(r['year']), r['group']): r for r in csv.DictReader((ACS / 'year_series.csv').read_text().splitlines())}
        for d in downloads:
            self.assertEqual(int(series[(d['year'], 'All')]['people']), d['kept_married_past_year'])
        pooled = sum(d['kept_married_past_year'] for d in downloads if d['year'] in base['pooled_years'])
        self.assertEqual(base['overall']['people'], pooled)

    def test_bundle_matches_comparison_table(self):
        bundle = json.loads((APP / 'models' / 'acs_one_year_divorce.json').read_text())
        rows = {r['model']: r for r in csv.DictReader((ACS / 'model_heldout_comparison.csv').read_text().splitlines())}
        for m in bundle['models']:
            self.assertAlmostEqual(m['heldout']['deviance_improvement_percent'],
                                   float(rows[m['key']]['deviance_improvement_percent']), places=2)
            self.assertGreater(m['heldout']['auc'], 0.5)


class SippTests(unittest.TestCase):
    def test_retro_bundle_agrees_with_audit(self):
        audit = json.loads((SIPP / 'retro_sample_audit.json').read_text())
        bundle = json.loads((APP / 'models' / 'sipp_first_marriage.json').read_text())
        self.assertEqual(bundle['training']['people'], audit['marriages'])
        self.assertEqual(bundle['training']['events'], audit['dissolutions'])
        self.assertEqual(sum(v['marriages'] for v in audit['by_source'].values()), audit['marriages'])
        best = max(m['heldout']['deviance_improvement_percent'] for m in bundle['models'])
        self.assertGreater(best, 0)
        self.assertGreaterEqual(audit['read'], audit['marriages'])

    def test_checksums_cover_the_topical_modules(self):
        names = [l.split()[1] for l in (SIPP / 'SHA256SUMS').read_text().splitlines()]
        for p in ('01', '04', '08'):
            self.assertIn(f'p{p}putm2.zip', names)
            self.assertIn(f'p{p}putm2.sas', names)

    def test_prospective_audit(self):
        path = SIPP / 'prospective_sample_audit.json'
        if not path.exists():
            self.skipTest('prospective model not built')
        audit = json.loads(path.read_text())
        bundle = json.loads((APP / 'models' / 'sipp_prospective_couples.json').read_text())
        self.assertEqual(bundle['training']['events'], audit['events'])
        self.assertEqual(sum(p['events'] for p in audit['pairs']), audit['events'])


if __name__ == '__main__':
    unittest.main()
