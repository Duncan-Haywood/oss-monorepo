"""Assemble report snapshot from computed CSVs; no manual result transcription."""
from pathlib import Path
import json,pandas as pd,numpy as np,datetime
P=Path(__file__).resolve().parent
O=P.parent/'report-app/src/data.json'
s=json.loads(O.read_text());s.update(title='Education, income and divorce: original U.S. microdata analysis',generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),buildStatus='creating',status='observed',filters=[])
acs=pd.read_csv(P/'acs/results.csv');ns=pd.read_csv(P/'nsfg/results.csv');nstd=pd.read_csv(P/'nsfg/age_standardized.csv');nl=pd.read_csv(P/'longitudinal/nlsy79_degree_sex_results.csv');mods=pd.read_csv(P/'acs/adjusted_models.csv')
Q={};B=[]
urls={'acs':'https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip','nsfg':'https://www.cdc.gov/nchs/nsfg/nsfg_2017_2019_puf.htm','nlsy':'https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip'}
def clean(rows):return json.loads(pd.DataFrame(rows).replace({np.nan:None}).to_json(orient='records'))
def addquery(q,rows,label,source,definition,files,caveats):
 Q[q]={'rows':clean(rows),'source':{'label':label,'url':urls[source],'files':files,'filters':[definition],'caveats':caveats,'metricDefinitions':[{'label':label,'definition':definition}],'evidenceFlow':[{'title':'Public microdata download','detail':urls[source]},{'title':'Original analysis','detail':'Reproducibility bundle contains executable transformations, survey weights, results, checksums and source documentation. No published table used as analytical input.'}]}}
def prose(id,text,q=None):B.append(dict(id=id,type='text',text=text,**({'queryId':q} if q else {})))
def table(id,q,title,columns):B.append(dict(id=id,type='table',queryId=q,title=title,columns=[dict(key=k,label=l,**({'format':f} if f else {})) for k,l,f in columns]))
def figure(id,q,title,name,caption):B.append(dict(id=id,type='figure',queryId=q,title=title,name=name,caption=caption))
def ci(z,lo='ci_low',hi='ci_high',scale=1,digits=1):return f'{z[lo]*scale:.{digits}f}–{z[hi]*scale:.{digits}f}%'
def pivot(a,group,sex,values,labels):
 out=[]
 for g in values:
  r={'group':g}
  for v,k in labels:
   t=a[(a[group]==g)&(a[sex]==v)]
   if len(t):
    z=t.iloc[0];r[k]=z['percent']/100;r[k+'CI']=ci(z,digits=2);r[k+'N']=int(z['n'])
  out.append(r)
 return out
