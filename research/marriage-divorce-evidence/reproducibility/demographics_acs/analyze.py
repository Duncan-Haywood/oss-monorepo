"""Original ACS2023 demographic event-composition and annual event analysis.
Reads original national person ZIP in ../acs; all80 person SDR replicates.
"""
from pathlib import Path
import zipfile,json,hashlib
import numpy as np,pandas as pd
P=Path(__file__).resolve().parent;Z=P.parent/'acs/csv_pus.zip'
W=['PWGTP']+[f'PWGTP{i}' for i in range(1,81)]
C=['AGEP','SEX','MAR','MARHD','HISP','RAC1P','NATIVITY','CIT','POBP','YOEP','WAOB']+W
chunks=[];checks=[]
with zipfile.ZipFile(Z) as z:
 for fname in z.namelist():
  if not fname.endswith('.csv'):continue
  for d in pd.read_csv(z.open(fname),usecols=C,chunksize=100000):
   d=d[d.AGEP.between(30,64)].copy();d['age_sex']=(d.SEX-1)*7+((d.AGEP-30)//5)
   d['risk']=d.MAR.isin([1,4])|(d.MARHD==1);d['event']=d.MARHD==1
   d['race_ethnicity']=np.where(d.HISP!=1,'Hispanic, any race',d.RAC1P.map({1:'NH White alone',2:'NH Black alone',3:'NH American Indian / Alaska Native alone',4:'NH American Indian / Alaska Native alone',5:'NH American Indian / Alaska Native alone',6:'NH Asian alone',7:'NH Native Hawaiian / Pacific Islander alone',8:'NH Some other race alone',9:'NH Two or more races'}))
   d['nativity']=d.NATIVITY.map({1:'Native',2:'Foreign born'})
   d['citizenship']=d.CIT.map({1:'Born in U.S.',2:'Born in U.S. territories',3:'Born abroad to U.S. citizen parent(s)',4:'Naturalized U.S. citizen',5:'Not a U.S. citizen'})
   d['entry_duration']=np.where(d.NATIVITY==2,pd.cut(2023-d.YOEP,[-1,4,9,19,200],labels=['Foreign born: 0–4 years','Foreign born: 5–9 years','Foreign born: 10–19 years','Foreign born: 20+ years']).astype('str'),None)
   d['birth_region']=np.where(d.NATIVITY==2,d.WAOB.map({1:'U.S. states',2:'U.S. territories',3:'Latin America',4:'Asia',5:'Europe',6:'Africa',7:'Northern America',8:'Oceania / at sea'}),None)
   checks.append(dict(n=len(d),events=int(d.event.sum()),risk_n=int(d.risk.sum()),foreign_n=int((d.NATIVITY==2).sum()),foreign_missing_entry=int(((d.NATIVITY==2)&d.YOEP.isna()).sum())))
   for dim in ['overall','race_ethnicity','nativity','citizenship','entry_duration','birth_region']:
    dd=d.copy();dd['group']='All' if dim=='overall' else d[dim];dd=dd[dd.group.notna()]
    for pop,mask in [('all_adults',np.ones(len(dd),bool)),('at_risk_approx',dd.risk)]:
     s=dd[mask];keys=['group','age_sex'];den=s.groupby(keys,observed=True)[W].sum();num=s[s.event].groupby(keys,observed=True)[W].sum().reindex(den.index,fill_value=0)
     un=s.groupby(keys,observed=True).size().rename('n');ev=s[s.event].groupby(keys,observed=True).size().reindex(den.index,fill_value=0).rename('events')
     den.columns=['d_'+c for c in W];num.columns=['e_'+c for c in W]
     tab=pd.concat([den,num,un,ev],axis=1).reset_index();tab['dimension']=dim;tab['population']=pop;chunks.append(tab)
   print(fname,'chunk',len(checks),'n',len(d),flush=True)
a=pd.concat(chunks).groupby(['dimension','population','group','age_sex'],observed=True).sum(numeric_only=True)
a.to_csv(P/'age_sex_cell_totals.csv.gz')

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
(P/'checks.json').write_text(json.dumps({'chunks':checks,'n':sum(c['n'] for c in checks),'events':sum(c['events'] for c in checks),'risk_n':sum(c['risk_n'] for c in checks),'source':str(Z),'zip_sha256':hashlib.file_digest(open(Z,'rb'),'sha256').hexdigest()},indent=2))
print(pd.DataFrame(rows).query("population=='at_risk_approx' and measure=='annual_event_percent_age_sex_standardized'").to_string(index=False))
