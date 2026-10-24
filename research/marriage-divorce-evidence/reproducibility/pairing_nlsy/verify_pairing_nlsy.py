"""Independent output audit using Python standard library."""
import csv,json,math,collections,pathlib
P=pathlib.Path(__file__).resolve().parent;rows=list(csv.DictReader(open(P/'spouse_pair_intervals.csv')));est=list(csv.DictReader(open(P/'pairing_crude_rates.csv')));audit=json.load(open(P/'pairing_audit.json'))
assert len(rows)==audit['confirmed_coresident_opposite_sex_intervals']
checks=[]
for target in est:
 if target['reporting_sex']!='All':continue
 S=[r for r in rows if r[target['factor']]==target['category']];rate=math.fsum(float(r['weight'])*int(r['event']) for r in S)/math.fsum(float(r['weight'])*float(r['exposure']) for r in S)*1000
 assert abs(rate-float(target['rate_per_1000']))<1e-9
 checks.append(target['factor']+'='+target['category'])
for r in rows:
 if r['earnings_pair']:
  h=float(r['husband_wages']);w=float(r['wife_wages']);total=float(r['couple_wages']);assert min(h,w)>=0;assert abs(total-h-w)<1e-7
  if total>0:assert abs(float(r['wife_wage_share'])-w/total)<1e-10
 if r['current_marriage_years']:assert 0<=float(r['current_marriage_years'])<=100
for label,m in json.load(open(P/'pairing_model_audit.json')).items():
 assert m['rank']==m['parameters'];assert m['normalized_max_score']<1e-9;assert abs(m['fitted_count']-m['observed_count'])<1e-7
out={'interval_count':len(rows),'verified_rate_groups':checks,'checks':'Passed independent weighted-rate arithmetic, component earnings/share arithmetic, duration bounds, full-rank model, likelihood score, fitted-count checks.'};json.dump(out,open(P/'pairing_verification.json','w'),indent=2);print(json.dumps(out,indent=2))
