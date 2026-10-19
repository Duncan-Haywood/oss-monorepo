"""Independently reconstruct design rows and standardized rates from saved coefficients."""
from pathlib import Path
import json,math
import numpy as np,pandas as pd
P=Path(__file__).resolve().parent;f=pd.read_csv(P/'couple_profile_input.csv');c=pd.read_csv(P/'joint_model_coefficients.csv');b=c.coefficient.to_numpy();names=c.term.tolist();V=pd.read_csv(P/'joint_model_covariance.csv',index_col=0).to_numpy();q=f.weight.to_numpy()*f.exposure.to_numpy();q/=sum(q)
def rows(d):
 Z=[]
 for term in names:
  if term=='Intercept':z=np.ones(len(d))
  elif ': ' in term:
   fac,tail=term.split(': ',1);level=tail.split(' vs ',1)[0];z=(d[fac]==level).to_numpy().astype(float)
  elif term=='Age per 10 years':z=(d.age.to_numpy()-45)/10
  elif term=='Current marriage years per 10':z=d.current_marriage_years.to_numpy()/10
  elif term=='Women respondents vs men':z=(d.sex=='Women').to_numpy().astype(float)
  elif term=='Subsequent vs first marriage':z=(d.marriage_order_group=='Subsequent').to_numpy().astype(float)
  elif term.startswith('Wave '):z=(d.start_wave==int(term.split()[1])).to_numpy().astype(float)
  else:raise ValueError(term)
  Z.append(z)
 return np.column_stack(Z)
X=rows(f);mu=f.exposure.to_numpy()*np.exp(X@b);w=f.weight.to_numpy();w/=w.mean();score=X.T@(w*(f.event.to_numpy()-mu));assert max(abs(score))/sum(w)<1e-9;assert abs(np.dot(w,mu)-np.dot(w,f.event.to_numpy()))<1e-7
mix=json.load(open(P/'school_16plus_fixed_mixture.json'));profiles=pd.read_csv(P/'complete_couple_profiles.csv');checks=[]
for r in profiles.itertuples():
 if not r.supported:
  assert math.isnan(r.rate_per_1000);continue
 pairs=mix if r.schooling=='Both 16+' else [dict(husband_school='12 years',wife_school='12 years',weight=1)]
 total=0.;grad=np.zeros(len(b))
 for pair in pairs:
  d=f.copy();d['husband_school']=pair['husband_school'];d['wife_school']=pair['wife_school'];d['couple_wage_quartile']=r.couple_wages;d['earnings_pair']=r.earnings_role;Z=rows(d);weighted=q*pair['weight']*np.exp(Z@b);total+=sum(weighted);grad+=Z.T@weighted
 logse=math.sqrt((grad/total)@V@(grad/total));lo=1000*total*math.exp(-1.96*logse);hi=1000*total*math.exp(1.96*logse)
 assert abs(1000*total-r.rate_per_1000)<1e-9;assert abs(lo-r.ci_low)<1e-9;assert abs(hi-r.ci_high)<1e-9
 checks.append(dict(profile=r.profile_id,independent_rate_per_1000=1000*total,ci_low=lo,ci_high=hi))
con=pd.read_csv(P/'standardized_direct_contrasts.csv')
for r in con.itertuples():
 assert abs(r.rate_A_per_1000-r.rate_B_per_1000-r.difference_per_1000)<1e-9
 assert abs(r.rate_A_per_1000/r.rate_B_per_1000-r.rate_ratio)<1e-9
out={'model_rank':int(np.linalg.matrix_rank(X)),'parameters':X.shape[1],'normalized_score':float(max(abs(score))/sum(w)),'independently_reconstructed_profiles':checks,'checks':'Passed design reconstruction from saved term labels, weighted score/fitted-count identities, standardized profile rates and log-delta CIs, direct difference/ratio arithmetic, and sparse-profile suppression.'};json.dump(out,open(P/'independent_verification.json','w'),indent=2);print(json.dumps(out,indent=2))