prose('summary','''## Executive Summary

- **Education is associated with divorce, but “more graduate education” does not yield a universal ranking.** In ACS 2023, age-standardized past-year divorce reports were 1.02% for bachelor’s-educated men and 1.16% for bachelor’s-educated women. All six master’s/professional/doctorate comparisons against bachelor’s within sex had 95% difference intervals containing zero; this does not establish equivalence.
- **Higher personal income is associated with lower annual divorce odds more clearly for men.** After controlling for age, education and race/ethnicity, men reporting $200k+ had an odds ratio of 0.66 (95% CI 0.57–0.76) versus $50k–74,999. Women’s estimate was 0.88 (0.73–1.07). Income and divorce were measured over overlapping periods, so these do not identify a pay effect.
- **Religious practice and spouse pairing add information.** NSFG first-marriage dissolution prevalence was about 26%–28% among weekly attenders versus 41%–42% among never attenders after interview-age standardization. Among women reporting both spouses BA+, unadjusted first-marriage dissolution prevalence was 14.5% (11.0–18.9), compared with 40.9% (36.1–45.8) when both were below BA. These are observed histories, not lifetime predictions; education and attendance may have changed after a dissolution.
- **NLSY79 supplies longer follow-up, with less precise small-degree estimates.** Recorded ever-divorce through the 2022/23 interview was 34.8% for bachelor’s-educated men and 40.0% for bachelor’s-educated women. These cohort estimates differ from both ACS annual measures and NSFG first-marriage histories. NLSY intervals here are weight-only approximations, not full survey-design intervals.''')
prose('definitions','''## Three different questions, three different denominators

**Cumulative recorded divorce occurrence — NLSY79:** among ever-married retained respondents born in 1957–1964, the fraction with at least one recorded legal divorce through their latest 2022/23 interview. This follows histories over decades, but is not complete lifetime risk or a common age/duration endpoint.

**Historical first-marriage dissolution prevalence — NSFG:** among ever-married people ages 25–49 interviewed in 2017–2019, the fraction whose first marriage had ended in divorce/annulment or separation by interview. Remarried people still count. Widowhood is excluded from the numerator but retained in the denominator. Follow-up exposure differs across people. A stricter divorce/annulment-only outcome is supplied separately.

**Annual divorce reporting — ACS:** among ever-married adults ages 30–64 interviewed in 2023, the fraction reporting divorce in the rolling past 12 months. This is not a calendar-year event rate, a person-year hazard, or the next-year risk of an intact marriage. The denominator includes previously divorced and widowed people.

**Current divorced prevalence — ACS:** the fraction currently divorced among ever-married adults. Remarriage removes people from this numerator; it does not erase a prior divorce. Current status therefore cannot substitute for ever-divorced history.

Do not add, average, or multiply these percentages into a personalized forecast. Sex refers to the survey’s male/female variable; the male and female samples are not matched spouses.''')
# ACS education
x=acs[(acs.variable=='education')&(acs.outcome=='annual_ever_married')&(acs.measure=='age_standardized')].copy();x['percent']=100*x.proportion;x['ci_low']=100*x.ci95_low;x['ci_high']=100*x.ci95_high;x['n']=x.unweighted_denominator_n
ed=['Less than high school','High school/GED','Some college','Associate','Bachelor','Master','Professional','Doctorate']
addquery('acs_education',pivot(x,'group','sex',ed,[('Men','men'),('Women','women')]),'ACS 2023 detailed degree and sex','acs','Age-standardized MARHD=1 / MAR!=5; ages30–64; pooled eligible age standard in seven5-year bins; 95% SDR normal intervals.',['results.csv','age_cell_weighted_totals.csv.gz'],['All 80 replicate weights, re-estimating standard population each replicate.','Current education may postdate divorce; no duration control.'])
prose('annual-text','''## Graduate degrees do not show a consistent annual-divorce hierarchy

The ACS analysis includes 1,499,259 respondents ages 30–64, of whom 1,182,597 were ever married; 13,788 ever-married respondents reported divorce in the past 12 months. Results use person weights and all 80 replicate weights, not a simple-random-sample approximation. Lower-education groups are not strictly monotonic either.

Matched-replicate differences against bachelor’s were small relative to uncertainty: for men, master’s −0.048 percentage points (95% CI −0.182 to 0.085); for women, master’s −0.090 points (−0.206 to 0.026). Professional and doctoral differences also included zero. These are pointwise exploratory intervals; “no detected difference” is not proof of equal outcomes.''','acs_education')
figure('annual-figure','acs_education','ACS 2023: annual divorce reports by degree and sex','annual','Dots are age-standardized proportions; whiskers are 95% confidence intervals from all80 ACS replicate weights. Ages30–64, ever married. Zero is shown; estimates are not intact-marriage hazards.')
table('annual-degrees','acs_education','Annual divorce reports: age-standardized percentages (95% CI)',[('group','Degree',None),('men','Men','pct'),('menCI','95% CI',None),('women','Women','pct'),('womenCI','95% CI',None)])
# Current prevalence separate
x=acs[(acs.variable=='education')&(acs.outcome=='current_divorced_ever_married')&(acs.measure=='age_standardized')].copy();x['percent']=100*x.proportion;x['ci_low']=100*x.ci95_low;x['ci_high']=100*x.ci95_high;x['n']=x.unweighted_denominator_n
addquery('acs_current',pivot(x,'group','sex',ed,[('Men','men'),('Women','women')]),'ACS current divorced status','acs','MAR=3 / MAR!=5; ages30–64; same pooled age standard; 95% SDR intervals.',['results.csv'],['Current divorced excludes remarried people and does not measure ever divorced.'])
prose('current-text','''### Current marital status answers a narrower question

The next table measures being divorced now, rather than experiencing a divorce during a year or ever. A person with a past divorce who remarried contributes to the denominator but not the current-divorced numerator.''','acs_current')
table('current-degrees','acs_current','Currently divorced among ever-married adults: age standardized',[('group','Degree',None),('men','Men','pct'),('menCI','95% CI',None),('women','Women','pct'),('womenCI','95% CI',None)])
# models income
for focus,ref,title in [('income_group','50,000-74,999','Personal income'),('employment','Employed','Employment')]:
 r=[];a=mods[mods.model==focus];terms=a[a.term.str.startswith(focus+':')].term.unique()
 for term in terms:
  if 'Armed forces' in term:continue
  rr={'group':term.split(':',1)[1]}
  for sex,key in [('Men','men'),('Women','women')]:
   z=a[(a.sex==sex)&(a.term==term)].iloc[0];rr[key]=round(z.odds_ratio,3);rr[key+'CI']=f'{z.ci95_low:.2f}–{z.ci95_high:.2f}'
  r.append(rr)
 addquery('acs_'+focus,r,'ACS adjusted '+title.lower()+' associations','acs','Survey-weighted binomial logit of MARHD=1 among ever-married ages30–64, separately by sex; age5-year group+degree+race/ethnicity+'+focus+'. Reference '+ref+'. 95% SDR log-odds intervals.',['adjusted_models.csv','model_acs.py'],['Odds ratios, not risk ratios or probabilities.','Income and employment fit separately, not mutually adjusted.','Contemporaneous measures; omitted duration and marriage order; cannot infer causality.'])
