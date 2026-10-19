"""Prospective married-baseline divorce incidence and adjusted weighted Poisson rate model.
Requires numpy, pandas; optional scipy is not used. Person-cluster sandwich is not survey-PSU variance.
"""
from pathlib import Path
import json,math,collections,re,sys
import numpy as np
import pandas as pd
P=Path(__file__).resolve().parent
D=json.load(open(P/'annual_nlsy_codebook.json')); raw=pd.read_csv(P/'annual_nlsy_extract.csv')
include_separated='--include-separated' in sys.argv
if include_separated:
 P=P/'legally_married_primary';P.mkdir(exist_ok=True)
lookup={(int(v['year']),v['name']):k for k,v in D.items() if v['year'].isdigit()}
def val(r,y,n,default=-999):
 k=lookup.get((y,n));return float(r[k]) if k is not None else default
def month(r,y,prefix='CURDATE'):
 a=val(r,y,prefix+'~Y');b=val(r,y,prefix+'~M')
 return a+(b-.5)/12 if 1979<=a<=2025 and 1<=b<=12 else None

def religion(v):return 'Weekly or more' if v in [1,2] else ('Less than weekly' if v in [3,4,5] else ('Never' if v==6 else None))
def edlabel(deg,hgc):
 if deg==2:return 'Associate'
 if deg in [3,4]:return 'Bachelor'
 if deg==5:return 'Master'
 if deg==6:return 'PhD'
 if deg==7:return 'Professional'
 if deg==1:return 'Some college' if 13<=hgc<=20 else 'High school'
 if 0<=hgc<12:return 'Less than high school'
 if hgc==12:return 'High school'
 if 13<=hgc<=15:return 'Some college'
 return None

audit=collections.Counter();A=[]
for _,r in raw.iterrows():
 deg=None;sex='Men' if r['R0214800']==1 else 'Women';pid=int(r['R0000100']);rank={1:1,2:2,3:3,4:3,5:4,6:5,7:5}
 for y in sorted({int(v['year']) for v in D.values() if v['year'].isdigit()}):
  for n in ['Q3-10B','Q3-10D']:
   z=val(r,y,n)
   if z in rank and (deg is None or rank[z]>=rank[deg]):deg=z
  if y not in range(2000,2022,2):continue
  base=val(r,y,'MARSTAT-KEY');endstat=val(r,y+2,'MARSTAT-KEY')
  if base not in ([1,2] if include_separated else [1]):continue
  audit['married_baseline_intervals']+=1
  if endstat not in [1,2,3,6] or val(r,y,'SAMPWEIGHT')<=0:audit['missing_followup_or_weight']+=1;continue
  t0=month(r,y);t1=month(r,y+2)
  if t0 is None or t1 is None or not .25<=t1-t0<=4:audit['invalid_interview_dates']+=1;continue
  term=[];bad=False
  for j in [1,2,3]:
   typ=val(r,y+2,f'MARST-CHNG{j}-TYPE')
   if typ not in [3,6]:continue
   tm=month(r,y+2,f'MARST-CHNG{j}-DATE')
   if tm is None or tm<=t0 or tm>t1:bad=True;break
   term.append((tm,int(typ)))
  if bad:audit['invalid_terminal_event_date']+=1;continue
  if endstat in [3,6] and not term:audit['terminal_status_without_terminal_event']+=1;continue
  tm,typ=min(term) if term else (t1,0)
  ex=tm-t0
  if ex<=0:audit['zero_exposure']+=1;continue
  hgc=val(r,y,f'HGCREV{str(y)[2:]}')
  if hgc<0:hgc=val(r,y,'Q3-4')
  e=edlabel(deg,hgc)
  inc=val(r,y,'TNFI_TRUNC');hrs=val(r,y,'HRSWK-PCY');age=val(r,y,'AGEATINT');first=float(r['R9908600'])
  work='No work hours' if hrs==0 else ('1–1,999 hours' if 0<hrs<2000 else ('2,000+ hours' if hrs>=2000 else None))
  rr=religion(float(r['R6533600']));rr12=religion(float(r['T3201400'])) if y>=2012 else None
  A.append(dict(id=pid,sex=sex,baseline_status=('Married' if base==1 else 'Separated'),start_wave=y,start=t0,stop=tm,exposure=ex,event=int(typ==3),widow=int(typ==6),end_status=endstat,weight=val(r,y,'SAMPWEIGHT')/100,education=e,education_model=('Graduate' if e in ['Master','PhD','Professional'] else e),family_income=inc if inc>=0 else np.nan,work=work,age=age if age>=0 else np.nan,first_marriage_age=first if 12<=first<=65 else np.nan,religion_2000=rr,religion_refresh=rr12 or rr))
