"""Development probe 2 on seed 60's four cases (not held out): envelope distance and the squeeze via the rule."""
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m60_jointpreload"))
import numpy as np
import core as C
E59, E58, E55, E54, E51, M1 = C.E59, C.E58, C.E55, C.E54, C.E51, C.M1
B = E59.B
LOADS = E54.lhs(48, 60)
ERRS = [B * a for a in E55.rand_dirs(6, 60)]
cases = [("g1", (1.2, -0.15), 6.38, 0), ("g1", (1.2, 0.0), 6.38, 0), ("g1", (1.2, -0.15), 6.38, 1),
         ("h1", (1.4, 0.15), 11.40, 3)]
for n, pose, Hh, ai in cases:
    C.setup(n)
    j = min(range(48), key=lambda i: abs(LOADS[i][0] - Hh))
    H, phd = LOADS[j]
    k = min((kk for kk in M1.KEYS if kk[0] == n), key=lambda kk: abs(kk[1]-pose[0]) + abs(kk[2]-pose[1]))
    ref = E51.ref_key(n)
    e = np.asarray(ERRS[ai], float)
    _, _, er_r, _, _, _ = E55.robust_rule(ref, M1.hose_f(ref, 0.0, 0.0), e)
    f = M1.hose_f(k, H, math.radians(phd))
    lk, lr = E54.limit(k, math.radians(phd)), E54.limit(ref, math.radians(phd))
    print(k, f"H {H:.3f} lim {lk:.3f} ref lim {lr:.3f} slack {lk-H:.3f}", "f", np.round(f, 3), "e", np.round(e, 3))
    print("  plan at true f:", E55.plan_forces(k, np.asarray(f)) is not None,
          " at f+e:", E55.plan_forces(k, np.asarray(f) + e) is not None)
    old = E58.R45.S_STAR
    for S in (12.5, 15.0, 20.0):
        E58.R45.S_STAR = S
        try:
            o = E59.rule_all(k, ref, f, e, er_r)["four-row"]
        finally:
            E58.R45.S_STAR = old
        print("  S", S, {kk: o.get(kk) for kk in ("how", "y", "z", "yd", "zd", "flips", "bind")})
