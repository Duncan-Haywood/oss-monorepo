from pathlib import Path
import json,pandas as pd
P=Path(__file__).resolve().parent
O=P.parent/'report-app/src/data.json'
s=json.loads(O.read_text());root=P/'annual_nlsy/legally_married_primary';r=pd.read_csv(root/'annual_crude_rates.csv');c=pd.read_csv(root/'annual_adjusted_without_separation_state.csv');cs=pd.read_csv(root/'annual_adjusted_rate_ratios.csv')
def addq(id,rows,label,files,definition,caveats):
 s['queries'][id]={'rows':json.loads(pd.DataFrame(rows).to_json(orient='records')),'source':{'label':label,'url':'https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip','files':files,'filters':[definition],'metricDefinitions':[{'label':label,'definition':definition}],'caveats':caveats}}
def table(id,q,title,cols):return dict(id=id,type='table',queryId=q,title=title,columns=[dict(key=k,label=v) for k,v in cols])
rows=[]
for cat in ['Married','Separated']:
 z={'baseline':cat}
 for sex,k in [('Men','men'),('Women','women')]:
  t=r[(r.sex==sex)&(r.factor=='baseline_status')&(r.category==cat)].iloc[0];z[k]=round(t.rate_per_1000,2);z[k+'CI']=f'{t.ci_low_per_1000:.2f}–{t.ci_high_per_1000:.2f}'
 rows.append(z)
addq('annual_nlsy_status',rows,'Prospective divorce incidence by starting marital state',['annual_nlsy/legally_married_primary/annual_crude_rates.csv'],'NLSY79 baseline legally married or separated, adjacent interviews2000–2022, observed exposure to firstdivorce, widowhood or followup. Rate per1000 person-years; baseline-wave weights; respondent-cluster approximate95% CI.',['Birth cohort1957–1964; mostly midlife marriages, not newlywed lifetime risk.','Intervals missing followup/date excluded. Cluster by respondent, not full survey PSU variance.','Separated at baseline is a marker of a marriage already in difficulty, not a causal treatment.'])
terms=[('Bachelor vs high school','education_model: Bachelor vs High school'),('Graduate vs high school','education_model: Graduate vs High school'),('Lowest family-income quartile vs Q2','income_quartile: Q1 vs Q2'),('Highest family-income quartile vs Q2','income_quartile: Q4 vs Q2'),('1–1,999 work hours vs 2,000+','work: 1–1,999 hours vs 2,000+ hours'),('Weekly attendance vs never','religion_2000: Weekly or more vs Never')]
rows=[]
for label,term in terms:
 z={'comparison':label}
 for sex,k in [('Men','men'),('Women','women')]:
  t=c[(c.sex==sex)&(c.term==term)].iloc[0];z[k]=round(t.rate_ratio,2);z[k+'CI']=f'{t.ci_low:.2f}–{t.ci_high:.2f}'
 rows.append(z)
