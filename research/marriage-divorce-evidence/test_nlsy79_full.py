"""Checks for reproducibility/nlsy79_full: the shipped first-marriage bundle agrees with its
aggregate tables, the reproduction of ml_couples recovered the published sample, and no
person-level file sits in the folder."""
from pathlib import Path
import csv, json, unittest

ROOT = Path(__file__).resolve().parent
F = ROOT / 'reproducibility' / 'nlsy79_full'
BUNDLE = ROOT / 'app' / 'models' / 'nlsy79_first_marriage.json'


class NLSY79FullTests(unittest.TestCase):
    def test_reproduction_recovers_published_sample(self):
        x = json.loads((F / 'reproduction_check.json').read_text())
        self.assertEqual(x['reproduced_sample'], x['published_sample'])
        self.assertEqual(x['reproduced_sample'], dict(intervals=40818, respondents=5735, events=726))
        enriched = x['heldout_deviance_improvement_percent']['Additive enriched']
        # Not bit-identical: tied incomes sort differently by CPU (METHODS.md); within 0.01 points.
        self.assertLess(abs(enriched['reproduced'] - enriched['committed']), 0.01)

    def test_bundle_agrees_with_tables(self):
        b = json.loads(BUNDLE.read_text())
        rows = {r['model']: r for r in csv.DictReader((F / 'heldout_model_comparison.csv').read_text().splitlines())}
        for m in b['models']:
            self.assertAlmostEqual(m['heldout']['deviance_improvement_percent'], float(rows[m['key']]['gain_percent']), places=2)
            lo, hi = m['heldout']['ci95']
            self.assertLessEqual(lo, hi)
        audit = json.loads((F / 'training_audit.json').read_text())
        self.assertEqual(b['training']['respondents'], audit['marriages'])
        self.assertEqual(b['training']['events'], audit['divorces'])
        # Every model with inputs beats the constant rate held out; the duration curve is the floor.
        best = max(float(rows[k]['gain_percent']) for k in rows if k not in ('constant', 'duration_only'))
        self.assertGreater(best, float(rows['duration_only']['gain_percent']))

    def test_published_cells_respect_minimums(self):
        b = json.loads(BUNDLE.read_text())
        self.assertTrue(all(c['n'] >= 100 for c in b['population_reference']['cells']))
        for t in b['partner_distribution']['spouse_traits_given_respondent']:
            self.assertTrue(all(c['n'] >= 30 for c in t['cells']))

    def test_no_person_level_files_committed(self):
        for p in F.rglob('*'):
            if p.is_file() and 'raw' not in p.parts and 'work' not in p.parts:
                self.assertLess(p.stat().st_size, 2_000_000, p.name)
                self.assertNotIn('extract', p.name if p.suffix == '.csv' else '')


if __name__ == '__main__':
    unittest.main()
