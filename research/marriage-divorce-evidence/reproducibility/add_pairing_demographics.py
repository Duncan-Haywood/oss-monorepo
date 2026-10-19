"""Idempotently add original pairing/demographic analyses to report data.
Run after prior report assembly helpers; requires sibling analysis directories.
No build, hosting or external write is performed.
"""
from pathlib import Path
import json,datetime,shutil
import pandas as pd,numpy as np
P=Path(__file__).resolve().parent
O=P.parent/'outputs' if (P.parent/'outputs').exists() else P.parent
F=O/'report-app/src/data.json'
Q={};B=[];prefix='pairdemo_'
URL={'acs':'https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip','nsfg':'https://www.cdc.gov/nchs/nsfg/nsfg_2017_2019_puf.htm','nlsy':'https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip'}
def read(folder,name):return pd.read_csv(P/folder/(name+'.csv'),keep_default_na=False)
def clean(x):return json.loads(pd.DataFrame(x).replace({np.nan:None}).to_json(orient='records'))
def query(key,rows,label,src,files,definition,caveats):
 key=prefix+key;Q[key]={'rows':clean(rows),'source':{'label':label,'url':URL[src],'files':files,'filters':[definition],'metricDefinitions':[{'label':label,'definition':definition}],'caveats':caveats,'evidenceFlow':[{'title':'Original respondent microdata','detail':URL[src]},{'title':'Reproducible original analysis','detail':'See listed code, data, methods, covariance/replicate checks and unrounded result files in the reproducibility bundle.'}]}};return key

def text(key,s,q=None):B.append(dict(id=prefix+key,type='text',text=s,**({'queryId':q} if q else {})))
def table(key,q,title,cols):B.append(dict(id=prefix+key,type='table',queryId=q,title=title,columns=[dict(key=k,label=l,**({'format':f} if f else {})) for k,l,f in cols]))
def interval(z,lo='ci95_low',hi='ci95_high',digits=2):
 try:return f'{float(z[lo]):.{digits}f}–{float(z[hi]):.{digits}f}'
 except (ValueError,TypeError):return 'Not estimable'

text('intro','''## Pairing and demographic follow-up: what these comparisons actually establish

**Education level and educational matching are different questions.** Both-low and both-high couples match, yet their observed outcomes differ substantially. The new analysis separates levels, directions of mismatch, and explicit comparisons with balanced educational margins.

**Shared religion and more frequent attendance are not established guarantees.** A prospective couple-religion analysis is now available, but its approximately100 events and broad intervals cannot identify an ideal denomination or frequency. Separate current-attendance associations in NSFG should not be read as prospective effects.

**Population overrepresentation depends on the denominator.** General-population divorce-event comparisons mix marriage exposure with divorce occurrence. Results below therefore show both all-adult and approximate marriage-exposed populations, with common age/sex standards. Demographic group averages do not establish an ideal partner ethnicity, individual compatibility, or the effect of changing an identity.''')
x=read('pairing_nsfg','age_standardized_pairing_cells');r=[]
for _,z in x[x.level==2].iterrows():r.append(dict(wife=z.wife,husband=z.husband,prevalence=z.estimate_pct_or_pp/100,CI=interval(z,'ci_low','ci_high'),n=int(z.n),events=int(z.events)))
q=query('education_cells',r,'Historical first-spouse education pairing with common age standard','nsfg',['pairing_nsfg/analyze_mismatch.py','pairing_nsfg/age_standardized_pairing_cells.csv','pairing_nsfg/README.md'],'Female ever-married ages25–49; first marriage divorce/annulment/separation by2017–2019 interview; common five-year interview-age standard; full Taylor design intervals.', ['Education current/past highest reported, not wedding-date attainment.','Former first husbands verified by questionnaire flowC-12;21unknown/refused pairs excluded.','Historical prevalence, not annual or lifetime risk.'])
text('education_intro','''### Matching education does not explain away education level

After a shared age standard, first-marriage dissolution prevalence was14.36% when both were BA+,41.52% when both were below BA, and32%–33% for either mismatch direction. Among wives below BA, a BA+ husband was associated with a lower point estimate than a below-BA husband; among BA+ wives, the below-BA husband group had the higher point estimate. A universal “matching is safer” interpretation does not describe this pattern.''',q)
table('education_cells',q,'First marriage dissolved by interview: age-standardized historical prevalence',[('wife','Wife',None),('husband','First husband',None),('prevalence','Prevalence','pct'),('CI','95% CI, %',None),('n','n',None),('events','Events',None)])
x=read('pairing_nsfg','formal_contrasts_and_models');r=[]
for _,z in x[x.estimate_pct_or_pp!=''].iterrows():
 if 'Equal-cell' in z.contrast or 'Wife BA+/husband below BA minus' in z.contrast:r.append(dict(comparison=f'{int(z.level)} education levels: '+z.contrast,difference=float(z.estimate_pct_or_pp),CI=interval(z,'ci_low','ci_high')))
