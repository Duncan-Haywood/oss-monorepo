from pathlib import Path
import numpy as np,pandas as pd
P=Path(__file__).resolve().parent
W=['PWGTP']+[f'PWGTP{i}' for i in range(1,81)]
a=pd.read_csv(P/'age_sex_cell_totals.csv.gz').set_index(['dimension','population','group','age_sex'])
def ci(v,percent=False,ratio=False):
 if ratio:
  lv=np.log(v);se=np.sqrt(.05*np.sum((lv[1:]-lv[0])**2));return dict(estimate=v[0],se_log=se,ci95_low=np.exp(lv[0]-1.96*se),ci95_high=np.exp(lv[0]+1.96*se))
 v=v*(100 if percent else 1);se=np.sqrt(.05*np.sum((v[1:]-v[0])**2));return dict(estimate=v[0],se=se,ci95_low=max(0,v[0]-1.96*se),ci95_high=min(100 if percent else np.inf,v[0]+1.96*se))
rows=[]
for pop in ['all_adults','at_risk_approx']:
 total=a.loc[('overall',pop,'All')];Td=total[['d_'+c for c in W]].to_numpy();Te=total[['e_'+c for c in W]].to_numpy();standard=Td/Td.sum(axis=0)
 for (dim,pp,g),b in a.groupby(level=['dimension','population','group']):
  if pp!=pop:continue
  b=b.droplevel([0,1,2]).reindex(range(14)).fillna(0);D=b[['d_'+c for c in W]].to_numpy();E=b[['e_'+c for c in W]].to_numpy()
  n=int(b.n.sum());events=int(b.events.sum());raw=E.sum(axis=0)/D.sum(axis=0)
  if len(b)==14 and np.all(D>0):std=((E/D)*standard).sum(axis=0)
  else:std=None
  meta=dict(dimension=dim,population=pop,group=g,n=n,events=events,weighted_n=D[:,0].sum(),weighted_events=E[:,0].sum(),min_age_sex_n=int(b.n.min()),sparse=events<100 or b.n.min()<30)
  for measure,v,pct,ratio in [('annual_event_percent_crude',raw,True,False),('population_share_percent',D.sum(axis=0)/Td.sum(axis=0),True,False),('divorce_event_share_percent',E.sum(axis=0)/Te.sum(axis=0),True,False),('event_composition_representation_ratio',(E.sum(axis=0)/Te.sum(axis=0))/(D.sum(axis=0)/Td.sum(axis=0)),False,True)]:
   rows.append(dict(**meta,measure=measure,**ci(v,pct,ratio)))
  if std is not None:rows.append(dict(**meta,measure='annual_event_percent_age_sex_standardized',**ci(std,True)))
pd.DataFrame(rows).to_csv(P/'results.csv',index=False)
