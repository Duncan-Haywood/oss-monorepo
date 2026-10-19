"""Interpretable prospective annual divorce-rate prediction audit.
Train-only preprocessing;5personfolds, fixed model settings, no personalization.
"""
from pathlib import Path
import json,joblib,sklearn,sys
import numpy as np,pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder,StandardScaler,SplineTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import PoissonRegressor
from sklearn.tree import DecisionTreeRegressor,export_text
ROOT=Path(__file__).resolve().parent
f=pd.read_csv(ROOT.parent/'annual_nlsy/legally_married_primary/nlsy_annual_intervals.csv')
num=['age','first_marriage_age'];cats=['sex','education_model','work','income_quartile','religion_2000','baseline_status','start_wave']
# Preserve missingness; no cohort-median values are learned before splitting.
for c in cats:f[c]=f[c].fillna('Unknown').astype(str)
ids=np.array(sorted(f.id.unique()));np.random.default_rng(20261019).shuffle(ids);foldmap={pid:i%5 for i,pid in enumerate(ids)};f['fold']=f.id.map(foldmap)
MODELS=['constant','additive_poisson','tree_depth2','tree_depth3','spline_additive_poisson']
def make(model):
 categorical=OneHotEncoder(handle_unknown='ignore',drop='first',sparse_output=False)
 if model=='spline_additive_poisson':
  # add_indicator creates a missingness variable before spline; pure binary indicator
  # receives its own spline basis, harmless but redundant; regularization controls rank.
  numeric=Pipeline([('impute',SimpleImputer(strategy='median',add_indicator=True)),('spline',SplineTransformer(n_knots=4,degree=3,include_bias=False,extrapolation='linear')),('scale',StandardScaler())])
 else:numeric=Pipeline([('impute',SimpleImputer(strategy='median',add_indicator=True)),('scale',StandardScaler())])
 prep=ColumnTransformer([('num',numeric,num),('cat',categorical,cats)],verbose_feature_names_out=True)
 if model=='additive_poisson':est=PoissonRegressor(alpha=.001,max_iter=500,tol=1e-8)
 elif model=='spline_additive_poisson':est=PoissonRegressor(alpha=.001,max_iter=500,tol=1e-8)
 else:est=DecisionTreeRegressor(criterion='poisson',max_depth=int(model[-1]),min_samples_leaf=500,min_weight_fraction_leaf=.02,random_state=20261019)
 return Pipeline([('preprocess',prep),('model',est)])
def deviance(y,mu):
 term=mu-y;mask=y>0;term[mask]+=y[mask]*np.log(y[mask]/mu[mask]);return 2*term

def calibration(g,pred):
 w=g.weight.to_numpy();e=g.exposure.to_numpy();y=g.event.to_numpy();T=w@e;E=w@y;rate=E/T;n=g.id.nunique();u=pd.DataFrame({'id':g.id,'u':w*(y-rate*e)}).groupby('id').u.sum().to_numpy();se=np.sqrt(n/(n-1)*sum(u*u))/T if n>1 else np.nan
 return dict(intervals=len(g),respondents=n,events=int(y.sum()),person_years=e.sum(),weighted_person_years=T,observed_per_1000=1000*rate,predicted_per_1000=1000*np.dot(w*e,pred)/T,observed_ci95_low=1000*rate*np.exp(-1.96*se/rate) if rate>0 else np.nan,observed_ci95_high=1000*rate*np.exp(1.96*se/rate) if rate>0 else np.nan)
