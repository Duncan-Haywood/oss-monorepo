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

    def test_fair_bundles_match_sklearn(self):
        self.run_node('fair.test.mjs')

    def test_mortality_competing_risks(self):
        self.run_node('mortality.test.mjs')

    def test_ood_score_matches_python(self):
        self.run_node('ood.test.mjs')

    def test_nsfg_pooled_bundle(self):
        self.run_node('nsfg_pooled.test.mjs')

    def test_canada_gss_bundle(self):
        self.run_node('canada_gss.test.mjs')

    def test_gss_panel_bundle(self):
        self.run_node('gss_panel.test.mjs')

    def test_nlsy79_first_marriage_bundle(self):
        self.run_node('nlsy79_first_marriage.test.mjs')

    def test_hcmst_bundle_matches_sklearn(self):
        self.run_node('hcmst.test.mjs')

    def test_lenses_and_scenarios(self):
        self.run_node('lenses.test.mjs')

    def test_population_comparison(self):
        self.run_node('population.test.mjs')

    def test_batch_and_candidates(self):
        self.run_node('batch.test.mjs')

    def test_dashboard(self):
        self.run_node('dashboard.test.mjs')

    def test_literature_adjustment(self):
        self.run_node('literature.test.mjs')

    def test_literature_ui_and_nchs_baselines(self):
        self.run_node('literature_ui.test.mjs')

    def test_literature_derivations_recompute(self):
        script = APP.parent / 'reproducibility' / 'literature_evidence' / 'scripts' / 'verify_quotes.py'
        r = subprocess.run(['python3', str(script)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout[-2000:] + r.stderr[-2000:])


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

    def test_population_reference_is_aggregate(self):
        import json
        for name in ('nsfg2002_first_marriage', 'nsfg2002_family'):
            ref = json.loads((APP / 'models' / f'{name}.json').read_text())['population_reference']
            self.assertEqual(ref['overall']['n'], 4126)
            self.assertEqual(len(ref['overall']['quantiles']), 99)
            for cells in ref['subgroups'].values():
                for cell in cells.values():
                    self.assertGreaterEqual(cell['n'], 100)


class HcmstBundleTests(unittest.TestCase):
    def test_bundle_agrees_with_audit_and_tables(self):
        import csv, json
        src = APP.parent / 'reproducibility' / 'hcmst'
        audit = json.loads((src / 'sample_audit.json').read_text())
        bundle = json.loads((APP / 'models' / 'hcmst_couples.json').read_text())
        # Stanford's documented counts (user guide v5; data.stanford.edu/hcmst2017).
        self.assertEqual(audit['hcmst2009']['respondents'], 4002)
        self.assertEqual(audit['hcmst2009']['partnered_qflag'], 3009)
        self.assertEqual(audit['hcmst2017']['partnered_2017'], 2862)
        self.assertTrue(audit['hcmst2009']['breakups_matching_w2345_combo_plus_w6'])
        self.assertEqual(bundle['training']['couples'], 3009)
        self.assertEqual(bundle['training']['events'], audit['hcmst2009']['breakups'])
        events = list(csv.DictReader(open(src / 'events_by_period.csv')))
        self.assertEqual(sum(int(r['breakups']) for r in events), bundle['training']['events'])
        self.assertEqual(sum(int(r['person_periods']) for r in events), bundle['training']['person_periods'])
        rates = {r['group']: r for r in csv.DictReader(open(src / 'breakup_rates_by_group.csv'))}
        self.assertGreater(float(rates['Quality: Poor or very poor']['unweighted_by_2017']),
                           float(rates['Quality: Excellent']['unweighted_by_2017']))
        self.assertGreater(float(rates['Unmarried']['unweighted_by_2017']), float(rates['Married']['unweighted_by_2017']))
        for m in bundle['models']:
            if m['key'] != 'period_only':
                lo, hi = m['heldout']['c_index_ci']
                self.assertLess(lo, m['heldout']['c_index'])
                self.assertLess(m['heldout']['c_index'], hi)
        for cells in bundle['population_reference']['models'].values():
            for c in cells:
                self.assertGreaterEqual(c['n'], 50)


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


class GssPanelBundleTests(unittest.TestCase):
    SRC = APP.parent / 'reproducibility' / 'gss_panel'

    def test_bundle_agrees_with_audit_and_rates(self):
        import csv, json
        audit = json.loads((self.SRC / 'sample_audit.json').read_text())
        # NORC's documented panel sizes (release notes; 2016-2020 codebook Table 2).
        self.assertEqual(audit['panel_2006_documented_counts_verified'], {'1': 2000, '2': 1536, '3': 1276})
        self.assertEqual(audit['panel_2008_documented_counts_verified'], {'1': 2023, '2': 1581, '3': 1295})
        self.assertEqual(audit['panel_2010_documented_counts_verified'], {'1': 2044, '2': 1551, '3': 1304})
        self.assertEqual(audit['panel_2020_documented_counts_verified'], {'1a': 2867, '1b': 2348, '2': 1823})
        bundle = json.loads((APP / 'models' / 'gss_panel_marriages.json').read_text())
        self.assertEqual(bundle['training']['events'], audit['two_year']['events'])
        self.assertEqual(bundle['training']['records'], audit['two_year']['records'])
        rows = [r for r in csv.DictReader(open(self.SRC / 'hapmar_dissolution_rates.csv'))
                if r['variant'] == 'main' and r['horizon'] == '2']
        self.assertEqual(sum(int(r['events']) for r in rows), audit['two_year']['events'])
        rate = {r['level']: float(r['weighted_rate']) for r in rows}
        self.assertGreater(rate['Not too happy'], rate['Pretty happy'])
        self.assertGreater(rate['Pretty happy'], rate['Very happy'])
        best = max(m['heldout']['logloss_improvement_percent'] for m in bundle['models'])
        self.assertGreater(best, 0)
        for cells in bundle['population_reference']['horizon_2']['subgroups'].values():
            for cell in cells.values():
                self.assertGreaterEqual(cell['respondents'], 100)


if __name__ == '__main__':
    unittest.main()
