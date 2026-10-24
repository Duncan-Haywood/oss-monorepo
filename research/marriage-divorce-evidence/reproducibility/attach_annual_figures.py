from pathlib import Path
import json,shutil
P=Path(__file__).resolve().parent
A=P.parent/'report-app'
F=A.parent/'figures';p=A/'src/data.json';s=json.loads(p.read_text());b=s['report']['blocks']
new=[('annual-driver-figure','annual_joint_contrasts','Joint annual associations','annualDrivers','annual-driver-table','annual_driver_contrasts.png','Differences in percentage points. Predictors are fitted jointly; intervals are pointwise 95% SDR estimates. Approximate ACS at-risk denominator; associations, not causal effects.'),('annual-prospective-figure','annual_nlsy_joint','Prospective annual associations','prospective','annual-prospective-table','prospective_rate_ratios.png','Baseline family income precedes follow-up; attendance is reported in 2000. Approximate respondent-cluster 95% intervals omit full survey design. This model does not condition on already-separated status.')]
for id,q,title,name,before,file,caption in new:
 b=[r for r in b if r['id']!=id];i=next(i for i,r in enumerate(b) if r['id']==before);b.insert(i,dict(id=id,type='figure',queryId=q,title=title,name=name,caption=caption));shutil.copy2(F/file,A/'src/content/assets'/f'{name}.png')
s['report']['blocks']=b;p.write_text(json.dumps(s,indent=2,ensure_ascii=False))