metrics=[];folds=[];cal=[];improvements=[];leafrows=[];coverage=[];allpred=[]
for sample in ['legally_married_including_separated','currently_married_only']:
 g=f.copy() if sample.startswith('legally') else f[f.baseline_status=='Married'].copy()
 raw=pd.read_csv(ROOT.parent/'annual_nlsy/legally_married_primary/nlsy_annual_intervals.csv');raw=raw.loc[g.index]
 for c in num+cats:coverage.append(dict(sample=sample,feature=c,intervals=len(g),missing_intervals=int(raw[c].isna().sum()),missing_respondents=int(raw.loc[raw[c].isna(),'id'].nunique()),weighted_missing_personyear_share=float(np.dot(raw.weight*raw.exposure,raw[c].isna())/np.dot(raw.weight,raw.exposure))))
 for model in MODELS:g['pred_'+model]=np.nan;g['dev_'+model]=np.nan
 for fold in range(5):
  train=g[g.fold!=fold];test=g[g.fold==fold];assert set(train.id).isdisjoint(set(test.id))
  yr=train.event.to_numpy()/train.exposure.to_numpy();sw=(train.weight*train.exposure).to_numpy();sw=sw/sw.mean()
  for model in MODELS:
   if model=='constant':pred=np.repeat(np.dot(train.weight,train.event)/np.dot(train.weight,train.exposure),len(test))
   else:
    fitted=make(model);fitted.fit(train[num+cats],yr,model__sample_weight=sw);pred=fitted.predict(test[num+cats]);pred=np.maximum(pred,1e-12)
   dev=deviance(test.event.to_numpy(),pred*test.exposure.to_numpy());g.loc[test.index,'pred_'+model]=pred;g.loc[test.index,'dev_'+model]=dev
   folds.append(dict(sample=sample,model=model,fold=fold,test_people=test.id.nunique(),test_intervals=len(test),test_events=int(test.event.sum()),weighted_deviance_per_person_year=float(np.dot(test.weight,dev)/np.dot(test.weight,test.exposure))))
 W=g.weight.to_numpy();E=g.exposure.to_numpy();Y=g.event.to_numpy();T=W@E
 baseline=np.dot(W,g.dev_constant)/T
 for model in MODELS:
  loss=np.dot(W,g['dev_'+model])/T
  metrics.append(dict(sample=sample,model=model,intervals=len(g),respondents=g.id.nunique(),events=int(Y.sum()),person_years=float(E.sum()),weighted_deviance_per_person_year=loss,relative_deviance_improvement_vs_constant=1-loss/baseline,observed_weighted_event_pseudocount=float(W@Y),predicted_weighted_event_pseudocount=float(np.dot(W*E,g['pred_'+model]))))
  # Predicted-risk quintiles with weighted personyear cutpoints, ties may reduce bins.
  pred=g['pred_'+model];order=np.argsort(pred.to_numpy());cum=np.cumsum((W*E)[order])/T
  cuts=np.interp([.2,.4,.6,.8],cum,pred.to_numpy()[order]);binid=np.searchsorted(cuts,pred.to_numpy(),side='right')+1
  for group in ([] if model=='constant' else sorted(np.unique(binid))):
   mask=binid==group;z=g[mask];cal.append(dict(sample=sample,model=model,group='Prediction quintile '+str(group),**calibration(z,z['pred_'+model].to_numpy())))
  # Explicit full-population calibration to expose intercept bias.
  cal.append(dict(sample=sample,model=model,group='All held-out observations',**calibration(g,pred.to_numpy())))
  if model!='constant':
   a=pd.DataFrame({'id':g.id,'loss_difference':g.weight*(g.dev_constant-g['dev_'+model]),'personyears':g.weight*g.exposure}).groupby('id').sum().to_numpy();point=a[:,0].sum()/a[:,1].sum();boot=[];rng=np.random.default_rng(31982)
   for _ in range(2000):
    ix=rng.integers(0,len(a),len(a));b=a[ix].sum(axis=0);boot.append(b[0]/b[1])
   improvements.append(dict(sample=sample,model=model,reference='constant',deviance_improvement_per_person_year=point,ci95_low=np.quantile(boot,.025),ci95_high=np.quantile(boot,.975),bootstrap='2000personresamples of paired crossfit losses, fitted folds fixed'))
 # Export descriptive final trees fitted on all selected rows. NOT held-out rate validation of these exact leaves.
 yr=g.event.to_numpy()/g.exposure.to_numpy();sw=(g.weight*g.exposure).to_numpy();sw/=sw.mean()
 for model in ['tree_depth2','tree_depth3']:
  fitted=make(model);fitted.fit(g[num+cats],yr,model__sample_weight=sw);joblib.dump(fitted,ROOT/(sample+'_'+model+'.joblib'));A=fitted.named_steps['preprocess'].transform(g[num+cats]);names=fitted.named_steps['preprocess'].get_feature_names_out();tree=fitted.named_steps['model']
  (ROOT/(sample+'_'+model+'.txt')).write_text(export_text(tree,feature_names=list(names),decimals=5))
  leaves=tree.apply(A)
  for leaf in np.unique(leaves):
   mask=leaves==leaf;z=g[mask];pred=fitted.predict(z[num+cats]);row=dict(sample=sample,model=model,leaf_id=int(leaf),**calibration(z,pred),mean_age=float(np.average(z.age,weights=z.weight*z.exposure)),mean_first_marriage_age=float(np.average(z.first_marriage_age.fillna(z.first_marriage_age.median()),weights=z.weight*z.exposure)),separated_intervals=int((z.baseline_status=='Separated').sum()));leafrows.append(row)
  # Exact decision paths in original numeric units (tree numeric transformed StandardScaler).
  paths=[];tr=tree.tree_;prep=fitted.named_steps['preprocess'];scale=prep.named_transformers_['num'].named_steps['scale'];num_names=prep.named_transformers_['num'].get_feature_names_out(num)
  def walk(node,conditions):
   if tr.feature[node]<0:paths.append(dict(leaf_id=int(node),conditions=conditions,training_fitted_rate_per_1000=float(tr.value[node,0,0]*1000)));return
   j=tr.feature[node];feature=names[j];threshold=float(tr.threshold[node])
   if feature.startswith('num__'):
    k=j;threshold=threshold*scale.scale_[k]+scale.mean_[k];feature=str(num_names[k])
   walk(tr.children_left[node],conditions+[feature+' <= '+str(round(threshold,3))]);walk(tr.children_right[node],conditions+[feature+' > '+str(round(threshold,3))])
  walk(0,[]);(ROOT/(sample+'_'+model+'_paths.json')).write_text(json.dumps(paths,indent=2))
 for model in ['additive_poisson','spline_additive_poisson']:
  fitted=make(model);fitted.fit(g[num+cats],yr,model__sample_weight=sw);joblib.dump(fitted,ROOT/(sample+'_'+model+'.joblib'))
  feature_names=fitted.named_steps['preprocess'].get_feature_names_out().tolist();est=fitted.named_steps['model']
  (ROOT/(sample+'_'+model+'_coefficients.json')).write_text(json.dumps(dict(intercept=float(est.intercept_),transformed_features=feature_names,coefficients=est.coef_.tolist(),coefficient_scale='log annual rate per person-year; numeric inputs transformed by saved pipeline'),indent=2))
 (ROOT/(sample+'_constant.json')).write_text(json.dumps(dict(rate_per_person_year=float(np.dot(g.weight,g.event)/np.dot(g.weight,g.exposure))),indent=2))
 g['sample']=sample;allpred.append(g[['sample','id','start_wave','sex','baseline_status','event','exposure','weight','fold']+['pred_'+m for m in MODELS]+['dev_'+m for m in MODELS]])
 print(sample,len(g),g.id.nunique(),g.event.sum(),flush=True)
