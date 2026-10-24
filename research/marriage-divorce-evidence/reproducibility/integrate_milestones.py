from pathlib import Path
import json,shutil
import pandas as pd
P=Path(__file__).resolve().parent;O=P.parent/'outputs' if P.name=='work' else P.parent;F=O/'report-app/src/data.json';s=json.loads(F.read_text())
x=pd.read_csv(P/'milestones_nlsy/annual_rates_by_first_birth_landmark.csv');x=x[x.sex=='All'];r=[]
for z in x.itertuples():r.append(dict(stage=z.first_birth_band,rate=round(z.rate_per_1000,2),CI=f'{z.ci95_low:.2f}–{z.ci95_high:.2f}',people=int(z.respondents),events=int(z.events),age=round(z.mean_baseline_age,1),married=round(z.mean_baseline_marriage_years,1)))
s['queries']['first_birth_landmark']={'rows':r,'source':{'label':'First biological birth and subsequent annual divorce in first marriages','url':'https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip','files':['milestones_nlsy/extract.py','milestones_nlsy/analyze.py','milestones_nlsy/annual_rates_by_first_birth_landmark.csv','milestones_nlsy/METHODS.md','milestones_nlsy/validation.json'],'filters':['Current first marriages; baseline2000–2020 respondent first biological birth reported by that baseline and occurring within current first marriage; later interview divorce person-time.','Explicit AGE1Bxx=-998 identifies no first birth by baseline; unknown dates are not childless.','Annual rates grouped by baseline time since birth; unadjusted for age/marriage duration; approximate respondent-cluster95%CIs.'],'caveats':['Respondent first biological child is not necessarily spouses’ first shared child. Not an empty-nest measure or last-child departure.','Only eight divorce events in0–4year group; ages and marriage durations differ greatly.','No birthday threshold or causal effect established.']}}
b=[dict(id='milestone-birth-text',type='text',queryId='first_birth_landmark',text='''## Life events: what about years after the first child?

A new baseline-history extract checks subsequent annual divorce after the respondent’s first biological birth **within a first marriage**. The observed rate is about8.8per1,000person-years at5–12years since birth,7.5at13–17,5.8at18–24 and3.3at25+. But respondents in the5–12group average age42and14married years; those in the25+group average age55and33married years. These crude comparisons do not isolate a childbirth-stage association from age and marriage survival.

**This does not identify a birthday after which risk falls independently, or show that having a child prevents divorce.** The0–4year group contains onlyeight observed divorces. The explicitly no-first-birth group is shown for coverage, not as a randomized comparison with parenthood.

The measure is the respondent’s first biological child, not necessarily the current couple’s first shared child. Turning18does not establish that the last child moved out, so this is **not an empty-nest analysis**. A proper “event plusYyears” model needs the event date, same-couple linkage, a common follow-up horizon, and control of changing age and marriage duration. Job loss, illness, retirement and reconciliation need their own measured histories; this report does not infer them from zero wages or anniversaries.'''),dict(id='milestone-birth-table',type='table',queryId='first_birth_landmark',title='First-birth stage at baseline: subsequent observed divorce incidence',columns=[dict(key=k,label=l) for k,l in [('stage','First-birth stage'),('rate','Per1,000person-years'),('CI','Approx.95%CI'),('people','Respondents'),('events','Divorces'),('age','Mean age'),('married','Mean married years')]])]
import re
for z in b:
 if 'text' in z:
  z['text']=re.sub(r'(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])',' ',z['text']).replace('per1,000','per 1,000').replace('onlyeight','only eight').replace('plusYyears','plus Y years')
s['report']['blocks']=[z for z in s['report']['blocks'] if not z['id'].startswith('milestone-')];i=next(i for i,z in enumerate(s['report']['blocks']) if z['id']=='landmark-matching');s['report']['blocks'][i:i]=b
F.write_text(json.dumps(s,indent=2,ensure_ascii=False,allow_nan=False))
shutil.copytree(P/'milestones_nlsy',O/'reproducibility/milestones_nlsy',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.log'))
shutil.copy2(Path(__file__).resolve(),O/'reproducibility/integrate_milestones.py')
