"""Independent heldout loss/calibration arithmetic, leakage audit, artifacts and relationship curves."""
from pathlib import Path
import csv,json,math,sys,platform,ast
import numpy as np,pandas as pd,joblib,sklearn
from importlib.metadata import version
P=Path(__file__).resolve().parent;f=pd.read_csv(P/'ml_couple_input.csv');r=pd.read_csv(P/'heldout_predictions.csv');summary=pd.read_csv(P/'heldout_model_comparison.csv');checks=[]
assert r.groupby('id').fold.nunique().max()==1
for model,g in r.groupby('model'):
 assert len(g)==len(f);assert not g.duplicated(['id','start_wave']).any()
 num=[];den=[];obs=[];exp=[]
 for z in g.itertuples():
  mu=z.exposure*z.predicted_rate;v=z.event*math.log(z.event/mu) if z.event>0 else 0
  num.append(2*z.weight*(v-z.event+mu));den.append(z.weight*z.exposure);obs.append(z.weight*z.event);exp.append(z.weight*mu)
 D=math.fsum(num)/math.fsum(den);OE=math.fsum(obs)/math.fsum(exp);stored=summary[summary.model==model].iloc[0];assert abs(D-stored.weighted_poisson_deviance_per_year)<1e-12;assert abs(OE-stored.observed_expected_ratio)<1e-12
 checks.append(dict(model=model,independent_deviance=D,independent_OE=OE))
cal=pd.read_csv(P/'heldout_calibration.csv')
for model,g in cal.groupby('model'):
 assert g.events.sum()==int(f.event.sum());assert abs(g.weighted_observed_events.sum()-summary[summary.model==model].weighted_observed_events.iloc[0])<1e-5
leaf=pd.read_csv(P/'final_tree_leaf_support.csv');assert leaf.events.min()>=20;assert leaf.respondents.min()>=100
out={'fold_people_never_overlap':True,'records_per_model':len(f),'events_per_model':int(f.event.sum()),'recomputed_metrics':checks,'leaf_event_support_min':int(leaf.events.min()),'leaf_person_support_min':int(leaf.respondents.min()),'checks':'Passed every-person heldout fold uniqueness, one prediction per input interval/model, independent count/exposure Poisson deviance and aggregate calibration, calibration event conservation, final leaf support.'};json.dump(out,open(P/'independent_verification.json','w'),indent=2)
manifest={'software':{'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__,'scikit_learn':sklearn.__version__,'scipy':version('scipy'),'joblib':version('joblib')},'target':'Recorded legal-divorce events per observed person-year; event/exposure with sample_weight=baselineweight*exposure','folds':'5 shuffled respondent-group heldout folds, seed20261019, same rows/folds for all six candidates','core_features':['both spouses schooling-year tiers','training-wave combined wage quartile with Zero and Unknown distinct','earnings role including Both zero and Unknown','current age','current marriage duration','respondent sex','first/subsequent/unknown marriage order','baseline wave'],'enriched_features':['respondent exact degree report available at baseline','respondent work-hour group','own religious attendance measured2000/updated2012 only from2012 onward, Unknown retained','age at first marriage','wife wage share with Unknown indicator','training-only family-income quartile','training-only common husband/wife individual wage bands'],'flexibility':'Quadratic splines with3trainingquantileknots for numeric predictors; school-pair and earnings-role×total-wage categorical interactions; fixed ridgealpha.0001','penalties':{'Additive core':.000001,'Additive enriched':.0001,'Spline + pair interactions':.0001},'tree_constraints':'Maximumdepth2/3; training-only escalation of minimum leaf rows until every leaf has20events and100distinctrespondents','not_included':['spouse religious agreement/practice','religious belief strength','race as a recommended trait','wealth/assets/pensions/self-employment income as paired wage predictors','occupation','relationship quality','infidelity','politics'],'missingness':'Missing never becomes zero; numeric median imputation and missing flags are trained withinfold, categoricalUnknown retained','serialized_models':[]}
for p in P.glob('final_*.joblib'):
 m=joblib.load(p);manifest['serialized_models'].append(dict(file=p.name,prepared_feature_names=m.named_steps['prep'].get_feature_names_out().tolist()))
json.dump(manifest,open(P/'feature_manifest.json','w'),indent=2)
(P/'requirements.txt').write_text('\n'.join(f'{a}=={version(a)}' for a in ['numpy','pandas','scikit-learn','scipy','joblib','threadpoolctl'])+'\n')
# Algebraic conditional term relationships for the winning enriched additive model; not interventions.
m=joblib.load(P/'final_additive_enriched.joblib');names=m.named_steps['prep'].get_feature_names_out().tolist();coef=m.named_steps['fit'].coef_;sc=m.named_steps['prep'].named_transformers_['num'].named_steps['scale'];curves=[]
for j,(field,reference,values) in enumerate([('age',50,range(35,66)),('current_marriage_years',20,range(0,46))]):
 idx=names.index('num__'+field);slope=coef[idx]/sc.scale_[j]
 for x in values:
  support=f[(f[field]>=x-2.5)&(f[field]<x+2.5)];curves.append(dict(feature=field,value=x,reference=reference,relative_rate=math.exp(slope*(x-reference)),nearby_intervals=len(support),nearby_people=int(support.id.nunique()),nearby_events=int(support.event.sum()),interpretation='Model-implied conditional term relationship; no causal or individual-forecast interpretation; no inferential CI'))
pd.DataFrame(curves).to_csv(P/'enriched_additive_term_relationships.csv',index=False)
print(json.dumps(out,indent=2))
