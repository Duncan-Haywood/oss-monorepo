"""Original prospective spouse education/earnings-pairing analysis; no prior artifacts modified."""
from pathlib import Path
import json,re,math,collections
import numpy as np
import pandas as pd
P=Path(__file__).resolve().parent;D=json.load(open(P/'pairing_nlsy_codebook.json'));raw=pd.read_csv(P/'pairing_nlsy_extract.csv').set_index('R0000100');L={(v['year'],v['name']):k for k,v in D.items()}
risk=P/'annual_risk_input.csv'
if not risk.exists():risk=P.parent/'annual_nlsy/legally_married_primary/nlsy_annual_intervals.csv'
I=pd.read_csv(risk);I=I[I.baseline_status=='Married'].copy()
def val(r,y,n):
 k=L.get((str(y),n));return float(r[k]) if k else -999

def wages(r,y,p):
 for suffix in ['_TRUNC_REVISED','_TRUNC','']:
  k=L.get((str(y),p+suffix))
  if k:return float(r[k]) if r[k]>=0 else np.nan
 return np.nan

def tier(g):
 if not 0<=g<=20:return None
 return '<12 years' if g<12 else ('12 years' if g==12 else ('13–15 years' if g<16 else ('16–17 years' if g<18 else '18+ years')))
rank={'<12 years':0,'12 years':1,'13–15 years':2,'16–17 years':3,'18+ years':4}
# Baseline respondent highest-grade history. Do not use information reported after interval start.
H={}
for pid,r in raw.iterrows():
 highest=None
 for y in range(2000,2022,2):
  for n in ['HGCREV'+str(y)[2:],'Q3-4']:
   g=val(r,y,n)
   if 0<=g<=20:highest=g if highest is None else max(highest,g)
  H[(int(pid),y)]=highest
A=[];audit=collections.Counter()
for _,a in I.iterrows():
 pid=int(a.id);y=int(a.start_wave);r=raw.loc[pid];audit['married_baseline_risk_intervals']+=1
 spouses=[]
 for j in range(1,31):
  suf=f'.{j:02d}'
  status_key=L.get((str(y),'HHI_FINAL_STATCODE'+suf))
  resident=(float(r[status_key]) in [0,1]) if status_key else True
  if val(r,y,'HHI_FINAL_RELCODE'+suf)==1 and resident:spouses.append(j)
 if len(spouses)!=1:audit['no_unique_coresident_spouse']+=1;continue
 j=spouses[0];suf=f'.{j:02d}';sx=val(r,y,'HHI_FINAL_GENCODE'+suf)
 if sx not in [1,2] or (a.sex=='Men' and sx!=2) or (a.sex=='Women' and sx!=1):audit['not_confirmed_opposite_sex']+=1;continue
 own=H[(pid,y)];spg=val(r,y,'HHI_FINAL_GRADECODE'+suf);og=tier(own) if own is not None else None;sg=tier(spg)
 ownw=wages(r,y,'Q13-5');spw=wages(r,y,'Q13-18')
 if a.sex=='Men':hg,wg,hw,ww=og,sg,ownw,spw
 else:hg,wg,hw,ww=sg,og,spw,ownw
 starts=[]
 for k in range(1,8):
  yy=val(r,'XRND',f'YRBG{k}M');mm=val(r,'XRND',f'MOBG{k}M')
  if 1900<=yy<=2025 and 1<=mm<=12:
   st=yy+(mm-.5)/12
   if st<=a.start:starts.append(st)
 dur=a.start-max(starts) if starts else np.nan
 d=a.to_dict();d.update(husband_school=hg,wife_school=wg,husband_wages=hw,wife_wages=ww,current_marriage_years=dur)
 if hg and wg:d['education_direction']='Same schooling tier' if rank[hg]==rank[wg] else ('Husband higher' if rank[hg]>rank[wg] else 'Wife higher')
 else:d['education_direction']=None
 total=hw+ww if np.isfinite(hw) and np.isfinite(ww) else np.nan;d['couple_wages']=total
 share=ww/total if total>0 else np.nan;d['wife_wage_share']=share
 if not np.isfinite(total):ec=None
 elif total==0:ec='Both zero wages'
 elif ww==0:ec='Husband only'
 elif hw==0:ec='Wife only'
 elif .4<=share<=.6:ec='Balanced 40–60% wife'
 elif share<.4:ec='Husband majority, both positive'
 else:ec='Wife majority, both positive'
 d['earnings_pair']=ec;A.append(d)
