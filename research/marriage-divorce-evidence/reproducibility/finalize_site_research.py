from pathlib import Path
import json,shutil,datetime,re
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];W=ROOT/'work';O=ROOT/'outputs';F=O/'report-app/src/data.json'
s=json.loads(F.read_text());prefix='site_research_'
s['report']['blocks']=[b for b in s['report']['blocks'] if not b['id'].startswith(prefix)]
s['queries']={k:v for k,v in s['queries'].items() if not k.startswith(prefix)}
x=pd.read_csv(W/'politics_nlsy/politics_crude_rates.csv');x=x[(x.sex=='All')&(x.factor=='party')]
rows=[dict(party=z.category,rate=round(z.rate_per_1000,2),CI=f'{z.ci95_low:.2f}–{z.ci95_high:.2f}' if pd.notna(z.ci95_low) else 'Not estimable',n=int(z.n),events=int(z.events)) for z in x.itertuples()]
q=prefix+'politics'
s['queries'][q]={'rows':rows,'source':{'label':'Original prospective NLSY79 party-affiliation analysis','url':'https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip','files':['politics_nlsy/analyze_politics.py','politics_nlsy/METHODS.md','politics_nlsy/politics_crude_rates.csv','politics_nlsy/politics_adjusted_rate_ratios.csv'],'filters':['Party measured in 2008 before the 2008–2010 interview interval; baseline legally married or separated; exposure ends at divorce, widowhood or follow-up. Baseline weights, approximate independent-respondent robust confidence intervals.'],'caveats':['Only one interval and an older birth cohort; full survey design variance not available.','Politics measured for respondent only; no spouse party or political mismatch.','Extended model is sample- and specification-sensitive; no causal political effect.']}}
blocks=[{'id':prefix+'politics_text','type':'text','queryId':q,'text':'''## Political party: an annual check, with limited precision

Party affiliation was measured in 2008, before the 2008–2010 divorce interval. The primary model adjusts for age, sex, age at first marriage and baseline separation. Republican versus Democrat has an adjusted rate ratio of **0.88 (approximate 95% CI 0.51–1.51)**; Independent versus Democrat is **1.08 (0.65–1.80)**. These estimates do not resolve a clear difference.

Adding education, family income, race and earlier religious attendance changes the Republican estimate to 0.53 (0.29–0.97), but reduces the model from 4,069 people / 136 events to 3,366 / 112. On that same smaller sample, the simpler model is 0.69 (0.37–1.31). The result therefore depends on both sample and adjustment; selecting only the apparently significant specification would overstate the evidence. Only 20 Republican events support the extended estimate.

The table gives crude annual event rates, rather than the adjusted rate ratios above. These data cannot establish whether political agreement between spouses, ideological intensity or a specific policy view changes divorce risk. Religion is not a substitute for a measured political view.'''},{'id':prefix+'politics_table','type':'table','queryId':q,'title':'Baseline party: subsequent divorces per 1,000 person-years','columns':[{'key':'party','label':'Party'},{'key':'rate','label':'Per 1,000 person-years'},{'key':'CI','label':'Approx. 95% CI'},{'key':'n','label':'Respondents'},{'key':'events','label':'Divorces'}]},{'id':prefix+'next_sources','type':'text','text':'''## Which additional datasets would help most?

**SIPP is the strongest next candidate for paired earnings and immigrant generation.** Census documents monthly marital status, month-specific spouse pointers, income and employment, plus biological parents’ nativity in the 2014 panel. That could support divorce exposure by month, lagged earnings for both spouses, and first/second-generation comparisons. Public-use availability and coding must be verified for the selected release, and a spouse must remain linked to the correct marriage after separation. [Official SIPP content](https://www.census.gov/programs-surveys/sipp/about/sipp-content-information.html).

**NLSY97 would test whether the NLSY79 findings carry to a younger cohort.** Its marriage and cohabitation event histories can link partners to characteristics including religion; the income module includes spouse/partner earnings. This is especially useful for the age-at-marriage question and education/religion pairing before dissolution. Exact wave coverage and event counts need a fresh audit. [Relationship histories](https://nlsinfo.org/content/cohorts/nlsy97/topical-guide/marriage-and-children/marital-marriage-relationships), [income documentation](https://www.nlsinfo.org/content/cohorts/nlsy97/topical-guide/income/income).

**PSID would add longer financial histories, wealth and family links.** Its public files include a marriage-history file and income/religion documentation. It is a strong candidate for distinguishing persistent earnings, job loss and accumulated resources. Public access requires registration and agreement to the provider’s terms; no registration or restricted-data access was completed here. [Getting started](https://psidonline.isr.umich.edu/GettingStarted.aspx), [documentation](https://psidonline.isr.umich.edu/Guide/documents.aspx).

**NSFH would add relationship quality, family obligations and gender-role attitudes.** Those variables address compatibility more directly than credentials alone, and the survey includes spouse/partner information and marital histories. Its much older fieldwork limits claims about contemporary marriages. [Survey archive](https://www.ssc.wisc.edu/nsfh/), [documented content](https://www.ssc.wisc.edu/nsfh/content2.htm).

**GSS panel files could extend politics and specific attitudes.** NORC provides panel datasets and a 2006–2014 panel codebook. A useful analysis would measure views before a later marital transition and audit usable divorce events; ordinary cross-sectional marital-status comparisons would not supply annual divorce risk. [Official downloads](https://gss.norc.org/get-the-data/stata.html), [documentation](https://gss.norc.org/get-documentation.html).

These are verified candidates for further work, not additional datasets already analyzed in this report. Priority: SIPP for monthly paired earnings and parental nativity, then NLSY97 for cohort replication, then PSID for long-run finances. No single source has yet been verified to cover both spouses’ politics, detailed religion, earnings and relatives living abroad with enough divorce events.''' }]
i=next(i for i,b in enumerate(s['report']['blocks']) if b['id']=='annual-old-analysis');s['report']['blocks'][i:i]=blocks
for b in s['report']['blocks']:
 if b['id']=='annual-prospective-interpretation':
  b['text']=b['text'].replace('Nor can I rank same-degree spouse pairings on a comparable annual basis: NSFG’s public durations and post-outcome spouse reports do not provide the needed prospective paired exposure. The earlier pairing finding remains historical, not an annual effect.','The paired prospective analyses below extend this check to both spouses’ earnings, schooling tiers and baseline religion. They do not establish a universal matching advantage. Exact graduate-degree pairings remain unavailable in that annual analysis; the earlier NSFG pairing finding remains historical.')
