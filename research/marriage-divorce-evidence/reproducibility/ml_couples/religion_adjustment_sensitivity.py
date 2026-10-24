"""Same-complete-sample explanatory Poisson sensitivity; separate from predictive ML evaluation."""
from pathlib import Path
import ast,json,math
import numpy as np,pandas as pd
P=Path(__file__).resolve().parent
src=ast.parse((P.parent/'pairing_nlsy/analyze_pairing_nlsy.py').read_text());fn=next(n for n in src.body if isinstance(n,ast.FunctionDef) and n.name=='fit')
for node in fn.body:
 if isinstance(node,ast.Return):node.value=ast.Tuple(elts=[node.value,ast.Name(id='b',ctx=ast.Load()),ast.Name(id='V',ctx=ast.Load()),ast.Name(id='cols',ctx=ast.Load())],ctx=ast.Load())
mod=ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[]));scope={'np':np,'pd':pd};exec(compile(mod,'original_pairing_fit','exec'),scope);fit=scope['fit']
f=pd.read_csv(P.parent/'pairing_nlsy/spouse_pair_intervals.csv');school=['12 years','<12 years','13–15 years','16–17 years','18+ years'];base={'husband_school':school,'wife_school':school,'couple_wage_quartile':['Q2','Q1','Q3','Q4'],'work':['2,000+ hours','No work hours','1–1,999 hours'],'earnings_pair':['Balanced 40–60% wife','Husband majority, both positive','Husband only','Wife majority, both positive','Wife only']}
f=f[f.couple_wages>0].dropna(subset=list(base)+['age','current_marriage_years','religion_refresh']).copy();allout=[];direct=[];aud={}
for name in ['Same sample, original covariates','Same sample + own prior attendance']:
 cat=dict(base)
 if name.endswith('attendance'):cat['religion_refresh']=['Never','Less than weekly','Weekly or more']
 ((rows,meta),b,V,cols)=fit(f,cat);aud[name]=meta
 for r in rows:allout.append(dict(model=name,**r))
 a=cols.index('earnings_pair: Husband only vs Balanced 40–60% wife');z=cols.index('earnings_pair: Husband majority, both positive vs Balanced 40–60% wife');d=b[a]-b[z];v=V[a,a]+V[z,z]-2*V[a,z];se=math.sqrt(max(v,0));direct.append(dict(model=name,contrast='Husband only vs husband-majority with both positive wages',rate_ratio=math.exp(d),ci_low=math.exp(d-1.96*se),ci_high=math.exp(d+1.96*se)))
pd.DataFrame(allout).to_csv(P/'religion_sensitivity_explanatory_coefficients.csv',index=False);pd.DataFrame(direct).to_csv(P/'religion_sensitivity_direct_earnings_contrast.csv',index=False);json.dump(aud,open(P/'religion_sensitivity_sample_audit.json','w'),indent=2)
print(pd.DataFrame(allout).query("term.str.startswith('earnings_pair') or term.str.startswith('religion')",engine='python').to_string(index=False));print(pd.DataFrame(direct).to_string(index=False))
# Separate exact latest-profile specification: marriage-order control, no respondent-work control.
pf=pd.read_csv(P.parent/'couple_profiles/couple_profile_input.csv').dropna(subset=['religion_refresh']).copy();pcat={k:v for k,v in base.items() if k!='work'};pcat['marriage_order_group']=['First','Subsequent'];PO=[];PD=[];PA={}
for name in ['Profile specification, same attendance-complete sample','Profile specification + own prior attendance']:
 cat=dict(pcat)
 if name.endswith('attendance'):cat['religion_refresh']=['Never','Less than weekly','Weekly or more']
 ((rows,meta),b,V,cols)=fit(pf,cat);PA[name]=meta
 for r in rows:PO.append(dict(model=name,**r))
 a=cols.index('earnings_pair: Husband only vs Balanced 40–60% wife');z=cols.index('earnings_pair: Husband majority, both positive vs Balanced 40–60% wife');d=b[a]-b[z];se=math.sqrt(max(V[a,a]+V[z,z]-2*V[a,z],0));PD.append(dict(model=name,contrast='Husband only vs husband-majority with both positive wages',rate_ratio=math.exp(d),ci_low=math.exp(d-1.96*se),ci_high=math.exp(d+1.96*se)))
pd.DataFrame(PO).to_csv(P/'profile_religion_sensitivity_coefficients.csv',index=False);pd.DataFrame(PD).to_csv(P/'profile_religion_sensitivity_direct_contrast.csv',index=False);json.dump(PA,open(P/'profile_religion_sensitivity_sample_audit.json','w'),indent=2)
print(pd.DataFrame(PD).to_string(index=False))
