"""Extend the existing report in place from computed annual CSVs, preserving all earlier blocks."""
from pathlib import Path
import json,pandas as pd,datetime
P=Path(__file__).resolve().parent
O=P.parent/'report-app/src/data.json'
s=json.loads(O.read_text());s['buildStatus']='updating';s['generatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();B=[]
def q(id,rows,label,files,definition,caveats):
 s['queries'][id]={'rows':json.loads(pd.DataFrame(rows).to_json(orient='records')),'source':{'label':label,'files':files,'url':'https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip','filters':[definition],'metricDefinitions':[{'label':label,'definition':definition}],'caveats':caveats,'evidenceFlow':[{'title':'Original joint annual analysis','detail':'All predictors fit simultaneously, separately by sex. All80 ACS replicate weights refit both coefficients and standardization target. Code, unrounded results and checks included.'}]}}
def text(id,v,qid=None):B.append(dict(id=id,type='text',text=v,**({'queryId':qid} if qid else {})))
def table(id,qid,title,cols):B.append(dict(id=id,type='table',queryId=qid,title=title,columns=[{'key':k,'label':v} for k,v in cols]))
def cis(r):return f'{r.ci95_low:.2f}–{r.ci95_high:.2f}'
a=P/'annual_acs/first_marriage';c=pd.read_csv(a/'marginal_contrasts.csv');pr=pd.read_csv(a/'profiles.csv')
contrasts=[('Unemployed vs employed','employment','Unemployed'),('High school vs bachelor','education','High school/GED'),('$100k–149k vs $50k–74k','income_group','100,000-149,999'),('$200k+ vs $50k–74k','income_group','200,000+'),('Master vs bachelor','education','Master')]
r=[]
for label,factor,level in contrasts:
 z={'comparison':label}
 for sex,key in [('Men','men'),('Women','women')]:
  t=c[(c.sex==sex)&(c.factor==factor)&(c.level==level)].iloc[0];z[key]=round(t.estimate,3);z[key+'CI']=cis(t)
 r.append(z)
q('annual_joint_contrasts',r,'Jointly adjusted annual ACS contrasts',['annual_acs/first_marriage/marginal_contrasts.csv','annual_acs/analyze_first_marriage.py'],'Ages30–64; MARHT1, not newly married in past12months, duration>=1; married/separated OR past-year divorce. Logistic model includes degree,income,employment,age-at-marriage,duration,race. Standardized differences percentage points, 95% SDR intervals.',['Approximate at-risk denominator, not exact person-years.','Current income/work/degree can follow divorce; no causal effects.','Contrasts are predeclared, pointwise, not a universal ranking of importance.'])
rows=[]
for profile in ['Bachelor employed 50-74k once','Bachelor employed 100-149k once','Master employed 100-149k once','Bachelor employed 200k+ once','Master employed 200k+ once']:
 z={'profile':profile.replace(' once','').replace('Bachelor','BA').replace('Master','MA')}
 for sex,key in [('Men','men'),('Women','women')]:
  t=pr[(pr.sex==sex)&(pr.profile==profile)].iloc[0];z[key]=round(t.estimate,2);z[key+'CI']=cis(t);z[key+'Support']=f'{int(t.unweighted_n):,} / {int(t.unweighted_events)}'
 rows.append(z)
q('annual_profiles',rows,'Predeclared observed-profile comparisons',['annual_acs/first_marriage/profiles.csv'],'Same first-marriage population and joint model; income/degree/employment profile set, averaging over sex-specific joint age-at-marriage/duration/race distribution; percent with divorce report, 95% SDR intervals.',['These are model-standardized past-year proportions, not personalized probabilities.','No minimum-risk search; same employed profiles compared for both sexes.','Sex-specific targets differ; male/female comparisons are not matched spouse outcomes.'])
q('annual_profile_support',pr,'Full annual profile support and sensitivity',['annual_acs/first_marriage/profiles.csv'],'Observed sample counts/events, raw weighted annual proportions and standardized model estimates for all predeclared profiles, including zero-income/nonemployment sensitivity.',['Low observed risk with zero personal income is not advice to lower earnings.','Income can change following divorce; profile cells may be sparse.'])
text('annual-summary','''## Annual comparisons and lower-divorce profiles

**Annual outcomes are the better starting point for this question, provided we compare people actually exposed to marriage during that period.** The earlier ACS denominator included every ever-married person, including people divorced long before the year. This extension uses a closer approximate at-risk denominator and fits the factors jointly, rather than interpreting each separately.

For comparable first marriages, **employment and education are substantial measured associations for both sexes; higher personal income is more consistently associated with lower annual divorce for men.** No degree or salary combination is proven to cause stability. A prospective NLSY person-time check is also included below, so current characteristics measured after divorce do not supply the only evidence.''')
text('annual-method','''### What changed to make the comparison fairer

The main profile analysis restricts ACS2023 to adults30–64 with only one marriage to date, no marriage in the preceding12months, and at least one calendar year since marriage. The approximate risk set includes those currently married or separated plus those reporting a divorce in the past12months. This removes many people with no marriage exposure during that year and excludes newlywed partial-year exposure.

The joint model includes **education, personal income, current employment, age at marriage, marriage duration and broad race/ethnicity controls**, separately for men and women. Profile predictions preserve the target population’s joint age-at-marriage/duration distribution; race is averaged as context, not used to define a desirable partner. All80 replicate weights are used.

This is still an approximation: some widowhood exposure is omitted; reported marriage dates lack months; same-year divorce/remarriage is excluded by the one-marriage restriction; and income/employment may have changed after divorce. The fuller all-marriage model and old ever-married denominator remain in the downloadable sensitivity results.''','annual_joint_contrasts')
text('annual-priority','''### Which measured differences are largest?

In these predeclared comparisons, **unemployment has the largest point-estimate difference**: +0.63 percentage points for men and +1.09 for women versus employment. High school versus bachelor’s is +0.44 points for men and +0.61 for women. Income$200k+ versus$50k–74k is −0.46 points for men and −0.29 for women; the women’s income interval includes zero.

These differences use the same annual percentage-point scale within each model. They are adjusted associations, not estimated effects of interventions, and their intervals overlap—so the exact ordering is uncertain. The chosen contrasts matter: comparing unemployment with employment is a different change from adding a graduate degree. Marriage duration also strongly differentiates observed annual outcomes, but surviving20 years is not an intervention, and survivor selection prevents calling it a protective treatment.''','annual_joint_contrasts')
table('annual-driver-table','annual_joint_contrasts','Annual difference in percentage points: first-listed group minus reference',[('comparison','Comparison'),('men','Men Δpp'),('menCI','95% CI'),('women','Women Δpp'),('womenCI','95% CI')])
text('annual-profile-text','''### Practical profiles supported by the current data

**For a man:** college education, employment and stronger personal income describe a supported lower-divorce profile. In the first-marriage model, an employed bachelor’s profile with$100k–149k personal income is0.84% (95%CI0.74–0.95); at$200k+ it is0.75% (0.63–0.87). A master’s does not improve on a bachelor’s consistently in this model.

**For a woman:** college education and avoiding unemployment have clearer support than simply maximizing personal salary. Among employed profiles, a master’s with$100k–149k is1.26% (1.07–1.46); with$200k+ it is1.12% (0.87–1.36). Corresponding bachelor’s profiles are1.47% and1.30%. The additional master’s association is modest and observational; professional/doctoral degrees do not establish a reliably better profile.

These are population-standardized annual divorce-report percentages for selected observed marriages, not your future spouse’s risk. They average across ages and durations rather than fixing an allegedly ideal wedding age. Neither table establishes that two separately modeled low-rate individuals will form a low-rate couple. A recommendation about matching spouses requires paired prospective histories.''','annual_profiles')
table('annual-profile-table','annual_profiles','Employed first-marriage profiles: standardized annual percent (95% CI)',[('profile','Profile'),('men','Men %'),('menCI','95% CI'),('women','Women %'),('womenCI','95% CI')])
table('annual-support-table','annual_profiles','Observed support: respondents / past-year divorces',[('profile','Profile'),('menSupport','Men n/events'),('womenSupport','Women n/events')])
text('annual-optimizer-warning','''### Why the lowest modeled number is not an ideal partner prescription

The zero/negative-personal-income, not-in-labor-force bachelor’s profile for women produces about0.31% (95%CI0.26–0.36). It contains15,222 respondents but only23 reported divorces. The model can describe that association, but it cannot show that leaving work or giving up income would reduce divorce. Specialization within marriage, partner resources, selection into work, and post-divorce income changes can produce this pattern. Once income is controlled jointly, the broad female nonemployment contrast itself is small and inconclusive.

Likewise, optimizing every degree, age, income and employment cell would select noisy minima and poorly supported combinations. I used specified, observed profiles and retained their counts and uncertainty instead. This analysis does not measure fidelity, conflict skills, shared plans, relationship quality or a partner’s willingness to work on a marriage.''','annual_profile_support')
# A final second source slice will be inserted when prospective output is verified.
text('annual-old-analysis','''## Supporting results from the earlier three-dataset analysis

The following sections retain the original annual, current-status and cumulative-history analyses. They answer different questions and should not be pooled into the annual profile estimates above.''')
# Keep every earlier block and data query; only replace this extension on rerun.
old=[b for b in s['report']['blocks'] if not b['id'].startswith('annual-') or b['id'] in ['annual-text','annual-figure','annual-degrees']]
# The original annual-definition id existed only in a preliminary build, not final.
s['report']['blocks']=B+old
# Fix compact prose outside URLs without altering numerical thousands or identifiers.
import re
for b in B:
 if 'text' in b:
  b['text']=re.sub(r'(?<=[A-Za-z])(?=\d)',' ',b['text']);b['text']=re.sub(r'(?<=\d)(?=[A-Za-z])',' ',b['text']);b['text']=b['text'].replace('ACS 2023','ACS 2023').replace('NLSY 79','NLSY79').replace('95%CI','95% CI');b['text']=re.sub(r'(?<=\d) k','k',b['text']);b['text']=re.sub(r'(?<=\w)(?=\$)',' ',b['text'])
O.write_text(json.dumps(s,indent=2,ensure_ascii=False));print('Added',len(B),'annual report blocks')
