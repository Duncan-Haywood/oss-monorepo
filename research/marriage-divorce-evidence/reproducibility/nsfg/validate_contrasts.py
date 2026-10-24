"""Numerically check standardization influence derivatives against reweighting."""
from contrasts import *
d=load('female');core=(d.fmarno>0)&d.ager.between(25,49);domain=core&(d.attndnow==7);y=d.marend01.isin([1,2]);q,z,_=std(d,core,domain,y)
indices=np.random.default_rng(20261019).choice(np.flatnonzero(core),size=25,replace=False)
maxerr=0
for i in indices:
 c=d.copy();c.loc[i,'wgt2017_2019']*=1+1e-5;q2,_,_=std(c,core,domain,y)
 err=abs((q2-q)/1e-5-z[i]);maxerr=max(err,maxerr)
assert maxerr<1e-7, maxerr
print('PASS: 25 finite-difference reweighting checks; max absolute influence error',maxerr)
