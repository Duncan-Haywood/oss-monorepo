from pathlib import Path
import json,joblib,numpy as np,pandas as pd
ROOT=Path(__file__).resolve().parent
f=pd.read_csv(ROOT.parent/'annual_nlsy/legally_married_primary/nlsy_annual_intervals.csv')
num=['age','first_marriage_age'];cats=['sex','education_model','work','income_quartile','religion_2000','baseline_status','start_wave']
for c in cats:f[c]=f[c].fillna('Unknown').astype(str)
p=pd.read_csv(ROOT/'crossfit_predictions.csv');assert (p.groupby('id').fold.nunique()==1).all();assert np.isfinite(p.filter(regex='^(pred_|dev_)').to_numpy()).all()
checks=[];man=[]
for sample in ['legally_married_including_separated','currently_married_only']:
 g=f.copy() if sample.startswith('legally') else f[f.baseline_status=='Married'].copy()
 man.append(dict(sample=sample,n=len(g),respondents=g.id.nunique(),events=int(g.event.sum()),numeric_support={c:dict(min=float(g[c].min()),max=float(g[c].max()),missing=int(g[c].isna().sum())) for c in num},categories={c:sorted(g[c].unique().tolist()) for c in cats}))
 for model in ['additive_poisson','spline_additive_poisson','tree_depth2','tree_depth3']:
  pipe=joblib.load(ROOT/(sample+'_'+model+'.joblib'));y=pipe.predict(g[num+cats]);assert np.isfinite(y).all() and(y>=0).all()
  observed=float(np.dot(g.weight,g.event));expected=float(np.dot(g.weight*g.exposure,y));checks.append(dict(sample=sample,model=model,loaded_pipeline_predictions_valid=True,observed_weighted_events=observed,training_fitted_weighted_events=expected,relative_event_total_error=(expected-observed)/observed))
(ROOT/'feature_manifest.json').write_text(json.dumps(man,indent=2));(ROOT/'verification.json').write_text(json.dumps(dict(person_folds_disjoint=True,all_crossfit_predictions_complete=True,artifact_checks=checks),indent=2));print(checks)
