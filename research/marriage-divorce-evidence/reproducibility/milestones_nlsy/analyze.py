"""First biological birth as a baseline landmark; original prospective intervals.
No report files are changed. Reproduce extract.py then analyze.py.
"""
from pathlib import Path
import json,math
import numpy as np,pandas as pd
P=Path(__file__).resolve().parent
cb=json.loads((P/'selected_codebook.json').read_text());lookup={(int(v['year']),v['name']):k for k,v in cb.items() if v['year'].isdigit()}
birth=pd.read_csv(P/'birth_baselines.csv').set_index('R0000100')
d=pd.read_csv(P.parent/'couple_profiles/couple_profile_input.csv');d=d[d.marriage_order_group=='First'].copy().reset_index(drop=True)
rows=[]
for r in d.itertuples():
 y=int(r.start_wave);rr=birth.loc[r.id];mm=rr[lookup[(y,f'C1DOB{str(y)[2:]}~M')]];yy=rr[lookup[(y,f'C1DOB{str(y)[2:]}~Y')]];age1=rr[lookup[(y,f'AGE1B{str(y)[2:]}')]]
 first=yy+(mm-.5)/12 if 1900<=yy<=2023 and 1<=mm<=12 else np.nan
 startmar=r.start-r.current_marriage_years
 status='Missing / invalid birth history';elapsed=np.nan;band=None
 if age1==-998:
  if np.isnan(first) and yy<0 and mm<0:status='No first biological birth by baseline';band='No first birth by baseline'
  else:status='Contradictory no-birth flag/date'
 elif not np.isnan(first):
  if first>r.start:status='Birth date after baseline'
  elif first<startmar:status='First biological birth before current first marriage'
  else:
   status='First biological birth within current first marriage';elapsed=r.start-first
   band=('0–4 years' if elapsed<5 else '5–12 years' if elapsed<13 else '13–17 years' if elapsed<18 else '18–24 years' if elapsed<25 else '25+ years')
 rows.append(dict(id=r.id,start_wave=y,birth_year=yy,birth_month=mm,age_first_birth_code=age1,first_biological_birth_date=first,current_marriage_start=startmar,first_birth_status=status,years_since_first_birth=elapsed,first_birth_band=band))
d=d.merge(pd.DataFrame(rows),on=['id','start_wave'],validate='one_to_one')
d.to_csv(P/'first_birth_interval_extract.csv',index=False)
coverage=d.groupby('first_birth_status',dropna=False).agg(intervals=('id','size'),respondents=('id','nunique'),events=('event','sum'),person_years=('exposure','sum')).reset_index();coverage.to_csv(P/'coverage.csv',index=False)

def rate(g):
 den=np.sum(g.weight*g.exposure);num=np.sum(g.weight*g.event);q=num/den;u=pd.DataFrame({'id':g.id,'u':g.weight*(g.event-q*g.exposure)/den}).groupby('id').u.sum();G=len(u);var=np.sum(u*u)*G/(G-1) if G>1 else np.nan;se=np.sqrt(var)
 if q>0 and np.isfinite(se):lo=q*np.exp(-1.96*se/q);hi=q*np.exp(1.96*se/q)
 else:lo=hi=np.nan
 return dict(intervals=len(g),respondents=G,events=int(g.event.sum()),person_years=g.exposure.sum(),weighted_person_years=den,rate_per_1000=1000*q,ci95_low=1000*lo,ci95_high=1000*hi,mean_baseline_age=np.average(g.age,weights=g.weight*g.exposure),mean_baseline_marriage_years=np.average(g.current_marriage_years,weights=g.weight*g.exposure),sparse=g.event.sum()<10)
results=[]
for sex in ['All','Men','Women']:
 s=d if sex=='All' else d[d.sex==sex]
 for band in ['No first birth by baseline','0–4 years','5–12 years','13–17 years','18–24 years','25+ years']:
  g=s[s.first_birth_band==band]
  if len(g):results.append(dict(sex=sex,first_birth_band=band,**rate(g)))
pd.DataFrame(results).to_csv(P/'annual_rates_by_first_birth_landmark.csv',index=False)
audit=dict(first_marriage_intervals=len(d),respondents=int(d.id.nunique()),events=int(d.event.sum()),years=sorted(map(int,d.start_wave.unique())),first_birth_asofbaseline=True,negative_no_birth_flag=-998,rate_ci='baseline weights, respondent-cluster ratio sandwich; approximate, not full survey design',selection='Existing complete-couple positive-wage profile-input sample; first marriages only; observed next interview, no2022-retention restriction',birth_legend='Respondent first biological child, not established common biological child or youngest child')
(P/'audit.json').write_text(json.dumps(audit,indent=2));print(coverage.to_string(index=False));print(pd.DataFrame(results).to_string(index=False))
