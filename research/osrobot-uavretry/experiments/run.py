import os, sys
here = os.path.dirname(__file__)
for p in ("../src", "../../osrobot-uavnogo/src", "../../osrobot-uavgust/src", "../../osrobot-uavwind/src", "../../osrobot-uav/src"):
    sys.path.insert(0, os.path.join(here, p))
from osrobot_uavretry.retry import *
from osrobot_uavnogo.nogo import design_for_limit
from osrobot_uavgust.gust import wind_pmf, quantile
from osrobot_uavwind.wind import WindMission

out = []
def pr(s):
    print(s); out.append(s)
ms = WindMission(3000, 1200, 0.5)
mu, sigma, kind = 5, 4, "fw"
pmf = wind_pmf(mu, sigma)
pr("# Fixed wing, wind ~ |Normal(5, 4)|, mission 3 km, 20 min, 0.5 kg; limit L = q-quantile; airframe sized for L; K slots per day, wind-persistence rho between slots, forecast error sf m/s")
pr("# columns: q L mass_kg sf rho K P_complete P_fail P_nolaunch E_attempts stationary_err")
for q in (0.5, 0.8, 0.95):
    L = quantile(pmf, q)
    d = design_for_limit(kind, ms, L)
    for rho in (0.0, 0.5, 0.8, 0.95):
        T = transition(pmf, rho)
        se = stationary_error(pmf, T)
        for sf in (0, 2):
            for K in (1, 2, 4, 8):
                dn, fl, nl, us = day(kind, d, ms, pmf, T, L, sf, K)
                pr(f"{q} {L:.2f} {d['mass']:.3f} {sf} {rho} {K} {dn:.3f} {fl:.3f} {nl:.3f} {us:.2f} {se:.4f}")
with open(os.path.join(here, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
