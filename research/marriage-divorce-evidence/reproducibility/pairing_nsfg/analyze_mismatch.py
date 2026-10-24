"""Historical first-marriage education pairing; survey Taylor inference.
python3 analyze_mismatch.py. Requires ../nsfg original downloads and modules.
"""
import sys
from pathlib import Path
P=Path(__file__).resolve().parent
sys.path.insert(0,str(P.parent/'nsfg'))
from contrasts import std, summary
from analyze import load,designvar
import numpy as np,pandas as pd
from scipy.stats import t
from scipy.special import expit
D=P.parent/'nsfg';d=load('female')
d['chedmarn']=pd.to_numeric(pd.read_fwf(D/'female.dat',colspecs=[(243,244)],names=['h'],skip_blank_lines=False).h,errors='coerce').to_numpy()
core=(d.fmarno>0)&d.ager.between(25,49);valid=d.chedmarn.between(1,6);y=d.marend01.isin([1,2]);w=d.wgt2017_2019.to_numpy()
rows=[];cts=[]
for level in [2,3]:
 wife=np.where(d.hieduc>=12,1,0) if level==2 else np.select([d.hieduc>=13,d.hieduc==12],[2,1],default=0)
 husband=np.where(d.chedmarn>=5,1,0) if level==2 else np.select([d.chedmarn==6,d.chedmarn==5],[2,1],default=0)
 names=['Below BA','BA+'] if level==2 else ['Below BA','Bachelor','Graduate/professional']
 fits={}
 for a in range(level):
  for b in range(level):
   dom=core&valid&(wife==a)&(husband==b);fit=std(d,core,dom,y)
   if fit is None:continue
   q,z,m=fit;fits[(a,b)]=(q,z)
   rows.append(dict(level=level,wife=names[a],husband=names[b],n=int(dom.sum()),events=int((dom&y).sum()),min_age_cell_n=m,sparse=(dom.sum()<100 or (dom&y).sum()<20 or m<10),**summary(d,q,z)))
 def contrast(name,terms):
  if not all(k in fits for k in terms):return
  q=sum(terms[k]*fits[k][0] for k in terms);z=sum(terms[k]*fits[k][1] for k in terms)
  cts.append(dict(level=level,contrast=name,**summary(d,q,z,True)))
 # Equal weighting balances education marginal distributions between matched and mismatched cells.
 contrast('Equal-cell average mismatched minus matched',{(a,b):(-1/level if a==b else 1/(level*(level-1))) for a in range(level) for b in range(level)})
 if level==2:
  contrast('Wife BA+/husband below BA minus wife below BA/husband BA+',{(1,0):1,(0,1):-1})
  contrast('Within wife BA+: husband below BA minus BA+',{(1,0):1,(1,1):-1})
  contrast('Within wife below BA: husband BA+ minus below BA',{(0,1):1,(0,0):-1})
  contrast('Within husband BA+: wife below BA minus BA+',{(0,1):1,(1,1):-1})
  contrast('Within husband below BA: wife BA+ minus below BA',{(1,0):1,(0,0):-1})
 # Survey pseudo-likelihood logistic: age5 + wife degree main + husband degree main + direction mismatch.
 mask=core&valid;idx=np.flatnonzero(mask);ab=pd.cut(d.ager,[24,29,34,39,44,49],labels=False).to_numpy()
 columns=[np.ones(len(d))];labels=['Intercept']
 for j in range(1,5):columns.append((ab==j).astype(float));labels.append(f'Age bin{j}')
 for j in range(1,level):columns.append((wife==j).astype(float));labels.append(f'Wife level{j}')
 for j in range(1,level):columns.append((husband==j).astype(float));labels.append(f'Husband level{j}')
 # 2x2 cannot separately identify both directional mismatches along with level mains (rank deficient).
 if level==2:
  columns.append((wife!=husband).astype(float));labels.append('Mismatched')
 else:
  columns.extend([(wife>husband).astype(float),(wife<husband).astype(float)]);labels.extend(['Wife higher','Husband higher'])
 X=np.column_stack(columns);xx=X[idx];yy=y.to_numpy()[idx].astype(float);ww=w[idx]/np.mean(w[idx]);beta=np.zeros(X.shape[1])
 for _ in range(100):
  mu=expit(xx@beta);bread=(xx.T*(ww*mu*(1-mu)))@xx;step=np.linalg.solve(bread,xx.T@(ww*(yy-mu)));beta+=step
  if np.max(abs(step))<1e-10:break
 mu=expit(xx@beta);bread=(xx.T*(ww*mu*(1-mu)))@xx
 score=np.zeros_like(X);score[idx]=xx*(ww*(yy-mu))[:,None];influence=score@np.linalg.inv(bread)
 for j,label in enumerate(labels):
  if label not in ['Mismatched','Wife higher','Husband higher']:continue
  v,df=designvar(d,influence[:,j]);se=np.sqrt(v);c=t.ppf(.975,df)
  cts.append(dict(level=level,contrast='Logistic '+label+' vs matched; age+wife+husband level main effects',log_or=beta[j],odds_ratio=np.exp(beta[j]),or_ci_low=np.exp(beta[j]-c*se),or_ci_high=np.exp(beta[j]+c*se),design_df=df,model_n=len(idx),model_rank=int(np.linalg.matrix_rank(xx))))
pd.DataFrame(rows).to_csv(P/'age_standardized_pairing_cells.csv',index=False)
pd.DataFrame(cts).to_csv(P/'formal_contrasts_and_models.csv',index=False)
print(pd.DataFrame(rows).to_string(index=False));print(pd.DataFrame(cts).to_string(index=False))
