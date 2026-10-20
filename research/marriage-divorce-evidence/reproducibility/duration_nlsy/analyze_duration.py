"""Marriage-duration person-time segmentation, prospective rates, fixed adjacent contrasts.
Input derives from the validated baseline co-resident spouse-pair dataset. No site changes.
"""
from pathlib import Path
import json,math
import numpy as np,pandas as pd
P=Path(__file__).resolve().parent;source=P/'duration_input_intervals.csv'
if not source.exists():source=P.parent/'couple_profiles/couple_profile_input.csv'
f=pd.read_csv(source);f.to_csv(P/'duration_input_intervals.csv',index=False)
bounds=[0,5,10,15,20,25,30,40,float('inf')];labels=['0–<5','5–<10','10–<15','15–<20','20–<25','25–<30','30–<40','40+'];out=[]
for ix,r in f.iterrows():
 start=float(r.current_marriage_years);end=start+float(r.exposure);edges=[start]+[b for b in bounds[1:-1] if start+1e-9<b<end-1e-9]+[end]
 for j,(lo,hi) in enumerate(zip(edges[:-1],edges[1:])):
  if hi-lo<1e-10:continue
  band=next(k for k in range(8) if bounds[k]<=((lo+hi)/2)<bounds[k+1]);z=r.to_dict();z.update(interval_id=ix,duration_band=labels[band],duration_low=lo,duration_high=hi,segment_exposure=hi-lo,segment_event=int(r.event) if j==len(edges)-2 else 0,segment_widow=int(r.widow) if j==len(edges)-2 else 0,attained_age=float(r.age)+(lo+hi)/2-start);out.append(z)
s=pd.DataFrame(out);s.to_csv(P/'duration_person_time_segments.csv',index=False)
assert abs(s.segment_exposure.sum()-f.exposure.sum())<1e-7;assert s.segment_event.sum()==f.event.sum();assert s.segment_widow.sum()==f.widow.sum()

def crude(g):
 E=float((g.weight*g.segment_event).sum());T=float((g.weight*g.segment_exposure).sum());r=E/T;u=(g.weight*(g.segment_event-r*g.segment_exposure)).groupby(g.id).sum();G=len(u);se=math.sqrt(G/(G-1)*(u*u).sum())/T;lo=r*math.exp(-1.96*se/r) if r>0 else np.nan;hi=r*math.exp(1.96*se/r) if r>0 else np.nan
 return dict(segments=len(g),intervals=int(g.interval_id.nunique()),respondents=int(g.id.nunique()),events=int(g.segment_event.sum()),widow_censors=int(g.segment_widow.sum()),person_years=float(g.segment_exposure.sum()),weighted_person_years=T,rate_per_1000=1000*r,ci_low=1000*lo,ci_high=1000*hi,caution='Fewer than 10 observed events' if g.segment_event.sum()<10 else '')
R=[]
for sex in ['All','Men','Women']:
 z=s if sex=='All' else s[s.sex==sex]
 for band in labels:R.append(dict(reporting_sex=sex,duration_band=band,**crude(z[z.duration_band==band])))
pd.DataFrame(R).to_csv(P/'duration_crude_rates.csv',index=False)
cat={'husband_school':['12 years','<12 years','13–15 years','16–17 years','18+ years'],'wife_school':['12 years','<12 years','13–15 years','16–17 years','18+ years'],'couple_wage_quartile':['Q2','Q1','Q3','Q4'],'earnings_pair':['Balanced 40–60% wife','Husband majority, both positive','Husband only','Wife majority, both positive','Wife only'],'duration_band':labels}
waves=sorted(s.start_wave.unique());names=['Intercept']
for fac,cats in cat.items():
 for le in cats[1:]:names.append(fac+': '+le+' vs '+cats[0])
names+=['Attained age per 10 years','Women respondents vs men','Subsequent vs first marriage']
for wave in waves[1:]:names.append('Wave '+str(int(wave))+' vs '+str(int(waves[0])))
def design(g):
 X=[np.ones(len(g))]
 for fac,cats in cat.items():
  for le in cats[1:]:X.append((g[fac]==le).to_numpy().astype(float))
 X.extend([(g.attained_age.to_numpy()-45)/10,(g.sex=='Women').to_numpy().astype(float),(g.marriage_order_group=='Subsequent').to_numpy().astype(float)])
 for wave in waves[1:]:X.append((g.start_wave==wave).to_numpy().astype(float))
 return np.column_stack(X)
X=design(s);w=s.weight.to_numpy();w=w/w.mean();y=s.segment_event.to_numpy();ex=s.segment_exposure.to_numpy();b=np.zeros(X.shape[1]);b[0]=np.log(np.dot(w,y)/np.dot(w,ex))
def ll(bb):
 eta=np.clip(X@bb,-30,20);return np.dot(w,y*eta-ex*np.exp(eta))
for it in range(80):
 mu=ex*np.exp(np.clip(X@b,-30,20));H=X.T@((w*mu)[:,None]*X);score=X.T@(w*(y-mu));step=np.linalg.lstsq(H,score,rcond=1e-10)[0];scl=1
 while ll(b+scl*step)<ll(b)-1e-8 and scl>1/1024:scl/=2
 b+=scl*step
 if max(abs(scl*step))<1e-9:break
