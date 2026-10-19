"""Prespecified crude rate ratios within common husband Q4 wages; respondent-cluster CIs."""
from pathlib import Path
import math,json
import pandas as pd
P=Path(__file__).resolve().parent;f=pd.read_csv(P/'spouse_pair_intervals.csv');f=f[f.husband_wage_band=='Q4'];O=[]
for sx in ['All','Men','Women']:
 s=f if sx=='All' else f[f.sex==sx]
 a=s[s.wife_wage_band=='Zero']
 for cat in ['Q1','Q2','Q3','Q4']:
  b=s[s.wife_wage_band==cat];Ea=(a.weight*a.event).sum();Ta=(a.weight*a.exposure).sum();Eb=(b.weight*b.event).sum();Tb=(b.weight*b.exposure).sum()
  if min(Ea,Eb)<=0:continue
  ra=Ea/Ta;rb=Eb/Tb;ua=(a.weight*(a.event-ra*a.exposure)/Ea).groupby(a.id).sum();ub=(b.weight*(b.event-rb*b.exposure)/Eb).groupby(b.id).sum();u=ua.subtract(ub,fill_value=0);G=len(u);se=math.sqrt(G/(G-1)*(u*u).sum());rr=ra/rb
  O.append(dict(reporting_sex=sx,husband_band='Q4',contrast='Wife zero vs wife '+cat,rate_ratio=rr,ci_low=rr*math.exp(-1.96*se),ci_high=rr*math.exp(1.96*se),zero_wife_events=int(a.event.sum()),comparison_events=int(b.event.sum()),caution='Crude within husband wage band; not adjusted for other characteristics'))
pd.DataFrame(O).to_csv(P/'high_husband_zero_wife_rate_ratios.csv',index=False);print(pd.DataFrame(O).query("reporting_sex=='All'").to_string(index=False))