f=pd.DataFrame(A);audit['confirmed_coresident_opposite_sex_intervals']=len(f);audit['confirmed_respondents']=int(f.id.nunique());audit['education_complete_intervals']=int(f.education_direction.notna().sum());audit['wages_complete_intervals']=int(f.earnings_pair.notna().sum());audit['wages_missing_intervals']=int(f.earnings_pair.isna().sum());audit['both_zero_wages_intervals']=int((f.earnings_pair=='Both zero wages').sum())

def wq(x,w):
 ix=np.argsort(x);x=np.asarray(x)[ix];w=np.asarray(w)[ix];return np.interp([.25,.5,.75],np.cumsum(w)/sum(w),x)
cut={};f['couple_wage_quartile']=None;f['husband_wage_band']=None;f['wife_wage_band']=None
for y,g in f.groupby('start_wave'):
 v=g[g.couple_wages>0];cuts=wq(v.couple_wages,v.weight);ix=v.index;f.loc[ix,'couple_wage_quartile']=['Q'+str(1+sum(z>c for c in cuts)) for z in v.couple_wages]
 # Common positive individual wage cutpoints for husbands and wives; not sex-specific cutpoints.
 b=g[g.couple_wages.notna()];x=np.concatenate([b.husband_wages.to_numpy(),b.wife_wages.to_numpy()]);w=np.tile(b.weight.to_numpy(),2);pos=x>0;ind=wq(x[pos],w[pos]);cut[int(y)]={'couple_positive_wages_quartiles':cuts.tolist(),'pooled_positive_spouse_wage_quartiles':ind.tolist()}
 for side in ['husband','wife']:
  f.loc[b.index,side+'_wage_band']=['Zero' if z==0 else 'Q'+str(1+sum(z>c for c in ind)) for z in b[side+'_wages']]
f.to_csv(P/'spouse_pair_intervals.csv',index=False);json.dump(dict(audit),open(P/'pairing_audit.json','w'),indent=2);json.dump(cut,open(P/'wage_cutpoints.json','w'),indent=2)

def rate(g):
 E=float((g.weight*g.event).sum());T=float((g.weight*g.exposure).sum());r=E/T;u=(g.weight*(g.event-r*g.exposure)).groupby(g.id).sum();G=len(u);se=math.sqrt(G/(G-1)*float((u*u).sum()))/T if G>1 else np.nan
 lo=r*math.exp(-1.96*se/r) if r>0 else np.nan;hi=r*math.exp(1.96*se/r) if r>0 else np.nan
 return dict(intervals=len(g),respondents=int(g.id.nunique()),events=int(g.event.sum()),person_years=float(g.exposure.sum()),rate_per_1000=1000*r,ci_low=1000*lo,ci_high=1000*hi,caution='Fewer than 10 events' if g.event.sum()<10 else '')
rr=[];mat=[];edu=[];prof=[]
for sex in ['All','Men','Women']:
 s=f if sex=='All' else f[f.sex==sex]
 for fac in ['education_direction','earnings_pair']:
  for cat,g in s.dropna(subset=[fac]).groupby(fac):rr.append(dict(reporting_sex=sex,factor=fac,category=cat,**rate(g)))
 for (h,w),g in s.dropna(subset=['husband_wage_band','wife_wage_band']).groupby(['husband_wage_band','wife_wage_band']):mat.append(dict(reporting_sex=sex,husband_wage_band=h,wife_wage_band=w,**rate(g)))
 for (h,w),g in s.dropna(subset=['husband_school','wife_school']).groupby(['husband_school','wife_school']):edu.append(dict(reporting_sex=sex,husband_school=h,wife_school=w,**rate(g)))
 for cat,g in s[s.husband_wage_band=='Q4'].dropna(subset=['earnings_pair']).groupby('earnings_pair'):prof.append(dict(reporting_sex=sex,husband_positive_wages='Q4',wife_pattern=cat,**rate(g)))
pd.DataFrame(rr).to_csv(P/'pairing_crude_rates.csv',index=False);pd.DataFrame(mat).to_csv(P/'husband_wife_wages_matrix.csv',index=False);pd.DataFrame(edu).to_csv(P/'husband_wife_schooling_matrix.csv',index=False);pd.DataFrame(prof).to_csv(P/'high_husband_wage_profiles.csv',index=False)
# Prespecified additive levels + pairing model. Mismatch is deterministic given both levels;
# its coefficient therefore depends on the additive level functional-form assumption.
school=['12 years','<12 years','13–15 years','16–17 years','18+ years']
base={'husband_school':school,'wife_school':school,'couple_wage_quartile':['Q2','Q1','Q3','Q4'],'work':['2,000+ hours','No work hours','1–1,999 hours']}
earncats=['Balanced 40–60% wife','Husband majority, both positive','Husband only','Wife majority, both positive','Wife only']

