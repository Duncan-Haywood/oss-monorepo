"""Exclude allocated divorce answers; age standard changes with restricted eligible sample."""
from pathlib import Path
import numpy as np,pandas as pd
ROOT=Path(__file__).resolve().parent
W=['PWGTP']+['PWGTP'+str(i) for i in range(1,81)]
d=pd.read_parquet(ROOT/'persons_30_64.parquet',columns=['sex','education','age_bin','MAR','MARHD','FMARHDP']+W)
r=[]
for label,mask in [('baseline',d.MAR!=5),('exclude_allocated_MARHD',(d.MAR!=5)&(d.FMARHDP==0))]:
 p=d[mask]
 std=p.groupby('age_bin')[W].sum().to_numpy();std=std/std.sum(axis=0)
 for (sex,education),g in p.groupby(['sex','education']):
  den=g.groupby('age_bin')[W].sum().to_numpy();num=g[g.MARHD==1].groupby('age_bin')[W].sum().reindex(range(7),fill_value=0).to_numpy()
  v=(num/den*std).sum(axis=0);se=np.sqrt(.05*np.sum((v[1:]-v[0])**2))
  r.append(dict(sensitivity=label,sex=sex,education=education,proportion=v[0],se=se,ci95_low=max(0,v[0]-1.96*se),ci95_high=min(1,v[0]+1.96*se),unweighted_n=len(g)))
pd.DataFrame(r).to_csv(ROOT/'sensitivity_exclude_allocated.csv',index=False)
