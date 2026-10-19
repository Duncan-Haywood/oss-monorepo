from pathlib import Path
import json,datetime,shutil
import pandas as pd
P=Path(__file__).resolve().parent;O=P.parent/'outputs' if P.name=='work' else P.parent;F=O/'report-app/src/data.json'
s=json.loads(F.read_text());B=[];Q={}
def query(key,rows,label,files,notes):
 Q[key]={'rows':rows,'source':{'label':label,'url':'https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip','files':files,'filters':notes,'caveats':['NLSY79 birth cohort 1957–1964, midlife/later-life married co-resident baseline couples.','Respondent-cluster approximate uncertainty omits original survey PSU/stratum variance.','Observational associations, survivor selection, missing histories and no causal or personalized forecast.']}};return key
def text(i,v,q=None):B.append(dict(id='landmark-'+i,type='text',text=v,**({'queryId':q} if q else {})))
def table(i,q,title,cols):B.append(dict(id='landmark-'+i,type='table',queryId=q,title=title,columns=[dict(key=k,label=l,**({'format':'scientific'} if k in ['improvement','low','high'] else {})) for k,l in cols]))
def ci(a,b):return f'{a:.2f}–{b:.2f}'
x=pd.read_csv(P/'duration_nlsy/duration_crude_rates.csv');x=x[x.reporting_sex=='All'];a=pd.read_csv(P/'duration_nlsy/duration_adjusted_common_target_rates.csv').set_index('duration_band');r=[]
for z in x.itertuples():
 y=a.loc[z.duration_band];r.append(dict(years=z.duration_band,crude=round(z.rate_per_1000,2),crudeCI=ci(z.ci_low,z.ci_high),adjusted=round(y.rate_per_1000,2),adjustedCI=ci(y.ci_low,y.ci_high),events=int(z.events),people=int(z.respondents),caution=z.caution if isinstance(z.caution,str) else ''))
