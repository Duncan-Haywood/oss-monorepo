"""NLSY97 first-marriage lens: the exported bundle agrees with its audit and aggregate tables, the
JS engine reproduces it (node), and nothing person-level is published. Stdlib only."""
from pathlib import Path
import csv, json, shutil, subprocess, unittest

HERE = Path(__file__).resolve().parent
SRC = HERE / 'reproducibility' / 'nlsy97_first_marriage'
BUNDLE = HERE / 'app' / 'models' / 'nlsy97_first_marriage.json'


class Nlsy97Bundle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.b = json.loads(BUNDLE.read_text())
        cls.audit = json.loads((SRC / 'sample_audit.json').read_text())
        with open(SRC / 'heldout_model_comparison.csv') as f:
            cls.comp = {r['model']: r for r in csv.DictReader(f)}

    def test_counts_match_bls_release_and_audit(self):
        self.assertEqual(self.audit['respondents_in_release'], 8984)   # NLSY97 round-1 sample (BLS)
        t = self.b['training']
        self.assertEqual(t['respondents'], self.audit['first_marriages'])
        self.assertEqual(t['events'], self.audit['dissolutions'])
        self.assertEqual(t['intervals'], self.audit['intervals'])
        self.assertLessEqual(self.audit['first_marriages'], self.audit['ever_married_created_variable'])

    def test_heldout_metrics_match_table_and_beat_constant(self):
        for m in self.b['models']:
            row = self.comp[m['key']]
            self.assertAlmostEqual(m['heldout']['deviance_improvement_percent'], float(row['deviance_gain_percent']), places=2)
            self.assertAlmostEqual(m['heldout']['harrell_c'], float(row['harrell_c']), places=3)
        best = next(m for m in self.b['models'] if m['key'] == self.b['best_model'])
        self.assertGreater(best['heldout']['ci95'][0], 0, 'best model should beat a constant rate held out')
        self.assertGreater(best['heldout']['harrell_c_ci95'][0], 0.5)

    def test_published_aggregates_respect_cell_minimums(self):
        pop = self.b['population_reference']
        self.assertEqual(pop['horizons'], [5, 10, 20])
        self.assertEqual(len(pop['overall']['quantiles']), 99)
        for group in pop['subgroups'].values():
            for cell in group.values():
                self.assertGreaterEqual(cell['n'], 100)
        pdist = self.b['partner_distribution']
        for key, rows in pdist.items():
            if isinstance(rows, list):
                for r in rows:
                    self.assertGreaterEqual(r['marriages'], pdist['min_cell'])

    def test_no_person_level_rows_in_repository(self):
        for p in SRC.iterdir():
            self.assertFalse(p.name.endswith(('.pkl', '.parquet', '.zip')), p.name)
            self.assertNotIn('extract', p.name.replace('extract.py', ''), p.name)
        for p in SRC.glob('*.csv'):
            with open(p) as f:
                header = next(csv.reader(f))
            self.assertNotIn('id', header, f'{p.name} looks person-level')

    @unittest.skipUnless(shutil.which('node'), 'node not installed')
    def test_js_engine_parity(self):
        r = subprocess.run(['node', '--test', str(HERE / 'app' / 'tests' / 'nlsy97.test.mjs')], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == '__main__':
    unittest.main()
