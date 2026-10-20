import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_uav.model import *

out = []
def pr(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

def fmt(r, kind):
    if r is None:
        return "no closure under 60 kg"
    x = r["x"]
    geo = f"rotor dia {x*100:5.1f} cm" if kind == "mr" else f"wing area {x:4.2f} m2"
    return f"mass {r['mass']:6.2f} kg  battery {r['m_bat']:5.2f} kg ({r['energy_wh']:6.1f} Wh)  {geo}"

def row(r):
    return f"{'none' if r is None else round(r['mass'], 2)!s:>6}"

def lightest(a, b, c):
    cand = [(r["mass"], n) for r, n in ((a, "multirotor"), (b, "fixed wing"), (c, "vtol")) if r]
    return min(cand)[1] if cand else "-"

REF = Mission(dist=3000, loiter=1200, m_pay=0.5)
pr("# Reference mission: 3 km out, 20 min on station, 0.5 kg / 5 W payload, 20% energy reserve")
pr("multirotor :", fmt(size_multirotor(REF), "mr"))
pr("vtol wing  :", fmt(size_vtol(REF), "fw"))
pr("fixed wing :", fmt(size_fixedwing(REF), "fw"))

pr("\n# Sweep 1: loiter time at 3 km (minutes), 0.5 kg payload; all-up mass in kg")
pr("loiter_min  multirotor  fixedwing  vtol  lightest")
for t in [1, 2, 5, 10, 20, 30, 45, 60, 90]:
    ms = Mission(3000, t * 60, 0.5)
    a, b, c = size_multirotor(ms), size_fixedwing(ms), size_vtol(ms)
    pr(f"{t:10d}  {row(a)}  {row(b)}  {row(c)}  {lightest(a, b, c)}")

pr("\n# Sweep 2: distance to the site (km), 10 min on station, 0.5 kg payload")
pr("dist_km  multirotor  fixedwing  vtol  lightest")
for dk in [0.25, 0.5, 1, 2, 3, 5, 8, 12]:
    ms = Mission(dk * 1000, 600, 0.5)
    a, b, c = size_multirotor(ms), size_fixedwing(ms), size_vtol(ms)
    pr(f"{dk:7.2f}  {row(a)}  {row(b)}  {row(c)}  {lightest(a, b, c)}")

pr("\n# Sweep 3: payload mass (kg) at the reference mission")
pr("payload  multirotor  fixedwing   vtol")
for mp in [0.1, 0.25, 0.5, 1.0, 2.0, 4.0]:
    ms = Mission(3000, 1200, mp)
    a, b, c = size_multirotor(ms), size_fixedwing(ms), size_vtol(ms)
    g = lambda r: 'none' if r is None else round(r['mass'], 2)
    pr(f"{mp:7.2f}  {g(a)!s:>10}  {g(b)!s:>9}  {g(c)!s:>9}")

pr("\n# Purpose-built against a frozen design: the reference multirotor and fixed wing, flown on other missions")
pr("(loiter time left in minutes at that distance, battery and mass frozen; 'x' = cannot reach and return)")
dm, dw = size_multirotor(REF), size_fixedwing(REF)
pr("dist_km  frozen_mr  frozen_fw   built-for-purpose mass for 20 min: mr / fw")
for dk in [0.5, 1, 3, 6, 9, 12, 15]:
    ms = Mission(dk * 1000, 1200, 0.5)
    a, b = frozen_max_loiter("mr", dm, ms), frozen_max_loiter("fw", dw, ms)
    s = lambda v: "x" if v is None else f"{v/60:.1f}"
    pm, pf = size_multirotor(ms), size_fixedwing(ms)
    pr(f"{dk:7.1f}  {s(a):>9}  {s(b):>9}   {round(pm['mass'],2) if pm else None} / {round(pf['mass'],2) if pf else None}")

pr("\n# Sensitivity of the reference all-up mass (kg) to the pack energy density, one assumption at a time")
import osrobot_uav.model as M
base = {k: getattr(M, k) for k in ["E_PACK", "FM", "CD0", "ETA_PROP"]}
for name, f in [("E_PACK 150 Wh/kg", ("E_PACK", 150*3600.)), ("E_PACK 250 Wh/kg", ("E_PACK", 250*3600.)),
                ("FM 0.6", ("FM", 0.6)), ("FM 0.8", ("FM", 0.8)), ("CD0 0.05", ("CD0", 0.05)), ("ETA_PROP 0.6", ("ETA_PROP", 0.6))]:
    setattr(M, f[0], f[1])
    a, b = M.size_multirotor(REF), M.size_fixedwing(REF)
    pr(f"{name:18s} multirotor {a['mass']:.2f}  fixed wing {b['mass']:.2f}")
    for k, v in base.items(): setattr(M, k, v)

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
