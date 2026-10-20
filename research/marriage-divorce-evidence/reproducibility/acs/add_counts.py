from pathlib import Path
import pandas as pd
ROOT=Path(__file__).resolve().parent
p=pd.read_parquet(ROOT/'persons_30_64.parquet',columns=['sex','education','income_group','employment','MAR','MARHD'])
r=pd.read_csv(ROOT/'results.csv')
counts=[]
for variable in ['education','income_group','employment']:
 for outcome in r.outcome.unique():
  d=p[p.MAR!=5] if outcome!='annual_all_adults' else p
  for (sex,g),s in d.groupby(['sex',variable],observed=True):
   event=(s.MARHD==1) if outcome.startswith('annual') else (s.MAR==3)
   counts.append(dict(variable=variable,outcome=outcome,sex=sex,group=g,unweighted_denominator_n=len(s),unweighted_numerator_n=int(event.sum())))
r=r.drop(columns=['unweighted_denominator_n','unweighted_numerator_n'],errors='ignore').merge(pd.DataFrame(counts),on=['variable','outcome','sex','group'],validate='many_to_one')
r.to_csv(ROOT/'results.csv',index=False)
print('Added counts',len(r))
