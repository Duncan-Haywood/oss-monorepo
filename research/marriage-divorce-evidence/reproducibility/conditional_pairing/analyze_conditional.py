"""Prespecified broad compatibility interactions; grouped-by-person5foldvalidation.
No individual calibration or causal matching rule is claimed.
"""
from pathlib import Path
import json
import numpy as np,pandas as pd
from scipy.stats import chi2
ROOT=Path(__file__).resolve().parent
f=pd.read_csv(ROOT.parent/'couple_profiles/couple_profile_input.csv')
cat={'husband_school':['12 years','<12 years','13–15 years','16–17 years','18+ years'],'wife_school':['12 years','<12 years','13–15 years','16–17 years','18+ years'],'couple_wage_quartile':['Q2','Q1','Q3','Q4'],'earnings_pair':['Balanced 40–60% wife','Husband majority, both positive','Husband only','Wife majority, both positive','Wife only']}
hi=['16–17 years','18+ years'];f['husband_high']=f.husband_school.isin(hi);f['wife_high']=f.wife_school.isin(hi)
f['own_high']=np.where(f.sex=='Men',f.husband_high,f.wife_high);f['partner_high']=np.where(f.sex=='Men',f.wife_high,f.husband_high);f['both_high']=f.husband_high&f.wife_high
support=[]
for facets in [['own_high','partner_high'],['own_high','earnings_pair'],['both_high','earnings_pair'],['sex','own_high','partner_high','couple_wage_quartile','earnings_pair']]:
 for key,g in f.groupby(facets):
  if not isinstance(key,tuple):key=(key,)
  row={'support_grid':' x '.join(facets),**dict(zip(facets,key)),'intervals':len(g),'respondents':g.id.nunique(),'events':int(g.event.sum()),'person_years':g.exposure.sum()};row['screen_supported']=row['respondents']>=100 and row['events']>=10;support.append(row)
pd.DataFrame(support).to_csv(ROOT/'conditional_support.csv',index=False)
waves=sorted(f.start_wave.unique())
def design(g,mode):
 names=['Intercept'];xs=[np.ones(len(g))]
 for v,levels in cat.items():
  for lev in levels[1:]:names.append(v+': '+lev);xs.append(np.asarray(g[v]==lev,float))
 names+=['Age per10years','Marriage duration per10years','Women respondents','Subsequent marriage'];xs.extend([(g.age.to_numpy()-45)/10,g.current_marriage_years.to_numpy()/10,np.asarray(g.sex=='Women',float),np.asarray(g.marriage_order_group=='Subsequent',float)])
 for wave in waves[1:]:names.append('Wave '+str(wave));xs.append(np.asarray(g.start_wave==wave,float))
 if mode!='additive':names.append('Both schooling16+ interaction');xs.append(np.asarray(g.both_high,float))
 if mode=='school_and_earnings_interactions':
  names.append('Own schooling16+ main');xs.append(np.asarray(g.own_high,float))
  for lev in cat['earnings_pair'][1:]:names.append('Own schooling16+ x '+lev);xs.append(np.asarray(g.own_high&(g.earnings_pair==lev),float))
 return np.column_stack(xs),names

def fit(g,mode,robust=False):
 X,names=design(g,mode);y=g.event.to_numpy();e=g.exposure.to_numpy();w=g.weight.to_numpy();w=w/w.mean();b=np.zeros(X.shape[1]);b[0]=np.log((w@y)/(w@e))
 def ll(bb):return np.sum(w*(y*(X@bb)-e*np.exp(np.clip(X@bb,-30,20))))
 for it in range(100):
  mu=e*np.exp(np.clip(X@b,-30,20));H=X.T@((w*mu)[:,None]*X);score=X.T@(w*(y-mu));step=np.linalg.lstsq(H,score,rcond=1e-12)[0];a=1
  while ll(b+a*step)<ll(b)-1e-8 and a>1/4096:a/=2
  b+=a*step
  if abs(a*step).max()<1e-8:break
 mu=e*np.exp(X@b);V=None
 if robust:
  H=X.T@((w*mu)[:,None]*X);bread=np.linalg.pinv(H);S=pd.DataFrame(X*(w*(y-mu))[:,None]);S['id']=g.id.to_numpy();U=S.groupby('id').sum().to_numpy();G=len(U);V=bread@(U.T@U)@bread*G/(G-1)*(len(g)-1)/(len(g)-len(b))
 return b,V,names,dict(iterations=it+1,n=len(g),respondents=g.id.nunique(),events=int(y.sum()),parameters=len(b),rank=int(np.linalg.matrix_rank(X)),score=float(abs(X.T@(w*(y-mu))).max()/sum(w)))
def deviance(y,mu):
 term=mu-y;pos=y>0;term[pos]+=y[pos]*np.log(y[pos]/mu[pos]);return 2*term
