"""Prespecified complete-couple profiles and common-target marginal standardization.
Input is the validated prospective baseline spouse-pair interval dataset, not cross-sectional couples.
"""
from pathlib import Path
import json,math
import numpy as np
import pandas as pd
P=Path(__file__).resolve().parent
input_path=P/'couple_profile_input.csv'
if not input_path.exists():input_path=P.parent/'pairing_nlsy/spouse_pair_intervals.csv'
f=pd.read_csv(input_path);f=f[f.couple_wages>0].copy()
if 'marriage_order_group' not in f:
 raw=pd.read_csv(P.parent/'pairing_nlsy/pairing_nlsy_extract.csv').set_index('R0000100')
 cb=json.load(open(P.parent/'pairing_nlsy/pairing_nlsy_codebook.json'))
 lookup={v['name']:k for k,v in cb.items() if v['year']=='XRND'}
 dates={}
 for pid,r in raw.iterrows():
  starts=[]
  for k in range(1,8):
   yy=r[lookup[f'YRBG{k}M']];mm=r[lookup[f'MOBG{k}M']]
   if 1900<=yy<=2025 and 1<=mm<=12:starts.append((k,yy+(mm-.5)/12))
  dates[int(pid)]=starts
 orders=[]
 for r in f.itertuples():
  ordinal=[k for k,t in dates[int(r.id)] if t<=r.start]
  orders.append('Subsequent' if ordinal and max(ordinal)>=2 else ('First' if ordinal and max(ordinal)==1 else None))
 f['marriage_order_group']=orders
cat={'husband_school':['12 years','<12 years','13–15 years','16–17 years','18+ years'],'wife_school':['12 years','<12 years','13–15 years','16–17 years','18+ years'],'couple_wage_quartile':['Q2','Q1','Q3','Q4'],'earnings_pair':['Balanced 40–60% wife','Husband majority, both positive','Husband only','Wife majority, both positive','Wife only']}
f=f.dropna(subset=list(cat)+['age','current_marriage_years','marriage_order_group']).copy().reset_index(drop=True)
f.to_csv(P/'couple_profile_input.csv',index=False)
waves=sorted(f.start_wave.unique());names=['Intercept']
for fac,lev in cat.items():
 for c in lev[1:]:names.append(fac+': '+c+' vs '+lev[0])
names+=['Age per 10 years','Current marriage years per 10','Women respondents vs men','Subsequent vs first marriage']
for wave in waves[1:]:names.append('Wave '+str(int(wave))+' vs '+str(int(waves[0])))

def design(g):
 X=[np.ones(len(g))]
 for fac,lev in cat.items():
  for c in lev[1:]:X.append((g[fac]==c).to_numpy().astype(float))
 X.extend([(g.age.to_numpy()-45)/10,g.current_marriage_years.to_numpy()/10,(g.sex=='Women').to_numpy().astype(float),(g.marriage_order_group=='Subsequent').to_numpy().astype(float)])
 for wave in waves[1:]:X.append((g.start_wave==wave).to_numpy().astype(float))
 return np.column_stack(X)
X=design(f);y=f.event.to_numpy();ex=f.exposure.to_numpy();w=f.weight.to_numpy();w=w/w.mean();beta=np.zeros(X.shape[1]);beta[0]=np.log(np.dot(w,y)/np.dot(w,ex))
def ll(b):
 eta=np.clip(X@b,-30,20);return np.dot(w,y*eta-ex*np.exp(eta))
for it in range(80):
 mu=ex*np.exp(np.clip(X@beta,-30,20));H=X.T@((w*mu)[:,None]*X);score=X.T@(w*(y-mu));step=np.linalg.lstsq(H,score,rcond=1e-10)[0];scale=1
 while ll(beta+scale*step)<ll(beta)-1e-8 and scale>1/1024:scale/=2
 beta+=scale*step
 if max(abs(scale*step))<1e-9:break
