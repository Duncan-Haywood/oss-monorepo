"""Respondent political party measured2008, prospective legal divorce2008–2010.
Weighted Poisson offset models; respondent-robust approximate CI, not full survey design.
"""
from pathlib import Path
import json
import numpy as np,pandas as pd
ROOT=Path(__file__).resolve().parent
f=pd.read_csv(ROOT.parent/'annual_nlsy/legally_married_primary/nlsy_annual_intervals.csv');f=f[f.start_wave==2008].copy()
r=pd.read_csv(ROOT/'baseline_politics.csv').rename(columns={'R0000100':'id','T2184000':'party_code','T2184100':'strength_code','T2184200':'lean_code','T2184300':'follow_code'})
f=f.merge(r,on='id',validate='one_to_one')
race=pd.read_csv(ROOT.parent/'annual_nlsy/annual_nlsy_extract.csv',usecols=['R0000100','R0214700']).rename(columns={'R0000100':'id'})
f=f.merge(race,on='id',validate='one_to_one')
f['race_ethnicity']=f.R0214700.map({1:'Hispanic',2:'Black',3:'Non-Black/non-Hispanic'})
f['party']=f.party_code.map({1:'Democrat',2:'Republican',3:'Independent',4:'Other party',5:'No preference'})
f['party_strength']=None
for party in ['Democrat','Republican']:
 for code,label in [(1,'Strong'),(2,'Not very strong')]:f.loc[(f.party==party)&(f.strength_code==code),'party_strength']=label+' '+party
f['party_plus_lean']=f.party.map({'Democrat':'Democrat or Democratic lean','Republican':'Republican or Republican lean'})
for code,label in [(1,'Republican or Republican lean'),(2,'Democrat or Democratic lean'),(3,'Equally close to both'),(4,'Neither')]:f.loc[f.party_code.isin([3,4,5])&(f.lean_code==code),'party_plus_lean']=label
f['follows_politics']=f.follow_code.map({1:'Always',2:'Most of the time',3:'About half the time',4:'Once in a while',5:'Never'})
f.to_csv(ROOT/'politics_analysis_extract.csv',index=False)
def rate(g):
 w=g.weight.to_numpy();y=g.event.to_numpy();t=g.exposure.to_numpy();E=w@y;T=w@t;lam=E/T;n=len(g);se=np.sqrt(n/(n-1)*np.sum((w*(y-lam*t))**2))/T if n>1 else np.nan
 return dict(n=n,events=int(y.sum()),person_years=float(t.sum()),weighted_person_years=T,rate_per_1000=1000*lam,ci95_low=1000*lam*np.exp(-1.96*se/lam) if lam>0 else np.nan,ci95_high=1000*lam*np.exp(1.96*se/lam) if lam>0 else np.nan,caution='Fewer than10 events: sparse' if y.sum()<10 else 'Approximate CI')
rows=[]
for sex in ['All','Men','Women']:
 s=f if sex=='All' else f[f.sex==sex]
 rows.append(dict(sex=sex,factor='All',category='All',**rate(s)))
 for fac in ['party','party_strength','party_plus_lean','follows_politics','baseline_status']:
  for lev,g in s.dropna(subset=[fac]).groupby(fac):rows.append(dict(sex=sex,factor=fac,category=lev,**rate(g)))