q=query('education_contrasts',r,'Educational mismatch contrasts with survey covariance','nsfg',['pairing_nsfg/formal_contrasts_and_models.csv','pairing_nsfg/README.md'],'Common age standard; weighted cell means combined using full respondent influence vectors and shared-target covariance; differences in percentage points, t54 intervals.',['Equal-cell matched/mismatched contrasts balance both partners education margins; artificial target, not population-average effect.','3x3 cells include sparse groups.','No causal intervention holding exact partner levels fixed can vary mismatch.'])
text('education_contrast_text','''The broad BA-threshold mismatch directions differ by1.09percentage points(95%CI−8.00 to10.18). An equal-cell comparison that balances each spouse’s marginal education distribution estimates mismatch-minus-match at4.68points(−2.07 to11.43); with below-BA/bachelor/graduate-professional categories it is0.70points(−4.50 to5.90). These estimates do not resolve a generic mismatch disadvantage beyond educational composition; they do not prove equivalence.

Exploratory logistic results depend on imposed additive partner-education assumptions. The2x2 mismatch odds ratio is1.40(0.97–2.00); a3x3 wife-higher term is2.19(1.12–4.30), while husband-higher is0.65(0.35–1.21). Those category/model-sensitive interaction terms should not override the direct cell comparisons or be described as independently causal mismatch effects. All detailed cells/models remain in the bundle.''',q)
table('education_contrasts',q,'Formal education contrasts: percentage-point differences',[('comparison','Comparison',None),('difference','Difference, pp',None),('CI','95% CI, pp',None)])

