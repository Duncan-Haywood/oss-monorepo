"""Independent segmentation conservation and model/margin/contrast verification."""
from pathlib import Path
import csv,json,math,collections
import numpy as np,pandas as pd
P=Path(__file__).resolve().parent
raw=list(csv.DictReader(open(P/'duration_input_intervals.csv')));parts=list(csv.DictReader(open(P/'duration_person_time_segments.csv')));groups=collections.defaultdict(list)
for r in parts:groups[int(r['interval_id'])].append(r)
for i,r in enumerate(raw):
 ss=sorted(groups[i],key=lambda z:float(z['duration_low']));assert abs(math.fsum(float(z['segment_exposure']) for z in ss)-float(r['exposure']))<1e-9;assert sum(int(z['segment_event']) for z in ss)==int(r['event']);assert sum(int(z['segment_widow']) for z in ss)==int(r['widow']);assert all(int(z['segment_event'])==0 for z in ss[:-1]);assert abs(float(ss[0]['duration_low'])-float(r['current_marriage_years']))<1e-9;assert abs(float(ss[-1]['duration_high'])-float(r['current_marriage_years'])-float(r['exposure']))<1e-9
rates=list(csv.DictReader(open(P/'duration_crude_rates.csv')))
for r in rates:
 if r['reporting_sex']!='All':continue
 g=[z for z in parts if z['duration_band']==r['duration_band']];rate=math.fsum(float(z['weight'])*int(z['segment_event']) for z in g)/math.fsum(float(z['weight'])*float(z['segment_exposure']) for z in g)*1000;assert abs(rate-float(r['rate_per_1000']))<1e-9
s=pd.DataFrame(parts)
for col in ['attained_age','weight','segment_exposure','segment_event','start_wave']:s[col]=pd.to_numeric(s[col])
c=pd.read_csv(P/'duration_joint_coefficients.csv');names=c.term.tolist();b=c.coefficient.to_numpy();V=pd.read_csv(P/'duration_joint_covariance.csv',index_col=0).to_numpy()
def design(d):
 cols=[]
 for n in names:
  if n=='Intercept':a=np.ones(len(d))
  elif ': ' in n:
   key,tail=n.split(': ',1);cat=tail.split(' vs ',1)[0];a=(d[key]==cat).to_numpy().astype(float)
  elif n=='Attained age per 10 years':a=(d.attained_age.to_numpy()-45)/10
  elif n=='Women respondents vs men':a=(d.sex=='Women').to_numpy().astype(float)
  elif n=='Subsequent vs first marriage':a=(d.marriage_order_group=='Subsequent').to_numpy().astype(float)
  elif n.startswith('Wave '):a=(d.start_wave==int(n.split()[1])).to_numpy().astype(float)
  else:raise ValueError(n)
  cols.append(a)
 return np.column_stack(cols)
X=design(s);w=s.weight.to_numpy();w/=w.mean();mu=s.segment_exposure.to_numpy()*np.exp(X@b);score=X.T@(w*(s.segment_event.to_numpy()-mu));assert max(abs(score))/sum(w)<1e-9
T=s[(s.attained_age>=55)&(s.attained_age<65)].copy();q=(T.weight*T.segment_exposure).to_numpy();q/=q.sum();m=pd.read_csv(P/'duration_adjusted_common_target_rates.csv');pred={}
for r in m.itertuples():
 t=T.copy();t['duration_band']=r.duration_band;Z=design(t);la=np.exp(Z@b);rate=float(np.dot(q,la));grad=Z.T@(q*la);se=math.sqrt((grad/rate)@V@(grad/rate));assert abs(rate*1000-r.rate_per_1000)<1e-9;assert abs(rate*1000*math.exp(-1.96*se)-r.ci_low)<1e-9;pred[r.duration_band]=(rate,grad)
C=pd.read_csv(P/'duration_adjacent_band_contrasts.csv');pvs=[]
for r in C.itertuples():
 v=np.zeros(len(b))
 for sign,band in [(1,r.later_band),(-1,r.earlier_band)]:
  key='duration_band: '+band+' vs 0–<5'
  if key in names:v[names.index(key)]+=sign
 lr=float(v@b);se=math.sqrt(v@V@v);rr=math.exp(lr);p=math.erfc(abs(lr/se)/math.sqrt(2));assert abs(rr-r.rate_ratio)<1e-9;assert abs(p-r.p_value)<1e-9;pvs.append(p)
 A,da=pred[r.later_band];B,db=pred[r.earlier_band];assert abs(1000*(A-B)-r.difference_per_1000)<1e-9
order=np.argsort(pvs);running=0
for rank,j in enumerate(order):
 running=max(running,min(1,(len(pvs)-rank)*pvs[j]));assert abs(running-C.iloc[j].p_holm)<1e-9
out={'input_intervals':len(raw),'segments':len(parts),'events':sum(int(z['segment_event']) for z in parts),'unweighted_person_years':math.fsum(float(z['segment_exposure']) for z in parts),'model_rank':int(np.linalg.matrix_rank(X)),'parameters':len(b),'normalized_score':float(max(abs(score))/sum(w)),'checks':'Passed every-interval exposure/event/widow conservation, terminal-event placement, independent crude rates, independent design/score reconstruction, common-target rates/log CIs, adjacent coefficient contrasts and Holm calculations.'};json.dump(out,open(P/'independent_verification.json','w'),indent=2);print(json.dumps(out,indent=2))
