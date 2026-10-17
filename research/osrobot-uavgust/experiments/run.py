import os, sys
here = os.path.dirname(__file__)
for p in ("..", "../../osrobot-uavwind", "../../osrobot-uav"):
    sys.path.insert(0, os.path.join(here, p, "src") if p != ".." else os.path.join(here, "..", "src"))
from osrobot_uavgust.gust import *
from osrobot_uavwind.wind import WindMission

out = []
def pr(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)
ms = WindMission(3000, 1200, 0.5)
KINDS = [("mr", "multirotor"), ("fw", "fixed wing")]
QS = [0.5, 0.8, 0.9, 0.95, 0.99]

pr("# Sweep 1: design wind = the q-quantile of |wind|, mission 3 km, 20 min, 0.5 kg; wind ~ Normal(mu, sigma) per mission")
pr("# columns: mu sigma kind q design_wind mass_kg premium_pct_vs_mean_wind_design P_success(reserve kept) P_success(reserve spent) E_stay_frac")
for mu, sigma in [(0, 3), (5, 2), (5, 4), (8, 3)]:
    pmf = wind_pmf(mu, sigma)
    for kind, name in KINDS:
        base = size_for(kind, ms, mu)
        for q in QS:
            dw = quantile(pmf, q)
            d = size_for(kind, ms, dw)
            if d is None:
                pr(f"{mu} {sigma} {name.replace(' ', '')} {q} {dw:.2f} none"); continue
            ps = success_prob(kind, d, ms, pmf)
            pr2 = success_prob(kind, d, ms, pmf, True)
            es = expected_stay(kind, d, ms, pmf)
            pr(f"{mu} {sigma} {name.replace(' ', '')} {q} {dw:.2f} {d['mass']:.3f} {100*(d['mass']/base['mass']-1):.1f} {ps:.3f} {pr2:.3f} {es:.3f}")

pr("\n# Sweep 2: sized for the mean wind only, with a bigger battery reserve instead of a design wind")
pr("# columns: mu sigma kind reserve mass_kg P_success(reserve spent)")
import osrobot_uav.model as M
R0 = M.RESERVE
for mu, sigma in [(5, 4), (8, 3)]:
    pmf = wind_pmf(mu, sigma)
    for kind, name in KINDS:
        for R in (R0, 0.3, 0.4, 0.6):
            M.RESERVE = R          # sizing and the frozen-design energy bookkeeping both use R
            d = size_for(kind, ms, mu)
            ps = success_prob(kind, d, ms, pmf, True)
            M.RESERVE = R0
            pr(f"{mu} {sigma} {name.replace(' ', '')} {R:.2f} {d['mass']:.3f} {ps:.3f}")

pr("\n# Sweep 3: does the airframe ordering survive a 95%-quantile design? mission 1 min on station, 3 km")
pr("# columns: mu sigma q multirotor_kg fixedwing_kg lightest")
ms1 = WindMission(3000, 60, 0.5)
for mu, sigma in [(0, 3), (5, 2), (8, 3)]:
    pmf = wind_pmf(mu, sigma)
    for q in (0.5, 0.95):
        dw = quantile(pmf, q)
        a, b = size_for("mr", ms1, dw), size_for("fw", ms1, dw)
        pr(f"{mu} {sigma} {q} {a['mass']:.3f} {b['mass']:.3f} {'multirotor' if a['mass'] < b['mass'] else 'fixedwing'}")

with open(os.path.join(here, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