# Prospective religion: full category output avoids selecting a preferred level.
x=read('pairing_religion','religion_crude_rates');r=[]
for _,z in x[(x.sex=='All')&x.factor.isin(['coded_affiliation_match','protestant_denom_match','none_pair'])].iterrows():r.append(dict(group=z.category,rate=z.rate_per_1000,CI=interval(z),n=int(z.n),events=int(z.events),caution=z.caution))
q=query('religion_pairs',r,'Predissolution couple religion, baseline2000 to2002','nlsy',['pairing_religion/religion_crude_rates.csv','pairing_religion/selected_codebook.json','pairing_religion/METHODS.md'],'Married baseline2000 respondents, same baseline spouse followed to legal divorce/widowhood/2002; weighted legal divorces per1000person-years; approximate independent-respondent intervals.',['Only105events before religion completeness restrictions; baseline age approximately36–43.','Spouse affiliation/attendance proxy reported.','Weight-adjusted uncertainty omits original surveyPSU/strata and later attrition correction.'])
text('religion_pairs_intro','''### Predissolution religion gives a more cautious answer

NLSY79 asks both respondent and spouse religion/attendance in2000, before the2000–2002 outcome interval. Different coded affiliations had12.51 legal divorces per1000person-years(approximate95%CI8.05–19.44), compared with11.88(9.17–15.38) for the same coded affiliation. The adjusted mismatch rate ratio is0.99(0.59–1.66), controlling both spouses’ broad affiliation levels and age/sex/first-marriage age. This wide interval permits meaningful differences in either direction.

The named-Protestant mismatch group had85respondents and zero events. That supplies insufficient event information, not evidence of protection. Broad “Protestant/Christian/unspecified” and “other” codes are heterogeneous, so a code match is not proof of identical beliefs. The table includes both-none and exactly-one-none groups rather than assuming either is optimal.''',q)
table('religion_pairs',q,'Baseline religious pairing and later annual legal-divorce incidence',[('group','Pairing',None),('rate','Per1000person-years',None),('CI','Approx.95% CI',None),('n','n',None),('events','Events',None),('caution','Caution',None)])
x=read('pairing_religion','religion_adjusted_margins');r=[]
for _,z in x[(x.model=='attendance_joint')&(x.factor=='respondent_attendance')].iterrows():r.append(dict(attendance=z.level,rate=z.standardized_rate_per_1000,CI=interval(z),n=int(z.observed_n),events=int(z.observed_events)))
q=query('religion_attendance',r,'Joint-spouse attendance prospective model','nlsy',['pairing_religion/religion_adjusted_margins.csv','pairing_religion/religion_adjusted_contrasts.csv','pairing_religion/religion_adjusted_rate_ratios.csv'],'WeightedPoisson annual incidence model; both spouses attendance plus baseline age/sex/age atfirstmarriage; margins over empirical target; approximate robust intervals.', ['Approximately100events; no education/income/employment controls in this religion model.','Not full-survey-design inference; sparse cells and broad intervals.','No monotonic attendance optimum identified.'])
text('religion_attendance_text','''More-than-weekly attendance does not demonstrate lower incidence than weekly attendance in this prospective sample: respondentRR1.70(0.65–4.44) when controlling spouse attendance. The corresponding adjusted difference is9.40divorces per1000person-years(−10.22 to29.01). All frequency levels are shown; choosing the smallest point estimate would manufacture an optimum from imprecise comparisons. Directional husband/wife weekly-pair cells are also too sparse for a strong husband-versus-wife rule; the only-wife-weekly cell has just6events.''',q)
table('religion_attendance',q,'Respondent attendance, controlling spouse attendance: adjusted annual incidence',[('attendance','Attendance',None),('rate','Per1000person-years',None),('CI','Approx.95% CI',None),('n','Observed n',None),('events','Events',None)])

# Demographic comparison presents both denominators and complete predefined categories.
x=read('demographics_acs','results')
def demo_table(dims,key,title):
 r=[]
 for (dim,g),b in x[x.dimension.isin(dims)].groupby(['dimension','group'],sort=False):
  row=dict(group=g)
  for pop,lab in [('all_adults','general'),('at_risk_approx','exposed')]:
   c=b[b.population==pop];v=c[c.measure=='annual_event_percent_age_sex_standardized']
   if len(v):z=v.iloc[0];row[lab]=z.estimate/100;row[lab+'CI']=interval(z);row['n' if lab=='exposed' else 'generalN']=int(z.n);row['events']=int(z.events);row['caution']='Sparse' if z['sparse'] else ''
   else:row[lab+'CI']='Insufficient age/sex cells';row['caution']='Sparse'
  r.append(row)
 q=query(key,r,title,'acs',['demographics_acs/analyze.py','demographics_acs/results.csv','demographics_acs/METHODS.md','demographics_acs/validation.json'],'ACS2023 adults30–64; MARHD1past12months; alladult vs currentmarried/separated ORpastyeardivorce denominator; age2sex×7agebin standard recomputed in all80replicates.', ['Descriptive associations; age/sex adjustment alone, not income/education/marriage-duration control.','Pastyear event percentages, not exact person-year hazards or prospective individual risks.','Sparseflags identify fewer100events or smallage/sex cells.'])
 table(key,q,title,[('group','Group',None),('general','All-adult %','pct'),('generalCI','95% CI, %',None),('exposed','Marriage-exposed %','pct'),('exposedCI','95% CI, %',None),('n','Exposed n',None),('events','Events',None),('caution','Caution',None)])
 return q
