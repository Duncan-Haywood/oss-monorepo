"""NLSY79 baseline2000 religion couple analyses, prospective2000–2002 legal divorce.
Requires sibling annual_nlsy/nlsy_annual_intervals.csv and baseline_religion.csv.
"""
from pathlib import Path
import json,math
import numpy as np,pandas as pd
ROOT=Path(__file__).resolve().parent
f=pd.read_csv(ROOT.parent/'annual_nlsy/nlsy_annual_intervals.csv');f=f[f.start_wave==2000].copy()
r=pd.read_csv(ROOT/'baseline_religion.csv').rename(columns={'R0000100':'id','R6533500':'r_aff','R6533600':'r_att','R6538600':'s_aff','R6538700':'s_att'})
f=f.merge(r,on='id',validate='one_to_one')
aff={1:'Protestant/nondenominational/unspecified Christian',2:'Baptist',3:'Episcopalian',4:'Lutheran',5:'Methodist',6:'Presbyterian',7:'Roman Catholic',8:'Jewish',9:'Other specified',10:'None'}
att={1:'More than weekly',2:'Weekly',3:'Monthly (1-3 times)',4:'Monthly (1-3 times)',5:'Several times/year or less',6:'Never'}
broad=lambda x:'Protestant/Christian' if x in range(1,7) else ('Roman Catholic' if x==7 else ('None' if x==10 else ('Jewish/Other' if x in [8,9] else None)))
for who,col in [('respondent','r'),('spouse','s')]:
 f[who+'_religion']=f[col+'_aff'].map(aff);f[who+'_attendance']=f[col+'_att'].map(att);f[who+'_broad']=f[col+'_aff'].map(broad)
valid=f.r_aff.between(1,10)&f.s_aff.between(1,10)
f['coded_affiliation_match']=np.where(valid,np.where(f.r_aff==f.s_aff,'Same coded affiliation','Different coded affiliations'),None)
f['broad_affiliation_match']=None
f.loc[valid,'broad_affiliation_match']=np.where(f.loc[valid,'respondent_broad']==f.loc[valid,'spouse_broad'],'Same broad affiliation','Different broad affiliations')
f['none_pair']=None
f.loc[valid,'none_pair']=np.select([(f.loc[valid,'r_aff']==10)&(f.loc[valid,'s_aff']==10),(f.loc[valid,'r_aff']==10)|(f.loc[valid,'s_aff']==10)],['Both none','Exactly one none'],default='Both affiliated')
f['protestant_denom_match']=None
validp=f.r_aff.between(2,6)&f.s_aff.between(2,6)
f.loc[validp,'protestant_denom_match']=np.where(f.loc[validp,'r_aff']==f.loc[validp,'s_aff'],'Same named Protestant denomination','Different named Protestant denominations')
f['husband_att']=np.where(f.sex=='Men',f.r_att,f.s_att);f['wife_att']=np.where(f.sex=='Women',f.r_att,f.s_att)
f['husband_attendance']=f.husband_att.map(att);f['wife_attendance']=f.wife_att.map(att)
v=f.husband_att.between(1,6)&f.wife_att.between(1,6)
f['weekly_pair']=None
f.loc[v,'weekly_pair']=np.select([(f.loc[v,'husband_att']<=2)&(f.loc[v,'wife_att']<=2),(f.loc[v,'husband_att']<=2),(f.loc[v,'wife_att']<=2)],['Both weekly+','Only husband weekly+','Only wife weekly+'],default='Neither weekly+')
f['attendance_pair']=None
f.loc[v,'attendance_pair']=f.loc[v,'husband_attendance']+' | '+f.loc[v,'wife_attendance']
f.to_csv(ROOT/'religion_analysis_extract.csv',index=False)
def rate(g):
 w=g.weight.to_numpy();y=g.event.to_numpy();t=g.exposure.to_numpy();E=w@y;T=w@t;lam=E/T;G=len(g);se=np.sqrt(G/(G-1)*np.sum((w*(y-lam*t))**2))/T if G>1 else np.nan
 return dict(n=len(g),events=int(y.sum()),person_years=t.sum(),weighted_person_years=T,rate_per_1000=1000*lam,ci95_low=1000*lam*np.exp(-1.96*se/lam) if lam>0 else np.nan,ci95_high=1000*lam*np.exp(1.96*se/lam) if lam>0 else np.nan,caution='Sparse: fewer than10 observed events; intervals approximate' if y.sum()<10 else 'Approximate respondent-level CI, not full survey design')
rows=[]
factors=['respondent_religion','spouse_religion','respondent_attendance','spouse_attendance','husband_attendance','wife_attendance','coded_affiliation_match','broad_affiliation_match','none_pair','protestant_denom_match','weekly_pair','attendance_pair']
for sex in ['All','Men','Women']:
 s=f if sex=='All' else f[f.sex==sex]
 rows.append(dict(sex=sex,factor='All',category='All',**rate(s)))
 for fac in factors:
  for category,g in s.dropna(subset=[fac]).groupby(fac):rows.append(dict(sex=sex,factor=fac,category=category,**rate(g)))