addq('annual_nlsy_joint',rows,'Prospective joint annual incidence-rate ratios',['annual_nlsy/legally_married_primary/annual_adjusted_without_separation_state.csv','annual_nlsy/analyze_annual_nlsy.py'],'Weighted Poisson model with person-time offset; sex-specific baseline degree, within-wave family-income quartile, annual work hours, attendance reported2000, age, ageatfirstmarriage,wave; legal-married/sep atbaseline; respondent-cluster approximate95% CIs. No baseline separation-state covariate in this table.',['All predictors precede the interval; old attendance measurement may become stale.','Complete-covariate subgroup; nonresponse and unmeasured differences remain.','Income is family income, not personal salary. Graduate degrees pooled in joint model.','A separate model conditions on already-separated status; associations change.'])
addq('annual_nlsy_state_adjusted',cs,'Prospective model also conditioning on separation state',['annual_nlsy/legally_married_primary/annual_adjusted_rate_ratios.csv'],'Same prospective model plus married/separated state at interval start.',['Separation may mediate earlier financial/relationship processes; this model answers a narrower conditional question.'])
text='''### Prospective annual follow-up changes what we can call protective

I constructed a second annual analysis from NLSY79:45,977 legally-married-or-separated interview intervals,6,238 people,1,463 observed divorces and about91,579 unweighted person-years during2000–2022. Exact reported interview/event months determine exposure; time ends at divorce, widowhood or follow-up. Predictors are measured before the interval. This is an event rate per person-year, unlike the ACS annual report proportion.

**Being already separated is by far the strongest immediate risk marker observed:** approximately119 divorces per1,000 person-years, compared with8–10 among people reporting married at interval start. Adjusted rate ratios are11.5 for men and15.1 for women. This largely identifies marriages already on a dissolution pathway; it is not a partner-selection trait or evidence that preventing legal separation would fix the underlying marriage.

For education, work, income and attendance, the model without separation-state adjustment gives the comparisons below. Low family income predicts higher later divorce, particularly for women; some education/work associations remain uncertain. In this older cohort, graduate-educated women had a higher adjusted rate than high-school-educated women (RR1.83, approximate95%CI1.22–2.74), despite the opposite credential pattern in recent ACS. This does not identify a harmful effect of graduate education; it shows that a universal ideal credential is unsupported across cohorts, populations and models. Adding baseline separation attenuates income associations and changes education estimates because it conditions on an important pathway/marker. These models should not be collapsed into a universal trait ranking.'''
text2='''### Religion does not earn a place in an annual “ideal profile” from this analysis

The earlier NSFG association used current attendance and cumulative first-marriage histories. In prospective NLSY models, weekly attendance measured before later divorces does **not show a clear independent protective association** once other predictors are included. The same remains true when attendance is refreshed in2012. Wide intervals permit meaningful increases or decreases; this is not proof that religious practice has no effect.

Therefore I would not require weekly attendance—or any specific denomination—in a statistically justified lower-divorce profile from these results. Nor can I rank same-degree spouse pairings on a comparable annual basis: NSFG’s public durations and post-outcome spouse reports do not provide the needed prospective paired exposure. The earlier pairing finding remains historical, not an annual effect.

The most defensible profile is **an intact relationship, college education where supported, employment/financial stability, and adequate combined resources**. Men’s personal income has a clearer recent ACS gradient; women’s own salary is less informative than a simple higher-is-always-better rule suggests. This is a supported descriptive sketch, not a proven ideal or a forecast for a new marriage.'''
import re
def tidy(t):
 t=re.sub(r'(?<=[A-Za-z])(?=\d)',' ',t);t=re.sub(r'(?<=\d)(?=[A-Za-z])',' ',t);t=t.replace('NLSY 79','NLSY79');return t
new=[dict(id='annual-prospective-text',type='text',queryId='annual_nlsy_status',queryIds=['annual_nlsy_status','annual_nlsy_state_adjusted'],text=tidy(text)),table('annual-state-table','annual_nlsy_status','Prospective incidence: divorces per1,000 person-years (approximate95% CI)',[('baseline','Starting state'),('men','Men /1,000'),('menCI','Approx.CI'),('women','Women /1,000'),('womenCI','Approx.CI')]),table('annual-prospective-table','annual_nlsy_joint','Prospective adjusted incidence-rate ratios (approximate95% CI)',[('comparison','Comparison'),('men','Men RR'),('menCI','Approx.CI'),('women','Women RR'),('womenCI','Approx.CI')]),dict(id='annual-prospective-interpretation',type='text',queryId='annual_nlsy_joint',text=tidy(text2))]
blocks=[b for b in s['report']['blocks'] if b['id'] not in {x['id'] for x in new}];i=next(i for i,b in enumerate(blocks) if b['id']=='annual-old-analysis');s['report']['blocks']=blocks[:i]+new+blocks[i:]
O.write_text(json.dumps(s,indent=2,ensure_ascii=False));print('Added prospective annual analysis')
