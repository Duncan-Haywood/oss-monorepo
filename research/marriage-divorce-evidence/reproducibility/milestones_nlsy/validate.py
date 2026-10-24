from pathlib import Path
import pandas as pd,numpy as np,json
P=Path(__file__).resolve().parent;d=pd.read_csv(P/'first_birth_interval_extract.csv');s=d[d.first_birth_status=='First biological birth within current first marriage'];c=d[d.first_birth_band=='No first birth by baseline']
checks=dict(first_marriage_only=bool((d.marriage_order_group=='First').all()),same_wave_only=bool(d.start_wave.between(2000,2020).all()),no_future_births=bool((s.first_biological_birth_date<=s.start+1e-9).all()),birth_within_current_marriage=bool((s.first_biological_birth_date>=s.current_marriage_start-1e-9).all()),childless_explicit_flag=bool((c.age_first_birth_code==-998).all()),childless_dates_negative=bool(((c.birth_year<0)&(c.birth_month<0)).all()),key_unique=not bool(d.duplicated(['id','start_wave']).any()),positive_exposure=bool((d.exposure>0).all()))
r=pd.read_csv(P/'annual_rates_by_first_birth_landmark.csv');a=r[r.sex=='All'];eligible=d[d.first_birth_band.notna()];checks['event_partition']=int(a.events.sum())==int(eligible.event.sum());checks['interval_partition']=int(a.intervals.sum())==len(eligible)
assert all(checks.values())
# Independently recompute the displayed point estimates from arithmetic weighted totals.
errs=[]
for z in a.itertuples():
 g=d[d.first_birth_band==z.first_birth_band];q=1000*np.dot(g.weight,g.event)/np.dot(g.weight,g.exposure);errs.append(abs(q-z.rate_per_1000))
checks['point_max_abs_error']=max(errs);assert max(errs)<1e-10
(P/'validation.json').write_text(json.dumps(checks,indent=2));print(json.dumps(checks,indent=2))