f=pd.DataFrame(A);audit['retained_intervals']=len(f);audit['respondents']=f.id.nunique();audit['divorces']=int(f.event.sum());audit['widow_censors']=int(f.widow.sum());audit['unweighted_person_years']=float(f.exposure.sum())
# Within-wave weighted quartiles use the eligible married-baseline intervals with valid income.
def wquantile(x,w,qs):
 ix=np.argsort(x);x=np.asarray(x)[ix];w=np.asarray(w)[ix];cdf=np.cumsum(w)/sum(w);return np.interp(qs,cdf,x)
thresholds={}
f['income_quartile']=None
for wave,g in f.dropna(subset=['family_income']).groupby('start_wave'):
 cuts=wquantile(g.family_income,g.weight,[.25,.5,.75]);thresholds[int(wave)]=cuts.tolist();f.loc[g.index,'income_quartile']=['Q'+str(1+sum(x>c for c in cuts)) for x in g.family_income]
f.to_csv(P/'nlsy_annual_intervals.csv',index=False)
json.dump(dict(audit),open(P/'annual_audit.json','w'),indent=2);json.dump(thresholds,open(P/'income_quartile_cutpoints.json','w'),indent=2)

def rate(g):
 E=float((g.weight*g.event).sum());T=float((g.weight*g.exposure).sum());lam=E/T
 u=(g.weight*(g.event-lam*g.exposure)).groupby(g.id).sum();G=len(u);se=math.sqrt(G/(G-1)*float((u*u).sum()))/T if G>1 else float('nan')
 lo=lam*math.exp(-1.96*se/lam) if lam>0 else float('nan');hi=lam*math.exp(1.96*se/lam) if lam>0 else float('nan')
 return dict(intervals=len(g),respondents=g.id.nunique(),events=int(g.event.sum()),person_years=float(g.exposure.sum()),weighted_person_years=T,caution=('Fewer than 10 observed events' if int(g.event.sum())<10 else ''),rate_per_1000=1000*lam,ci_low_per_1000=1000*lo,ci_high_per_1000=1000*hi)
R=[]
for sex in ['All','Men','Women']:
 s=f if sex=='All' else f[f.sex==sex]
 R.append(dict(sex=sex,factor='All',category='All',**rate(s)))
 for factor in ['baseline_status','education','income_quartile','work','religion_2000','religion_refresh']:
  for cat,g in s.dropna(subset=[factor]).groupby(factor):R.append(dict(sex=sex,factor=factor,category=cat,**rate(g)))
pd.DataFrame(R).to_csv(P/'annual_crude_rates.csv',index=False)
# Jointly adjusted piecewise-exponential rate model; normalize weights for fitting.
levels={'education_model':['High school','Less than high school','Some college','Associate','Bachelor','Graduate'],'income_quartile':['Q2','Q1','Q3','Q4'],'work':['2,000+ hours','No work hours','1–1,999 hours'],'religion_2000':['Never','Less than weekly','Weekly or more']}
if include_separated:levels['baseline_status']=['Married','Separated']

def design(g,lev):
 cols=['Intercept'];X=[np.ones(len(g))]
 for fac,cats in lev.items():
  for c in cats[1:]:cols.append(fac+': '+c+' vs '+cats[0]);X.append((g[fac]==c).astype(float).to_numpy())
 cols+=['Age at baseline (per 10 years)','Age at first marriage (per 5 years)'];X+=[(g.age.to_numpy()-45)/10,(g.first_marriage_age.to_numpy()-25)/5]
 for wave in range(2002,2022,2):cols.append('Wave '+str(wave)+' vs 2000');X.append((g.start_wave==wave).astype(float).to_numpy())
 return np.column_stack(X),cols

def model(g,lev):
 need=list(lev)+['age','first_marriage_age'];g=g.dropna(subset=need).copy();X,names=design(g,lev);y=g.event.to_numpy();e=g.exposure.to_numpy();w=g.weight.to_numpy();w=w/np.mean(w);beta=np.zeros(X.shape[1]);beta[0]=np.log(np.dot(w,y)/np.dot(w,e))
 def ll(b):
  eta=np.clip(X@b,-30,20);return float(np.dot(w,y*eta-e*np.exp(eta)))
 for it in range(60):
  mu=e*np.exp(np.clip(X@beta,-30,20));H=X.T@((w*mu)[:,None]*X);grad=X.T@(w*(y-mu));step=np.linalg.lstsq(H,grad,rcond=1e-10)[0];q=1
  while ll(beta+q*step)<ll(beta)-1e-8 and q>1/1024:q/=2
  beta+=q*step
  if np.max(np.abs(q*step))<1e-8:break
 mu=e*np.exp(np.clip(X@beta,-30,20));H=X.T@((w*mu)[:,None]*X);B=np.linalg.pinv(H,rcond=1e-10)
 score=pd.DataFrame((w*(y-mu))[:,None]*X);score['id']=g.id.to_numpy();U=score.groupby('id').sum().to_numpy();G=len(U);cor=G/(G-1)*(len(g)-1)/(len(g)-len(beta));V=B@(U.T@U)@B*cor;se=np.sqrt(np.maximum(np.diag(V),0));out=[]
 for n,b,s in zip(names,beta,se):out.append(dict(term=n,log_rate_ratio=b,rate_ratio=float(np.exp(b)),ci_low=float(np.exp(b-1.96*s)),ci_high=float(np.exp(b+1.96*s))))
 return out,dict(intervals=len(g),respondents=g.id.nunique(),events=int(g.event.sum()),person_years=float(g.exposure.sum()),iterations=it+1,matrix_rank=int(np.linalg.matrix_rank(X)),parameters=X.shape[1],max_normalized_score=float(np.max(np.abs(X.T@(w*(y-mu))))/sum(w)),weighted_observed_events=float(np.dot(w,y)),weighted_fitted_events=float(np.dot(w,mu))),g,X,beta,V