mu=ex*np.exp(np.clip(X@beta,-30,20));H=X.T@((w*mu)[:,None]*X);B=np.linalg.pinv(H,rcond=1e-10);S=pd.DataFrame((w*(y-mu))[:,None]*X);S['id']=f.id.to_numpy();U=S.groupby('id').sum().to_numpy();G=len(U);V=B@(U.T@U)@B*G/(G-1)*(len(f)-1)/(len(f)-len(beta));se=np.sqrt(np.maximum(np.diag(V),0))
pd.DataFrame([dict(term=n,coefficient=b,se=s,rate_ratio=np.exp(b),ci_low=np.exp(b-1.96*s),ci_high=np.exp(b+1.96*s)) for n,b,s in zip(names,beta,se)]).to_csv(P/'joint_model_coefficients.csv',index=False)
pd.DataFrame(V,index=names,columns=names).to_csv(P/'joint_model_covariance.csv')
target=f.weight.to_numpy()*ex;target/=sum(target)
high=['16–17 years','18+ years'];hh=f[f.husband_school.isin(high)&f.wife_school.isin(high)].copy();hh['target_weight']=hh.weight*hh.exposure
mix=hh.groupby(['husband_school','wife_school']).target_weight.sum();mix/=mix.sum();mix=[dict(husband_school=h,wife_school=ww,weight=float(v)) for (h,ww),v in mix.items()]
json.dump(mix,open(P/'school_16plus_fixed_mixture.json','w'),indent=2)

def standardized(settings,school_mode=None,b=beta):
 mixtures=mix if school_mode=='Both 16+' else [dict(weight=1)]
 R=0.;grad=np.zeros(len(beta))
 for pair in mixtures:
  z=f.copy()
  for key,value in settings.items():z[key]=value
  if school_mode=='Both 12':z['husband_school']='12 years';z['wife_school']='12 years'
  if school_mode=='Both 16+':z['husband_school']=pair['husband_school'];z['wife_school']=pair['wife_school']
  A=design(z);lam=np.exp(A@b);q=target*pair['weight'];R+=float(np.dot(q,lam));grad+=A.T@(q*lam)
 return R,grad

def estimate(settings,school_mode=None):
 R,d=standardized(settings,school_mode);g=d/R;var=float(g@V@g);se=math.sqrt(max(var,0));return dict(rate_per_1000=1000*R,ci_low=1000*R*math.exp(-1.96*se),ci_high=1000*R*math.exp(1.96*se)),R,d

def support(g):
 return dict(intervals=len(g),respondents=int(g.id.nunique()),events=int(g.event.sum()),person_years=float(g.exposure.sum()))

def crude(g):
 r=(g.weight*g.event).sum()/(g.weight*g.exposure).sum();return 1000*r
# Predefined archetypes; sparse configurations remain visible but are not promoted as supported profiles.
specs=[('Both 12','Q1','Balanced 40–60% wife'),('Both 12','Q1','Husband majority, both positive'),('Both 12','Q1','Husband only'),('Both 12','Q2','Balanced 40–60% wife'),('Both 16+','Q4','Balanced 40–60% wife'),('Both 16+','Q4','Husband majority, both positive'),('Both 16+','Q4','Husband only'),('Both 16+','Q4','Wife majority, both positive'),('Both 16+','Q4','Wife only')]
PROFILES=[];PRED={}
for i,(school,q,role) in enumerate(specs,1):
 sm=(f.husband_school.eq('12 years')&f.wife_school.eq('12 years')) if school=='Both 12' else (f.husband_school.isin(high)&f.wife_school.isin(high))
 z=f[sm&f.couple_wage_quartile.eq(q)&f.earnings_pair.eq(role)];n=support(z);ok=n['respondents']>=100 and n['events']>=10
 row=dict(profile_id='P'+str(i),schooling=school,couple_wages=q,earnings_role=role,**n,observed_rate_per_1000=crude(z),supported=ok)
 if ok:
  e,R,d=estimate(dict(couple_wage_quartile=q,earnings_pair=role),school);row.update(e);PRED[row['profile_id']]=(R,d)
 else:row.update(rate_per_1000=np.nan,ci_low=np.nan,ci_high=np.nan)
 PROFILES.append(row)