pd.DataFrame(rows).to_csv(ROOT/'religion_crude_rates.csv',index=False)
# Weighted Poisson exposure likelihood; independent-respondent sandwich, not design-based PSU CI.
models=[('attendance_joint',{'respondent_attendance':['Weekly','More than weekly','Monthly (1-3 times)','Several times/year or less','Never'],'spouse_attendance':['Weekly','More than weekly','Monthly (1-3 times)','Several times/year or less','Never']}),('weekly_pair',{'weekly_pair':['Both weekly+','Neither weekly+','Only husband weekly+','Only wife weekly+']}),('coded_affiliation_mismatch',{'coded_affiliation_match':['Same coded affiliation','Different coded affiliations'],'respondent_broad':['Protestant/Christian','Roman Catholic','None','Jewish/Other'],'spouse_broad':['Protestant/Christian','Roman Catholic','None','Jewish/Other']}),('none_pair',{'none_pair':['Both affiliated','Both none','Exactly one none']})]
coeff=[];margins=[];contrasts=[];checks=[]
for model,levs in models:
 g=f.dropna(subset=list(levs)+['age','first_marriage_age']).copy();names=['Intercept'];xx=[np.ones(len(g))];ix={}
 for fac,levels in levs.items():
  ix[fac]={}
  for lev in levels[1:]:ix[fac][lev]=len(xx);xx.append(np.asarray(g[fac]==lev,float));names.append(fac+': '+lev+' vs '+levels[0])
 names+=['Respondent male','Baseline age per10years','Age at first marriage per5years'];xx+=[np.asarray(g.sex=='Men',float),(g.age.to_numpy()-40)/10,(g.first_marriage_age.to_numpy()-25)/5]
 X=np.column_stack(xx);y=g.event.to_numpy();e=g.exposure.to_numpy();w=g.weight.to_numpy();w=w/w.mean();b=np.zeros(X.shape[1]);b[0]=np.log((w@y)/(w@e))
 def ll(bb):return np.sum(w*(y*(X@bb)-e*np.exp(np.clip(X@bb,-25,15))))
 for it in range(100):
  mu=e*np.exp(np.clip(X@b,-25,15));H=X.T@((w*mu)[:,None]*X);score=X.T@(w*(y-mu));step=np.linalg.lstsq(H,score,rcond=1e-12)[0];a=1
  while ll(b+a*step)<ll(b)-1e-9 and a>1/4096:a/=2
  b+=a*step
  if abs(a*step).max()<1e-8:break
 mu=e*np.exp(X@b);bread=np.linalg.pinv(X.T@((w*mu)[:,None]*X));scores=X*(w*(y-mu))[:,None];cov=len(g)/(len(g)-1)*bread@(scores.T@scores)@bread
 for j,name in enumerate(names):
  se=np.sqrt(max(0,cov[j,j]));coeff.append(dict(model=model,term=name,log_rate_ratio=b[j],se=se,rate_ratio=np.exp(b[j]),ci95_low=np.exp(b[j]-1.96*se),ci95_high=np.exp(b[j]+1.96*se),n=len(g),events=int(y.sum())))
 for fac,levels in levs.items():
  pred={};grad={}
  for lev in levels:
   xp=X.copy()
   for idx in ix[fac].values():xp[:,idx]=0
   if lev in ix[fac]:xp[:,ix[fac][lev]]=1
   lam=np.exp(xp@b);p=np.average(lam,weights=w);gr=np.average(lam[:,None]*xp,weights=w,axis=0);se=np.sqrt(max(0,gr@cov@gr));pred[lev]=p;grad[lev]=gr
   obs=g[g[fac]==lev];margins.append(dict(model=model,factor=fac,level=lev,standardized_rate_per_1000=p*1000,ci95_low=1000*p*np.exp(-1.96*se/p),ci95_high=1000*p*np.exp(1.96*se/p),observed_n=len(obs),observed_events=int(obs.event.sum())))
  for lev in levels[1:]:
   diff=pred[lev]-pred[levels[0]];gr=grad[lev]-grad[levels[0]];se=np.sqrt(max(0,gr@cov@gr));contrasts.append(dict(model=model,factor=fac,contrast=lev+' minus '+levels[0],difference_per_1000=1000*diff,ci95_low=1000*(diff-1.96*se),ci95_high=1000*(diff+1.96*se)))
 checks.append(dict(model=model,n=len(g),events=int(y.sum()),parameters=X.shape[1],iterations=it+1,max_abs_score=float(abs(X.T@(w*(y-mu))).max()),rank=int(np.linalg.matrix_rank(X)),condition_number=float(np.linalg.cond(X.T@((w*mu)[:,None]*X)))))
for name,r in [('religion_adjusted_rate_ratios',coeff),('religion_adjusted_margins',margins),('religion_adjusted_contrasts',contrasts)]:pd.DataFrame(r).to_csv(ROOT/(name+'.csv'),index=False)
json.dump(checks,open(ROOT/'religion_model_checks.json','w'),indent=2)
print(checks)
