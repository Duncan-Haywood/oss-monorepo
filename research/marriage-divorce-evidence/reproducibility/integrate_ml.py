from pathlib import Path
import json,shutil,datetime
import pandas as pd
P=Path(__file__).resolve().parent;O=P.parent/'outputs' if P.name=='work' else P.parent;F=O/'report-app/src/data.json';s=json.loads(F.read_text());Q={};B=[]
def q(key,rows,label,files,notes,url='https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip'):
 Q[key]={'rows':rows,'source':{'label':label,'url':url,'files':files,'filters':notes,'caveats':['Prediction is not causal explanation; no individualized or contemporary external validation.','No pooling of incompatible annual/cumulative/current-status outcomes across surveys.']}};return key
def txt(i,t,k=None):B.append(dict(id='ml-'+i,type='text',text=t,**({'queryId':k} if k else {})))
def tab(i,k,title,cols,search=False):B.append(dict(id='ml-'+i,type='table',queryId=k,title=title,searchable=search,columns=[dict(key=a,label=b) for a,b in cols]))
x=pd.read_csv(P/'ml_couples/heldout_model_comparison.csv');rows=[dict(population='Co-resident couples',model=z.model,improvement=round(z.deviance_improvement_percent,2),loss=round(z.weighted_poisson_deviance_per_year,6)) for z in x.itertuples()]
y=pd.read_csv(P/'ml_individuals/heldout_metrics.csv')
for z in y.itertuples():rows.append(dict(population='Married, excluding separated' if z.sample=='currently_married_only' else 'Legally married, including separated',model=z.model,improvement=round(100*z.relative_deviance_improvement_vs_constant,2),loss=round(z.weighted_deviance_per_person_year,6)))
k=q('ml_performance',rows,'Respondent-held-out interpretable prediction comparisons',['ml_couples/train_models.py','ml_couples/heldout_model_comparison.csv','ml_individuals/analyze_ml.py','ml_individuals/heldout_metrics.csv'],['Five respondent-held-out folds; all observations from one person stay in one fold. Training-only preprocessing.','Legal-divorce count/exposure target, baseline survey weight×person-time training weights. Poisson deviance per weighted person-year; lower is better.','Different populations are separate experiments; compare models within the same population.'])
txt('overview','''## Can interpretable machine learning predict divorce better?

**We trained the models and tested them on people excluded from fitting.** On the full co-resident couple panel—5,735 respondents, 726 divorces and 82,039 person-years—the enriched additive model had the best held-out point score: **3.40% less prediction loss than a constant-rate model**. Splines plus pair interactions achieved 2.89%; shallow trees achieved about 2.3%–2.4%. More complexity did not improve on the enriched additive model in this comparison. These percentages are loss reductions, **not accuracy, percentage points of divorce risk or causal effects**.

For individuals who were currently married at baseline, the additive model improved loss by about1.94%, compared with0.67%/0.37% for depth2/3 trees. Including already-separated people increased apparent predictive gains to about13%, because separation identifies marriages already on a dissolution path. That is useful for describing an existing marriage’s status, but does not make a prospective spouse-selection rule.

The models can describe broad risk variation, but this is not a validated personal divorce calculator. Most people do not divorce during an observed interval; always predicting “no divorce” would appear accurate while providing little useful information. We use held-out event-rate loss and calibration rather than that misleading accuracy statistic.''',k)
tab('performance',k,'Held-out prediction loss: compare within each population',[('population','Population'),('model','Interpretable model'),('improvement','Loss reduction vs constant, %'),('loss','Poisson loss /person-year')])
txt('inputs','''### What went into the models—and what did not

The couple model uses both spouses’ schooling, combined wages, earnings split, current age and marriage duration/order, survey wave and respondent sex. The enriched version adds the respondent’s baseline credential, work-hour group, age at first marriage, family income and **own prior religious attendance**. Zero wages and unknown wages are distinct; the full panel retains both-zero and missing-earnings configurations. Income cutpoints, imputers, encoders and splines are learned within training folds.

The individual model uses own education, income position, work hours, age, age at first marriage, sex, wave and prior attendance, with a separate analysis including/excluding already-separated respondents. Neither model includes measured relationship quality, fidelity, wealth or business valuation. The couple model lacks full spouse religious histories and harmonized occupations. Attendance is not denomination or agreement between spouses. The original profile model did not adjust for religion; the enriched prediction model does.

ACS and NSFG are not stacked onto these NLSY observations: ACS current occupation/income can follow the divorce, and NSFG historical dissolution has a different outcome and exposure. “All data” requires harmonized measurement and compatible targets, not merging unrelated survey respondents or treating post-divorce variables as predictors.''')
txt('tree','''### A readable tree is an explanation of a fitted model, not a discovered law

The fitted two-level couple tree groups marriages at about11 and18.4 years, then splits older-duration marriages at age52.5. Its four fitted training leaves have rates around16.4,9.6,6.9 and2.7 divorces per1,000person-years. These thresholds were chosen by an algorithm to summarize this training sample. **They do not overturn the earlier finding that no specific anniversary cutoff was established**, and this tree did not outperform the enriched additive model on held-out people.

The legally-married individual tree first asks whether the respondent was already separated. Its main apparent performance advantage comes from distinguishing that state. Readable tree paths, leaf support, coefficients, calibration tables and trained model files are included in the reproducibility package.

Aggregate calibration is also not enough for portability: the enriched couple model’s observed/expected ratio was about0.996 in respondent cross-validation, but about0.870 in a later-wave check—overprediction when applied forward in calendar time. The later-wave test can include people seen earlier, so it is a temporal sensitivity rather than an independent external validation.''',k)
x=pd.read_csv(P/'direct_earnings/husband_only_vs_majority_direct.csv');z=x.iloc[0];k=q('direct_earnings',json.loads(x.to_json(orient='records')),'Direct husband-only versus husband-majority dual-earnings contrast',['direct_earnings/analyze.py','direct_earnings/husband_only_vs_majority_direct.csv','direct_earnings/validation.json'],['Original joint profile model; direct comparison uses full covariance, common target and respondent-cluster approximate intervals.'])
txt('effects',f'''## How large are the earnings associations in everyday terms?

The original adjusted model gives balanced-earner incidence of8.69divorces per1,000married person-years, compared with6.31for husband-majority dual earnings,8.11for husband-only wages and12.44for wife-majority dual earnings. Thus:

- Husband-majority dual versus balanced: **2.38fewer per1,000years**, about0.238percentage points per year; RR0.73.
- Husband-only versus balanced: **0.58fewer per1,000years**, about0.058points; its interval includes no difference.
- Wife-majority dual versus balanced: **3.75more per1,000years**, about0.375points; the absolute-difference interval is approximately−0.02to7.52per1,000. The relative interval is1.03–1.99; scale-dependent interval approximations give different boundary results, so a large adverse causal effect is not established.

**Husband-only versus husband-majority dual earning must be tested directly.** The direct difference is **+{z.difference_per1000:.2f} per1,000person-years (95%CI {z.difference_ci95_low:.2f}to{z.difference_ci95_high:.2f})**, RR **{z.rate_ratio:.2f} ({z.ratio_ci95_low:.2f}–{z.ratio_ci95_high:.2f})**. The point estimate favors both earning, but the original full-sample interval includes no difference. You cannot prove the two configurations differ just because only one comparison against balanced earnings is significant.

Both16+schooling versus both12years corresponds to about3.41fewer divorces per1,000person-years—0.341percentage points—conditional on the specified model. It is a broad schooling contrast, not proof that each extra graduate degree improves outcomes. These annual rates cannot be multiplied into fixed-duration or lifetime probabilities.''',k)
x=pd.read_csv(P/'ml_couples/profile_religion_sensitivity_direct_contrast.csv');k2=q('religion_sensitivity',json.loads(x.to_json(orient='records')),'Own-attendance sensitivity of the direct earnings comparison',['ml_couples/religion_adjustment_sensitivity.py','ml_couples/profile_religion_sensitivity_direct_contrast.csv','ml_couples/profile_religion_sensitivity_sample_audit.json'],['Same attendance-complete subset and original profile specification, with/without own prior attendance; conditional associations, not causal effects.'])
txt('adjustment','''### What is adjusted, and how much does religion change it?

The original contrasts adjust for both partners’ schooling, combined wages, age, marriage duration, first/subsequent marriage, survey wave and respondent sex. **They do not adjust for religion, occupation, wealth, children or relationship quality.**

In a separate attendance-complete subset, refitting the original profile specification gives husband-only versus husband-majority dual RR1.320; adding own prior attendance gives RR1.320. Their approximate intervals are1.002–1.740 and1.002–1.738. The small shift indicates that this measured attendance variable explains little of that fitted contrast. The subset itself differs from the original full sample, whose RR was1.286 with an interval including1. This is a fragile, nominally bounded result—not a robust recommendation to change spouses’ work arrangements. It also does not establish adjustment for both partners’ beliefs or religious agreement.''',k2)
x=pd.read_csv(P/'degree_profession_audit/degree_occupation_annual_descriptive.csv');r=[]
for z in x.itertuples():r.append(dict(sex=z.sex,degree=z.degree,occupation=z.occupation,rate=round(z.annual_event_percent,3),CI=f'{z.ci95_low:.3f}–{z.ci95_high:.3f}',n=int(z.n),events=int(z.events),support='Adequate descriptive support' if z.adequate_descriptive_support else 'Sparse: interpret cautiously'))
k=q('degree_profession',r,'ACS detailed credential by broad occupation: descriptive annual reports',['degree_profession_audit/analyze_acs_all.py','degree_profession_audit/degree_occupation_annual_descriptive.csv','degree_profession_audit/METHODS.md','degree_profession_audit/validation.json'],['ACS2023 ages30–64, approximate married/separated-or-recent-divorce denominator; current/last-five-year occupation, crude annual divorce-report percentages.','425403respondents,4556events; all80replicate weights.80sex×degree×occupation cells,41pass n≥100/events≥20 screen.','Current occupation may follow divorce; not prospective person-year rates, causal profession effects or inputs to the NLSY predictor.'],'https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip')
txt('degrees','''## Bachelor’s, master’s, professional and PhD—by occupation

A new original ACS cross-tab supplies all four credentials by sex and predefined broad occupations, with all80replicate-weight confidence intervals. It includes425,403people and4,556past-year divorce reports;41of80cells meet the descriptive support screen. Use the search field to find a credential, sex or occupation. The full table is provided rather than selecting whichever profession has the smallest estimate.

**This table is a different supporting outcome:** crude past-year divorce-report percentages, measured alongside current or recent occupation. A divorce may have preceded a job change. It is not a prospective annual marriage hazard and is not fed into the prediction models. The currently-employed-only sensitivity is supplied separately.

A professional-degree category does not distinguish MD from JD; a doctorate category does not identify a specific PhD field. Occupation is not the same as degree subject. Graduate-degree and profession pairings for both spouses remain limited by available pre-divorce histories and cell sizes. The earlier 16+schooling result does not imply that master’s, professional and doctoral couples form a uniformly safer hierarchy.''',k)
tab('degree-profession',k,'Credential × broad occupation: crude annual divorce reports, %',[('sex','Sex'),('degree','Credential'),('occupation','Occupation'),('rate','Annual report %'),('CI','95%CI, %'),('n','Respondents'),('events','Divorce reports'),('support','Support')],True)
# Fix compressed prose without altering data or source URLs.
import re
for b in B:
 if 'text' not in b:continue
 t=b['text'];t=re.sub(r'(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])',' ',t);t=t.replace('per1,000','per 1,000').replace('95%CI','95% CI');t=re.sub(r',(?=[A-Za-z]|\d+\.)',', ',t);b['text']=t
s['report']['blocks']=B+[b for b in s['report']['blocks'] if not b['id'].startswith('ml-')];s['queries'].update(Q);s['generatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();s['buildStatus']='complete';F.write_text(json.dumps(s,indent=2,ensure_ascii=False,allow_nan=False))
for folder in ['ml_couples','ml_individuals','direct_earnings','degree_profession_audit']:shutil.copytree(P/folder,O/'reproducibility'/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.log'))
shutil.copy2(Path(__file__).resolve(),O/'reproducibility/integrate_ml.py')
print('Integrated ML, direct effects and credential/occupation results.')
