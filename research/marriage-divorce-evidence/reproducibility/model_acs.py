"""Survey-weighted ACS binomial logit associations; all 80 SDR replicate fits.
Run after work/acs/analyze_acs.py. No causal interpretation.
"""
from pathlib import Path
import numpy as np, pandas as pd, json
from scipy.special import expit
P=Path(__file__).resolve().parent
W=['PWGTP']+['PWGTP'+str(i) for i in range(1,81)]
def fit(X,den,num):
 b=np.zeros(X.shape[1]); b[0]=-4
 for it in range(50):
  p=expit(X@b); g=X.T@(num-den*p); H=X.T@((den*p*(1-p))[:,None]*X)
  step=np.linalg.solve(H,g); b+=step
  if abs(step).max()<1e-8: return b,it+1
 raise RuntimeError('no convergence')
def main():
 d=pd.read_parquet(P/'acs/persons_30_64.parquet')
 d=d[d.MAR!=5].copy(); d['event']=(d.MARHD==1).astype(int)
 d['race_ethnicity']=np.where(d.HISP!=1,'Hispanic',np.where(d.RAC1P==1,'Non-Hispanic White',np.where(d.RAC1P==2,'Non-Hispanic Black','Non-Hispanic other')))
 levels={'age_bin':list(range(7)),'education':['Bachelor','Less than high school','High school/GED','Some college','Associate','Master','Professional','Doctorate'],'income_group':['50,000-74,999','Zero/negative','1-24,999','25,000-49,999','75,000-99,999','100,000-149,999','150,000-199,999','200,000+'],'employment':['Employed','Unemployed','Not in labor force','Armed forces'],'race_ethnicity':['Non-Hispanic White','Hispanic','Non-Hispanic Black','Non-Hispanic other']}
 rows=[]; checks=[]
 for sex in ['Men','Women']:
  sub=d[d.sex==sex]
  for focus in ['income_group','employment']:
   variables=['age_bin','education','race_ethnicity',focus]
   den=sub.groupby(variables,observed=True)[W].sum()
   num=sub[sub.event==1].groupby(variables,observed=True)[W].sum().reindex(den.index,fill_value=0)
   tab=den.reset_index();xs=[np.ones(len(tab))];names=['Intercept']
   for v in variables:
    for lev in levels[v][1:]: xs.append((tab[v]==lev).to_numpy(float));names.append(v+':'+str(lev))
   X=np.column_stack(xs); D=den.to_numpy(float);N=num.to_numpy(float)
   betas=[];iters=[]
   for j in range(81):
    b,it=fit(X,D[:,j],N[:,j]);betas.append(b);iters.append(it)
   B=np.array(betas);se=np.sqrt(4/80*((B[1:]-B[0])**2).sum(axis=0))
   for i,name in enumerate(names):
    rows.append(dict(model=focus,sex=sex,term=name,log_odds=B[0,i],se=se[i],odds_ratio=np.exp(B[0,i]),ci95_low=np.exp(B[0,i]-1.96*se[i]),ci95_high=np.exp(B[0,i]+1.96*se[i]),unweighted_n=len(sub),events=int(sub.event.sum())))
   checks.append(dict(sex=sex,model=focus,max_iterations=max(iters),cells=len(tab),n=len(sub),events=int(sub.event.sum()),weights=int(sub.PWGTP.sum())))
 pd.DataFrame(rows).to_csv(P/'acs/adjusted_models.csv',index=False)
 (P/'acs/model_checks.json').write_text(json.dumps(checks,indent=2))
 print(json.dumps(checks))
if __name__=='__main__':main()
