"""Feasibility/counts and contemporaneous ACS degree×occupation associations.
Original2023nationalZIP; no report edits; no prospective or idealprofile claims.
"""
from pathlib import Path
import zipfile,re,json
import pandas as pd,numpy as np
P=Path(__file__).resolve().parent;D=P.parent/'acs';W=['PWGTP']+[f'PWGTP{i}' for i in range(1,81)]
s=(D/'data_dictionary_2023.txt').read_text();i=s.index('OCCP         ');s=s[i:s.index('\nPAOC',i)]
m={int(c):p for c,p,n in re.findall(r'^\s*(\d{4})\s+\.([A-Z]+)-([^\n]+)',s,re.M)}
(P/'occupation_prefix_mapping.json').write_text(json.dumps(m,indent=2))
broad={'MGR':'Management/business/finance','BUS':'Management/business/finance','FIN':'Management/business/finance','CMM':'Computing/engineering/science','ENG':'Computing/engineering/science','SCI':'Computing/engineering/science','LGL':'Legal','EDU':'Education/library','MED':'Healthcare practitioners/technical','CMS':'Community/social services','ENT':'Arts/media'}
chunks=[];audit=[]
with zipfile.ZipFile(D/'csv_pus.zip') as z:
 for name in z.namelist():
  if not name.endswith('.csv'):continue
  for d in pd.read_csv(z.open(name),usecols=['AGEP','SEX','MAR','MARHD','ESR','SCHL','OCCP']+W,chunksize=100000):
   d=d[d.AGEP.between(30,64)&d.SCHL.isin([21,22,23,24])].copy()
   audit.append(dict(degree_adults=len(d),employed_degree_adults=int(d.ESR.isin([1,2]).sum())))
   d=d[d.ESR.isin([1,2])&(d.MAR.isin([1,4])|(d.MARHD==1))].copy()
   d['occupation']=d.OCCP.map(m).map(broad).fillna('Other occupations');d['degree']=d.SCHL.map({21:'Bachelor',22:'Master',23:'Professional degree',24:'Doctorate'});d['sex']=d.SEX.map({1:'Men',2:'Women'})
   keys=['sex','degree','occupation'];den=d.groupby(keys)[W].sum();num=d[d.MARHD==1].groupby(keys)[W].sum().reindex(den.index,fill_value=0)
   count=d.groupby(keys).size().rename('n');events=d[d.MARHD==1].groupby(keys).size().reindex(den.index,fill_value=0).rename('events');den.columns=['d_'+c for c in W];num.columns=['e_'+c for c in W];chunks.append(pd.concat([den,num,count,events],axis=1))
   print(name,len(chunks),flush=True)
a=pd.concat(chunks).groupby(level=[0,1,2]).sum();a.to_csv(P/'currently_employed_replicate_aggregate_totals.csv.gz');rows=[]
for (sex,degree,occ),b in a.iterrows():
 den=b[['d_'+c for c in W]].to_numpy(float);num=b[['e_'+c for c in W]].to_numpy(float);rate=num/den*100;se=np.sqrt(.05*np.sum((rate[1:]-rate[0])**2));rows.append(dict(sex=sex,degree=degree,occupation=occ,n=int(b.n),events=int(b.events),weighted_n=den[0],weighted_events=num[0],annual_event_percent=rate[0],se_pp=se,ci95_low=max(0,rate[0]-1.96*se),ci95_high=min(100,rate[0]+1.96*se),adequate_descriptive_support=bool(b.n>=100 and b.events>=20)))
r=pd.DataFrame(rows);r.to_csv(P/'currently_employed_degree_occupation_annual_descriptive.csv',index=False)
(P/'currently_employed_acs_audit.json').write_text(json.dumps(dict(total_eligible_n=int(r.n.sum()),total_events=int(r.events.sum()),cells=len(r),adequate_descriptive_cells=int(r.adequate_descriptive_support.sum()),occupation_codes=len(m),current_employment_only=True,standardization='None; crude contemporaneous annual event percentages, not prospective features',source_url='https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip',chunk_counts=audit),indent=2));print(r.to_string(index=False))