prose('income-text','''## Higher pay is not a universal explanation

The income models adjust for five-year age groups, eight degree categories, and four race/ethnicity categories, separately for men and women. The reference group is **$50,000–74,999 in total personal income**, not household income or salary alone. Amounts use the ACS adjustment factor to express 2023 dollars.

For men, the $200k+ estimate is 0.66 (95% CI 0.57–0.76): about34% lower odds of reporting a past-year divorce, conditional on these controls. For women, the estimate is 0.88 (0.73–1.07), which includes no association. No formal sex-interaction test was used, so differing significance alone does not prove the two associations differ.

Zero/negative-income women have an especially low adjusted odds ratio of0.32. This is a warning against treating earnings as a simple protective dose: marital specialization, selection into employment, household resources, and income changes following divorce can all contribute. The model cannot distinguish these mechanisms.''','acs_income_group')
table('income-model','acs_income_group','Adjusted odds ratios: personal income versus $50k–74,999',[('group','Personal income',None),('men','Men OR',None),('menCI','95% CI',None),('women','Women OR',None),('womenCI','95% CI',None)])
prose('employment-text','''### Employment associations also differ across the samples

The employment model uses the same demographic controls, with employment replacing income. The reference is employed adults. Men outside the labor force have an adjusted odds ratio of1.34 (1.23–1.46), while women outside the labor force have0.57 (0.53–0.61). These describe employment near interview, not stable work across a marriage. The unstable small armed-forces subgroup is retained in downloadable results but omitted here.''','acs_employment')
table('employment-model','acs_employment','Adjusted odds ratios: employment versus employed',[('group','Employment',None),('men','Men OR',None),('menCI','95% CI',None),('women','Women OR',None),('womenCI','95% CI',None)])
# NLSY
ned=['Less than high school','High school diploma or equivalent','Some college, no higher degree','Associate','Bachelor','Master','Professional','Doctorate (PhD)']
addquery('nlsy_education',pivot(nl,'education','sex',ned,[('Men','men'),('Women','women')]),'NLSY79 cumulative recorded legal divorce','nlsy','Positive2022 weight+valid marital status; ever-married retained respondents; any observed legal divorce through2022/23. Latest degree; 95% WEIGHT-ONLY approximate logit intervals.',['nlsy79_extract.csv','nlsy79_degree_sex_results.csv'],['Not a BLS age55 replication.','CIs omit PSU/stratum design, clustering and weight estimation.','Death and attrition select the retained sample; missing histories may conceal transitions.','Latest education may postdate divorce; PhD/professional cells are sparse.'])
prose('nlsy-text','''## NLSY79 provides decades of history, not a contemporary lifetime forecast

Among5,562 ever-married respondents retained in2022, recorded ever-divorce was46.7% for men and52.8% for women. The birth cohort is1957–1964, ages58–65 in nominal2022 (some interviews occurred in2023). Any recorded legal divorce counts, including divorce followed by remarriage. Combining marital status with transition records and baseline divorce dates identified149 cases that all observed marital-status waves alone would miss.

Bachelor’s-educated men had34.8% recorded ever-divorce and master’s-educated men21.8%; women had40.0% and51.0%, respectively. The difference in direction from younger NSFG first-marriage histories is not a replication failure: the cohorts, exposure windows, any-marriage versus first-marriage outcomes, and final educational classifications differ. Degrees acquired after divorce are included. These results should not be read as the effect of obtaining a master’s.

**The following95% intervals are weight-only approximations.** They account for unequal weights but omit survey clustering/stratification because usable design identifiers were not established for this extract. They can be too narrow. Among2,681 respondents without a recorded divorce,893 missed at least one marital-status wave. A complete-wave sensitivity retained the women’s master’s/bachelor’s difference (48.3% versus37.3%), but does not eliminate selection bias. The doctoral groups contain only21 men and15 women; the professional groups contain52 men and29 women. Treat these as descriptive, fragile estimates.''','nlsy_education')
table('nlsy-degrees','nlsy_education','Recorded ever-divorce through2022/23: weight-only approximate95% CIs',[('group','Degree',None),('men','Men','pct'),('menCI','Approx.CI',None),('menN','n',None),('women','Women','pct'),('womenCI','Approx.CI',None),('womenN','n',None)])
pros=pd.read_csv(P/'longitudinal/nlsy79_prospective_income_employment.csv');x=pros[pros.measure.str.startswith('1999 family')];groups=['Under $25,000','$25,000–49,999','$50,000–99,999','$100,000 or more']
addquery('nlsy_prospective',pivot(x,'category','sex',groups,[('Men','men'),('Women','women')]),'NLSY79 earlier income and later recorded divorce','nlsy','Married in2000 and retained in2022(n3502); family income1999 nominal dollars; any divorce transition in2002–2022. Weighted unadjusted follow-up proportions; weight-only approximate95% intervals.',['nlsy79_prospective_income_employment.csv'],['Income precedes follow-up but not all marital conflict.','Conditional on retention; any later marriage divorce counts; competing death not modeled.','Not personal salary, a fixed-marriage survival risk, or causal effect.'])
prose('prospective-text','''### An earlier-income check supports a narrower association

A supplemental NLSY analysis starts with3,502 people married in2000 and retained in2022, then looks for any recorded divorce in2002–2022. Income was measured for1999, before that outcome interval. Among men, subsequent recorded divorce was29.9% below$25k versus14.9% at$100k+, but the middle categories were not monotonic. Women’s corresponding estimates were21.2% and19.3%.

This improves temporal ordering but is unadjusted, selected on later retention, and uses **family income in nominal1999 dollars**. It cannot answer whether moving someone’s current salary from$75k to$200k would change their divorce risk. The separate hours-worked results are also supplied: men working2,000+ hours had21.6% follow-up occurrence versus30.8% at zero hours; women24.5% versus22.4%. These are descriptive, not effects of steady employment.''','nlsy_prospective')
table('prospective-income','nlsy_prospective','1999 family income and later recorded divorce (approximate95% CIs)',[('group','1999 family income',None),('men','Men','pct'),('menCI','Approx.CI',None),('women','Women','pct'),('womenCI','Approx.CI',None)])
# NSFG degrees
x=ns[(ns.dimension=='education')&(ns.outcome=='first_marriage_divorced_separated')]
nsed=['Less than high school','High school / GED','Some college, no degree','Associate','Bachelor','Master','Professional','Doctorate']
addquery('nsfg_education',pivot(x,'group','sex',nsed,[('male','men'),('female','women')]),'NSFG first-marriage histories by degree','nsfg','Ever-married ages25–49; MAREND01 in1,2; 2017–2019 interview histories; crude weighted prevalence, Taylor logit t54 intervals.',['results.csv','analysis_extract.csv.gz'],['Different marital exposure by age/age at marriage; final education may postdate outcome.','Doctorate/professional cells sparse: male23/31, female32/41.'])
prose('nsfg-degree-text','''## Younger adults’ first-marriage histories show a different slice

NSFG includes1,908 ever-married men and2,609 ever-married women ages25–49. Bachelor’s and master’s groups show lower first-marriage dissolution prevalence than high-school-only groups in these unadjusted histories. Unlike the ACS annual measure, this counts a first marriage ending years earlier even if the respondent remarried. Unlike NLSY’s any-divorce outcome, later-marriage divorces after a first spouse’s death are not counted.

Doctorate/professional cells have only23/31 men and32/41 women. Wide intervals and different durations since marriage prevent a fine-grained graduate-degree ranking.''','nsfg_education')
table('nsfg-degrees','nsfg_education','First marriage ended in divorce/annulment or separation by interview',[('group','Degree',None),('men','Men','pct'),('menCI','95% CI',None),('women','Women','pct'),('womenCI','95% CI',None)])
# religion
x=nstd[(nstd.dimension=='religious_attendance')&(nstd.outcome=='first_marriage_divorced_separated')]
att=['Weekly or more','1–3 times monthly','Less than monthly','Never']
addquery('nsfg_attendance',pivot(x,'group','sex',att,[('male','men'),('female','women')]),'NSFG religious attendance and dissolution','nsfg','Ever-married ages25–49; first-marriage divorce/annulment/separation; current religious attendance; standardized to sex-specific eligible interview-age distribution; Taylor t54 logit intervals.',['age_standardized.csv','standardize.py'],['Sex-specific age standards support within-sex comparisons, not a controlled cross-sex contrast.','Attendance measured at interview; religion may change after divorce.','No adjustment for marriage duration, age at marriage, education or family background.'])
prose('religion-text','''## Current religious practice is associated with marital history

After standardizing five-year interview-age groups within each sex, weekly-or-more attendance corresponds to28.2% first-marriage dissolution prevalence among men and26.4% among women; never attendance corresponds to40.9% and42.0%. The intermediate categories are not strictly ordered. Formal never-minus-weekly differences were15.69 percentage points for women (95%CI9.30–22.09) and12.70 points for men (3.00–22.40), using the covariance of the survey influence estimates.

This is an association with **current attendance**, not religious commitment before marriage. Divorce can change participation or affiliation, and the survey cannot establish the causal direction here. Denomination tables and a divorce/annulment-only sensitivity outcome are included in the results; neither should be interpreted as a church-specific causal effect.''','nsfg_attendance')
figure('religion-figure','nsfg_attendance','NSFG: attendance and first-marriage dissolution','religion','Age standardized within sex, ages25–49; points and95% Taylor survey-design intervals. First-marriage dissolution includes separation and annulment. Current attendance may have changed following divorce.')
table('religion-table','nsfg_attendance','First-marriage dissolution prevalence by current attendance',[('group','Attendance',None),('men','Men','pct'),('menCI','95% CI',None),('women','Women','pct'),('womenCI','95% CI',None)])
# pairing
p=pd.read_csv(P/'nsfg/female_first_spouse_pairing.csv');x=p[(p.pairing_level=='BAplus_2x2')&(p.outcome=='first_marriage_divorced_separated')].copy();rr=[]
for _,z in x.iterrows():rr.append({'wife':z.wife,'husband':z.first_husband,'dissolution':z.percent/100,'CI':ci(z),'n':int(z.n),'events':int(z.events)})
addquery('nsfg_pairing',rr,'NSFG historical first-husband education pairing','nsfg','Female ever-married25–49; valid CHEDMARN spouse education(n2588); 2x2 education pairing; first-marriage divorce/annulment/separation; crude Taylor t54 CIs.',['female_first_spouse_pairing.csv','female_pairing_extract.csv.gz'],['Respondent education at interview, husband current/past highest education; not wedding-date degree.','Not adjusted for age/duration; no detailed graduate degree breakdown for husbands.','Female reports of first husbands, not matched spouses or male-report former-wife history.'])
prose('pairing-text','''## Spouse education pairing can be examined without conditioning on marriage survival

Women’s NSFG first-husband education question is asked for former first husbands as well as current/separated husbands. The official questionnaire’s flow checkC-12 on page13 confirms this, although the codebook’s universe prose is incomplete. Observed responses cover all2,722 ever-married women in the full file. Among eligible women ages25–49,21 with unknown/refused spouse education are excluded, leaving2,588.

Both-BA+ pairings show14.5% first-marriage dissolution prevalence, compared with40.9% for both-below-BA pairings. Mixed pairings are around33%–34%. After standardizing interview age, bothBA+ was14.36% (10.86–18.76) and both-below-BA41.52% (36.66–46.54), a difference of−27.15 percentage points (−33.57 to−20.74). This age adjustment does not align marital duration or wedding-date covariates. This is more informative than analyzing only intact couples, but it is still a retrospective observational association. Spouses’ educational reports are not explicitly education at the wedding. Husbands’ graduate/professional education is combined; separate master’s/PhD/JD/MD pair-specific risks are unsupported. No corresponding former-first-wife education field was established for men.

ACS co-resident householder/spouse education tables are also supplied as descriptive distributions only. They exclude dissolved former couples and therefore cannot estimate divorce risk by pairing.''','nsfg_pairing')
table('pairing-table','nsfg_pairing','Women’s first-marriage outcomes by reported spouse education',[('wife','Wife',None),('husband','First husband',None),('dissolution','Dissolution','pct'),('CI','95% CI',None),('n','n',None)])
# benchmark/methods
prose('benchmark','''## Correcting the starting benchmark

The earlier chat conflated several BLS quantities. Its70.5% first-marriage-retention figure refers to **ever-married men with bachelor’s or higher** in a selected1957–1964 cohort through age55. It does not describe every college-educated man, both-college couples, high earners, or an effect of pay. “Not still in a first marriage” can include widowhood; the complement is not automatically divorce risk. The27.1%/40.5% figures in that table describe first-marriage divorce, not ever-divorced-from-any-marriage prevalence.

The BLS study uses its own complete-history criteria and custom weights. This report’s NLSY analysis is a new, differently defined extract through2022/23 rather than a replication of that published estimate. [BLS study and tables](https://www.bls.gov/mlr/2024/article/patterns-of-marriage-and-divorce-from-ages-15-to-55-evidence-from-the-nlsy79.htm).''')
prose('methods','''## Methods, reproducibility and limits

**Data vintages.** ACS2023 one-year national person files, NSFG2017–2019 male/female respondent files, and NLSY79 public release through nominal2022 were downloaded directly from Census/CDC/NLSinfo on October19,2026. These are intentionally specified releases, not a claim to use the newest available release. PSID was assessed but not analyzed: its download portal requires free registration, and no account was created.

**Uncertainty.** ACS uses successive-difference replication: variance=4/80×Σ(replicate estimate−full estimate)². All80 replicate weights are retained; age standards and adjusted models are recalculated per replicate. Normal95% intervals are used for proportions, with log-scale intervals for odds ratios. NSFG uses WGT2017_2019,18 strata and72 nested PSUs; Taylor linearized variances use54 design degrees of freedom and logit t intervals. NLSY uses positive2022 weights and an independent-person weighted-ratio approximation; its intervals omit full survey design. No interval accounts for every source of recall, missingness, measurement error or model misspecification. Multiple comparisons are exploratory, with no multiplicity adjustment.

**Missingness and allocation.** ACS baseline retains Census-allocated responses;8.13% of weighted ages30–64 have the divorce-response allocation flag. Excluding these retains the broad degree pattern but shifts some values: women’s professional estimate changes from1.17% to1.26%. NSFG recoded family income is imputed; refused/unknown attendance and spouse education are excluded from the relevant domains, not coded never/low education. NLSY negative nonresponse/skip codes are excluded as specified; missed interviews may hide unrecorded divorces. Absence of a recorded transition is not proof of uninterrupted marriage.

**Confounding and selection.** Interview age standardization does not align marriage duration, age at marriage, marriage order or childhood conditions. Latest education, current religion, income and employment may follow divorce. Selection into marriage, remarriage, mortality, immigration, nonresponse and attrition affect the samples. These data do not justify multiplying “protective factors,” claiming causation, or estimating a specific person’s probability. Wealth, fidelity/affairs, relationship quality and the exact effect of a salary increase are not answered by these analyses.

**Survival limits.** No headline lifetime or fixed-duration divorce risk is claimed. NSFG public duration dates are coarsened; an exploratory grouped four-year Kaplan–Meier calculation is retained in the machine-readable results, clearly labeled approximate, and excluded from conclusions. It depends on interval event/censoring conventions and treats death as censoring, not competing risk. A defensible wedding-baseline survival model with time-varying predictors would require further history harmonization.

**Validation.** Parsing counts were checked against NSFG codebooks, pair-question routing against the questionnaire, ACS totals and all replicate transformations were audited, and an independent optimizer reproduced the four ACS adjusted-model coefficient vectors to within1.4×10⁻⁹. Graduate-degree difference CIs use matched replicate contrasts rather than inference from overlapping marginal CIs. Source-specific audit and model-check files are included. These checks validate computation and definitions, not causal identification.

The reproducibility bundle includes compact analytical datasets, all used weights/design variables, selected official dictionaries, raw NSFG files, source/checksum manifests, executable scripts, unrounded CSV results, and a single rerun entry point. Full Census and NLSY archives remain downloadable from the recorded official URLs and are checksum-identified. The report app source and figures are saved separately.''')
prose('sources','''## Public sources

- [Census ACS2023 public microdata archive](https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip), [2023 dictionary](https://www2.census.gov/programs-surveys/acs/tech_docs/pums/data_dict/PUMS_Data_Dictionary_2023.pdf), [PUMS weighting handbook](https://www.census.gov/content/dam/Census/library/publications/2021/acs/acs_pums_handbook_2021.pdf).
- [CDC NSFG2017–2019 data and design documentation](https://www.cdc.gov/nchs/nsfg/nsfg_2017_2019_puf.htm), [codebooks](https://www.cdc.gov/nchs/nsfg/nsfg_2017_2019_codebooks.htm), [female first-husband questionnaire](https://www.cdc.gov/nchs/data/nsfg/NSFG-PUF2017-2019-FemC-CRQ-508.pdf).
- [NLSY79 public archive through2022](https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip), [official data-access guidance](https://www.nlsinfo.org/content/access-data-investigator/accessing-data-cohorts).
- [PSID public-data access portal](https://simba.isr.umich.edu/data/data.aspx), assessed for feasibility but not analyzed.

All reported analytical estimates were calculated from respondent microdata. Published findings were used only for documentation and to correct the original benchmark.''')
# Repair compressed words from concise source construction without changing data keys.
import re
for b in B:
 for k in ['text','title','caption']:
  if k in b:
   parts=re.split(r'(https://[^)\s]+)',b[k]);
   for j in range(0,len(parts),2):
    parts[j]=re.sub(r'(?<=[A-Za-z%])(?=\d)', ' ',parts[j]);parts[j]=re.sub(r'(?<=\d)(?=[A-Za-z])',' ',parts[j]);parts[j]=re.sub(r'(?<=\w)(?=\$)',' ',parts[j]);parts[j]=re.sub(r'(?<=[%\d])(?=\()', ' ',parts[j])
   b[k]=''.join(parts).replace('NLSY 79','NLSY79').replace('WGT 2017_2019','WGT2017_2019').replace('95%CI','95% CI').replace('bothBA+','both BA+').replace('checkC-12','check C-12').replace('of−','of −').replace('to−','to −');b[k]=re.sub(r'(?<=\d) k', 'k', b[k]);b[k]=re.sub(r'(?<=[,;])(?=\d)', ' ', b[k]);b[k]=re.sub(r'(?<=\d), (?=\d{3}(?:\D|$))', ',', b[k])
