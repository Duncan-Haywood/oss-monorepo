"""Development probe on seed 60's four cases (not held out)."""
import math, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m60_jointpreload"))
os.environ.setdefault("M60_N", "48")
import numpy as np
import core as C
E59, E55, E54, E51, M1 = C.E59, C.E55, C.E54, C.E51, C.M1
B = E59.B
LOADS = E54.lhs(48, 60)
ERRS = [B * a for a in E55.rand_dirs(6, 60)]
cases = [("g1", (1.2, -0.15), 6.38, 0), ("g1", (1.2, 0.0), 6.38, 0), ("g1", (1.2, -0.15), 6.38, 1),
         ("h1", (1.4, 0.15), 11.40, 3)]
for n, pose, Hh, ai in cases:
    t = time.time()
    C.setup(n)
    j = min(range(48), key=lambda i: abs(LOADS[i][0] - Hh))
    H, phd = LOADS[j]
    k = (n, *pose)
    k = min((kk for kk in M1.KEYS if kk[0] == n), key=lambda kk: abs(kk[1]-pose[0]) + abs(kk[2]-pose[1]))
    ref = E51.ref_key(n)
    e = np.asarray(ERRS[ai], float)
    _, _, er_r, _, _, _ = E55.robust_rule(ref, M1.hose_f(ref, 0.0, 0.0), e)
    f = M1.hose_f(k, H, math.radians(phd))
    fm = np.asarray(f) + e
    o = E59.rule_all(k, ref, f, e, er_r)["four-row"]
    print(k, H, phd, ai, "rule:", o.get("how"), o.get("bind"))
    # where does plan_forces fail?
    r, names, legs = M1.ROB[n]
    q = M1.POSE[k].qpos
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, fm)
        fn, _ = M1.GQ.solve(cm, "hold", legs, M1.SIGNS[n], M1.TAUF, hold_idx=M1.light(n))
        print("  F", F, "hold solve", None if fn is None else "ok")
    P = E59.plans(k, fm)
    p = P["four-row"]
    print("  pose-side plan:", None if p is None else {kk: p[kk] for kk in ("Y", "obj", "pass", "s", "bind")})
    for S in (15.0, 20.0, 30.0):
        p = E59.plans(k, fm, S=S)["four-row"]
        print("  S", S, None if p is None else {kk: p[kk] for kk in ("Y", "obj", "pass", "s", "bind")})
    print("  time", round(time.time() - t, 1))
