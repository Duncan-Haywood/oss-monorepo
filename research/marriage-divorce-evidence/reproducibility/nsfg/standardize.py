"""Direct age standardization with full Taylor design linearization.
Target age distribution is sex-specific ever-married respondents age25-49,
accounting for estimation of that distribution, not treating it as fixed.
"""
# Execute existing analysis then reuse its functions and loaded definitions.
from analyze import *
rows=[];extract=[]
for sex in ['female','male']:
 d=load(sex);core=(d.fmarno>0)&d.ager.between(25,49)
 d['agebin']=pd.cut(d.ager,[24,29,34,39,44,49],labels=False)
 w=d.wgt2017_2019.to_numpy();N=np.sum(w*core)
 for dim,cat in groups(d).items():
  for val in cat.dropna().unique():
   dom=core&(cat==val)
   for kind,ev in [('first_marriage_divorced_separated',d.marend01.isin([1,2])),('first_marriage_divorced_annulled',d.marend01==1)]:
    q=0.;z=np.zeros(len(d));parts=[];valid=True
    for b in range(5):
     base=core&(d.agebin==b);cell=dom&(d.agebin==b);A=np.sum(w*base);B=np.sum(w*cell)
     if B<=0:valid=False;break
     p=np.sum(w*cell*ev)/B;q+=A/N*p;parts.append((base,cell,A,B,p))
    if not valid:continue
    for base,cell,A,B,p in parts:z+=w*(base*(p-q)/N+(A/N)*cell*(ev-p)/B)
    variance,df=designvar(d,z);se=np.sqrt(variance);crit=t.ppf(.975,df)
    if 0<q<1:
     l=np.log(q/(1-q));s=se/(q*(1-q));lo=1/(1+np.exp(-(l-crit*s)));hi=1/(1+np.exp(-(l+crit*s)))
    else:lo=hi=np.nan
    rows.append(dict(sex=sex,dimension=dim,group=val,outcome=kind,n=int(dom.sum()),events=int((dom&ev).sum()),percent=100*q,se_percentage_points=100*se,ci_low=100*lo,ci_high=100*hi,design_df=df,min_age_cell_n=min(int(a[1].sum()) for a in parts),sparse=bool(dom.sum()<100 or (dom&ev).sum()<20 or min(int(a[1].sum()) for a in parts)<10)))
 d['sex']=sex;extract.append(d)
pd.DataFrame(rows).to_csv(P/'age_standardized.csv',index=False)
pd.concat(extract).to_csv(P/'analysis_extract.csv.gz',index=False,compression='gzip')
print(pd.DataFrame(rows).query("dimension=='religious_attendance' and outcome=='first_marriage_divorced_separated'").to_string(index=False))