RR=[];M={};profiles=[]
for sex in ['Men','Women']:
 s=f[f.sex==sex];out,meta,g,X,beta,V=model(s,levels);M[sex]=meta
 for r in out:RR.append(dict(sex=sex,**r))
 # Prespecified supported combination; no minimum-risk search across combinations.
 s=s[s.baseline_status=='Married']
 for name,mask in [('College+, upper-half income, weekly attendance, 2000+ hours',(s.education.isin(['Bachelor','Master','PhD','Professional']))&(s.income_quartile.isin(['Q3','Q4']))&(s.religion_2000=='Weekly or more')&(s.work=='2,000+ hours')),('College+, upper-half income, weekly attendance, under2000 hours',(s.education.isin(['Bachelor','Master','PhD','Professional']))&(s.income_quartile.isin(['Q3','Q4']))&(s.religion_2000=='Weekly or more')&(s.work.isin(['No work hours','1–1,999 hours'])) )]:
  h=s[mask]
  if len(h):profiles.append(dict(sex=sex,profile=name,**rate(h)))
 college=s.education.isin(['Bachelor','Master','PhD','Professional'])&s.income_quartile.isin(['Q3','Q4'])
 for hours in ['2,000+ hours','Under 2,000 hours']:
  hm=(s.work=='2,000+ hours') if hours=='2,000+ hours' else s.work.isin(['No work hours','1–1,999 hours'])
  for attendance in ['Any attendance','Weekly or more','Below weekly or never']:
   am=pd.Series(True,index=s.index) if attendance=='Any attendance' else ((s.religion_2000=='Weekly or more') if attendance=='Weekly or more' else s.religion_2000.isin(['Less than weekly','Never']))
   h=s[college&hm&am]
   if len(h):profiles.append(dict(sex=sex,profile='Married, college+, upper-half income, '+hours+', '+attendance,**rate(h)))
pd.DataFrame(RR).to_csv(P/'annual_adjusted_rate_ratios.csv',index=False);json.dump(M,open(P/'annual_model_audit.json','w'),indent=2);pd.DataFrame(profiles).to_csv(P/'annual_prespecified_profiles.csv',index=False)
# Refresh religion in 2012 sensitivity, same covariates and fitting method.
lev2=dict(levels);lev2['religion_refresh']=lev2.pop('religion_2000');RR2=[]
for sex in ['Men','Women']:
 out,meta,*_=model(f[f.sex==sex],lev2)
 for r in out:RR2.append(dict(sex=sex,**r))
pd.DataFrame(RR2).to_csv(P/'annual_adjusted_religion_refresh_sensitivity.csv',index=False)
print(json.dumps(dict(audit),indent=2));print(json.dumps(M,indent=2));print(pd.DataFrame(RR).query("term.str.contains('education|income|work|religion')",engine='python').to_string(index=False))
if include_separated:
 lev_no_status={k:v for k,v in levels.items() if k!='baseline_status'}
 outrows=[];meta2={}
 for sex in ['Men','Women']:
  out,meta,*_=model(f[f.sex==sex],lev_no_status);meta2[sex]=meta
  for r in out:outrows.append(dict(sex=sex,**r))
 pd.DataFrame(outrows).to_csv(P/'annual_adjusted_without_separation_state.csv',index=False)
 json.dump(meta2,open(P/'annual_model_without_separation_state_audit.json','w'),indent=2)
 if include_separated:
  lev_refresh_no_status={k:v for k,v in lev2.items() if k!='baseline_status'}
  sensitivity=[]
  for sex in ['Men','Women']:
   out,meta,*_=model(f[f.sex==sex],lev_refresh_no_status)
   for r in out:sensitivity.append(dict(sex=sex,**r))
  pd.DataFrame(sensitivity).to_csv(P/'annual_adjusted_refresh_without_separation_state.csv',index=False)
