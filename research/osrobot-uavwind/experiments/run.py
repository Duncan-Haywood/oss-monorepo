import os, sys
here = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(here, "..", "src"))
sys.path.insert(0, os.path.join(here, "..", "..", "osrobot-uav", "src"))
import osrobot_uavwind.wind as W
from osrobot_uavwind.wind import *

out = []
def pr(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)
g = lambda r: "none" if r is None else round(r["mass"], 2)
def lightest(a, b, c):
    cand = [(r["mass"], n) for r, n in ((a, "multirotor"), (b, "fixed wing"), (c, "vtol")) if r]
    return min(cand)[1] if cand else "-"

WINDS = [0, 2, 4, 6, 8, 10, 12, 15, 18]
pr("# Sweep 1: steady wind (m/s), reference mission 3 km, 20 min, 0.5 kg; all-up mass in kg (no translational-lift credit)")
pr("wind  multirotor  fixedwing  vtol  lightest")
for w in WINDS:
    ms = WindMission(3000, 1200, 0.5, wind=w)
    a, b, c = size_multirotor(ms), size_fixedwing(ms), size_vtol(ms)
    pr(f"{w:4d}  {g(a)!s:>10}  {g(b)!s:>9}  {g(c)!s:>5}  {lightest(a, b, c)}")

pr("\n# Sweep 2: the same with translational-lift credit for the station-keeping multirotor (optimistic)")
pr("wind  multirotor")
W.CREDIT = True
for w in WINDS:
    pr(f"{w:4d}  {g(size_multirotor(WindMission(3000, 1200, 0.5, wind=w)))!s:>10}")
W.CREDIT = False

pr("\n# Sweep 3: short stays, 1 min on station at 3 km (where the multirotor won with no wind); mass in kg")
pr("wind  multirotor  fixedwing  vtol  lightest")
for w in [0, 4, 8, 12, 15]:
    ms = WindMission(3000, 60, 0.5, wind=w)
    a, b, c = size_multirotor(ms), size_fixedwing(ms), size_vtol(ms)
    pr(f"{w:4d}  {g(a)!s:>10}  {g(b)!s:>9}  {g(c)!s:>5}  {lightest(a, b, c)}")

pr("\n# Sweep 4: VTOL against multirotor at 10 min, 8 km (VTOL won with no wind at 12 km only)")
pr("wind  multirotor  fixedwing  vtol  lightest")
for w in [0, 6, 12]:
    ms = WindMission(8000, 600, 0.5, wind=w)
    a, b, c = size_multirotor(ms), size_fixedwing(ms), size_vtol(ms)
    pr(f"{w:4d}  {g(a)!s:>10}  {g(b)!s:>9}  {g(c)!s:>5}  {lightest(a, b, c)}")

pr("\n# Frozen designs: sized for the reference mission in no wind, flown in wind (minutes on station left at 3 km;")
pr("# 'x' = cannot make the round trip or hold station), and the mass of a design built for that wind")
ref = WindMission(3000, 1200, 0.5, wind=0)
dm, dw = size_multirotor(ref), size_fixedwing(ref)
pr("wind  frozen_mr  frozen_fw   built-for-wind mass: mr / fw")
for w in [0, 3, 6, 9, 12, 15, 18]:
    ms = WindMission(3000, 1200, 0.5, wind=w)
    s = lambda v: "x" if v is None else f"{v/60:.1f}"
    pr(f"{w:4d}  {s(frozen_loiter('mr', dm, ms)):>9}  {s(frozen_loiter('fw', dw, ms)):>9}   {g(size_multirotor(ms))} / {g(size_fixedwing(ms))}")

pr("\n# Wind at which a frozen reference design is down to 10 min on station (of the 20 it was sized for), step 0.25 m/s")
def half_wind(kind, d):
    w = 0.0
    while w < 25:
        v = frozen_loiter(kind, d, WindMission(3000, 1200, 0.5, wind=w))
        if v is None or v < 600: return w
        w += 0.25
    return None
pr(f"multirotor {half_wind('mr', dm)} m/s   fixed wing {half_wind('fw', dw)} m/s")

with open(os.path.join(here, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
