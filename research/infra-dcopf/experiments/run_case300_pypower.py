"""Case300 AC vs DC OPF with a solver that converges (PYPOWER's PIPS, a port of MATPOWER's).
Step 1: validate against MATPOWER's published case300 optimum (719,725.08 $/h).
Step 2: split the AC price gap into loss and congestion by solving the AC OPF with limits
off (prices then differ across buses by losses/voltage only) and with limits on (adds congestion).
The n most loaded branches are capped at a fraction f of their flow in the unlimited AC optimum, so the caps bind by construction
(capping every branch is infeasible: the load must still be served).
Writes experiments/results_case300_pypower.txt."""
import warnings; warnings.filterwarnings("ignore")
import copy, sys
import numpy as np
from pypower.api import runopf, rundcopf, case300, ppoption
from pypower.idx_brch import RATE_A, PF, QF, PT, QT
from pypower.idx_bus import LAM_P, BUS_TYPE, REF, PD, QD
from pypower.idx_gen import PMAX, PMIN

MATPOWER_CASE300_COST = 719725.08  # MATPOWER 7 docs / case300 header: AC OPF optimum
OPT = ppoption(VERBOSE=0, OUT_ALL=0, OPF_ALG=560)
DCOPT = ppoption(VERBOSE=0, OUT_ALL=0)

def scale(c, k):
    c = copy.deepcopy(c); c["bus"][:, [PD, QD]] *= k; return c

def limit(c, flows, f, n):
    """Cap the n branches with the largest free-flow at f x their free flow; the rest stay unlimited (RATE_A = 0)."""
    c = copy.deepcopy(c); c["branch"][:, RATE_A] = 0.0
    top = np.argsort(-flows)[:n]; c["branch"][top, RATE_A] = f * flows[top]
    return c

def flows(r):
    return np.maximum(np.hypot(r["branch"][:, PF], r["branch"][:, QF]), np.hypot(r["branch"][:, PT], r["branch"][:, QT]))

if __name__ == "__main__":
    out = open("experiments/results_case300_pypower.txt", "w")
    def P(*a): print(*a, file=out, flush=True); print(*a)
    base = case300()
    r0 = runopf(base, OPT)
    P(f"validation: PYPOWER AC OPF case300 cost {r0['f']:.2f} vs MATPOWER {MATPOWER_CASE300_COST:.2f}  (diff {r0['f']-MATPOWER_CASE300_COST:+.2f}, success={r0['success']})")
    P("load f  n  nbind  AC_free   AC_lim   DC_lim  cong_cost%  DC-ACfree%  DC-AClim%  loss_spread  tot_spread  cong_spread(AClim-ACfree)  spread_dc")
    for k in (0.8, 1.0):
        c = scale(base, k)
        rf = runopf(c, OPT)
        if not rf["success"]: P(f"{k} free: AC failed"); continue
        fl = flows(rf); ref = np.where(rf["bus"][:, BUS_TYPE] == REF)[0][0]
        lf = rf["bus"][:, LAM_P]
        for f, n in ((0.95, 3), (0.9, 3), (0.9, 10), (0.8, 3), (0.8, 10)):
            cl = limit(c, fl, f, n)
            ra, rd = runopf(cl, OPT), rundcopf(cl, DCOPT)
            if not (ra["success"] and rd["success"]): P(f"{k:4.2f} {f:4.2f} {n:2d} ac={ra['success']} dc={rd['success']}"); continue
            la, ld = ra["bus"][:, LAM_P], rd["bus"][:, LAM_P]
            sa = np.hypot(ra["branch"][:, PF], ra["branch"][:, QF])
            nb = int((np.maximum(sa, np.hypot(ra["branch"][:, PT], ra["branch"][:, QT])) > 0.999 * cl["branch"][:, RATE_A]).sum()) - int((cl["branch"][:, RATE_A] == 0).sum())
            sp = lambda x: x.max() - x.min()
            P(f"{k:4.2f} {f:4.2f} {n:2d} {nb:5d} {rf['f']:10.0f} {ra['f']:10.0f} {rd['f']:10.0f} {(ra['f']/rf['f']-1)*100:9.3f} {(rd['f']/rf['f']-1)*100:9.2f} {(rd['f']/ra['f']-1)*100:9.2f} {sp(lf):10.2f} {sp(la):10.2f} {np.abs(la-lf).max():14.2f} {sp(ld):10.2f}")
