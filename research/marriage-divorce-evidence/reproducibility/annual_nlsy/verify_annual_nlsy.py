"""Independent standard-library checks against saved primary interval and result files."""
import csv,json,math,pathlib,collections
P=pathlib.Path(__file__).resolve().parent/'legally_married_primary'
R=list(csv.DictReader(open(P/'nlsy_annual_intervals.csv')));T=list(csv.DictReader(open(P/'annual_crude_rates.csv')));out={}
for sx in ['All','Men','Women']:
 s=[r for r in R if sx=='All' or r['sex']==sx];wE=math.fsum(float(r['weight'])*int(r['event']) for r in s);wY=math.fsum(float(r['weight'])*float(r['exposure']) for r in s);calc=wE/wY*1000;stored=next(float(r['rate_per_1000']) for r in T if r['sex']==sx and r['factor']=='All');assert abs(calc-stored)<1e-9
 out[sx]={'independent_rate_per_1000':calc,'saved_rate':stored,'events':sum(int(r['event']) for r in s),'unweighted_person_years':math.fsum(float(r['exposure']) for r in s)}
for r in R:
 assert r['baseline_status'] in ['Married','Separated']
 assert abs(float(r['exposure'])-(float(r['stop'])-float(r['start'])))<1e-9
 assert not (int(r['event']) and int(r['widow']))
 assert float(r['weight'])>0
for name in ['annual_model_audit.json','annual_model_without_separation_state_audit.json']:
 m=json.load(open(P/name))
 for sx,a in m.items():
  assert a['matrix_rank']==a['parameters'];assert a['max_normalized_score']<1e-9;assert abs(a['weighted_observed_events']-a['weighted_fitted_events'])<1e-7
out['checks']='Passed exposure, endpoint, independent crude-rate, full-rank, score, and fitted-count checks.'
json.dump(out,open(P/'independent_verification.json','w'),indent=2);print(json.dumps(out,indent=2))
