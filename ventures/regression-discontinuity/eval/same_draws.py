"""Same-draws coverage comparison with rdrobust 2.1.1 (GPL-3.0, run as an
external program only). Draws 500 samples of 1,000 from the Lee calibration
(numpy seed 99), writes them to DIR, and prints rdrobust's coverage at its
default bandwidth. Then: node eval/same-draws.mjs DIR
    /tmp/rdenv/bin/python eval/same_draws.py /tmp/rd-draws
"""
import numpy as np, warnings, json, sys, pathlib; warnings.filterwarnings('ignore')
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/rd-draws'); out.mkdir(parents=True, exist_ok=True)
from rdrobust import rdrobust
rng=np.random.default_rng(99); R=500; n=1000
def lee(x):
    return np.where(x>=0,0.52+0.84*x-3.00*x**2+7.99*x**3-9.01*x**4+3.56*x**5,0.48+1.27*x+7.18*x**2+20.21*x**3+21.54*x**4+7.33*x**5)
X=2*rng.beta(2,4,(R,n))-1; Y=lee(X)+rng.normal(0,0.1295,(R,n))
np.savetxt(out / 'X.txt',X,fmt='%.8f'); np.savetxt(out / 'Y.txt',Y,fmt='%.8f')
cc=cr=0; hs=[]
for r in range(R):
    o=rdrobust(Y[r],X[r]); ci=o.ci.values
    cc+= ci[0,0]<=0.04<=ci[0,1]; cr+= ci[2,0]<=0.04<=ci[2,1]; hs.append(o.bws.values[0,0])
print(json.dumps(dict(conv=cc/R,robust=cr/R,meanH=float(np.mean(hs)))))
