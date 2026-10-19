"""Direct age-standardized pairing and attendance with survey contrasts.
Five-year interview-age strata; estimated sex-specific ever-married standard.
"""
from analyze import *

def std(d,core,domain,y):
 w=d.wgt2017_2019.to_numpy();N=np.sum(w*core);q=0.;parts=[];z=np.zeros(len(d));bn=pd.cut(d.ager,[24,29,34,39,44,49],labels=False)
 for b in range(5):
  base=core&(bn==b);cell=domain&(bn==b);A=np.sum(w*base);B=np.sum(w*cell)
  if B<=0:return None
  p=np.sum(w*cell*y)/B;q+=A/N*p;parts.append((base,cell,A,B,p))
 for base,cell,A,B,p in parts:z+=w*(base*(p-q)/N+(A/N)*cell*(y-p)/B)
 return q,z,min(int(p[1].sum()) for p in parts)

def summary(d,q,z,contrast=False):
 v,df=designvar(d,z);se=np.sqrt(v);crit=t.ppf(.975,df)
 if contrast:lo=q-crit*se;hi=q+crit*se
 elif 0<q<1:
  l=np.log(q/(1-q));s=se/(q*(1-q));lo=1/(1+np.exp(-(l-crit*s)));hi=1/(1+np.exp(-(l+crit*s)))
 else:lo=hi=np.nan
 return dict(estimate_pct_or_pp=q*100,se_pp=se*100,ci_low=lo*100,ci_high=hi*100,design_df=df)
rows=[]
for sx in ['female','male']:
 d=load(sx);core=(d.fmarno>0)&d.ager.between(25,49);y=d.marend01.isin([1,2]);g=groups(d)['religious_attendance'];fits={}
 for name in ['Never','Weekly or more']:
  dom=core&(g==name);q,z,m=std(d,core,dom,y);fits[name]=(q,z)
  rows.append(dict(sex=sx,analysis='religious_attendance',group=name,estimand='age_standardized_prevalence',n=int(dom.sum()),min_age_cell_n=m,**summary(d,q,z)))
 q=fits['Never'][0]-fits['Weekly or more'][0];z=fits['Never'][1]-fits['Weekly or more'][1]
 rows.append(dict(sex=sx,analysis='religious_attendance',group='Never minus weekly or more',estimand='difference_percentage_points',**summary(d,q,z,True)))
 if sx=='female':
  d['chedmarn']=pd.to_numeric(pd.read_fwf(P/'female.dat',colspecs=[(243,244)],names=['h'],skip_blank_lines=False).h,errors='coerce').to_numpy()
  valid=d.chedmarn.between(1,6);fits={}
  for wife in [False,True]:
   for husband in [False,True]:
    name=f"Wife {'BA+' if wife else 'below BA'} / first husband {'BA+' if husband else 'below BA'}"
    dom=core&valid&((d.hieduc>=12)==wife)&((d.chedmarn>=5)==husband);q,z,m=std(d,core,dom,y);fits[(wife,husband)]=(q,z)
    rows.append(dict(sex=sx,analysis='female_first_spouse_pairing',group=name,estimand='age_standardized_prevalence',n=int(dom.sum()),min_age_cell_n=m,**summary(d,q,z)))
  q=fits[(True,True)][0]-fits[(False,False)][0];z=fits[(True,True)][1]-fits[(False,False)][1]
  rows.append(dict(sex=sx,analysis='female_first_spouse_pairing',group='Both BA+ minus both below BA',estimand='difference_percentage_points',**summary(d,q,z,True)))
pd.DataFrame(rows).to_csv(P/'age_standardized_contrasts.csv',index=False)
print(pd.DataFrame(rows).to_string(index=False))
