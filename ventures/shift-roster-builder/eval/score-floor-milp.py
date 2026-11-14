# The priced clique model of calc.mjs (cliqueLP, priced, modelOnly) as an integer program, solved by HiGHS through scipy, beside its
# LP, and the posted roster priced in the same model. Input: eval/score-floor-milp.mjs's JSON (one week per line).
#   node eval/score-floor-milp.mjs 60 168 0 > m.json && python3 eval/score-floor-milp.py m.json   (pip install scipy)
# x[p,s] and open[s] integer, hour-level weights (lam) continuous, one slack per inequality row; every row is "= 1" with its slack.
# The model drops rules (days in a row, keep sets, overtime) and prices pay and penalties by linear floors, so its integer optimum
# is still a lower bound on every roster's score, only tighter than its LP. If it reaches the posted score less the $0.50
# tolerance, the posted roster is proven; if not, the rest is the linear floors' looseness or a better roster.
import json,sys,os,time,numpy as np
from scipy.optimize import milp,linprog,LinearConstraint,Bounds
from scipy.sparse import csc_matrix
for line in open(sys.argv[1]):
    W=json.loads(line);M=W['model'];m=M['m'];cols=M['cols'];vals=M['vals'];cost=np.array(M['cost'],float)
    nx,nl,S=M['nx'],M['nLam'],M['S'];n=len(cols)
    r=[];c=[];v=[]
    for j,rows in enumerate(cols):
        for t,row in enumerate(rows):r.append(row);c.append(j);v.append(1.0 if vals[j] is None else vals[j][t])
    A=csc_matrix((v,(r,c)),shape=(m,n))
    integ=np.zeros(n);integ[:nx]=1;integ[nx+nl:nx+nl+S]=1
    ub=np.full(n,np.inf);ub[:nx+nl+S]=1
    BIG=1e5
    # The LP, as scipy's HiGHS solves it, for comparison with the engine's dual bound.
    t=time.time();lp=linprog(cost,A_eq=A,b_eq=np.ones(m),bounds=list(zip(np.zeros(n),ub)),method='highs')
    print(f"week {W['week']}: {m} rows, {n} columns; posted score {W['score']:,.2f}; engine lower bound {W['lowerBound']:,.2f}")
    print(f"  LP (HiGHS) {lp.fun:,.2f} in {time.time()-t:.1f}s")
    # The posted roster in the model: x from the owner array, open where unowned, lam on the two levels around each person's hours.
    own=W['owner'];x=np.zeros(n)
    xid={(p,s):j for j,(p,s) in enumerate(M['xcol'])}
    hrs={}
    for s,p in enumerate(own):
        if p is None or p<0:x[nx+nl+s]=1
        else:x[xid[(p,s)]]=1;hrs[p]=hrs.get(p,0)+M['len'][s]
    xo=x[:nx+nl+S]
    pay=float(cost[:nx]@x[:nx]);openc=float(cost[nx+nl:nx+nl+S]@x[nx+nl:nx+nl+S])
    print(f"  posted roster: open {openc/BIG:.2f} h; shift terms {pay:,.2f}; score above open and shift terms {W['score']-openc-pay:,.2f} (fairness, shortfall, overtime, the rest)")
    TL=float(os.environ.get('TL','600'))
    t=time.time()
    res=milp(cost,constraints=LinearConstraint(A,np.ones(m),np.ones(m)),integrality=integ,bounds=Bounds(np.zeros(n),ub),options={'time_limit':TL,'mip_rel_gap':1e-12})
    db=getattr(res,'mip_dual_bound',None)
    print(f"  MILP: status {res.status} ({res.message[:60]}), value {res.fun if res.fun is None else f'{res.fun:,.2f}'}, dual bound {db if db is None else f'{db:,.2f}'}, {time.time()-t:.1f}s")
    if res.x is not None:
        X=res.x
        print(f"  MILP roster: open {float(cost[nx+nl:nx+nl+S]@X[nx+nl:nx+nl+S])/BIG:.2f} h; shift terms {float(cost[:nx]@X[:nx]):,.2f}; hour-level terms {float(cost[nx:nx+nl]@X[nx:nx+nl]):,.2f}")
        if db is not None:print(f"  posted score - MILP dual bound: {W['score']-db:,.2f} (tolerance 0.50)")
        # The MILP's roster as an owner array (person per shift copy, -1 open), for eval/score-floor-milp-check.mjs to score with the
        # engine's own rules (OWNER_OUT names the file).
        mo=[-1]*S
        for j,(p,s) in enumerate(M['xcol']):
            if X[j]>0.5:mo[s]=p
        if os.environ.get('OWNER_OUT'):json.dump({'week':W['week'],'owner':mo},open(os.environ['OWNER_OUT'],'w'))
