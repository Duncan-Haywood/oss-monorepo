"""Original descriptive NLSY79 cohort analysis; weight-only uncertainty approximation."""
import csv,json,math,pathlib,statistics
P=pathlib.Path(__file__).resolve().parent
D=json.load(open(P/'nlsy79_selected_codebook.json'))
rows=list(csv.DictReader(open(P/'nlsy79_extract.csv')))
rows=[{k:float(v) for k,v in r.items()} for r in rows]
mar=[k for k,v in D.items() if v['name']=='MARSTAT-KEY']
trans=[k for k,v in D.items() if v['name'].endswith('-TYPE') or __import__('re').fullmatch(r'Q2-5A1(?:_[123]|\.0[123])',v['name'])]
levels={-4:'No academic degree reported',1:'High school diploma or equivalent',2:'Associate',3:'Bachelor',4:'Bachelor',5:'Master',6:'Doctorate (PhD)',7:'Professional',8:'Other'}
A=[]
for r in rows:
 if r['T9299300']<=0 or r['T9300300']<0:continue
 ever=r['R9908800']>0 or any(r[k]>0 for k in mar)
 if not ever:continue
 divorce=r['R0012800']>0 or any(r[k]==3 for k in mar+trans)
 ed=levels.get(r['T9900100'],'Unknown')
 if r['T9900100']==1 and r['T9900000']>=13:ed='Some college, no higher degree'
 if r['T9900100']==-4 and 0<=r['T9900000']<12:ed='Less than high school'
 r.update(sex={1:'Men',2:'Women'}[r['R0214800']],education=ed,ever_divorce=divorce,weight=r['T9299300']/100)
 A.append(r)

def estimate(sub):
 w=[r['weight'] for r in sub];y=[float(r['ever_divorce']) for r in sub];S=sum(w);p=sum(a*b for a,b in zip(w,y))/S
 # Independent-person linearization for a weighted ratio, not complex-survey design variance.
 v=len(w)/(len(w)-1)*sum(a*a*(b-p)**2 for a,b in zip(w,y))/S**2 if len(w)>1 else float('nan')
 se=math.sqrt(v);ne=S*S/sum(a*a for a in w)
 # Logit interval avoids impossible limits.
 if 0<p<1:lo=1/(1+math.exp(-(math.log(p/(1-p))-1.96*se/(p*(1-p)))));hi=1/(1+math.exp(-(math.log(p/(1-p))+1.96*se/(p*(1-p)))))
 else:lo=hi=p
 return {'n':len(sub),'divorce_n':sum(y),'effective_n':ne,'percent':100*p,'ci_low':100*lo,'ci_high':100*hi,'weighted_population':S,'caution':'Sparse: n < 50' if len(w)<50 else ''}
results=[]
for sex in ['All','Men','Women']:
 for ed in ['All']+list(dict.fromkeys(levels.values()))+['Some college, no higher degree','Less than high school','Unknown']:
  s=[r for r in A if (sex=='All' or r['sex']==sex) and (ed=='All' or r['education']==ed)]
  if s:results.append(dict(sex=sex,education=ed,**estimate(s)))
with open(P/'nlsy79_degree_sex_results.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=results[0]);w.writeheader();w.writerows(results)
# Audit counts for alternative indicator omitting transition records.
json.dump({'source_respondents':len(rows),'positive_2022_weights_valid_marital_status':sum(r['T9299300']>0 and r['T9300300']>=0 for r in rows),'ever_married_analysis_n':len(A),'recorded_ever_divorce_n':sum(r['ever_divorce'] for r in A),'divorces_only_detected_by_transition_or_baseline_date':sum(r['ever_divorce'] and not any(r[k]==3 for k in mar) for r in A),'marital_status_variables':len(mar),'transition_variables':len(trans),'estimates':results},open(P/'nlsy79_results.json','w'),indent=2)
for r in results:
 if r['sex']!='All' and r['education'] in ['Bachelor','Master','Doctorate (PhD)','Professional']:print(r)

# Prospective association: 1999 income/hours, married in 2000, divorce recorded 2002 onward.
# Conditional on responding in 2022; follow-up is not survival-adjusted and any subsequent divorce counts.
post=[k for k in trans if int(D[k]['year'])>=2002]
F=[]
for r in A:
 if r['R7007000']!=1:continue
 q=dict(r);q['ever_divorce']=any(r[k]==3 for k in post)
 F.append(q)
rr=[]
for sex in ['All','Men','Women']:
 for measure in ['1999 family income (nominal dollars)','1999 annual hours']:
  for label,lo,hi in ([('Under $25,000',0,25000),('$25,000–49,999',25000,50000),('$50,000–99,999',50000,100000),('$100,000 or more',100000,float('inf'))] if measure.startswith('1999 family') else [('0 hours',0,1),('1–1,999 hours',1,2000),('2,000 or more hours',2000,float('inf'))]):
   var='R7006500' if measure.startswith('1999 family') else 'R7007600'
   sub=[r for r in F if (sex=='All' or r['sex']==sex) and lo<=r[var]<hi]
   if sub:rr.append(dict(sex=sex,measure=measure,category=label,**estimate(sub)))
with open(P/'nlsy79_prospective_income_employment.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=rr[0]);w.writeheader();w.writerows(rr)
json.dump({'baseline_married_2000_retained_2022_n':len(F),'recorded_postbaseline_divorce_n':sum(r['ever_divorce'] for r in F),'results':rr},open(P/'nlsy79_prospective.json','w'),indent=2)
print('Prospective baseline n:',len(F))

# Observation coverage sensitivity: no missing marital-status interview waves.
complete=[r for r in A if all(r[k]>=0 for k in mar)]
sensitivity=[]
for sex in ['All','Men','Women']:
 for ed in ['All','Bachelor','Master','Doctorate (PhD)','Professional']:
  sub=[r for r in complete if (sex=='All' or r['sex']==sex) and (ed=='All' or r['education']==ed)]
  if sub:sensitivity.append(dict(sex=sex,education=ed,**estimate(sub)))
with open(P/'nlsy79_complete_waves_sensitivity.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=sensitivity[0]);w.writeheader();w.writerows(sensitivity)
json.dump({'retained_birth_year_min':int(min(r['R0000500'] for r in A))+1900,'retained_birth_year_max':int(max(r['R0000500'] for r in A))+1900,'complete_30_status_waves_n':len(complete),'no_recorded_divorce_n':sum(not r['ever_divorce'] for r in A),'no_recorded_divorce_with_any_missing_status_wave_n':sum(not r['ever_divorce'] and any(r[k]<0 for k in mar) for r in A)},open(P/'nlsy79_coverage_audit.json','w'),indent=2)
