"""Joint descriptive ACS models; requires sibling acs/persons_30_64.parquet.
All80 SDR fits and empirical standardized predictive margins; not causal risks.
"""
from pathlib import Path
import json
import numpy as np,pandas as pd
from scipy.special import expit
ROOT=Path(__file__).resolve().parent
W=['PWGTP']+['PWGTP'+str(i) for i in range(1,81)]
levels={'age_bin':list(range(7)),'education':['Bachelor','Less than high school','High school/GED','Some college','Associate','Master','Professional','Doctorate'],'income_group':['50,000-74,999','Zero/negative','1-24,999','25,000-49,999','75,000-99,999','100,000-149,999','150,000-199,999','200,000+'],'employment':['Employed','Unemployed','Not in labor force','Armed forces'],'marriage_count':['Once','Twice','Three+'],'race_ethnicity':['Non-Hispanic White','Hispanic','Non-Hispanic Black','Non-Hispanic other']}
profiles=[('Bachelor employed 50-74k once',{'education':'Bachelor','income_group':'50,000-74,999','employment':'Employed','marriage_count':'Once'}),('Bachelor employed 100-149k once',{'education':'Bachelor','income_group':'100,000-149,999','employment':'Employed','marriage_count':'Once'}),('Master employed 100-149k once',{'education':'Master','income_group':'100,000-149,999','employment':'Employed','marriage_count':'Once'}),('Bachelor employed 200k+ once',{'education':'Bachelor','income_group':'200,000+','employment':'Employed','marriage_count':'Once'}),('Master employed 200k+ once',{'education':'Master','income_group':'200,000+','employment':'Employed','marriage_count':'Once'}),('Bachelor NILF zero income once',{'education':'Bachelor','income_group':'Zero/negative','employment':'Not in labor force','marriage_count':'Once'}),('Some college employed 25-49k twice',{'education':'Some college','income_group':'25,000-49,999','employment':'Employed','marriage_count':'Twice'})]
def fit(X,D,N):
 b=np.zeros(X.shape[1]);b[0]=-4
 for i in range(70):
  p=expit(X@b);score=X.T@(N-D*p);H=X.T@((D*p*(1-p))[:,None]*X);step=np.linalg.solve(H,score);b+=step
  if abs(step).max()<1e-8:return b,i+1
 raise ValueError('Convergence')
def summarize(v,scale=1):
 v=v*scale;se=np.sqrt(.05*((v[1:]-v[0])**2).sum());return dict(estimate=v[0],se=se,ci95_low=v[0]-1.96*se,ci95_high=v[0]+1.96*se)
