"""Writes results.txt. Deterministic. Prices come from garment-teardown (reported retail, cited there)."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "garment-teardown" / "src"))
from garment_teardown import TRENCH, COAT, SCENARIOS, replica, cost_breakdown
from garment_costperwear import *

P_D = {"trench": 2850.0, "coat": 3850.0}   # reported retail, see garment-teardown README
g = {"trench": TRENCH, "coat": COAT}
P_R = {k: cost_breakdown(replica(v), SCENARIOS["mid-wage"])["fob"] for k, v in g.items()}
out = []
w = out.append
w("replica cost to make (garment-teardown, mid-wage): " + ", ".join(f"{k} ${v:.0f}" for k, v in P_R.items()))
w("")
w("== A. break-even lifetime multiple Ld/Lr (designer must outlast replica by this factor), by designer care cost per wear (replica care fixed at $0.10) and resale")
w("garment  resale  designer_care  breakeven_multiple   (replica lifetime 60 wears)")
for k in ("trench", "coat"):
    for resale in (0.0, 0.3):
        for care in (0.0, 0.5, 2.0):
            r = breakeven_ratio(P_D[k], P_R[k], resale_designer=resale, care_designer=care,
                                care_replica=0.1, wears_replica=60)
            w(f"{k} {resale:.1f} {care:.1f} {r:.1f}")
w("")
w("== B. P(designer cheaper per wear), lognormal lifetimes sigma 0.5, replica median 60 wears, no resale or care")
w("garment  designer_median_wears  prob")
for k in ("trench", "coat"):
    for m in (300, 1000, 3000, 10000):
        w(f"{k} {m} {prob_designer_cheaper(P_D[k], P_R[k], m, 60):.3f}")
w("")
w("== C. trench: designer median wears needed for P(designer cheaper) >= 0.5, by resale and designer care (replica care $0.10, median 60)")
w("resale  designer_care  needed_median_wears")
for resale in (0.0, 0.3, 0.6):
    for care in (0.1, 1.0):
        lo, hi = 1.0, 1e7
        for _ in range(60):
            mid = (lo * hi) ** 0.5
            if prob_designer_cheaper(P_D["trench"], P_R["trench"], mid, 60, resale_designer=resale,
                                     care_designer=care, care_replica=0.1, n=4000) >= 0.5:
                hi = mid
            else:
                lo = mid
        w(f"{resale:.1f} {care:.1f} {hi:.0f}")
w("")
w("== D. trench: designer median wears 1000, replica median wears varied (P designer cheaper)")
w("replica_median_wears  prob")
for m in (15, 30, 60, 120, 240):
    w(f"{m} {prob_designer_cheaper(P_D['trench'], P_R['trench'], 1000, m):.3f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
