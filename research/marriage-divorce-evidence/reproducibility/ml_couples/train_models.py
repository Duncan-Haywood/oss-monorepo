"""Respondent-heldout comparison of interpretable prospective couple divorce-rate models.
All data transformations learn from the training fold; no site or prior analysis edits.
"""
from pathlib import Path
import json,math,warnings
import numpy as np,pandas as pd
from sklearn.model_selection import GroupKFold
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder,StandardScaler,SplineTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import PoissonRegressor
from sklearn.tree import DecisionTreeRegressor,export_text
from sklearn.metrics import mean_poisson_deviance
import sklearn,joblib
P=Path(__file__).resolve().parent;source=P/'ml_couple_input.csv'
if not source.exists():source=P.parent/'pairing_nlsy/spouse_pair_intervals.csv'
f=pd.read_csv(source)
if 'marriage_order_group' not in f:
 known=pd.read_csv(P.parent/'couple_profiles/couple_profile_input.csv')[['id','start_wave','marriage_order_group']].drop_duplicates(['id','start_wave']);f=f.merge(known,on=['id','start_wave'],how='left');f['marriage_order_group']=f.marriage_order_group.fillna('Unknown')
f=f[(f.exposure>0)&(f.weight>0)].copy().reset_index(drop=True);f.to_csv(P/'ml_couple_input.csv',index=False)
SEED=20261019
core_cat=['husband_school','wife_school','total_wage_band','earnings_pair','sex','marriage_order_group','wave_cat']
extra_cat=['education','work','religion_refresh','family_income_band','husband_wage_band_train','wife_wage_band_train']
core_num=['age','current_marriage_years'];extra_num=['first_marriage_age','wife_wage_share']
models=['Constant','Additive core','Additive enriched','Spline + pair interactions','Poisson tree depth 2','Poisson tree depth 3']

def quantiles(x,w):
 ix=np.argsort(x);x=np.asarray(x)[ix];w=np.asarray(w)[ix]
 return np.interp([.25,.5,.75],np.cumsum(w)/sum(w),x).tolist()

def fit_cutpoints(t):
 cuts={}
 for wave,g in t.groupby('start_wave'):
  a=g[g.couple_wages>0];z=g[g.family_income>=0];b=g[['husband_wages','wife_wages','weight']];x=np.r_[b.husband_wages.to_numpy(),b.wife_wages.to_numpy()];w=np.tile(b.weight.to_numpy(),2);ok=np.isfinite(x)&(x>0)
  cuts[int(wave)]={'total':quantiles(a.couple_wages,a.weight),'family':quantiles(z.family_income,z.weight),'individual':quantiles(x[ok],w[ok])}
 return cuts

def prepare(t,cuts):
 z=t.copy();waves=sorted(cuts);total=[];family=[];hw=[];ww=[];wcat=[]
 for r in t.itertuples():
  wave=int(r.start_wave);use=max([v for v in waves if v<=wave],default=min(waves));c=cuts[use];wcat.append(str(use))
  def band(x,k,zero=True):
   if not np.isfinite(x) or x<0:return 'Unknown'
   if zero and x==0:return 'Zero'
   return 'Q'+str(1+sum(x>v for v in c[k]))
  total.append(band(r.couple_wages,'total'));family.append(band(r.family_income,'family',False));hw.append(band(r.husband_wages,'individual'));ww.append(band(r.wife_wages,'individual'))
 z['total_wage_band']=total;z['family_income_band']=family;z['husband_wage_band_train']=hw;z['wife_wage_band_train']=ww;z['wave_cat']=wcat
 for col in core_cat+extra_cat:z[col]=z[col].fillna('Unknown').astype(str)
 for col in core_num+extra_num:z[col+'_missing']=np.where(z[col].isna(),'Missing','Observed')
 z['school_pair']=z.husband_school+' | '+z.wife_school;z['role_total_pair']=z.earnings_pair+' | '+z.total_wage_band
 return z

def pipeline(kind):
 enriched=kind!='Additive core';cats=core_cat+(extra_cat if enriched else []);nums=core_num+(extra_num if enriched else []);cats=cats+[x+'_missing' for x in nums]
 if kind=='Spline + pair interactions':cats=cats+['school_pair','role_total_pair']
 numsteps=[('impute',SimpleImputer(strategy='median',keep_empty_features=True))]
 if kind=='Spline + pair interactions':numsteps += [('spline',SplineTransformer(n_knots=3,degree=2,include_bias=False,extrapolation='linear'))]
 if not kind.startswith('Poisson tree'):numsteps += [('scale',StandardScaler())]
 prep=ColumnTransformer([('num',Pipeline(numsteps),nums),('cat',OneHotEncoder(handle_unknown='ignore',drop='first',sparse_output=False),cats)],remainder='drop',sparse_threshold=0)
 if kind.startswith('Poisson tree'):est=DecisionTreeRegressor(criterion='poisson',max_depth=int(kind[-1]),min_samples_leaf=500,random_state=SEED)
 else:est=PoissonRegressor(alpha=.000001 if kind=='Additive core' else .0001,max_iter=1500,tol=1e-8,solver='newton-cholesky')
 return Pipeline([('prep',prep),('fit',est)])

