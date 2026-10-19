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

    def test_nsfg2002_family_matches_sklearn(self):
        self.run_node('nsfg2002_family.test.mjs')

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


if __name__ == '__main__':
    unittest.main()