text('demographics_intro','''## Population composition and annual divorce events

The new ACS analysis includes1,499,259respondents ages30–64 and13,788past-year divorce reports. The approximate marriage-exposed denominator contains978,402respondents: currently married or separated, plus anyone reporting a past-year divorce. It reconstructs neither exact January1risk sets nor person-years. Overall annual event percentages are1.01% per alladult and1.59% per approximate exposed adult.

The first percentage in each table uses the entire general population, including never-married adults. The second uses the approximate marriage-exposed population. Both are standardized to a common age/sex distribution within their respective denominator. Groups can change relative position because marriage prevalence/exposure differs. These dated2023 group associations do not establish inherent causes or select an ideal ethnicity or origin for an individual relationship.''')
demo_table(['race_ethnicity'],'race','Race/ethnicity: age/sex-standardized annual divorce-event percentages')
text('race_note','''Hispanic origin is an ethnicity; Hispanic respondents of every race form one category, and other rows are non-Hispanic(NH). The broad classifications combine varied people and histories. Age/sex adjustment does not remove differences in education, income, age at marriage, marriage duration, migration, or selection into marriage. Small NativeHawaiian/PacificIslander and some-other-race event cells are flagged; their point estimates should not be ranked as stable group characteristics.''')
demo_table(['nativity','citizenship'],'nativity','Nativity and citizenship: age/sex-standardized annual event percentages')
demo_table(['entry_duration','birth_region'],'origin','Foreign-born entry duration and predefined world-area of birth')
r=[]
for g,b in x[(x.dimension.isin(['race_ethnicity','nativity']))&(x.population=='at_risk_approx')].groupby('group',sort=False):
 rr=dict(group=g)
 for measure,key in [('population_share_percent','populationShare'),('divorce_event_share_percent','eventShare'),('event_composition_representation_ratio','representation')]:
  z=b[b.measure==measure].iloc[0];rr[key]=z.estimate/100 if key!='representation' else z.estimate
  if key=='representation':rr['CI']=interval(z)
 r.append(rr)
q=query('representation',r,'Composition of divorce events versus approximate marriage-exposed population','acs',['demographics_acs/results.csv','demographics_acs/summarize.py'],'Crude event-share divided by subgroup share of approximate marriage-exposed adults30–64; all80replicates withlog95%CI forratio.', ['Composition ratio, not causal risk; mathematically equals subgroup crude eventproportion divided by overall crude eventproportion for this same denominator.','Age/sex standardized results are separate; do not interpret these crude representation ratios as adjusted.','Generalpopulation representation results also preserved in CSV.'])
text('representation_text','''### “Overrepresented” needs a reference population

A composition ratio above1means a group contributes a larger share of reported divorce events than of the selected marriage-exposed population; below1means a smaller share. The table states both shares. This is a crude composition calculation, not a new independent finding: algebraically it equals the group’s crude annual event proportion divided by the overall crude event proportion under the same denominator. Separate general-population representations are included in the CSV, and the preceding tables provide age/sex adjustment.''',q)
table('representation',q,'Crude event representation, with explicit marriage-exposed denominator',[('group','Group',None),('populationShare','Population share','pct'),('eventShare','Divorce-event share','pct'),('representation','Composition ratio',None),('CI','95% CI',None)])
text('unavailable','''### Birthplace, former nationality and family abroad remain different variables

“Native” includes U.S.-territory births and people born abroad to U.S.-citizen parents; it is not synonymous with birth in a U.S.state. Foreign-born origin rows use Census’s predefined world areas, not selected country rankings. Approximate years since entry are2023minus reported entry year, not lawful status, continuous residence or immigration timing relative to marriage.

Birthplace does not identify former nationality. ACS’s parent-nativity variable is restricted to eligible children age17orunder, so it cannot identify second-generation adults in this30–64analysis. Co-resident household relationships cannot establish whether parents, siblings or extendedfamily live elsewhere in the U.S.or abroad. These requested dimensions cannot be inferred from the available adult microdata.20partition checks across all81weights confirm the demographic totals, including foreign-born subgroup totals.''')

