"""Matched-replicate graduate minus BA direct-age-standardized annual proportions.
Requires age_cell_weighted_totals.csv.gz from analyze_acs.py. All units percentage points.
"""
from pathlib import Path
import numpy as np,pandas as pd
from scipy.stats import norm
ROOT=Path(__file__).resolve().parent
W=['PWGTP']+['PWGTP'+str(i) for i in range(1,81)]
a=pd.read_csv(ROOT/'age_cell_weighted_totals.csv.gz')
a=a[(a.variable=='education')&(a.outcome=='annual_ever_married')]
D=['d_'+c for c in W];N=['n_'+c for c in W]
std=a.groupby('age_bin')[D].sum().to_numpy(float);std/=std.sum(axis=0)
rows=[]
for sex in ['Men','Women']:
 rates={}
 for education,g in a[a.sex==sex].groupby('group'):
  g=g.sort_values('age_bin'); assert len(g)==7
  rates[education]=(g[N].to_numpy()/g[D].to_numpy()*std).sum(axis=0)
 for education in ['Master','Professional','Doctorate']:
  v=100*(rates[education]-rates['Bachelor']);se=np.sqrt(.05*((v[1:]-v[0])**2).sum())
  rows.append(dict(sex=sex,contrast=education+' minus Bachelor',difference_pp=v[0],se_pp=se,ci95_low_pp=v[0]-1.96*se,ci95_high_pp=v[0]+1.96*se,p_two_sided=2*norm.sf(abs(v[0]/se)),method='matched 80 SDR replicates; pooled ever-married age 30-64 standard'))
pd.DataFrame(rows).to_csv(ROOT/'degree_contrasts.csv',index=False)
print(pd.DataFrame(rows).to_string(index=False))