modes=['additive','school_interaction','school_and_earnings_interactions'];coef=[];wald=[];audits=[];Bs={};Vs={}
for mode in modes:
 b,V,names,audit=fit(f,mode,True);audit['model']=mode;audits.append(audit);Bs[mode]=b;Vs[mode]=V
 for i,n in enumerate(names):
  se=np.sqrt(max(0,V[i,i]));coef.append(dict(model=mode,term=n,log_rate_ratio=b[i],se=se,rate_ratio=np.exp(b[i]),ci95_low=np.exp(b[i]-1.96*se),ci95_high=np.exp(b[i]+1.96*se)))
 groups={}
 if mode!='additive':groups['schooling_both_high']=[names.index('Both schooling16+ interaction')]
 if mode=='school_and_earnings_interactions':groups['ownschool_x_earnings_joint']=[i for i,n in enumerate(names) if n.startswith('Own schooling16+ x ')]
 for label,idx in groups.items():
  z=b[idx];vv=V[np.ix_(idx,idx)];stat=float(z@np.linalg.pinv(vv)@z);df=int(np.linalg.matrix_rank(vv));wald.append(dict(model=mode,test=label,df=df,wald_chi2=stat,p=chi2.sf(stat,df)))
pd.DataFrame(coef).to_csv(ROOT/'interaction_coefficients.csv',index=False);pd.DataFrame(wald).to_csv(ROOT/'interaction_wald.csv',index=False)
# Folds assigned once at respondent level; no person appears in train and test.
rng=np.random.default_rng(20261019);ids=np.array(sorted(f.id.unique()));rng.shuffle(ids);foldmap={pid:i%5 for i,pid in enumerate(ids)};f['cv_fold']=f.id.map(foldmap)
for mode in modes:f['heldout_deviance_'+mode]=np.nan;f['heldout_mu_'+mode]=np.nan
foldresults=[]
for fold in range(5):
 train=f[f.cv_fold!=fold];test=f[f.cv_fold==fold]
 assert set(train.id).isdisjoint(set(test.id))
 for mode in modes:
  b,_,_,au=fit(train,mode);X,_=design(test,mode);mu=test.exposure.to_numpy()*np.exp(X@b);dev=deviance(test.event.to_numpy(),mu);f.loc[test.index,'heldout_deviance_'+mode]=dev;f.loc[test.index,'heldout_mu_'+mode]=mu
  foldresults.append(dict(fold=fold,model=mode,test_respondents=test.id.nunique(),test_intervals=len(test),test_events=int(test.event.sum()),weighted_deviance_per_person_year=float(np.dot(test.weight,dev)/np.dot(test.weight,test.exposure)),**{'train_'+k:v for k,v in au.items()}))
pd.DataFrame(foldresults).to_csv(ROOT/'heldout_folds.csv',index=False)
metrics=[];wt=f.weight.to_numpy();py=np.dot(wt,f.exposure)
for mode in modes:metrics.append(dict(model=mode,weighted_heldout_deviance_per_person_year=np.dot(wt,f['heldout_deviance_'+mode])/py,weighted_heldout_observed_events=np.dot(wt,f.event),weighted_heldout_expected_events=np.dot(wt,f['heldout_mu_'+mode])))
pd.DataFrame(metrics).to_csv(ROOT/'heldout_metrics.csv',index=False)
# Paired respondent-bootstrap of cross-fitted deviance difference. Models/folds held fixed.
# Positive improvement means smaller deviance than additive model.
boot=[];rng=np.random.default_rng(31982)
for mode in modes[1:]:
 z=pd.DataFrame({'id':f.id,'improvement':f.weight*(f.heldout_deviance_additive-f['heldout_deviance_'+mode]),'person_years':f.weight*f.exposure}).groupby('id').sum();a=z.to_numpy();point=a[:,0].sum()/a[:,1].sum();rep=[]
 for _ in range(2000):
  ix=rng.integers(0,len(a),len(a));r=a[ix].sum(axis=0);rep.append(r[0]/r[1])
 boot.append(dict(model=mode,reference='additive',deviance_improvement_per_person_year=point,ci95_low=np.quantile(rep,.025),ci95_high=np.quantile(rep,.975),bootstrap='2000 paired respondent resamples; crossfit models held fixed'))
pd.DataFrame(boot).to_csv(ROOT/'heldout_improvement.csv',index=False)
f[['id','start_wave','sex','own_high','partner_high','couple_wage_quartile','earnings_pair','event','exposure','weight','cv_fold']+['heldout_mu_'+m for m in modes]+['heldout_deviance_'+m for m in modes]].to_csv(ROOT/'crossfit_predictions.csv',index=False)
json.dump(audits,open(ROOT/'model_audit.json','w'),indent=2)
print(pd.DataFrame(wald).to_string(index=False));print(pd.DataFrame(metrics).to_string(index=False));print(pd.DataFrame(boot).to_string(index=False))