# Append only if paired wage analysis has finished and its audit exists.
if (P/'pairing_nlsy/pairing_model_audit.json').exists():
 x=read('pairing_nlsy','high_husband_wage_profiles');r=[]
 for _,z in x[x.reporting_sex=='All'].iterrows():r.append(dict(wife=z.wife_pattern,rate=z.rate_per_1000,CI=interval(z,'ci_low','ci_high'),respondents=int(z.respondents),intervals=int(z.intervals),events=int(z.events)))
 q=query('wage_profiles',r,'Predissolution paired wages: prespecified upper-quartile husband subgroup','nlsy',['pairing_nlsy/high_husband_wage_profiles.csv','pairing_nlsy/wage_cutpoints.json','pairing_nlsy/METHODS.md'],'Baseline married respondent intervals2000–2022followups; husbandQ4onsharedwithinwavepositivewage scale; legaldivorce incidence per1000personyears; respondentcluster approximateCIs.', ['Priorcalendar-year wage/salary income of both spouses, proxyspouse reports; not wealth,totalincome or selfemploymentprofits.','Q4is relative withinwave positive wages, not fixed200k salary.','Zero spouse wages do not establish dependence or zero resources; sparse directions not a recommended configuration.'])
 text('wages_intro','''## Paired earnings: separate total resources from who earns more

A prospective NLSY79 analysis now links each baseline spouse’s prior-calendar-year wages to later legal-divorce incidence. It uses the same dollar thresholds for husbands and wives within a wave. The prespecified table below holds the husband in the upper positive-wage quartile; it does not search all configurations for the smallest outcome.

Adjusted relative-wage models additionally control combined couple-wage quartile, both spouses’ schooling tiers, respondent hours, age, current-marriage duration and wave. Versus balanced40%–60%wife wages, husband-majority/both-positiveRR0.72(0.57–0.92), husband-onlyRR0.96(0.70–1.32), wife-majority/both-positiveRR1.40(1.01–1.94), wife-onlyRR1.06(0.70–1.61). This does not establish that a wife with zero wages is safer than two earners or financial dependence protects marriage. Baseline wage changes can already reflect marital problems; unmeasured conditions and missingness remain. Full schooling-pair matrices and model sensitivity are in the bundle; schooling years are not verified BA/master’s/doctorate credentials.''',q)
 table('wage_profiles',q,'Upper-quartile husband wages: subsequent annual legal-divorce incidence',[('wife','Wife earnings configuration',None),('rate','Per1000person-years',None),('CI','Approx.95% CI',None),('respondents','Respondents',None),('intervals','Intervals',None),('events','Events',None)])
 x=read('pairing_nlsy','pairing_adjusted_rate_ratios');r=[]
 for _,z in x[(x.reporting_sex=='All')&(x.model=='earnings')&x.term.str.startswith('earnings_pair:')].iterrows():r.append(dict(comparison=z.term.replace('earnings_pair: ',''),RR=z.rate_ratio,CI=interval(z,'ci_low','ci_high')))
 q=query('wage_adjusted',r,'Relative wages conditional on combined couple resources','nlsy',['pairing_nlsy/pairing_adjusted_rate_ratios.csv','pairing_nlsy/pairing_model_audit.json'],'BaselineweightedPoisson exposureoffset model; samebaselinecouple followedtofirstdivorce/widowhood/nextinterview; repeatedrespondentclusterCIs.',['Approximate uncertainty omits original surveyPSU/strata.','Missing/skip earnings excluded rather than zero.','Additive covariate assumptions; neither randomized nor a personalized forecast.'])
 table('wage_adjusted',q,'Adjusted incidence rate ratios relative to balanced wages',[('comparison','Comparison',None),('RR','Rate ratio',None),('CI','Approx.95% CI',None)])

