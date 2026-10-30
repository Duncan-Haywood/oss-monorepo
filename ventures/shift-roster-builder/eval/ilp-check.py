# Least open hours for weeks dumped by eval/ilp-export.mjs, by an independent ILP (HiGHS via scipy).
# Hard rules only: availability, one person per shift copy, no overlap, rest gap, weekly cap. No pay terms.
#   node eval/ilp-export.mjs 8 22 > w.json && python3 eval/ilp-check.py w.json   (pip install scipy)
import json,sys,time,numpy as np
from scipy.optimize import milp,LinearConstraint,Bounds
from scipy.sparse import lil_matrix
W=json.load(open(sys.argv[1]))
for c,w in enumerate(W):
    sl=w['slots'];el=w['elig'];P=len(el);S=len(sl);rest=w['rest']
    # vars x[p,s] then open[s]
    nv=P*S+S;idx=lambda p,s:p*S+s
    cost=np.zeros(nv)
    for s in range(S):cost[P*S+s]=(sl[s][1]-sl[s][0])/60
    rows=[];lo=[];hi=[]
    A=lil_matrix((S+P+P*S*S,nv));r=0
    for s in range(S):
        for p in range(P):A[r,idx(p,s)]=1
        A[r,P*S+s]=1;lo.append(1);hi.append(1);r+=1
    for p in range(P):
        for s in range(S):A[r,idx(p,s)]=(sl[s][1]-sl[s][0])/60
        lo.append(0);hi.append(w['maxH'][p]);r+=1
    for p in range(P):
        for a in range(S):
            for b in range(a+1,S):
                if not(el[p][a] and el[p][b]):continue
                # conflict if b starts before a ends+rest or vice versa
                x,y=(a,b) if sl[a][0]<=sl[b][0] else (b,a)
                if sl[y][0]<sl[x][1]+rest or sl[x][0]==sl[y][0]:
                    A[r,idx(p,a)]=1;A[r,idx(p,b)]=1;lo.append(0);hi.append(1);r+=1
    A=A[:r].tocsr()
    ub=np.ones(nv)
    for p in range(P):
        for s in range(S):
            if not el[p][s]:ub[idx(p,s)]=0
    t=time.time()
    res=milp(cost,constraints=LinearConstraint(A,lo,hi),integrality=np.ones(nv),bounds=Bounds(0,ub),options={'time_limit':300})
    print(c,res.status,res.message[:40],'min open hours',res.fun,'dual bound',getattr(res,'mip_dual_bound',None),'engine open',w.get('engineOpen'),'engine floor',w.get('engineFloor'),'%.1fs'%(time.time()-t))
