"""Milestone 3e: how much does the choice of low-speed wave exponent (m2 vs m4) matter?

    PYTHONPATH=src python3 experiments/run_holtrop_forms.py > experiments/results_holtrop_forms.txt
"""
import math
from marine_hull.hull import G, RHO_FRESH
from marine_hull.holtrop import hm_resistance
from marine_hull.michell import wigley_volume, wigley_wetted

L, B, D = 4.0, 0.4, 0.25
CT_EXP, NU = 4.16e-3, 1.1386e-6
VOL, S_EX = wigley_volume(L, B, D), wigley_wetted(L, B, D)
CM = CWP = 2.0 / 3.0
print("Wigley 4 x 0.4 x 0.25 m, 15 C fresh water; CW and CT on Ju's area 2.380 m2; tank CT 4.16e-3 at Fn 0.267")
print("-- tank point, HM-regression area (like-for-like HM) --")
for form in ("m2", "m4"):
    v = 0.267 * math.sqrt(G * L)
    r = hm_resistance(v, L, B, D, VOL, CM, CWP, rho=RHO_FRESH, nu=NU, low_form=form)
    q = 0.5 * RHO_FRESH * v * v * 2.380
    print(f"{form}: CW {r['RW']/q*1e3:.3f}e-3, CT {r['RT']/q*1e3:.3f}e-3 ({(r['RT']/q/CT_EXP-1)*100:+.1f}% on tank)")
print("-- ratio RW(m4 form)/RW(m2 form) and RT ratio over Fn, exact area --")
print("Fn    RW_m2[N]  RW_m4[N]  RW ratio  RT ratio")
for fn in (0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40):
    v = fn * math.sqrt(G * L)
    a = hm_resistance(v, L, B, D, VOL, CM, CWP, rho=RHO_FRESH, nu=NU, s=S_EX, low_form="m2")
    b = hm_resistance(v, L, B, D, VOL, CM, CWP, rho=RHO_FRESH, nu=NU, s=S_EX, low_form="m4")
    print(f"{fn:.2f}  {a['RW']:8.3f}  {b['RW']:8.3f}  {b['RW']/a['RW']:.2f}      {b['RT']/a['RT']:.3f}")
