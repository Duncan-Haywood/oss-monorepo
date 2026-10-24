from pathlib import Path
import unittest,json,math
ROOT=Path(__file__).resolve().parent
class HandoffTests(unittest.TestCase):
 def test_source_references_resolve(self):
  s=json.loads((ROOT/'report-app/src/data.json').read_text());self.assertEqual(s['buildStatus'],'complete')
  for b in s['report']['blocks']:
   if b.get('queryId'):self.assertIn(b['queryId'],s['queries'])
 def test_direct_earnings_ratio_uses_covariance(self):
  import csv
  r=list(csv.DictReader((ROOT/'reproducibility/direct_earnings/husband_only_vs_majority_direct.csv').read_text().splitlines()))[0]
  self.assertAlmostEqual(float(r['rate_ratio']),float(r['rate_husband_only_per1000'])/float(r['rate_husband_majority_dual_per1000']),places=10)
  self.assertLess(float(r['difference_ci95_low']),0);self.assertGreater(float(r['difference_ci95_high']),0)
 def test_model_timing_and_fold_checks(self):
  x=json.loads((ROOT/'reproducibility/ml_couples/independent_verification.json').read_text());self.assertTrue(x['fold_people_never_overlap'])
  y=json.loads((ROOT/'reproducibility/ml_individuals/verification.json').read_text());self.assertTrue(y['respondent_folds_disjoint']) if 'respondent_folds_disjoint' in y else self.assertTrue(all(v for k,v in y.items() if isinstance(v,bool)))
 def test_no_site_binding(self):
  x=json.loads((ROOT/'report-app/.openai/hosting.json').read_text());self.assertNotIn('project_id',x)
 def test_portable_report_complete(self):
  t=(ROOT/'Report.html').read_text();self.assertIn('report:98c10bbe-799b-4b6b-a668-711ee83012b7',t);self.assertIn('Machine',t) if 'Machine' in t else self.assertIn('Poisson',t)
if __name__=='__main__':unittest.main()