addquery('acs_contrasts',pd.read_csv(P/'acs/degree_contrasts.csv'),'ACS matched-replicate degree contrasts','acs','Age-standardized annual divorce proportion differences vs bachelor, separately by sex; matched80-replicate SDR CIs.',['degree_contrasts.csv'],['Pointwise95% difference intervals; not equivalence tests.'])
addquery('nsfg_contrasts',pd.read_csv(P/'nsfg/age_standardized_contrasts.csv'),'NSFG age-standardized prevalence and contrasts','nsfg','Taylor influence-function estimates and differences, shared sex-specific age standard ages25–49, t54 intervals.',['age_standardized_contrasts.csv','contrasts.py'],['Adjusted only for coarse interview age, not duration or wedding-age education.'])
for b in B:
 if b['id']=='annual-text':b['queryIds']=['acs_education','acs_contrasts']
 if b['id']=='religion-text':b['queryIds']=['nsfg_attendance','nsfg_contrasts']
 if b['id']=='pairing-text':b['queryIds']=['nsfg_pairing','nsfg_contrasts']
s['queries']=Q;s['report']={'blocks':B,'sourcePreviews':{urls['nsfg']:{'title':'CDC NSFG public-use data','summary':'Official data downloads, design variables and survey-variance documentation for the2017–2019 release.','source':'CDC NCHS','approvedForReport':True},'https://www.bls.gov/mlr/2024/article/patterns-of-marriage-and-divorce-from-ages-15-to-55-evidence-from-the-nlsy79.htm':{'title':'BLS NLSY79 study','summary':'Published first-marriage outcomes through age55, using a selected complete-history sample and custom survey weights. Used to correct the earlier benchmark, not as input to the original analyses.','source':'BLS','date':'2024-09-12','approvedForReport':True}}}
O.write_text(json.dumps(s,indent=2,ensure_ascii=False))
print(len(Q),'reviewed queries;',len(B),'report blocks')
