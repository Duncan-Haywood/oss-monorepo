import os, sys
here = os.path.dirname(__file__)
for p in ("../src", "../../osrobot-uavgust/src", "../../osrobot-uavwind/src", "../../osrobot-uav/src"):
    sys.path.insert(0, os.path.join(here, p))
from osrobot_uavnogo.nogo import *
from osrobot_uavwind.wind import WindMission

out = []
def pr(s):
    print(s); out.append(s)
ms = WindMission(3000, 1200, 0.5)
KINDS = [("mr", "multirotor"), ("fw", "fixedwing")]
pr("# Go/no-go limit L = q-quantile of |wind|; airframe sized for L; mission 3 km, 20 min, 0.5 kg; wind ~ Normal(mu, sigma); forecast error sf m/s")
pr("# columns: mu sigma kind q L mass_kg sf P_scrub P_fail P_complete P_complete_given_launch")
for mu, sigma in [(5, 4), (8, 3)]:
    pmf = wind_pmf(mu, sigma)
    for kind, name in KINDS:
        for q in (0.5, 0.8, 0.95):
            L = quantile(pmf, q)
            d = design_for_limit(kind, ms, L)
            for sf in (0, 1, 2, 3):
                sc, fl, dn = outcomes(kind, d, ms, pmf, L, sf)
                pr(f"{mu} {sigma} {name} {q} {L:.2f} {d['mass']:.3f} {sf} {sc:.3f} {fl:.3f} {dn:.3f} {dn/(dn+fl) if dn+fl else 0:.3f}")
with open(os.path.join(here, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