pd.DataFrame(PROFILES).to_csv(P/'complete_couple_profiles.csv',index=False)

def contrast(label,A,B,meta=None):
 ra,da=A;rb,db=B;lr=da/ra-db/rb;sr=math.sqrt(max(float(lr@V@lr),0));diff=ra-rb;dd=da-db;sd=math.sqrt(max(float(dd@V@dd),0));rr=ra/rb
 return dict(contrast=label,rate_A_per_1000=1000*ra,rate_B_per_1000=1000*rb,difference_per_1000=1000*diff,difference_ci_low=1000*(diff-1.96*sd),difference_ci_high=1000*(diff+1.96*sd),rate_ratio=rr,ratio_ci_low=rr*math.exp(-1.96*sr),ratio_ci_high=rr*math.exp(1.96*sr),**(meta or {}))
CON=[]
_,ra,da=estimate({'couple_wage_quartile':'Q4'});_,rb,db=estimate({'couple_wage_quartile':'Q1'});CON.append(contrast('Combined wages Q4 vs Q1',(ra,da),(rb,db)))
_,ra,da=estimate({},'Both 16+');_,rb,db=estimate({},'Both 12');CON.append(contrast('Both schooling 16+ vs both 12',(ra,da),(rb,db)))
_,rb,db=estimate({'earnings_pair':'Balanced 40–60% wife'})
for role in cat['earnings_pair'][1:]:
 _,ra,da=estimate({'earnings_pair':role});CON.append(contrast(role+' vs balanced',(ra,da),(rb,db)))
for aa,bb in [('P2','P1'),('P3','P1'),('P6','P5'),('P5','P4')]:
 if aa in PRED and bb in PRED:CON.append(contrast(aa+' vs '+bb,PRED[aa],PRED[bb]))
pd.DataFrame(CON).to_csv(P/'standardized_direct_contrasts.csv',index=False)
# Finite-difference gradient check for standardized rates; independent arithmetic checks saved below.
settings={'couple_wage_quartile':'Q4','earnings_pair':'Balanced 40–60% wife'};R,d=standardized(settings,'Both 16+');errs=[]
for j in [0,1,8,12,20,len(beta)-1]:
 bp=beta.copy();bm=beta.copy();bp[j]+=1e-6;bm[j]-=1e-6;rp,_=standardized(settings,'Both 16+',bp);rm,_=standardized(settings,'Both 16+',bm);fd=(rp-rm)/2e-6;errs.append(abs(fd-d[j]))
audit=dict(intervals=len(f),respondents=int(f.id.nunique()),events=int(y.sum()),person_years=float(ex.sum()),rank=int(np.linalg.matrix_rank(X)),parameters=X.shape[1],iterations=it+1,normalized_max_score=float(max(abs(X.T@(w*(y-mu))))/sum(w)),weighted_fitted_events=float(np.dot(w,mu)),weighted_observed_events=float(np.dot(w,y)),target='Baseline-weighted observed person-year distribution of age, marriage duration, first/subsequent order, wave and respondent sex; other covariates preserved unless explicitly set',gradient_finite_difference_max_error=float(max(errs)),covariance_min_eigenvalue=float(np.linalg.eigvalsh(V).min()),profile_support_minimum='100 distinct respondents and 10 observed divorces',standardization_target_fixed=True)
json.dump(audit,open(P/'joint_model_audit.json','w'),indent=2)
assert audit['rank']==audit['parameters'];assert audit['normalized_max_score']<1e-9;assert audit['gradient_finite_difference_max_error']<1e-7
print(json.dumps(audit,indent=2));print(pd.DataFrame(PROFILES).to_string(index=False));print(pd.DataFrame(CON).to_string(index=False))
