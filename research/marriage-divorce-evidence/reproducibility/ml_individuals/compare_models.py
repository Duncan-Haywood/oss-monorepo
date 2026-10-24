from pathlib import Path
import numpy as np,pandas as pd,json,re
ROOT=Path(__file__).resolve().parent
f=pd.read_csv(ROOT/'crossfit_predictions.csv');rows=[]
for sample,g in f.groupby('sample'):
 for model in ['tree_depth2','tree_depth3','spline_additive_poisson']:
  a=pd.DataFrame({'id':g.id,'gain':g.weight*(g.dev_additive_poisson-g['dev_'+model]),'py':g.weight*g.exposure}).groupby('id').sum().to_numpy();point=a[:,0].sum()/a[:,1].sum();r=[];rng=np.random.default_rng(77109)
  for _ in range(2000):
   ix=rng.integers(0,len(a),len(a));v=a[ix].sum(axis=0);r.append(v[0]/v[1])
  rows.append(dict(sample=sample,model=model,reference='additive_poisson',deviance_improvement_per_person_year=point,ci95_low=np.quantile(r,.025),ci95_high=np.quantile(r,.975)))
pd.DataFrame(rows).to_csv(ROOT/'heldout_vs_additive.csv',index=False)
# Human-readable tree paths; every rate is the final training tree's descriptive value.
leaf=pd.read_csv(ROOT/'tree_leaf_support.csv')
lines=['# Shallow tree paths','These trees were refitted on all selected observations for readability. Their leaf rates are training descriptions, not independently validated personal predictions. Held-out performance is reported separately.','']
labels={'age':'Current age','first_marriage_age':'Age at first marriage','missingindicator_first_marriage_age':'Age at first marriage missing','education_model':'Education','income_quartile':'Family income quartile','religion_2000':'Own religious attendance in2000','baseline_status':'Baseline marital status','start_wave':'Baseline wave','sex':'Respondent sex','work':'Prior-year work hours'}
for path in sorted(ROOT.glob('*_paths.json')):
 sample=path.name.split('_tree_depth')[0];model='tree_depth'+path.name.split('_tree_depth')[1].split('_')[0];lines.extend(['## '+sample+' — '+model,''])
 for row in json.load(open(path)):
  cs=[]
  for condition in row['conditions']:
   if condition.startswith('cat__'):
    match=re.match(r'cat__(.+) (<=|>) 0.5$',condition);feature,operator=match.groups()
    fac=next(c for c in ['education_model','income_quartile','religion_2000','baseline_status','start_wave','sex','work'] if feature.startswith(c+'_'));level=feature[len(fac)+1:];cs.append(labels[fac]+(' is ' if operator=='>' else ' is not ')+level)
   else:
    k=condition.split(' ')[0];cs.append(condition.replace(k,labels.get(k,k),1))
  z=leaf[(leaf['sample']==sample)&(leaf.model==model)&(leaf.leaf_id==row['leaf_id'])].iloc[0]
  lines.append('- '+'; '.join(cs)+f": {row['training_fitted_rate_per_1000']:.2f} divorces per1,000person-years; {int(z.respondents):,} respondents, {int(z.events)} events.")
 lines.append('')
(ROOT/'Readable_Trees.md').write_text('\n'.join(lines))
print(pd.DataFrame(rows).to_string(index=False))
