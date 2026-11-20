"""Development probe 3 (seed 60, not held out): the planner's own limit L_p at the G1 cases' direction."""
import math, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m60_jointpreload"))
import numpy as np
import core as C
E55, E54, M1 = C.E55, C.E54, C.M1


def lp(key, phi, hmax=60.0, it=20):
    ok = lambda H: E55.plan_forces(key, np.asarray(M1.hose_f(key, H, phi), float)) is not None  # noqa: E731
    if not ok(0.0):
        return None
    if ok(hmax):
        return hmax
    a, b = 0.0, hmax
    for _ in range(it):
        m = (a + b) / 2
        a, b = (m, b) if ok(m) else (a, m)
    return a


C.setup("g1")
phi = math.radians(133.49268409749624)
for k in (("g1", 1.2, -0.15), ("g1", 1.2, 0.0)):
    k = min((kk for kk in M1.KEYS if kk[0] == "g1"), key=lambda kk: abs(kk[1]-k[1]) + abs(kk[2]-k[2]))
    t = time.time()
    print(k, "L_p", lp(k, phi), "balance", E54.limit(k, phi), f"{time.time()-t:.1f}s")
