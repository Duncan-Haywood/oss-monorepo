import numpy as np, json
from scipy import stats
b=[17.88,28.92,33.00,41.52,42.12,45.60,48.48,51.84,51.96,54.12,55.56,67.80,68.64,68.64,68.88,84.12,93.12,98.64,105.12,105.84,127.92,128.04,173.40]
f=[t for t in b if t<=100]; c=[100.0]*(len(b)-len(f))
out={}
d=stats.CensoredData(uncensored=f,right=c)
s,loc,sc=stats.weibull_min.fit(d,floc=0); out['bear100']=[s,sc,f,c]
rng=np.random.default_rng(7)
t=sc2=None
T=rng.weibull(1.6,40)*900; C=rng.uniform(200,1500,40)
ff=[float(x) for x,y in zip(T,C) if x<=y]; cc=[float(y) for x,y in zip(T,C) if x>y]
s2,_,sc2=stats.weibull_min.fit(stats.CensoredData(uncensored=ff,right=cc),floc=0); out['rand']=[s2,sc2,ff,cc]
print(json.dumps(out))