def train_predict(tr,te,kind,cuts):
 a=prepare(tr,cuts);b=prepare(te,cuts);y=(tr.event/tr.exposure).to_numpy();ew=(tr.weight*tr.exposure).to_numpy()
 if kind=='Constant':
  r=float((tr.weight*tr.event).sum()/(tr.weight*tr.exposure).sum());return np.full(len(te),r),None,dict(rate=r)
 pipe=pipeline(kind)
 if kind.startswith('Poisson tree'):
  minimum=max(500,int(math.ceil(.03*len(tr))))
  for attempt in range(12):
   pipe.set_params(fit__min_samples_leaf=minimum);pipe.fit(a,y,fit__sample_weight=ew);leaves=pipe.named_steps['fit'].apply(pipe.named_steps['prep'].transform(a));g=tr[['id','event']].copy();g['leaf']=leaves;support=g.groupby('leaf').agg(events=('event','sum'),people=('id','nunique'))
   if support.events.min()>=20 and support.people.min()>=100:break
   minimum=min(int(math.ceil(len(tr)/2)),int(math.ceil(minimum*1.4)))
  meta=dict(min_samples_leaf=minimum,actual_depth=pipe.named_steps['fit'].get_depth(),leaves=pipe.named_steps['fit'].get_n_leaves(),min_leaf_events=int(support.events.min()),min_leaf_respondents=int(support.people.min()))
 else:
  with warnings.catch_warnings(record=True) as caught:
   warnings.simplefilter('always');pipe.fit(a,y,fit__sample_weight=ew)
  meta=dict(iterations=int(pipe.named_steps['fit'].n_iter_),warnings=[str(v.message) for v in caught])
 pred=np.maximum(pipe.predict(b),1e-12);return pred,pipe,meta

def metrics(t,pred):
 y=t.event.to_numpy();e=t.exposure.to_numpy();w=t.weight.to_numpy();mu=e*pred;term=np.zeros(len(y));ok=y>0;term[ok]=y[ok]*np.log(y[ok]/mu[ok]);D=2*np.dot(w,term-y+mu)/np.dot(w,e);check=mean_poisson_deviance(y/e,pred,sample_weight=w*e);assert abs(D-check)<1e-12
 return dict(intervals=len(t),respondents=int(t.id.nunique()),events=int(y.sum()),person_years=float(e.sum()),weighted_poisson_deviance_per_year=float(D),weighted_observed_events=float(np.dot(w,y)),weighted_expected_events=float(np.dot(w,mu)),observed_expected_ratio=float(np.dot(w,y)/np.dot(w,mu)),observed_rate_per_1000=float(1000*np.dot(w,y)/np.dot(w,e)),predicted_rate_per_1000=float(1000*np.dot(w,mu)/np.dot(w,e)))

folds=np.empty(len(f),int);fold_audit=[]
for fold,(trix,teix) in enumerate(GroupKFold(n_splits=5,shuffle=True,random_state=SEED).split(f,groups=f.id),1):
 assert not set(f.iloc[trix].id)&set(f.iloc[teix].id);folds[teix]=fold;fold_audit.append(dict(fold=fold,training_respondents=int(f.iloc[trix].id.nunique()),test_respondents=int(f.iloc[teix].id.nunique()),test_events=int(f.iloc[teix].event.sum())))
f[['id','start_wave']].assign(fold=folds).to_csv(P/'respondent_folds.csv',index=False)
PRED=[];FIT=[];FOLDMET=[]
for fold in range(1,6):
 tr=f[folds!=fold];te=f[folds==fold];cuts=fit_cutpoints(tr)
 for kind in models:
  pred,pipe,meta=train_predict(tr,te,kind,cuts);FIT.append(dict(validation='Respondent-heldout',fold=fold,model=kind,**meta));FOLDMET.append(dict(fold=fold,model=kind,**metrics(te,pred)));z=te[['id','start_wave','event','exposure','weight']].copy();z['fold']=fold;z['model']=kind;z['predicted_rate']=pred;z['expected_events']=pred*z.exposure;PRED.append(z)
 print('Completed fold',fold,flush=True)