if (P/'pairing_nlsy/high_husband_zero_wife_rate_ratios.csv').exists():
 x=read('pairing_nlsy','husband_wife_wages_matrix');r=[]
 for _,z in x[(x.reporting_sex=='All')&(x.husband_wage_band=='Q4')].iterrows():r.append(dict(wife=z.wife_wage_band,rate=z.rate_per_1000,CI=interval(z,'ci_low','ci_high'),respondents=int(z.respondents),events=int(z.events)))
 q=query('wage_dollar_levels',r,'Same upper-quartile husband wages with every wife wage band','nlsy',['pairing_nlsy/husband_wife_wages_matrix.csv','pairing_nlsy/high_husband_zero_wife_rate_ratios.csv','pairing_nlsy/direct_high_husband_comparisons.py'],'Prespecified husbandQ4; commonwithinwavepositivepartnerwagequartiles plus explicitzero wife wages; legaldivorceper1000personyears.', ['Q4is a relative positive-wage band, not a fixed salary or total wealth.','Crude comparisons within husbandband retain other confounding.','Respondent-cluster approximate95% intervals; no fullsurveyPSU/strata.'])
 text('wage_direct_text','''### Direct test of the high-husband/zero-wife-wages idea

Holding the husband in the same upper wage quartile, wife-zero incidence is6.56per1000person-years(4.56–9.44), versus6.25(3.79–10.30) when the wife is also in the upper quartile. Their formal crude rate ratio is1.05(0.56–1.95): the data do not identify wife-zero as better. All five wife wage bands are shown rather than selecting the minimum. “No reported wage/salary income” is not the same as no income, no wealth, or financial dependence.''',q)
 table('wage_dollar_levels',q,'Upper-quartile husband: wife zero versus all common wage quartiles',[('wife','Wife wage band',None),('rate','Per1000person-years',None),('CI','Approx.95% CI',None),('respondents','Respondents',None),('events','Events',None)])
 x=read('pairing_nlsy','pairing_adjusted_rate_ratios');r=[]
 for _,z in x[(x.reporting_sex=='All')&(x.model=='education')&x.term.str.startswith('education_direction:')].iterrows():r.append(dict(comparison=z.term.replace('education_direction: ',''),RR=z.rate_ratio,CI=interval(z,'ci_low','ci_high')))
 q=query('education_prospective',r,'Predissolution schooling-tier mismatch with partner-level controls','nlsy',['pairing_nlsy/pairing_adjusted_rate_ratios.csv','pairing_nlsy/husband_wife_schooling_matrix.csv','pairing_nlsy/METHODS.md'],'Prospectivebaselinepairedschooling; controlsbothschoolinglevels,relative/totalcouplewages,workhours,age,currentmarriageduration,wave; respondentcluster approximateCIs.', ['Schooling-year tiers, not verifieddegreecredentials.','Mismatchtermreliesonadditivepartner-level assumption, not saturatedcellmodel.','Unmeasured confounding/selection remain.'])
 text('education_prospective_text','''The prospective schooling analysis also does not resolve a residual mismatch association once both schooling levels and observed resources are controlled: husband-higherRR1.08(0.73–1.60), wife-higherRR1.36(0.90–2.06), versus the same schooling tier. These are schooling-year categories, not separately verified bachelor’s/master’s/doctorate degrees. The mismatch coefficient relies on additive partner-level assumptions; detailed matrices are retained.''',q)
 table('education_prospective',q,'Prospective adjusted schooling-direction incidence rate ratios',[('comparison','Comparison',None),('RR','Rate ratio',None),('CI','Approx.95% CI',None)])