mu=ex*np.exp(np.clip(X@b,-30,20));H=X.T@((w*mu)[:,None]*X);B=np.linalg.pinv(H,rcond=1e-10);sc=pd.DataFrame((w*(y-mu))[:,None]*X);sc['id']=s.id.to_numpy();U=sc.groupby('id').sum().to_numpy();G=len(U);V=B@(U.T@U)@B*G/(G-1)*(len(s)-1)/(len(s)-len(b));se=np.sqrt(np.maximum(np.diag(V),0))
pd.DataFrame([dict(term=n,coefficient=bb,se=ss,rate_ratio=np.exp(bb),ci_low=np.exp(bb-1.96*ss),ci_high=np.exp(bb+1.96*ss)) for n,bb,ss in zip(names,b,se)]).to_csv(P/'duration_joint_coefficients.csv',index=False);pd.DataFrame(V,index=names,columns=names).to_csv(P/'duration_joint_covariance.csv')
# Common late-midlife target prevents assigning forty-year marriages to respondents aged 35.
target=s[(s.attained_age>=55)&(s.attained_age<65)].copy();q=(target.weight*target.segment_exposure).to_numpy();q/=q.sum();M=[];pred={}
for band in labels:
 z=target.copy();z['duration_band']=band;A=design(z);lam=np.exp(A@b);r=float(np.dot(q,lam));d=A.T@(q*lam);g=d/r;sr=math.sqrt(max(float(g@V@g),0));pred[band]=(r,d)
 support=target[target.duration_band==band]
 M.append(dict(duration_band=band,rate_per_1000=1000*r,ci_low=1000*r*math.exp(-1.96*sr),ci_high=1000*r*math.exp(1.96*sr),target_age='55–<65',observed_target_respondents=int(support.id.nunique()),observed_target_events=int(support.segment_event.sum()),observed_target_person_years=float(support.segment_exposure.sum())))
pd.DataFrame(M).to_csv(P/'duration_adjusted_common_target_rates.csv',index=False)
C=[]
for low,high in zip(labels[:-1],labels[1:]):
 ra,da=pred[high];rb,db=pred[low];lr=da/ra-db/rb;sr=math.sqrt(max(float(lr@V@lr),0));rr=ra/rb;diff=ra-rb;dd=da-db;sd=math.sqrt(max(float(dd@V@dd),0));p=math.erfc(abs(math.log(rr)/sr)/math.sqrt(2)) if sr>0 else np.nan
 C.append(dict(contrast=high+' vs '+low,earlier_band=low,later_band=high,difference_per_1000=1000*diff,difference_ci_low=1000*(diff-1.96*sd),difference_ci_high=1000*(diff+1.96*sd),rate_ratio=rr,ratio_ci_low=rr*math.exp(-1.96*sr),ratio_ci_high=rr*math.exp(1.96*sr),p_value=p))
order=np.argsort([r['p_value'] for r in C]);running=0
for rank,j in enumerate(order):
 running=max(running,min(1,(len(C)-rank)*C[j]['p_value']));C[j]['p_holm']=running;C[j]['clear_adjacent_difference_holm_005']=bool(running<.05)
pd.DataFrame(C).to_csv(P/'duration_adjacent_band_contrasts.csv',index=False)
# Observed late-midlife support permits readers to assess standardized category support.
audit=dict(input_intervals=len(f),segments=len(s),respondents=int(s.id.nunique()),input_events=int(f.event.sum()),split_events=int(s.segment_event.sum()),input_widows=int(f.widow.sum()),split_widows=int(s.segment_widow.sum()),input_person_years=float(f.exposure.sum()),split_person_years=float(ex.sum()),weighted_input_person_years=float((f.weight*f.exposure).sum()),weighted_split_person_years=float((s.weight*s.segment_exposure).sum()),model_rank=int(np.linalg.matrix_rank(X)),model_parameters=X.shape[1],iterations=it+1,normalized_max_score=float(max(abs(X.T@(w*(y-mu))))/sum(w)),weighted_normalized_fitted_events=float(np.dot(w,mu)),weighted_normalized_observed_events=float(np.dot(w,y)),target_age_min=55,target_age_upper_exclusive=65,target_segments=len(target),target_respondents=int(target.id.nunique()),target_events=int(target.segment_event.sum()),target_person_years=float(target.segment_exposure.sum()),adjacent_comparisons=7,holm_clear_comparisons=int(sum(r['clear_adjacent_difference_holm_005'] for r in C)),target_distribution_fixed=True)
assert audit['model_rank']==audit['model_parameters'];assert audit['normalized_max_score']<1e-9
json.dump(audit,open(P/'duration_audit.json','w'),indent=2)
print(json.dumps(audit,indent=2));print(pd.DataFrame(R).query("reporting_sex=='All'").to_string(index=False));print(pd.DataFrame(M).to_string(index=False));print(pd.DataFrame(C).to_string(index=False))
# Omnibus fixed-band test distinguishes a general duration association from an abrupt threshold.
ix=[i for i,n in enumerate(names) if n.startswith('duration_band:')];z=b[ix];W=float(z@np.linalg.solve(V[np.ix_(ix,ix)],z));t=W/2;pv=math.erfc(math.sqrt(t))
for a in [.5,1.5,2.5]:pv+=math.exp(a*math.log(t)-t-math.lgamma(a+1))
json.dump({'test':'Respondent-cluster robust Wald test of all seven duration indicators jointly zero','statistic':W,'degrees_freedom':7,'p_value':pv,'interpretation':'Overall association across fixed duration bands, not evidence of a particular step or causal threshold'},open(P/'duration_global_test.json','w'),indent=2)
