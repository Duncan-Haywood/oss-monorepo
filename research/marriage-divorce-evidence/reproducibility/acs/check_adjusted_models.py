"""Independent full-weight coefficient check using scipy trust-exact optimizer."""
from pathlib import Path
import numpy as np,pandas as pd,json
from scipy.optimize import minimize
from scipy.special import expit
ROOT=Path(__file__).resolve().parent
d=pd.read_parquet(ROOT/'persons_30_64.parquet',columns=['sex','MAR','MARHD','HISP','RAC1P','age_bin','education','income_group','employment','PWGTP'])
d=d[d.MAR!=5].copy()
d['race_ethnicity']=np.select([d.HISP!=1,d.RAC1P==1,d.RAC1P==2],['Hispanic','Non-Hispanic White','Non-Hispanic Black'],default='Non-Hispanic other')
base={'age_bin':0,'education':'Bachelor','race_ethnicity':'Non-Hispanic White','income_group':'50,000-74,999','employment':'Employed'}
r=pd.read_csv(ROOT/'adjusted_models.csv');checks=[]
for sex in ['Men','Women']:
 for focus in ['income_group','employment']:
  sub=d[d.sex==sex];vs=['age_bin','education','race_ethnicity',focus]
  # Build alternative design via pandas dummies, removing references explicitly.
  sub=sub.copy();sub['num']=sub.PWGTP*(sub.MARHD==1)
  cells=sub.groupby(vs,observed=True)[['PWGTP','num']].sum().reset_index()
  names=['Intercept']; xx=[np.ones(len(cells))]
  for v in vs:
   for level in sorted(cells[v].unique()):
    if level==base[v]:continue
    names.append(v+':'+str(level));xx.append(np.asarray(cells[v]==level,float))
  X=np.column_stack(xx);weight=cells.PWGTP.to_numpy(float);y=cells.num.to_numpy(float)/weight
  weight/=weight.sum()
  fun=lambda b:np.sum(weight*(np.logaddexp(0,X@b)-y*(X@b)))
  jac=lambda b:X.T@(weight*(expit(X@b)-y))
  hess=lambda b:X.T@((weight*expit(X@b)*(1-expit(X@b)))[:,None]*X)
  b0=np.zeros(len(names));b0[0]=-4
  fit=minimize(fun,b0,jac=jac,hess=hess,method='trust-exact',options={'gtol':1e-11})
  reported=r[(r.sex==sex)&(r.model==focus)].set_index('term').loc[names,'log_odds'].to_numpy()
  checks.append(dict(sex=sex,model=focus,max_abs_logodds_difference=float(abs(fit.x-reported).max()),max_abs_normalized_score_reported=float(abs(jac(reported)).max()),optimizer_success=bool(fit.success)))
(ROOT/'adjusted_model_independent_checks.json').write_text(json.dumps(checks,indent=2));print(checks)