# Optional bounded first-marriage-age table from the already completed ACS model.
if (P/'annual_acs/first_marriage/predictive_margins.csv').exists():
 x=read('annual_acs/first_marriage','predictive_margins');r=[]
 for g in ['<22','22-26','27-31','32-36','37+']:
  row={'age':g}
  for sex,key in [('Men','men'),('Women','women')]:
   v=x[(x.factor=='age_at_marriage')&(x.sex==sex)&(x.level==g)]
   if len(v):z=v.iloc[0];row[key]=z.estimate/100;row[key+'CI']=interval(z)
  r.append(row)
 q=query('first_marriage_age',r,'Annual divorce reporting by age at first marriage','acs',['annual_acs/first_marriage/predictive_margins.csv','annual_acs/first_marriage/checks.json'],'ACS2023first-marriage-onlycurrent/recentmarriageexposure; alreadycompletedjointmodelpredictivemargins byageatfirstmarriage; all80replicates.', ['Ageatmarriagederivedfromcurrentageandmarriageyear, approximateyearresolution.','Survivorconditioning: currentlyage30–64firstmarriagesselectedforremainingfirstmarriedorrecentdivorce.','Averaging counterfactualages across observedcurrentages/durationscanimplyinfeasiblecombinations; nooptimalweddingage inferred.'])
 text('first_marriage_age_text','''### Age at first marriage: a bounded descriptive check

The first-marriage-only ACS model supplies the requested annual comparison below. These conditional predictive margins are affected by current-age30–64selection and survival of a first marriage into that sample. Forcing marriage-age categories across fixed observed current ages and durations can create infeasible combinations, so the smallest fitted value is not an optimal wedding age or a prospective recommendation. Age and marriage year have calendar-year resolution.''',q)
 table('first_marriage_age',q,'First marriages: adjusted past-year divorce-event percentages',[('age','Approx.ageatfirstmarriage',None),('men','Men','pct'),('menCI','95% CI, %',None),('women','Women','pct'),('womenCI','95% CI, %',None)])

# Paired earnings is the most direct annual follow-up; keep it before historical education.
wage_blocks=[b for b in B if b['id'].startswith(prefix+'wage')]
B=[b for b in B if not b['id'].startswith(prefix+'wage')]
B=B[:1]+wage_blocks+B[1:]

# Copy source modules and inputs as a portable increment, excluding caches.
R=O/'reproducibility';R.mkdir(exist_ok=True)
for folder in ['pairing_nsfg','demographics_acs','pairing_religion','pairing_nlsy']:
 if (P/folder).exists():shutil.copytree(P/folder,R/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
if P!=R:shutil.copy2(Path(__file__).resolve(),R/'add_pairing_demographics.py')
# Read current report immediately before mutation to preserve other completed helpers.
s=json.loads(F.read_text());s['queries']={k:v for k,v in s['queries'].items() if not k.startswith(prefix)};s['queries'].update(Q)
blocks=[b for b in s['report']['blocks'] if not b['id'].startswith(prefix)]
i=next((i for i,b in enumerate(blocks) if b['id']=='annual-old-analysis'),len(blocks));s['report']['blocks']=blocks[:i]+B+blocks[i:]
s['report']['sourcePreviews'].update({'https://www.nlsinfo.org/sites/default/files/attachments/121210/3.Marital%20History.html':{'title':'NLSY792000couple religion questionnaire','summary':'Exact respondent/spouse affiliation and attendance questions before prospectivefollowup.','source':'NLSinfo','approvedForReport':True},'https://www2.census.gov/programs-surveys/acs/tech_docs/pums/data_dict/PUMS_Data_Dictionary_2023.pdf':{'title':'ACS2023PUMSdictionary','summary':'Official race/ethnicity,nativity,citizenship,yearofentry,worldareaofbirth,parentnativity and marital-event definitions.','source':'U.S.CensusBureau','approvedForReport':True}})
s['generatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();s['buildStatus']='complete';F.write_text(json.dumps(s,indent=2,ensure_ascii=False,allow_nan=False))
print('Integrated',len(Q),'queries and',len(B),'blocks; buildStatus complete; no build/hosting changes.')
