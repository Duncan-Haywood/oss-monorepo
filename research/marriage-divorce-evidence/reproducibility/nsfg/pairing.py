"""Women respondent / first-husband education, historical first marriage outcomes.
CHEDMARN is verified against questionnaire Section C flow check C-12, page13.
"""
from analyze import *
d=load('female')
# Single-field fwf must retain completely blank records for row alignment.
d['chedmarn']=pd.to_numeric(pd.read_fwf(P/'female.dat',colspecs=[(243,244)],names=['h'],skip_blank_lines=False).h,errors='coerce').to_numpy()
assert len(d)==6141
assert int(d.chedmarn.notna().sum())==2722
base=(d.fmarno>0)&d.ager.between(25,49);valid=d.chedmarn.between(1,6)
assert (d.chedmarn[~(d.fmarno>0)].isna()).all()
rows=[]
for level in ['BAplus_2x2','degree_3x3']:
 if level=='BAplus_2x2':
  wife=np.where(d.hieduc>=12,'Wife BA+','Wife below BA');hus=np.where(d.chedmarn>=5,'First husband BA+','First husband below BA')
 else:
  wife=np.select([d.hieduc>=13,d.hieduc==12],['Wife graduate/professional','Wife bachelor'],default='Wife below BA')
  hus=np.select([d.chedmarn==6,d.chedmarn==5],['First husband graduate/professional','First husband bachelor'],default='First husband below BA')
 for a in np.unique(wife):
  for b in np.unique(hus):
   domain=base&valid&(wife==a)&(hus==b)
   for kind in ['first_marriage_divorced_separated','first_marriage_divorced_annulled']:
    r=estimate(d,domain,kind)
    if r:rows.append(dict(pairing_level=level,wife=a,first_husband=b,outcome=kind,**r))
pd.DataFrame(rows).to_csv(P/'female_first_spouse_pairing.csv',index=False)
d.to_csv(P/'female_pairing_extract.csv.gz',index=False,compression='gzip')
print(pd.crosstab(d.chedmarn.fillna(-1),d.marend01.fillna(-1)))
print('eligible',base.sum(),'valid',int((base&valid).sum()))
print(pd.DataFrame(rows).query("pairing_level=='BAplus_2x2' and outcome=='first_marriage_divorced_separated'").to_string(index=False))
