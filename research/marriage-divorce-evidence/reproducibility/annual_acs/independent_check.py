"""Independent full-weight optimizer and profile arithmetic validation."""
from pathlib import Path
import numpy as np,pandas as pd,json
from scipy.special import expit
from scipy.optimize import minimize
P=Path(__file__).resolve().parent
base=P.parent/'acs/persons_30_64.parquet'
d=pd.read_parquet(base);d=d[(d.MARHT==1)&(d.MARHM!=1)].copy();d['dur']=2023-d.MARHYP;d=d[d.dur>=1]
d['age_at_marriage']=pd.cut(d.AGEP-d.dur,[-np.inf,22,27,32,37,np.inf],right=False,labels=['<22','22-26','27-31','32-36','37+']).astype('str');d['duration']=pd.cut(d.dur,[1,5,10,20,np.inf],right=False,labels=['1-4','5-9','10-19','20+']).astype('str')
d['race_ethnicity']=np.select([d.HISP!=1,d.RAC1P==1,d.RAC1P==2],['Hispanic','Non-Hispanic White','Non-Hispanic Black'],default='Non-Hispanic other')
d=d[d.MAR.isin([1,4])|(d.MARHD==1)]
coef=pd.read_csv(P/'first_marriage/joint_coefficients.csv');profiles=pd.read_csv(P/'first_marriage/profiles.csv');checks=[]
for sex in ['Men','Women']:
 s=d[d.sex==sex].copy();s['N']=s.PWGTP*(s.MARHD==1);cols=['age_at_marriage','duration','education','income_group','employment','race_ethnicity'];t=s.groupby(cols,observed=True)[['PWGTP','N']].sum().reset_index()
 c=coef[coef.sex==sex];names=c.term.tolist();X=np.column_stack([np.ones(len(t))]+[(t[n.split(':',1)[0]]==n.split(':',1)[1]).to_numpy(float) for n in names[1:]])
 w=t.PWGTP.to_numpy(float);w/=w.sum();y=t.N.to_numpy()/t.PWGTP.to_numpy();b0=np.zeros(len(names));b0[0]=-4
 fun=lambda b:np.sum(w*(np.logaddexp(0,X@b)-y*(X@b)))
 jac=lambda b:X.T@(w*(expit(X@b)-y))
 hess=lambda b:X.T@((w*expit(X@b)*(1-expit(X@b)))[:,None]*X)
 fit=minimize(fun,b0,jac=jac,hess=hess,method='trust-exact',options={'gtol':1e-11})
 err=float(abs(fit.x-c.log_odds.to_numpy()).max());assert err<1e-6
 for _,r in profiles[profiles.sex==sex].iterrows():
  xp=X.copy()
  for variable,value in json.loads(r.settings).items():
   for j,n in enumerate(names):
    if n.startswith(variable+':'):xp[:,j]=(n.split(':',1)[1]==value)
  pred=100*np.sum(w*expit(xp@fit.x));assert abs(pred-r.estimate)<1e-6
 checks.append({'sex':sex,'max_logodds_difference':err,'profile_margin_check':'passed','n':len(s),'events':int((s.MARHD==1).sum())})
(P/'independent_checks.json').write_text(json.dumps(checks,indent=2));print(checks)