# Make compressed agent prose legible without altering URLs or numerical results.
protected=['NLSY79','NSFG','ACS','Q1','Q2','Q3','Q4','BA']
def spacing(t):
 parts=re.split(r'(https?://[^\s)]+)',t)
 for i in range(0,len(parts),2):
  a=parts[i]
  for j,v in enumerate(protected):a=a.replace(v,f'ZZTOKEN{chr(65+j)}ZZ')
  a=re.sub(r'(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])|(?<=%)(?=[A-Za-z])',' ',a)
  a=re.sub(r'(?<=[\w%])(?=\()',' ',a)
  a=re.sub(r'(?<=[,;])(?=\S)',' ',a)
  a=re.sub(r'(?<=\d),\s+(?=\d{3}\b)',',',a)
  a=re.sub(r'(?<=\d) k\b','k',a)
  for j,v in enumerate(protected):a=a.replace(f'ZZTOKEN{chr(65+j)}ZZ',v)
  for old,new in {'firstmarriage':'first marriage','personyears':'person-years','per1000':'per 1,000','samebaseline':'same baseline','withinwave':'within-wave','broadreligion':'broad religion','currentmarriage':'current marriage','familyincome':'family income','spousepair':'spouse pair','wifewages':'wife wages','annualdivorce':'annual divorce','ageatmarriage':'age at marriage','ageatfirstmarriage':'age at first marriage','ageat':'age at ','extendedfamily':'extended family','publicmicrodata':'public microdata','age30':'age 30','bothpositive':'both positive','notcausal':'not causal'}.items():a=a.replace(old,new)
  parts[i]=a
 return ''.join(parts)
for b in s['report']['blocks']:
 if 'text' in b:b['text']=spacing(b['text'])
 if 'caption' in b:b['caption']=spacing(b['caption'])
for b in s['report']['blocks']:
 if b['id']=='methods' and 'Prospective NLSY models use baseline' not in b['text']:
  b['text']+='\n\n**Prospective uncertainty.** Prospective NLSY models use baseline-wave weights and person-time exposure, with respondent-cluster robust intervals for repeated intervals; the one-interval religion and politics analyses use independent-respondent robust intervals. These remain approximate because original survey PSU/stratum design variance and attrition-weight corrections were not established. The 2022-weight statement above applies to the original cumulative-history analysis only.\n\n**Two downloads.** The hosted download contains aggregate tables, methods and code. Compact individual-level extracts, raw NSFG files and the larger local reproducibility archive are retained locally; official original microdata links remain in Sources.'
# Include the completed 5x5 earnings figure alongside its full matrix source.
if not any(b.get('name')=='pairedIncomes' for b in s['report']['blocks']):
 q='pairdemo_wage_matrix'
 d=pd.read_csv(W/'pairing_nlsy/husband_wife_wages_matrix.csv').replace({float('nan'):None})
 s['queries'][q]={'rows':json.loads(d.to_json(orient='records')),'source':{'label':'Full paired-wage matrix','url':'https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip','files':['pairing_nlsy/husband_wife_wages_matrix.csv','pairing_nlsy/wage_cutpoints.json','pairing_nlsy/METHODS.md'],'caveats':['Crude baseline-wave weighted incidence; shared positive-wage quartile thresholds by wave; zero wages separate.','Approximate respondent-cluster uncertainty; sparse cells do not justify selecting an ideal configuration.']}}
 i=next(i for i,b in enumerate(s['report']['blocks']) if b['id']=='pairdemo_wage_profiles')
 s['report']['blocks'].insert(i,{'id':prefix+'income_matrix','type':'figure','name':'pairedIncomes','queryId':q,'title':'Paired wages and subsequent annual divorce','caption':'Each cell shows divorces per 1,000 person-years and observed divorce events. Asterisks flag fewer than 10 events. Quartiles use common husband/wife thresholds within each survey wave; these are crude associations. Full estimates, confidence intervals and wage cutpoints are available in the source and download.'})
shutil.copytree(W/'politics_nlsy',O/'reproducibility/politics_nlsy',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.log'))
for name in ['finalize_site_research.py','create_public_download.py']:shutil.copy2(W/name,O/'reproducibility'/name)
s['generatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();s['buildStatus']='complete';F.write_text(json.dumps(s,indent=2,ensure_ascii=False,allow_nan=False))
print('Report finalized:',len(s['report']['blocks']),'blocks,',len(s['queries']),'queries')
