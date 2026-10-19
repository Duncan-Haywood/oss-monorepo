"""Direct husband-only vs husband-majority dual-earner standardized contrast.
Reads saved model coefficients/covariance; never refits or mutates originals.
"""
from pathlib import Path
import json,math
import numpy as np,pandas as pd
P=Path(__file__).resolve().parent;D=P.parent/'couple_profiles'
f=pd.read_csv(D/'couple_profile_input.csv');c=pd.read_csv(D/'joint_model_coefficients.csv');b=c.coefficient.to_numpy();V=pd.read_csv(D/'joint_model_covariance.csv',index_col=0).to_numpy();names=c.term.tolist()
cat={'husband_school':['12 years','<12 years','13–15 years','16–17 years','18+ years'],'wife_school':['12 years','<12 years','13–15 years','16–17 years','18+ years'],'couple_wage_quartile':['Q2','Q1','Q3','Q4'],'earnings_pair':['Balanced 40–60% wife','Husband majority, both positive','Husband only','Wife majority, both positive','Wife only']}
waves=sorted(f.start_wave.unique());target=(f.weight*f.exposure).to_numpy();target/=sum(target)
def design(g):
 X=[np.ones(len(g))]
 for fac,lev in cat.items():
  for v in lev[1:]:X.append((g[fac]==v).to_numpy(float))
 X.extend([(g.age.to_numpy()-45)/10,g.current_marriage_years.to_numpy()/10,(g.sex=='Women').to_numpy(float),(g.marriage_order_group=='Subsequent').to_numpy(float)])
 for wave in waves[1:]:X.append((g.start_wave==wave).to_numpy(float))
 return np.column_stack(X)
def pred(settings,bb=b):
 g=f.copy()
 for k,v in settings.items():g[k]=v
 X=design(g);rate=np.exp(X@bb);return np.dot(target,rate),X.T@(target*rate)
def contrast(label,setting):
 a,da=pred(dict(setting,earnings_pair='Husband only'));z,dz=pred(dict(setting,earnings_pair='Husband majority, both positive'));diff=a-z;dd=da-dz;sd=np.sqrt(dd@V@dd);lr=da/a-dz/z;sr=np.sqrt(lr@V@lr);rr=a/z
 return dict(context=label,rate_husband_only_per1000=a*1000,rate_husband_majority_dual_per1000=z*1000,difference_per1000=diff*1000,difference_ci95_low=(diff-1.96*sd)*1000,difference_ci95_high=(diff+1.96*sd)*1000,rate_ratio=rr,ratio_ci95_low=rr*np.exp(-1.96*sr),ratio_ci95_high=rr*np.exp(1.96*sr))
rows=[contrast('Whole-model common target; remaining observed characteristics preserved',{}),contrast('Both schooling12years and couplewagesQ1; common age/duration/order/wave/sex target',{'husband_school':'12 years','wife_school':'12 years','couple_wage_quartile':'Q1'})]
pd.DataFrame(rows).to_csv(P/'husband_only_vs_majority_direct.csv',index=False)
# Shared-model covariance is essential: verify RR from direct coefficient contrast.
i=names.index('earnings_pair: Husband only vs Balanced 40–60% wife');j=names.index('earnings_pair: Husband majority, both positive vs Balanced 40–60% wife');rr=math.exp(b[i]-b[j]);sl=math.sqrt(V[i,i]+V[j,j]-2*V[i,j]);err=max(abs(r['rate_ratio']-rr) for r in rows)
assert err<1e-12
# Gradient independent finite difference verification.
r,d=pred({'earnings_pair':'Husband only'});errors=[]
for j in [0,12,13,16,29]:
 bp=b.copy();bm=b.copy();bp[j]+=1e-6;bm[j]-=1e-6;rp,_=pred({'earnings_pair':'Husband only'},bp);rm,_=pred({'earnings_pair':'Husband only'},bm);errors.append(abs((rp-rm)/2e-6-d[j]))
assert max(errors)<1e-8
json.dump(dict(model_rows=len(f),respondents=int(f.id.nunique()),events=int(f.event.sum()),rate_ratio_direct_coefficient=rr,ratio_ci95_low=rr*np.exp(-1.96*sl),ratio_ci95_high=rr*np.exp(1.96*sl),RR_identity_max_error=err,gradient_max_error=max(errors),unsupported_highschooling_Q4_singleincome_events=4,uncertainty='Saved respondent-cluster sandwich; fixed empirical target, no original surveyPSU/strata; exploratory'),open(P/'validation.json','w'),indent=2)
print(pd.DataFrame(rows).to_string(index=False))