for name,rows in [('heldout_metrics',metrics),('heldout_folds',folds),('calibration',cal),('heldout_improvement',improvements),('tree_leaf_support',leafrows),('missing_coverage',coverage)]:pd.DataFrame(rows).to_csv(ROOT/(name+'.csv'),index=False)
pd.concat(allpred).to_csv(ROOT/'crossfit_predictions.csv',index=False)
(ROOT/'settings.json').write_text(json.dumps(dict(seed=20261019,folds=5,models=MODELS,additive_alpha=.001,spline_alpha=.001,tree_min_rows_leaf=500,tree_min_fraction_personyears_leaf=.02,categorical=cats,numeric=num,target='Future first legal divorce before widowhood or next interview; annual rate'),indent=2))
print(pd.DataFrame(metrics).to_string(index=False))

(ROOT/'model_artifact_manifest.json').write_text(json.dumps(dict(python=sys.version,sklearn=sklearn.__version__,numpy=np.__version__,pandas=pd.__version__,joblib=joblib.__version__,input_features=num+cats,output='Predicted legal-divorce annual incidence rate per person-year, not a personal calibrated probability',training_population='NLSY79cohort born1957–1964, baseline waves2000–2020, repeated existing married/separated intervals',religion='Own attendance measured2000, potentially20yearsstale; not spouse religion'),indent=2))