q=query('duration_rates',r,'Prospective annual divorce incidence by attained marriage duration',['duration_nlsy/analyze_duration.py','duration_nlsy/duration_crude_rates.csv','duration_nlsy/duration_adjusted_common_target_rates.csv','duration_nlsy/METHODS.md'],['Exact observed person-time split at duration boundaries; legal-divorce event only in terminal segment.','Joint adjusted estimates standardize to ages55–64 so every duration band is feasible, including40+ years. Age, schooling, earnings split/amount, marriage order, wave and sex controlled.'])
text('duration','''## Does making it past a certain anniversary lower future divorce incidence?

**Longer-surviving marriages have lower observed annual divorce incidence in this cohort, but we did not identify a sharp “safe after year X” threshold.** Observed rates decline from about16.7per1,000person-years during years0–<5 to9.0during15–<20,5.3during25–<30 and2.8during30–<40. These are annual events per exposed time, not the probability of eventually divorcing.

The analysis splits each interview interval at the actual duration boundaries, assigning its time to the appropriate bands and a divorce only to the final segment. All69,185person-years and592divorces are preserved. The sample begins in midlife, so short marriages here often began later in life; this is **not a newlywed life table for couples marrying in their20s**.

The adjusted estimates below use one common ages55–64target. That makes every duration category possible; a40-year marriage cannot be assigned to a27-year-old. These values consequently describe an older comparison population and cannot serve as your current personal prediction.''',q)
table('duration-table',q,'Annual divorces per1,000married person-years: duration and uncertainty',[('years','Marriage duration, years'),('crude','Observed rate'),('crudeCI','Approx.95%CI'),('adjusted','Adjusted, ages55–64'),('adjustedCI','Approx.95%CI'),('events','Divorces'),('people','Respondents')])
x=pd.read_csv(P/'duration_nlsy/duration_adjacent_band_contrasts.csv');r=json.loads(x.to_json(orient='records'));q2=query('duration_contrasts',r,'Predefined adjacent marriage-duration contrasts',['duration_nlsy/duration_adjacent_band_contrasts.csv','duration_nlsy/duration_global_test.json'],['Seven adjacent-band comparisons defined before fitting; respondent-cluster covariance.','Holm adjustment across the seven comparisons; do not search exact anniversaries for a favorable threshold.'])
text('threshold','''### A declining pattern is different from a proven cliff

The joint test for duration across all bands finds evidence of an overall association (7degrees of freedom,p≈0.023). **None of the seven adjacent-band comparisons establishes a clear step**, even before multiple-comparison adjustment; the smallest unadjustedp≈0.135 and smallest Holm-adjustedp≈0.945. This does not prove a smooth decline or rule out a real threshold; it means these data cannot locate one precisely. The 40+ band has only two divorces and particularly wide uncertainty.

“If still married after20years, what happens next?” is a **conditional** question about survivors. Some less-stable marriages have already ended, and spouses have also aged. The lower rate therefore does not show that merely waiting causes a troubled relationship to become safe. The common-age adjustment target contains only 60 observed divorces across 3,292 people, with sparse individual bands, so adjusted estimates borrow information through the model. No anniversary guarantees stability, and multiplying an annual rate by5or10does not produce a valid future5-/10-year risk.''',q2)
x=pd.read_csv(P/'conditional_pairing/heldout_improvement.csv');r=[]
for z in x.itertuples():r.append(dict(model=z.model,improvement=z.deviance_improvement_per_person_year,low=z.ci95_low,high=z.ci95_high))
q=query('matching_validation',r,'Person-held-out test of individualized matching interactions',['conditional_pairing/analyze_conditional.py','conditional_pairing/heldout_metrics.csv','conditional_pairing/heldout_improvement.csv','conditional_pairing/interaction_wald.csv','conditional_pairing/METHODS.md'],['Fivefold cross-fitting by respondent; every interval from one person stays in the same fold.','Compare additive model against both-high-schooling interaction, then own-schooling×earnings-role interactions; lower held-out Poisson deviance is better.','Paired respondent-resampling intervals hold cross-fit model estimates fixed; they omit refitting uncertainty.'])
text('matching','''## Given your profile, which partner has the lowest statistical risk?

That is a useful target, but it needs evidence that **a partner characteristic works differently depending on your own characteristics**. A model that simply adds both spouses’ schooling and income does not establish a compatibility rule. We tested broad schooling-pair and own-schooling-by-earnings-role interactions rather than treating the earlier profile table as a personal matchmaking engine.

Neither interaction model improved prediction on people held out from fitting. Both-high-schooling interaction tests were uncertain (p≈0.19 and0.32); the joint own-schooling×earnings-role test hadp≈0.11. Only21of160detailed sex×own-schooling×partner-schooling×total-wage×earnings-role cells met the exploratory100-person/10-divorce support screen. This leaves too little reliable information to select an individualized minimum. Lack of improvement is not proof that compatibility never matters.

**What is supported:** broad schooling and earnings-configuration associations in the specified populations, with substantial uncertainty. **What is not yet supported:** a precise ideal partner’s degree, salary, denomination, age gap or political identity conditional on one person’s full profile. Detailed preference/relationship-quality variables and a younger marriage-start cohort would improve this question more than adding a spurious decimal place to the current estimates.''',q)
table('matching-check',q,'Held-out prediction improvement versus additive model: positive is better',[('model','Interaction model'),('improvement','Deviance improvement /person-year'),('low','Approx.95%CI low'),('high','Approx.95%CI high')])
text('assets','''### Assets, work and schooling are separate inputs

A person can have no wage income while operating a business, holding substantial assets or receiving investment income. **Zero wages are not synonymous with unemployment or lack of resources.** The couple-profile model uses positive combined wage/salary earnings; wealth, portfolio income and self-employment profits are not interchangeable with that measure. Its older marriage sample also cannot be plugged directly into a forecast for a person in their20s.

For partner-search comparisons, separate your own age, education, earned income, business income and assets; then vary the prospective partner’s measured characteristics while keeping yours fixed. Changing an earnings share at fixed combined wages changes both spouses’ wage amounts, so the current share contrasts cannot by themselves answer “with my own income fixed, what partner income is best?” Nor do schooling-year tiers distinguish a master’s from a PhD. These are gaps for further analysis, not evidence that a particular partner type is safe.''')
B.insert(1,dict(id='landmark-duration-figure',type='figure',name='duration',queryId='duration_rates',title='Divorce incidence by years married',caption='Observed rates and adjusted common-age rates answer different population questions. All intervals are approximate respondent-cluster 95% intervals; the 40+ band has only two events. No sharp anniversary threshold is identified. See the adjacent table and methods for counts, target and controls.'))
# Improve spacing only in the new authored prose; preserve numbers/URLs/data.
import re
for b in B:
 if 'text' not in b:continue
 t=b['text'];t=re.sub(r'(?<=\d)(?=(?:per|during|during|years|person|divorces|married|degrees|or|does|detailed|of))',' ',t);t=re.sub(r'(?<=[a-z])(?=\d)',' ',t);t=re.sub(r'(?<=\d)(?=[a-z])',' ',t);t=t.replace('per1,000','per 1,000').replace('person-years','person-years').replace('p≈','p ≈ ');b['text']=t
s['report']['blocks']=[b for b in s['report']['blocks'] if not b['id'].startswith('landmark-')];i=next(i for i,b in enumerate(s['report']['blocks']) if b['id']=='annual-summary');s['report']['blocks'][i:i]=B;s['queries'].update(Q)
for folder in ['duration_nlsy','conditional_pairing']:
 shutil.copytree(P/folder,O/'reproducibility'/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.log'))
shutil.copy2(Path(__file__).resolve(),O/'reproducibility/integrate_duration_matching.py')
s['generatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();s['buildStatus']='complete';F.write_text(json.dumps(s,indent=2,ensure_ascii=False,allow_nan=False))
print('Integrated duration and conditional-matching analyses.')