d=pd.read_parquet(ROOT.parent/'acs/persons_30_64.parquet');d=d[d.MAR!=5].copy()
d['marriage_count']=d.MARHT.map({1:'Once',2:'Twice',3:'Three+'})
d['race_ethnicity']=np.where(d.HISP!=1,'Hispanic',np.where(d.RAC1P==1,'Non-Hispanic White',np.where(d.RAC1P==2,'Non-Hispanic Black','Non-Hispanic other')))
coef=[];margins=[];prof=[];ranges=[];contrasts=[];checks=[]
for denominator in ['approx_current_married_separated_or_recent_divorce','ever_married']:
 for sex in ['Men','Women']:
  s=d[d.sex==sex].copy()
  if denominator.startswith('approx'):s=s[s.MAR.isin([1,4])|(s.MARHD==1)]
  variables=list(levels)
  den=s.groupby(variables,observed=True)[W].sum();num=s[s.MARHD==1].groupby(variables,observed=True)[W].sum().reindex(den.index,fill_value=0)
  tab=den.reset_index();D=den.to_numpy(float);N=num.to_numpy(float)
  names=['Intercept'];xs=[np.ones(len(tab))];indices={}
  for v in variables:
   indices[v]={}
   for lev in levels[v][1:]:
    indices[v][lev]=len(xs);xs.append(np.asarray(tab[v]==lev,float));names.append(v+':'+str(lev))
  X=np.column_stack(xs);B=[];its=[]
  for j in range(81):
   b,it=fit(X,D[:,j],N[:,j]);B.append(b);its.append(it)
  B=np.array(B); ww=D/D.sum(axis=0)
  for i,name in enumerate(names):
   se=np.sqrt(.05*((B[1:,i]-B[0,i])**2).sum());coef.append(dict(denominator=denominator,sex=sex,term=name,log_odds=B[0,i],se=se,odds_ratio=np.exp(B[0,i]),ci95_low=np.exp(B[0,i]-1.96*se),ci95_high=np.exp(B[0,i]+1.96*se)))
  def prediction(settings):
   # Replace specified dummies; retain all other empirical covariates.
   xp=X.copy()
   for v,lev in settings.items():
    for idx in indices[v].values():xp[:,idx]=0
    if lev in indices[v]:xp[:,indices[v][lev]]=1
   # avoid huge 81 matrices; each replicate has its own fitted coefficients and target weights
   return np.array([(expit(xp@B[j])*ww[:,j]).sum() for j in range(81)])
  for v in variables:
   pred={}
   for lev in levels[v]:
    val=prediction({v:lev});pred[lev]=val
    obs=s[s[v]==lev];r=dict(denominator=denominator,sex=sex,factor=v,level=lev,unweighted_n=len(obs),unweighted_events=int((obs.MARHD==1).sum()),weighted_n=int(obs.PWGTP.sum()),unit='percent');r.update(summarize(val,100));margins.append(r)
   for lev in levels[v][1:]:
    if v!='race_ethnicity':
     r=dict(denominator=denominator,sex=sex,factor=v,level=lev,reference=levels[v][0],unit='percentage_points');r.update(summarize(pred[lev]-pred[levels[v][0]],100));contrasts.append(r)
   # Largest-minus-smallest descriptive adjusted marginal probabilities selected from point estimates.
   # Exclude armed forces from employment range because sparse, and race ranking not appropriate.
   eligible=[x for x in levels[v] if not(v=='employment' and x=='Armed forces')]
   if v!='race_ethnicity':
    low=min(eligible,key=lambda x:pred[x][0]);high=max(eligible,key=lambda x:pred[x][0]);r=dict(denominator=denominator,sex=sex,factor=v,low_level=low,high_level=high,unit='percentage_points',selection_note='point-estimate extrema selected among observed categories; CI conditional on selected pair, not selection adjusted');r.update(summarize(pred[high]-pred[low],100));ranges.append(r)
  for label,settings in profiles:
   val=prediction(settings);obs=s
   for v,lev in settings.items():obs=obs[obs[v]==lev]
   r=dict(denominator=denominator,sex=sex,profile=label,settings=json.dumps(settings),standardization='age and race averaged over eligible population within sex',unweighted_n=len(obs),unweighted_events=int((obs.MARHD==1).sum()),weighted_n=int(obs.PWGTP.sum()),weighted_observed_pct=100*(obs.PWGTP*(obs.MARHD==1)).sum()/obs.PWGTP.sum(),unit='percent');r.update(summarize(val,100));prof.append(r)
  checks.append(dict(denominator=denominator,sex=sex,n=len(s),events=int((s.MARHD==1).sum()),weighted_n=int(s.PWGTP.sum()),weighted_events=int((s.PWGTP*(s.MARHD==1)).sum()),cells=len(tab),max_iterations=max(its),max_abs_normalized_score=float(np.abs(X.T@(N[:,0]-D[:,0]*expit(X@B[0]))).max()/D[:,0].sum())))
  print(checks[-1],flush=True)
for name,rows in [('joint_coefficients',coef),('predictive_margins',margins),('profiles',prof),('factor_association_ranges',ranges),('marginal_contrasts',contrasts)]:pd.DataFrame(rows).to_csv(ROOT/(name+'.csv'),index=False)
(ROOT/'checks.json').write_text(json.dumps(checks,indent=2))