pd.DataFrame(rows).to_csv(ROOT/'politics_crude_rates.csv',index=False)
base={'party':['Democrat','Republican','Independent','No preference'],'baseline_status':['Married','Separated']}
extended={**base,'education_model':['High school','Less than high school','Some college','Associate','Bachelor','Graduate'],'income_quartile':['Q2','Q1','Q3','Q4'],'religion_2000':['Never','Less than weekly','Weekly or more'],'race_ethnicity':['Non-Black/non-Hispanic','Hispanic','Black']}
coeff=[];margins=[];contrast=[];checks=[]
for name,levels in [('age_sex_separation_adjusted',base),('extended_education_income_2000religion',extended),('age_sex_same_extended_complete_cases',base)]:
 g=f.dropna(subset=list(levels)+['age','first_marriage_age']).copy();g=g[g.party.isin(levels['party'])]
 if name=='age_sex_same_extended_complete_cases':g=g.dropna(subset=list(extended))
 names=['Intercept'];xx=[np.ones(len(g))];party_ix={}
 for fac,levs in levels.items():
  for lev in levs[1:]:
   if fac=='party':party_ix[lev]=len(xx)
   xx.append(np.asarray(g[fac]==lev,float));names.append(fac+': '+lev+' vs '+levs[0])
 names+=['Male respondent','Age per10years','Age at first marriage per5years'];xx+=[np.asarray(g.sex=='Men',float),(g.age.to_numpy()-48)/10,(g.first_marriage_age.to_numpy()-25)/5]
 X=np.column_stack(xx);y=g.event.to_numpy();e=g.exposure.to_numpy();w=g.weight.to_numpy();w/=w.mean();b=np.zeros(X.shape[1]);b[0]=np.log((w@y)/(w@e))
 def ll(bb):return np.sum(w*(y*(X@bb)-e*np.exp(np.clip(X@bb,-25,15))))
 for it in range(100):
  mu=e*np.exp(np.clip(X@b,-25,15));H=X.T@((w*mu)[:,None]*X);score=X.T@(w*(y-mu));step=np.linalg.lstsq(H,score,rcond=1e-12)[0];a=1
  while ll(b+a*step)<ll(b)-1e-9 and a>1/4096:a/=2
  b+=a*step
  if abs(a*step).max()<1e-8:break
 mu=e*np.exp(X@b);bread=np.linalg.pinv(X.T@((w*mu)[:,None]*X));scores=X*(w*(y-mu))[:,None];cov=len(g)/(len(g)-1)*bread@(scores.T@scores)@bread
 for j,term in enumerate(names):
  se=np.sqrt(max(0,cov[j,j]));coeff.append(dict(model=name,term=term,rate_ratio=np.exp(b[j]),ci95_low=np.exp(b[j]-1.96*se),ci95_high=np.exp(b[j]+1.96*se),log_rate_ratio=b[j],se=se,n=len(g),events=int(y.sum())))
 pred={};grad={}
 for lev in levels['party']:
  xp=X.copy()
  for idx in party_ix.values():xp[:,idx]=0
  if lev in party_ix:xp[:,party_ix[lev]]=1
  lam=np.exp(xp@b);p=np.average(lam,weights=w);gr=np.average(lam[:,None]*xp,weights=w,axis=0);se=np.sqrt(max(0,gr@cov@gr));pred[lev]=p;grad[lev]=gr
  obs=g[g.party==lev];margins.append(dict(model=name,party=lev,standardized_rate_per_1000=1000*p,ci95_low=1000*p*np.exp(-1.96*se/p),ci95_high=1000*p*np.exp(1.96*se/p),observed_n=len(obs),observed_events=int(obs.event.sum())))
 for lev in levels['party'][1:]:
  diff=pred[lev]-pred['Democrat'];gr=grad[lev]-grad['Democrat'];se=np.sqrt(max(0,gr@cov@gr));contrast.append(dict(model=name,contrast=lev+' minus Democrat',difference_per_1000=1000*diff,ci95_low=1000*(diff-1.96*se),ci95_high=1000*(diff+1.96*se)))
 checks.append(dict(model=name,n=len(g),events=int(y.sum()),parameters=X.shape[1],rank=int(np.linalg.matrix_rank(X)),iterations=it+1,max_abs_score=float(abs(X.T@(w*(y-mu))).max()),condition_number=float(np.linalg.cond(X.T@((w*mu)[:,None]*X)))))
for name,r in [('politics_adjusted_rate_ratios',coeff),('politics_adjusted_margins',margins),('politics_adjusted_contrasts',contrast)]:pd.DataFrame(r).to_csv(ROOT/(name+'.csv'),index=False)
json.dump(checks,open(ROOT/'politics_checks.json','w'),indent=2)
print(checks)
