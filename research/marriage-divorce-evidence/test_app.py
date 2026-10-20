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

    def test_prewedding_lens_matches_sklearn(self):
        self.run_node('prewedding.test.mjs')

    def test_sipp_bundles(self):
        self.run_node('sipp.test.mjs')

    def test_acs_bundle(self):
        self.run_node('acs.test.mjs')

    def test_lens_adapters(self):
        self.run_node('adapters.test.mjs')

    def test_summary_across_lenses(self):
        self.run_node('summary.test.mjs')

    def test_nsfg_pooled_bundle(self):
        self.run_node('nsfg_pooled.test.mjs')

    def test_browser_trainer_matches_sklearn(self):
        self.run_node('train.test.mjs')

    def test_browser_trainer_parallel_folds(self):
        self.run_node('train_parallel.test.mjs')

    def test_newlywed_bundle(self):
        self.run_node('newlywed.test.mjs')

    def test_nlsy97_bundle(self):
        self.run_node('nlsy97.test.mjs')

    def test_canada_gss_bundle(self):
        self.run_node('canada_gss.test.mjs')

    def test_gss_panel_bundle(self):
        self.run_node('gss_panel.test.mjs')

    def test_nlsy79_first_marriage_bundle(self):
        self.run_node('nlsy79_first_marriage.test.mjs')

    def test_hcmst_bundle_matches_sklearn(self):
        self.run_node('hcmst.test.mjs')

    def test_hcmst_dating_bundles_match_sklearn(self):
        self.run_node('hcmst_dating.test.mjs')

    def test_nlsy97_cohab_bundles_match_sklearn(self):
        self.run_node('nlsy97_cohab.test.mjs')

    def test_lenses_and_scenarios(self):
        self.run_node('lenses.test.mjs')

    def test_before_the_wedding_stage(self):
        self.run_node('stage.test.mjs')

    def test_before_the_wedding_lens_in_the_app(self):
        self.run_node('prewedding_app.test.mjs')

    def test_dating_couple_chain(self):
        self.run_node('dating.test.mjs')

    def test_per_partner_explanations(self):
        self.run_node('explain_rows.test.mjs')

    def test_population_comparison(self):
        self.run_node('population.test.mjs')

    def test_batch_and_candidates(self):
        self.run_node('batch.test.mjs')

    def test_dashboard(self):
        self.run_node('dashboard.test.mjs')

    def test_compare_scenarios(self):
        self.run_node('scenarios.test.mjs')

    def test_profile_report(self):
        self.run_node('report.test.mjs')

    def test_satisfaction_by_duration_chart(self):
        self.run_node('satisfaction.test.mjs')

    def test_dating_length_evidence(self):
        self.run_node('dating-length.test.mjs')

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

    def test_hcmst_dating_audit_and_incidence(self):
        import csv, json
        src = self.SRC / 'hcmst_dating_to_marriage'
        audit = json.loads((src / 'sample_audit.json').read_text())
        self.assertEqual(audit['couples_unmarried_2009'], 1081)
        self.assertEqual(sum(audit['fates'].values()), 1081)
        self.assertEqual(audit['fates']['married'], audit['marriages'])
        self.assertEqual(sum(audit['after_marriage'].values()), audit['marriages'])
        for t in ('marriage', 'breakup'):
            b = json.loads((APP / 'models' / f'hcmst_dating_{t}.json').read_text())
            self.assertEqual(b['training']['couple_periods'], audit['couple_periods'])
            self.assertEqual(b['stage'], 'before')
        rows = {r['group']: r for r in csv.DictReader(open(src / 'cumulative_incidence.csv'))}
        allc = rows['All unmarried couples']
        self.assertLess(float(allc['married_by_8.4y']) + float(allc['broke_up_by_8.4y']), 1)
        self.assertGreater(float(rows['relationship_quality: Excellent']['married_by_8.4y']),
                           float(rows['relationship_quality: Fair']['married_by_8.4y']))

    def test_hcmst_dating_external_validation_2017(self):
        import csv, json
        src = self.SRC / 'hcmst_dating_to_marriage'
        rows = list(csv.DictReader(open(src / 'external_validation_hcmst2017.csv')))
        self.assertEqual(len(rows), 12)  # 2 windows x 2 outcomes x 3 models
        audit = json.loads((src / 'sample_audit.json').read_text())['hcmst2017']
        self.assertEqual(audit['unmarried_couples'], 777)
        for r in rows:
            if r['model'] == 'additive_harmonized':
                self.assertGreater(float(r['auc']), 0.7, r)  # the 2009 model ranks 2017 couples
                self.assertLess(abs(float(r['observed_share_weighted']) - float(r['predicted_share_weighted'])), 0.05, r)
            yr = r['window'][-4:]
            key = ('married_by_' if r['outcome'] == 'married' else 'broke_up_by_') + yr
            self.assertEqual(int(r['events']), audit[key])

    def test_nlsy97_cohabitation_audit(self):
        import csv, json
        src = self.SRC / 'nlsy97_cohabitation_to_marriage'
        audit = json.loads((src / 'sample_audit.json').read_text())
        self.assertEqual(audit['respondents'], 8984)  # NLSY97 round-1 sample
        self.assertEqual(sum(audit['events'].values()), audit['first_cohabitations'])
        for t, key in (('married', 'nlsy97_cohab_marriage'), ('split', 'nlsy97_cohab_split')):
            b = json.loads((APP / 'models' / f'{key}.json').read_text())
            self.assertEqual(b['training']['events'], audit['events'][t])
            self.assertEqual(b['stage'], 'before')
        allc = next(r for r in csv.DictReader(open(src / 'cumulative_incidence.csv')) if r['group'] == 'All first cohabitations')
        self.assertLess(float(allc['married_by_10y']) + float(allc['split_by_10y']), 1)

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