def fit(g,cat):
 g=g.dropna(subset=list(cat)+['age','current_marriage_years']).copy();cols=['Intercept'];X=[np.ones(len(g))]
 for fac,levs in cat.items():
  for le in levs[1:]:cols.append(fac+': '+le+' vs '+levs[0]);X.append((g[fac]==le).to_numpy().astype(float))
 cols+=['Age per 10 years','Current marriage years per 10'];X+=[(g.age.to_numpy()-45)/10,g.current_marriage_years.to_numpy()/10]
 if g.sex.nunique()>1:cols.append('Women respondents vs men');X.append((g.sex=='Women').to_numpy().astype(float))
 for wave in sorted(g.start_wave.unique()):
  if wave==2000:continue
  cols.append('Wave '+str(int(wave))+' vs 2000');X.append((g.start_wave==wave).to_numpy().astype(float))
 X=np.column_stack(X);w=g.weight.to_numpy();w=w/w.mean();y=g.event.to_numpy();e=g.exposure.to_numpy();b=np.zeros(X.shape[1]);b[0]=np.log(np.dot(w,y)/np.dot(w,e))
 def ll(z):
  eta=np.clip(X@z,-30,20);return np.dot(w,y*eta-e*np.exp(eta))
 for it in range(80):
  mu=e*np.exp(np.clip(X@b,-30,20));H=X.T@((w*mu)[:,None]*X);grad=X.T@(w*(y-mu));step=np.linalg.lstsq(H,grad,rcond=1e-10)[0];q=1
  while ll(b+q*step)<ll(b)-1e-8 and q>1/1024:q/=2
  b+=q*step
  if max(abs(q*step))<1e-8:break
 mu=e*np.exp(np.clip(X@b,-30,20));H=X.T@((w*mu)[:,None]*X);B=np.linalg.pinv(H,rcond=1e-10);S=pd.DataFrame((w*(y-mu))[:,None]*X);S['id']=g.id.to_numpy();U=S.groupby('id').sum().to_numpy();G=len(U);V=B@(U.T@U)@B*G/(G-1)*(len(g)-1)/(len(g)-len(b));se=np.sqrt(np.maximum(np.diag(V),0));out=[dict(term=n,rate_ratio=float(np.exp(bb)),ci_low=float(np.exp(bb-1.96*ss)),ci_high=float(np.exp(bb+1.96*ss))) for n,bb,ss in zip(cols,b,se)]
 audit=dict(intervals=len(g),respondents=int(g.id.nunique()),events=int(g.event.sum()),person_years=float(g.exposure.sum()),rank=int(np.linalg.matrix_rank(X)),parameters=X.shape[1],normalized_max_score=float(max(abs(X.T@(w*(y-mu))))/sum(w)),fitted_count=float(np.dot(w,mu)),observed_count=float(np.dot(w,y)),iterations=it+1,baseline_waves=sorted(int(z) for z in g.start_wave.unique()))
 return out,audit
OUT=[];META={}
for sex in ['All','Men','Women']:
 s=f[f.couple_wages>0] if sex=='All' else f[(f.couple_wages>0)&(f.sex==sex)]
 for target in ['earnings','education']:
  c=dict(base)
  c['earnings_pair']=earncats
  if target=='education':c['education_direction']=['Same schooling tier','Husband higher','Wife higher']
  out,meta=fit(s,c);META[sex+' '+target]=meta
  for r in out:OUT.append(dict(reporting_sex=sex,model=target,**r))
pd.DataFrame(OUT).to_csv(P/'pairing_adjusted_rate_ratios.csv',index=False);json.dump(META,open(P/'pairing_model_audit.json','w'),indent=2)
print(json.dumps(dict(audit),indent=2));print(pd.DataFrame(rr).query("reporting_sex=='All'").to_string(index=False));print(pd.DataFrame(OUT).query("reporting_sex=='All' and (term.str.startswith('earnings_pair') or term.str.startswith('education_direction'))",engine='python').to_string(index=False));print(pd.DataFrame(prof).query("reporting_sex=='All'").to_string(index=False))
