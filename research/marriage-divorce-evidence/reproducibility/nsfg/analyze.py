"""NSFG 2017–2019 original microdata analysis. Python 3; pandas numpy scipy.
Run from this directory: python3 analyze.py. Official files preserved alongside.
"""
from pathlib import Path
import re,json,hashlib
import numpy as np,pandas as pd
from scipy.stats import t
P=Path(__file__).resolve().parent
V=['caseid','ager','hieduc','fmarital','fmarno','marend01','mardat01','mardis01','mar1diss','fmar1age','attndnow','religion','totincr','laborfor','wgt2017_2019','sest','secu']
def load(sex):
 d={m[2].lower():(int(m[0])-1,int(m[0])-1+int(m[3])) for m in re.findall(r'_column\((\d+)\)\s+(\w+)\s+(\w+)\s+%(\d+)f', (P/f'{sex}.dct').read_text())}
 x=pd.read_fwf(P/f'{sex}.dat',colspecs=[d[v] for v in V],names=V,na_values=['.'])
 for v in V:x[v]=pd.to_numeric(x[v],errors='coerce')
 return x
ED={5:'Less than high school',6:'Less than high school',7:'Less than high school',8:'Less than high school',9:'High school / GED',10:'Some college, no degree',11:'Associate',12:'Bachelor',13:'Master',14:'Doctorate',15:'Professional'}
def groups(d):
 return {'education':d.hieduc.map(ED),'religious_attendance':d.attndnow.map({1:'Weekly or more',2:'Weekly or more',3:'1–3 times monthly',4:'1–3 times monthly',5:'Less than monthly',6:'Less than monthly',7:'Never'}),'religion':d.religion.map({1:'None',2:'Catholic',3:'Protestant',4:'Other'}),'family_income':pd.cut(d.totincr,[0,7,11,13,14,15],labels=['Under $25k','$25k–49,999','$50k–74,999','$75k–99,999','$100k+']).astype('str'),'employment':d.laborfor.map({1:'Full-time',2:'Part-time',3:'Temporarily absent / leave',4:'Temporarily absent / leave',5:'Looking for work',6:'School',7:'Keeping house / caring',8:'Keeping house / caring',9:'Other'})}
def designvar(d,z):
 a=pd.DataFrame({'h':d.sest,'k':d.secu,'z':z}).groupby(['h','k']).z.sum().reset_index()
 out=0.;df=0
 for _,g in a.groupby('h'):
  m=len(g);df+=m-1
  if m>1:out+=m/(m-1)*np.sum((g.z-g.z.mean())**2)
 return out,df

def estimate(d,domain,kind):
 w=d.wgt2017_2019.to_numpy();g=domain.to_numpy();event=d.marend01.isin([1,2]).to_numpy();n=int(g.sum())
 if kind=='first_marriage_divorced_annulled':y=(d.marend01==1).to_numpy()
 elif kind=='first_marriage_divorced_separated':y=event
 elif kind=='current_divorced_separated':y=d.fmarital.isin([3,4]).to_numpy()
 if kind!='four_year_dissolution_KM_approx':
  den=np.sum(w*g);q=np.sum(w*g*y)/den if den else np.nan;z=w*g*(y-q)/den;ev=int(np.sum(g*y))
 else:
  duration=d.mar1diss.to_numpy();S=1.;terms=np.zeros(len(d));ev=int(np.sum(g*event*(duration<=4)))
  for j in [1,2,3,4]:
   risk=g*(duration>=j);fail=g*event*(duration==j);Y=np.sum(w*risk);D=np.sum(w*fail)
   if Y<=D or Y==0:return None
   S*=1-D/Y;terms+=(fail*Y-D*risk)/(Y*(Y-D))
  q=1-S;z=w*S*terms
 variance,df=designvar(d,z);se=np.sqrt(variance)
 if 0<q<1:
  crit=t.ppf(.975,df);logit=np.log(q/(1-q));scale=se/(q*(1-q));lo=1/(1+np.exp(-(logit-crit*scale)));hi=1/(1+np.exp(-(logit+crit*scale)))
 else:lo=hi=np.nan
 return dict(n=n,events=ev,percent=100*q,se_percentage_points=100*se,ci_low=100*lo,ci_high=100*hi,design_df=df,sparse=(n<100 or ev<20))
rows=[];audit={}
for sex in ['female','male']:
 d=load(sex);ever=d.fmarno>0;adult=d.ager.between(25,49);core=ever&adult
 audit[sex]={'n':len(d),'ever_married_n':int(ever.sum()),'ever_married_age25_49_n':int(core.sum()),'strata':int(d.sest.nunique()),'psu':int(d.groupby(['sest','secu']).ngroups),'age_range':[int(d.ager.min()),int(d.ager.max())],'marend_counts':d.marend01.value_counts(dropna=False).to_dict(),'duration_counts':d.mar1diss.value_counts(dropna=False).to_dict()}
 for dim,cat in {'overall':pd.Series('All',index=d.index),**groups(d)}.items():
  for val in cat.dropna().unique():
   dom=core&(cat==val)
   for kind in ['first_marriage_divorced_annulled','first_marriage_divorced_separated','four_year_dissolution_KM_approx']:
    r=estimate(d,dom,kind)
    if r:rows.append(dict(sex=sex,dimension=dim,group=val,outcome=kind,**r))
pd.DataFrame(rows).to_csv(P/'results.csv',index=False)
(P/'audit.json').write_text(json.dumps(audit,indent=2))
sources={
 'female.dat':'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/2017_2019_FemRespData.dat',
 'male.dat':'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/2017_2019_MaleData.dat',
 'female.dct':'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/stata/2017_2019_FemRespSetup.dct',
 'male.dct':'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/stata/2017_2019_MaleSetup.dct',
 'userguide.pdf':'https://www.cdc.gov/nchs/data/nsfg/NSFG-2017-2019-UG-MainText-508.pdf',
 'female_marriage.pdf':'https://www.cdc.gov/nchs/data/nsfg/2017-2019_NSFG_FemResp_SectionC_Codebook-508.pdf',
 'female_marriage_questionnaire.pdf':'https://www.cdc.gov/nchs/data/nsfg/NSFG-PUF2017-2019-FemC-CRQ-508.pdf',
}
for sx,code,rel in [('female','FemResp','I'),('male','Male','J')]:
 sources[f'{sx}_recodes.pdf']=f'https://www.cdc.gov/nchs/data/nsfg/2017-2019_NSFG_{code}_SectionRecodes_Codebook-508.pdf'
 sources[f'{sx}_religion.pdf']=f'https://www.cdc.gov/nchs/data/nsfg/2017-2019_NSFG_{code}_Section{rel}_Codebook-508.pdf'
manifest=[]
for f in P.iterdir():
 if f.suffix in ['.dat','.dct','.pdf']:manifest.append({'file':f.name,'source_url':sources.get(f.name),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(P/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(audit,indent=2));print(pd.DataFrame(rows).query("dimension == 'education' and outcome == 'first_marriage_divorced_separated'").to_string(index=False))