class DecisionEvidenceTests(unittest.TestCase):
    """app/data/decision_evidence.json traces to verified, quoted records whose numbers re-check
    mechanically (quotes against cached source texts when present; repo sources always)."""
    DIR = APP.parent / 'reproducibility' / 'decision_evidence'

    @classmethod
    def setUpClass(cls):
        import importlib.util, json
        spec = importlib.util.spec_from_file_location('decision_build', cls.DIR / 'scripts' / 'build.py')
        cls.build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.build)
        cls.app = json.loads((APP / 'data' / 'decision_evidence.json').read_text())
        cls.ev = {r['id']: r for r in json.loads((cls.DIR / 'evidence.json').read_text())['records']}
        cls.lit = {r['id']: r for r in json.loads((APP.parent / 'reproducibility' / 'literature_evidence' / 'evidence.json').read_text())['records']}
        cls.dois = json.loads((cls.DIR / 'doi_check.json').read_text())

    def test_app_records_trace_to_verified_quoted_evidence(self):
        recs = self.app['interventions'] + self.app['design_standards']
        self.assertGreaterEqual(len(self.app['interventions']), 30)
        for r in recs:
            src = self.ev[r['id']]
            self.assertTrue(src['verified'], r['id'])
            self.assertTrue(r['quote'] and r['quote'] == src['quote'], r['id'])
            self.assertIn(r['provenance'], {'primary', 'abstract', 'secondhand', 'project_analysis'})
            for k in ('estimate', 'ci_low', 'ci_high', 'range_low', 'range_high'):
                self.assertEqual(r.get(k), src.get(k), (r['id'], k))
            if r.get('doi'):
                self.assertEqual(self.dois[r['doi']]['status'], 'ok', r['id'])

    def test_numbers_recheck_mechanically(self):
        srcs = self.build.sources_for()
        checked_quotes = 0
        for r in self.ev.values():
            res = self.build.check(r, srcs)
            self.assertEqual(res['values'], 'ok', (r['id'], res['problems']))
            if srcs[r['source']].available:
                checked_quotes += 1
                self.assertEqual((res['quote'], res['numbers']), ('ok', 'ok'), (r['id'], res['problems']))
                self.assertNotIn('fail', res['extra_quotes'], (r['id'], res['problems']))
            if r['provenance'] == 'project_analysis':   # repo sources are always available
                self.assertTrue(srcs[r['source']].available, r['id'])
        self.assertGreaterEqual(checked_quotes, 5)

    def test_factor_grades_cover_app_factors_and_copy_verified_numbers(self):
        need = {'age_at_marriage', 'education_completion', 'cohabitation_before_marriage', 'premarital_birth_timing', 'religious_attendance',
                'income_employment', 'debt_finances', 'relationship_education', 'counselling_therapy', 'conflict_behaviour'}
        grades = {g['factor']: g for g in self.app['factor_grades']}
        self.assertEqual(set(grades), need)
        order = ['experimental', 'quasi_experimental', 'prospective_observational_adjusted', 'cross_sectional']
        for g in grades.values():
            self.assertIn(g['strongest_design'], order)
            self.assertTrue(g['evidence'])
            for e in g['evidence']:
                kind, rid = e['ref'].split(':', 1)
                src = (self.ev if kind == 'decision' else self.lit)[rid]
                self.assertTrue(src['verified'], e['ref'])
                self.assertEqual(e['quote'], src['quote'], e['ref'])
                self.assertEqual(e.get('estimate'), src.get('estimate'), e['ref'])
        self.assertEqual(grades['relationship_education']['strongest_design'], 'experimental')
        self.assertEqual(grades['cohabitation_before_marriage']['strongest_design'], 'prospective_observational_adjusted')

    def test_design_md_cites_existing_records(self):
        import re
        text = (self.DIR / 'DESIGN.md').read_text()
        cited = set(re.findall(r'\b([A-Z][A-Za-z]+\d{4}_[A-Za-z0-9_]+)', text))
        self.assertGreaterEqual(len(cited), 10)
        self.assertFalse(cited - set(self.ev), cited - set(self.ev))


if __name__ == '__main__':
    unittest.main()