oof=pd.concat(PRED,ignore_index=True);oof.to_csv(P/'heldout_predictions.csv',index=False);pd.DataFrame(FOLDMET).to_csv(P/'fold_metrics.csv',index=False);SUM=[];CAL=[]
for kind,g in oof.groupby('model',sort=False):
 SUM.append(dict(model=kind,**metrics(g,g.predicted_rate.to_numpy())))
 cuts=quantiles(g.predicted_rate,g.weight*g.exposure) # calibration uses ten bins, not these quartiles.
 ix=np.argsort(g.predicted_rate.to_numpy());v=g.predicted_rate.to_numpy()[ix];ww=(g.weight*g.exposure).to_numpy()[ix];dec=np.unique(np.interp(np.arange(1,10)/10,np.cumsum(ww)/sum(ww),v));g=g.copy();g['calibration_bin']=np.searchsorted(dec,g.predicted_rate,side='left')+1
 for k,z in g.groupby('calibration_bin'):CAL.append(dict(model=kind,bin=int(k),**metrics(z,z.predicted_rate.to_numpy())))
summary=pd.DataFrame(SUM);base=float(summary.loc[summary.model=='Constant','weighted_poisson_deviance_per_year'].iloc[0]);summary['deviance_improvement_percent']=100*(base-summary.weighted_poisson_deviance_per_year)/base;summary.to_csv(P/'heldout_model_comparison.csv',index=False);pd.DataFrame(CAL).to_csv(P/'heldout_calibration.csv',index=False)
# Later-wave sensitivity shares people with training: not an independent-person or external test.
tr=f[f.start_wave<=2012];te=f[f.start_wave>=2014];cuts=fit_cutpoints(tr);TEMP=[];TP=[]
for kind in models:
 pred,pipe,meta=train_predict(tr,te,kind,cuts);TEMP.append(dict(model=kind,**metrics(te,pred)));FIT.append(dict(validation='Later-wave sensitivity',model=kind,**meta));z=te[['id','start_wave','event','exposure','weight']].copy();z['model']=kind;z['predicted_rate']=pred;TP.append(z)
pd.DataFrame(TEMP).to_csv(P/'later_wave_model_comparison.csv',index=False);pd.concat(TP).to_csv(P/'later_wave_predictions.csv',index=False)
# Final fits for explanation only; full-sample leaf rates are not validation performance.
FINAL=[];LEAF=[];cuts=fit_cutpoints(f);json.dump(cuts,open(P/'final_training_cutpoints.json','w'),indent=2)
for kind in models[1:]:
 pred,pipe,meta=train_predict(f,f,kind,cuts);FINAL.append(dict(model=kind,**meta));names=pipe.named_steps['prep'].get_feature_names_out().tolist()
 if kind.startswith('Poisson tree'):
  tree=pipe.named_steps['fit'];suffix='depth'+kind[-1];(P/('tree_'+suffix+'.txt')).write_text(export_text(tree,feature_names=names,decimals=4,show_weights=True));A=prepare(f,cuts);leaf=tree.apply(pipe.named_steps['prep'].transform(A));z=f.copy();z['leaf']=leaf
  for k,g in z.groupby('leaf'):LEAF.append(dict(model=kind,leaf=int(k),**metrics(g,np.full(len(g),float(tree.tree_.value[int(k),0,0])))))
 else:pd.DataFrame(dict(feature=names,coefficient=pipe.named_steps['fit'].coef_)).to_csv(P/('coefficients_'+kind.lower().replace(' ','_').replace('+','and')+'.csv'),index=False)
 joblib.dump(pipe,P/('final_'+kind.lower().replace(' ','_').replace('+','and')+'.joblib'))
pd.DataFrame(LEAF).to_csv(P/'final_tree_leaf_support.csv',index=False);json.dump(FIT,open(P/'fit_audit.json','w'),indent=2,default=lambda v:v.item());json.dump(FINAL,open(P/'final_fit_audit.json','w'),indent=2,default=lambda v:v.item())
audit=dict(population='Full available baseline co-resident opposite-sex married respondent intervals; includes explicit zero and unknown earnings',intervals=len(f),respondents=int(f.id.nunique()),events=int(f.event.sum()),person_years=float(f.exposure.sum()),both_zero_wage_intervals=int((f.earnings_pair=='Both zero wages').sum()),missing_couple_wage_intervals=int(f.couple_wages.isna().sum()),missing_prior_religion_intervals=int(f.religion_refresh.isna().sum()),folds=fold_audit,selection='Minimum aggregate heldout deviance among six fixed candidates is exploratory CV selection, not external testing',later_wave_training_people=int(tr.id.nunique()),later_wave_test_people=int(te.id.nunique()),later_wave_overlapping_people=len(set(tr.id)&set(te.id)),later_wave_feature_handling='Post-2012 waves map to latest 2012 training-wave categorical encoding and wage/income cutpoints; no future outcomes or test-distribution quartiles used',python_sklearn=sklearn.__version__)
json.dump(audit,open(P/'sample_audit.json','w'),indent=2);print(summary.to_string(index=False),flush=True);print(pd.DataFrame(TEMP).to_string(index=False),flush=True)
