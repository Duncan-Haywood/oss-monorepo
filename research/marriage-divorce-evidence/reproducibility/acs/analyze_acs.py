"""Original 2023 ACS PUMS analysis. Run python3 analyze_acs.py from its folder.
Downloads national original ZIP if absent. Retains all 80 person replicate weights.
"""
from pathlib import Path
import json, zipfile, urllib.request, hashlib
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parent
URL='https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip'
p=ROOT/'csv_pus.zip'
if not p.exists(): urllib.request.urlretrieve(URL,p)
W=['PWGTP']+['PWGTP'+str(i) for i in range(1,81)]
cols=['SERIALNO','SPORDER','STATE','AGEP','SEX','SCHL','MAR','MARHD','MARHT','MARHM','MARHW','MARHYP','PINCP','PERNP','ADJINC','ESR','WKHP','WKWN','RELSHIPP','HISP','RAC1P','FMARHDP','FSCHLP']+W
edu={**{i:'Less than high school' for i in range(1,16)},16:'High school/GED',17:'High school/GED',18:'Some college',19:'Some college',20:'Associate',21:'Bachelor',22:'Master',23:'Professional',24:'Doctorate'}
writer=None; chunks=[]; pairs=[]
with zipfile.ZipFile(p) as z:
 for f in z.namelist():
  if not f.endswith('.csv'): continue
  print('Reading',f,flush=True)
  for d in pd.read_csv(z.open(f),usecols=cols,chunksize=100000,dtype={'SERIALNO':'string'}):
   pair=d[d.RELSHIPP.isin([20,21,23])].copy(); pairs.append(pair)
   d=d[d.AGEP.between(30,64)].copy()
   d['education']=d.SCHL.map(edu); d['sex']=d.SEX.map({1:'Men',2:'Women'})
   d['age_bin']=((d.AGEP-30)//5).astype('int8')
   d['income_2023']=d.PINCP*d.ADJINC/1e6
   d['income_group']=pd.cut(d.income_2023,[-np.inf,0,25000,50000,75000,100000,150000,200000,np.inf],labels=['Zero/negative','1-24,999','25,000-49,999','50,000-74,999','75,000-99,999','100,000-149,999','150,000-199,999','200,000+']).astype('str')
   d['employment']=d.ESR.map({1:'Employed',2:'Employed',3:'Unemployed',4:'Armed forces',5:'Armed forces',6:'Not in labor force'})
   for c in W: d[c]=d[c].astype('int32')
   tab=pa.Table.from_pandas(d,preserve_index=False)
   if writer is None: writer=pq.ParquetWriter(ROOT/'persons_30_64.parquet',tab.schema,compression='zstd')
   writer.write_table(tab)
   # Keep aggregates only in RAM. Each record contributes to count and each outcome numerator.
   for variable in ['education','income_group','employment']:
    for outcome, mask in [('annual_ever_married',(d.MAR!=5)),('current_divorced_ever_married',(d.MAR!=5)),('annual_all_adults',np.ones(len(d),dtype=bool))]:
     sub=d[mask].copy(); sub['group']=sub[variable]; sub['variable']=variable;sub['outcome']=outcome
     yy=(sub.MARHD==1) if outcome.startswith('annual') else (sub.MAR==3)
     den=sub.groupby(['variable','outcome','sex','group','age_bin'],observed=True)[W].sum()
     num=sub.loc[yy].groupby(['variable','outcome','sex','group','age_bin'],observed=True)[W].sum().reindex(den.index,fill_value=0)
     den.columns=['d_'+c for c in W];num.columns=['n_'+c for c in W]
     chunks.append(pd.concat([den,num],axis=1))
writer.close()
a=pd.concat(chunks).groupby(level=[0,1,2,3,4]).sum();a.to_csv(ROOT/'age_cell_weighted_totals.csv.gz')
def estimate(v):
 se=np.sqrt(4/80*np.sum((v[1:]-v[0])**2));return [v[0],se,max(0,v[0]-1.96*se),min(1,v[0]+1.96*se)]
rows=[]
for (var,outcome), block in a.groupby(level=[0,1]):
 # Fixed age standard: pooled men/women eligible denominator for this outcome, education aggregation.
 standard=a.loc[('education',outcome)].groupby(level='age_bin')[["d_"+c for c in W]].sum().to_numpy()
 standard=standard/standard.sum(axis=0)
 for (sex,g), sub in block.groupby(level=['sex','group']):
  den=sub[['d_'+c for c in W]].to_numpy();num=sub[['n_'+c for c in W]].to_numpy()
  raw=num.sum(axis=0)/den.sum(axis=0)
  # All seven age bins exist for all published groups; assert to avoid silent omissions.
  assert len(sub)==7 and np.all(den>0)
  std=((num/den)*standard).sum(axis=0)
  for measure,v in [('crude',raw),('age_standardized',std)]:
   r=dict(variable=var,outcome=outcome,sex=sex,group=g,measure=measure,weighted_denominator=den[:,0].sum(),weighted_numerator=num[:,0].sum())
   r.update(zip(['proportion','se','ci95_low','ci95_high'],estimate(v)));rows.append(r)
pd.DataFrame(rows).to_csv(ROOT/'results.csv',index=False)
# Pairing is descriptive among current co-resident householder/spouse pairs. One household weight = householder person weight.
pair=pd.concat(pairs,ignore_index=True)
h=pair[pair.RELSHIPP==20].copy();s=pair[pair.RELSHIPP.isin([21,23])].copy()
pair=h.merge(s[['SERIALNO','SCHL','SEX','AGEP']],on='SERIALNO',suffixes=('_householder','_spouse'),validate='one_to_one')
pair=pair[pair.AGEP_householder.between(30,64)&pair.AGEP_spouse.between(30,64)]
pair['education_householder']=pair.SCHL_householder.map(edu);pair['education_spouse']=pair.SCHL_spouse.map(edu)
pr=[]
for (e1,e2),b in pair.groupby(['education_householder','education_spouse']):
 total=pair[W].sum().to_numpy();v=b[W].sum().to_numpy()/total
 r={'education_householder':e1,'education_spouse':e2,'unweighted_n':len(b),'weighted_households':b.PWGTP.sum()};r.update(zip(['proportion','se','ci95_low','ci95_high'],estimate(v)));pr.append(r)
pd.DataFrame(pr).to_csv(ROOT/'pairing_current_households.csv',index=False)
manifest={'url':URL,'year':2023,'files':['psam_pusa.csv','psam_pusb.csv'],'sha256':hashlib.file_digest(open(p,'rb'),'sha256').hexdigest(),'age_range':[30,64],'sample_n':pq.ParquetFile(ROOT/'persons_30_64.parquet').metadata.num_rows,'method':'SDR variance 4/80 sum((replicate-estimate)^2), normal 95% CI. Age standard pooled eligible population ages 30-64 in 5-year bins, recomputed per replicate. All estimates descriptive.'}
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest),flush=True)

# Append sample counts to every published subgroup estimate.
exec((ROOT/"add_counts.py").read_text())
